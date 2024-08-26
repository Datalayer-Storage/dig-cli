import fs from "fs";
import { SimpleIntervalJob, Task } from "toad-scheduler";
import {
  getStoresList,
  DIG_FOLDER_PATH,
  getManifestFilePath,
} from "../../utils/config";
import {
  getRootHistory,
  getLatestStoreInfo,
  validateStore,
} from "../../blockchain/datastore";
import { pullFilesFromNetwork } from "../../utils/download";
import { getPublicIpAddress } from "../../utils/network";
import {
  doesHostExistInMirrors,
  createServerCoin,
} from "../../blockchain/server_coin";

const syncStore = async (storeId: string, publicIp: string): Promise<void> => {
  console.log(`Starting sync process for store ${storeId}...`);

  try {
    const isUpToDate = await isStoreUpToDate(storeId);

    if (isUpToDate) {
      console.log(`Store ${storeId} is already up to date.`);
      return;
    }

    console.log(`Store ${storeId} is out of date. Syncing...`);
    await syncStoreFromNetwork(storeId);

    const isValid = await validateStoreIntegrity(storeId);
    if (isValid) {
      console.log(`Store ${storeId} synced successfully.`);
    } else {
      console.error(
        `Store integrity check failed for ${storeId}. Resyncing from scratch...`
      );
      await resyncStoreFromScratch(storeId);
      console.log(`Resync completed for store ${storeId}.`);
    }
  } catch (error: any) {
    console.error(`Error processing store ${storeId}: ${error.message}`);
  } finally {
    await finalizeStoreSync(storeId);
    await ensureServerCoinExists(storeId, publicIp);
  }
};

const isStoreUpToDate = async (storeId: string): Promise<boolean> => {
  console.log(`Checking if store ${storeId} is up to date...`);

  const rootHistory = await getRootHistory(Buffer.from(storeId, "hex"));
  const manifest = fs
    .readFileSync(getManifestFilePath(storeId), "utf-8")
    .trim();
  const manifestRootHashes = manifest.split("\n");

  return rootHistory.length === manifestRootHashes.length;
};

const syncStoreFromNetwork = async (storeId: string): Promise<void> => {
  try {
    console.log(`Attempting to sync store ${storeId} from the network...`);
    await pullFilesFromNetwork(storeId, DIG_FOLDER_PATH, false, false);
  } catch (error: any) {
    console.warn(
      `Initial sync attempt failed for ${storeId}: ${error.message}`
    );
    if (error.message.includes("No DIG Peers found")) {
      console.error(`No DIG Peers found for store ${storeId}. Skipping...`);
      return;
    }
    console.log(`Retrying sync for store ${storeId} with forced download...`);
    await pullFilesFromNetwork(storeId, DIG_FOLDER_PATH, true, false);
  }
};

const validateStoreIntegrity = async (storeId: string): Promise<boolean> => {
  console.log(`Validating integrity for store ${storeId}...`);
  const isValid = await validateStore();
  if (isValid) {
    console.log(`Store ${storeId} passed integrity check.`);
  } else {
    console.warn(`Store ${storeId} failed integrity check.`);
  }
  return isValid;
};

const resyncStoreFromScratch = async (storeId: string): Promise<void> => {
  console.log(`Resyncing store ${storeId} from scratch...`);
  await pullFilesFromNetwork(storeId, DIG_FOLDER_PATH, true, false);
};

const ensureServerCoinExists = async (
  storeId: string,
  publicIp: string
): Promise<void> => {
  try {
    console.log(`Ensuring server coin exists for store ${storeId}...`);
    const serverCoinExists = await doesHostExistInMirrors(storeId, publicIp);
    if (!serverCoinExists) {
      console.log(
        `No server coin found for store ${storeId} on IP ${publicIp}. Creating new server coin...`
      );
      await createServerCoin(storeId, [publicIp]);
      console.log(
        `Server coin created for store ${storeId} on IP ${publicIp}.`
      );
    } else {
      console.log(`Server coin already exists for store ${storeId}.`);
    }
  } catch (error: any) {
    console.error(
      `Error in ensuring server coin for store ${storeId}: ${error.message}`
    );
  }
};

const finalizeStoreSync = async (storeId: string): Promise<void> => {
  try {
    console.log(`Finalizing sync for store ${storeId}...`);
    await getLatestStoreInfo(Buffer.from(storeId, "hex"));
    console.log(`Finalization complete for store ${storeId}.`);
  } catch (error: any) {
    console.error(`Error in finalizing store ${storeId}: ${error.message}`);
  }
};

const task = new Task("sync-stores", async () => {
  console.log("Starting sync-stores task...");

  const storeList = getStoresList();
  let publicIp: string | undefined;

  try {
    publicIp = await getPublicIpAddress();
    console.log(`Found public IP for machine: ${publicIp}`);
  } catch (error: any) {
    console.error(`Failed to retrieve public IP address: ${error.message}`);
    return; // Exit the task if we can't retrieve the public IP
  }

  for (const storeId of storeList) {
    if (publicIp) {
      try {
        await syncStore(storeId, publicIp);
      } catch (error: any) {
        console.error(`Failed to sync store ${storeId}: ${error.message}`);
      }
    } else {
      console.warn(`Skipping store ${storeId} due to missing public IP.`);
    }
  }

  console.log("Sync-stores task completed.");
});

const job = new SimpleIntervalJob(
  {
    seconds: 300,
    runImmediately: true,
  },
  task,
  { id: "sync-stores", preventOverrun: true }
);

export default job;
