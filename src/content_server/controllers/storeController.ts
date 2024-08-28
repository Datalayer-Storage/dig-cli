import { Request, Response } from "express";
import fs from "fs";
import { getStoresList, getCoinState } from "../../utils/config";
import { formatBytes } from "../utils/formatBytes";
import { renderIndexView, renderStoreView, renderKeysIndexView, renderStoreSyncingView } from "../views";
import { extname } from "path";
import { DataIntegrityTree, DataIntegrityTreeOptions } from "../../DataIntegrityTree";
import { mimeTypes } from "../utils/mimeTypes";
import { hexToUtf8 } from "../utils/hexUtils";
import { getStorageLocation} from '../utils/storage';
import { getLatestStoreInfo } from "../../blockchain/datastore";

const digFolderPath = getStorageLocation();

export const getStoresIndex = async (req: Request, res: Response) => {
  const storeList = getStoresList();
  const rows = await Promise.all(
    storeList.map(async (storeId) => {
      const state = await getCoinState(storeId);
      const formattedBytes = formatBytes(Number(state.metadata.bytes));
      return renderIndexView(storeId, state, formattedBytes);
    })
  );
  res.send(renderStoreView(rows.join("")));
};

// Controller for handling the /:storeId route
export const getKeysIndex = async (req: Request, res: Response) => {
    let { storeId } = req.params;
    let rootHash: string | undefined;
    
    try {

      const showKeys = req.query.showKeys === "true";
  
      if (storeId.length === 129) {
        // Reassign storeId to the first 64 characters and rootHash to the last 64 characters
        rootHash = storeId.slice(-64).trim();
        storeId = storeId.slice(0, 64);
      } else {
        const storeInfo = await getLatestStoreInfo(Buffer.from(storeId, 'hex'));
        rootHash = storeInfo.latestInfo.metadata.rootHash.toString('hex');
      }

      const options: DataIntegrityTreeOptions = {
        storageMode: "local",
        storeDir: `${digFolderPath}/stores`,
        disableInitialize: true,
        rootHash
      };
  
      const datalayer = new DataIntegrityTree(storeId, options);
      
      res.setHeader('X-Synced', 'false');
      res.setHeader('X-Generation-Hash', rootHash);
      res.setHeader('X-Store-Id', storeId);

      if (process.env.CACHE_ALL_STORES === "") {
        // Creating the directory means the sync service will attempt to sync the store
        fs.mkdirSync(`${digFolderPath}/stores/${storeId}`, { recursive: true });
      }
  
      if (!showKeys) {
        const indexKey = Buffer.from("index.html").toString("hex");
        const hasIndex = datalayer.hasKey(indexKey, rootHash);
  
        if (hasIndex) {
          const stream = datalayer.getValueStream(indexKey, rootHash);
          const fileExtension = extname("index.html").toLowerCase();
          const sha256 = datalayer.getSHA256(indexKey);
  
          if (!sha256) {
            res.status(500).send("Error retrieving file.");
            return;
          }
  
          const proofOfInclusion = datalayer.getProof(indexKey, sha256, rootHash);
          res.setHeader("x-proof-of-inclusion", proofOfInclusion);
  
          const mimeType = mimeTypes[fileExtension] || "application/octet-stream";
          res.setHeader("Content-Type", mimeType);
  
          stream.pipe(res);
  
          stream.on("error", (err) => {
            console.error("Stream error:", err);
            res.status(500).send("Error streaming file.");
          });
  
          return;
        }
      }
  
      const keys = datalayer.listKeys(rootHash);
      const links = keys.map((key) => {
        const utf8Key = hexToUtf8(key);
        const link = `/${storeId}/${encodeURIComponent(utf8Key)}`;
        return { utf8Key, link };
      });
  
      res.send(renderKeysIndexView(storeId, links));
    } catch (error: any) {
      if (error.code === 404) {
        res.setHeader('X-Synced', 'false');
        const state = await getCoinState(storeId);
        return res.status(202).send(renderStoreSyncingView(storeId, state));
      } else {
        console.error("Error in getKeysIndex controller:", error);
        res.status(500).send("An error occurred while processing your request.");
      }

    }
  };
  
  // Controller for handling the /:storeId/* route
  export const getKey = async (req: Request, res: Response) => {
    try {
      let { storeId } = req.params;
      const catchall = req.params[0];
      let rootHash: string | undefined;
  
      const key = Buffer.from(catchall, "utf-8").toString("hex");

      if (storeId.length === 129) {
        // Reassign storeId to the first 64 characters and rootHash to the last 64 characters
        rootHash = storeId.slice(-64);
        storeId = storeId.slice(0, 64);
      } else {
        const storeInfo = await getLatestStoreInfo(Buffer.from(storeId, 'hex'));
        rootHash = storeInfo.latestInfo.metadata.rootHash.toString('hex');
      }
  
      const options: DataIntegrityTreeOptions = {
        storageMode: "local",
        storeDir: `${digFolderPath}/stores`,
        disableInitialize: true,
        rootHash
      };
  
      const datalayer = new DataIntegrityTree(storeId, options);
      rootHash = datalayer.getRoot();
    
      if (!datalayer.hasKey(key, rootHash)) {
        res.status(404).send("File not found.");
        return;
      }
  
      const stream = datalayer.getValueStream(key, rootHash);
      const fileExtension = extname(catchall).toLowerCase();
      const sha256 = datalayer.getSHA256(key, rootHash);
  
      if (!sha256) {
        res.status(500).send("Error retrieving file.");
        return;
      }
  
      const proofOfInclusion = datalayer.getProof(key, sha256, rootHash);
      res.setHeader("x-proof-of-inclusion", proofOfInclusion);
  
      const mimeType = mimeTypes[fileExtension] || "application/octet-stream";
      res.setHeader("Content-Type", mimeType);
      res.setHeader('X-Generation-Hash', rootHash);
      res.setHeader('X-Store-Id', storeId);
  
      stream.pipe(res);
  
      stream.on("error", (err) => {
        console.error("Stream error:", err);
        res.status(500).send("Error streaming file.");
      });
    } catch (error) {
      console.error("Error in getKey controller:", error);
      res.status(500).send("Error retrieving the requested file.");
    }
  };