import { Request, Response } from "express";
import { getStoresList, getCoinState } from "../../utils/config";
import { formatBytes } from "../utils/formatBytes";
import { renderIndexView, renderStoreView, renderKeysIndexView } from "../views";
import { extname } from "path";
import { DataIntegrityTree, DataIntegrityTreeOptions } from "../../DataIntegrityTree";
import { mimeTypes } from "../utils/mimeTypes";
import { hexToUtf8 } from "../utils/hexUtils";
import { getStorageLocation} from '../utils/storage';

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
    try {
      const { storeId } = req.params;
      const showKeys = req.query.showKeys === "true";
  
      const options: DataIntegrityTreeOptions = {
        storageMode: "local",
        storeDir: `${digFolderPath}/stores`,
        disableInitialize: true,
      };
  
      const datalayer = new DataIntegrityTree(storeId, options);
  
      if (!showKeys) {
        const indexKey = Buffer.from("index.html").toString("hex");
        const hasIndex = datalayer.hasKey(indexKey);
  
        if (hasIndex) {
          const stream = datalayer.getValueStream(indexKey);
          const fileExtension = extname("index.html").toLowerCase();
          const sha256 = datalayer.getSHA256(indexKey);
  
          if (!sha256) {
            res.status(500).send("Error retrieving file.");
            return;
          }
  
          const proofOfInclusion = datalayer.getProof(indexKey, sha256);
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
  
      const keys = datalayer.listKeys();
      const links = keys.map((key) => {
        const utf8Key = hexToUtf8(key);
        const link = `/${storeId}/${encodeURIComponent(utf8Key)}`;
        return { utf8Key, link };
      });
  
      res.send(renderKeysIndexView(storeId, links));
    } catch (error) {
      console.error("Error in getKeysIndex controller:", error);
      res.status(500).send("An error occurred while processing your request.");
    }
  };
  
  // Controller for handling the /:storeId/* route
  export const getKey = async (req: Request, res: Response) => {
    try {
      const { storeId } = req.params;
      const catchall = req.params[0];
  
      const key = Buffer.from(catchall, "utf-8").toString("hex");
  
      const options: DataIntegrityTreeOptions = {
        storageMode: "local",
        storeDir: `${digFolderPath}/stores`,
        disableInitialize: true,
      };
  
      const datalayer = new DataIntegrityTree(storeId, options);
  
      if (!datalayer.hasKey(key)) {
        res.status(404).send("File not found.");
        return;
      }
  
      const stream = datalayer.getValueStream(key);
      const fileExtension = extname(catchall).toLowerCase();
      const sha256 = datalayer.getSHA256(key);
  
      if (!sha256) {
        res.status(500).send("Error retrieving file.");
        return;
      }
  
      const proofOfInclusion = datalayer.getProof(key, sha256);
      res.setHeader("x-proof-of-inclusion", proofOfInclusion);
  
      const mimeType = mimeTypes[fileExtension] || "application/octet-stream";
      res.setHeader("Content-Type", mimeType);
  
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