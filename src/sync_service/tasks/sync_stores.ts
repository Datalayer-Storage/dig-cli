import fs from "fs";
import { SimpleIntervalJob, Task } from "toad-scheduler";
import {
  getStoresList,
  DIG_FOLDER_PATH,
  getManifestFilePath,
} from "../../utils/config";
import { getRootHistory, getLatestStoreInfo } from "../../blockchain/datastore";
import { pullFilesFromNetwork } from "../../utils/download";
import { validateStore } from "../../blockchain/datastore";
import { getPublicIpAddress } from "../../utils/network";
import {
  doesHostExistInMirrors,
  createServerCoin,
} from "../../blockchain/server_coin";

const task = new Task("sync-stores", async () => {
  const storeList = getStoresList();

  for (const storeId of storeList) {
    try {
      const rootHistory = await getRootHistory(Buffer.from(storeId, "hex"));
      const manifest = fs
        .readFileSync(getManifestFilePath(storeId), "utf-8")
        .trim();
      const manifestRootHashes = manifest.split("\n");

      if (rootHistory.length === manifestRootHashes.length) {
        console.log(`Store ${storeId} is up to date.`);
        continue; // Skip to the next store
      }

      console.log(`Syncing store ${storeId}...`);

      try {
        await pullFilesFromNetwork(storeId, DIG_FOLDER_PATH, false, false);
      } catch (error: any) {
        if (error.message.includes("No DIG Peers found")) {
          console.error(error.message);
          return;
        }
        await pullFilesFromNetwork(storeId, DIG_FOLDER_PATH, true, false);
      }

      const storeIntegrityCheck = await validateStore();

      if (!storeIntegrityCheck) {
        console.error(
          "Store integrity check failed. Attempting to resync store from scratch."
        );
        await pullFilesFromNetwork(storeId, DIG_FOLDER_PATH, true, false);
      }
    } finally {
      // Running this caches the latest store information for faster lookup later
      console.log(`Fetching latest store info for ${storeId}`);
      await getLatestStoreInfo(Buffer.from(storeId, "hex"));

      // Check if there is a server coin for the store and create one if there is not
      // TODO: This is a good spot to add expiring server coin renewal logic
      const publicIp = await getPublicIpAddress();
      const serverCoinExists = await doesHostExistInMirrors(storeId, publicIp);
      if (!serverCoinExists) {
        await createServerCoin(storeId, [publicIp]);
      }
    }
  }
});

const job = new SimpleIntervalJob(
  {
    seconds: 60,
    runImmediately: true,
  },
  task,
  { id: "sync-stores", preventOverrun: true }
);

export default job;
