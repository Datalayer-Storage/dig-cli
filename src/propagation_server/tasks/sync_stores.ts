import fs from "fs";
import { SimpleIntervalJob, Task } from "toad-scheduler";
import {
  getStoresList,
  STORE_PATH,
  getManifestFilePath,
} from "../../utils/config";
import {
  getRootHistory,
  getLatestStoreInfo,
  validateStore,
} from "../../blockchain/datastore";
import { pullFilesFromNetwork } from "../../utils/download";
import {
  doesHostExistInMirrors,
  createServerCoin,
} from "../../blockchain/server_coin";
import { NconfManager } from "../../utils/nconfManager";

const PUBLIC_IP_KEY = "publicIp";
const nconfManager = new NconfManager("config.json");

const syncStore = async (storeId: string): Promise<void> => {
  console.log(`Starting sync process for store ${storeId}...`);

  try {
    const isUpToDate = await isStoreUpToDate(storeId);

    if (isUpToDate) {
      console.log(`Store ${storeId} is already up to date.`);
      return;
    }

    console.log(`Store ${storeId} is out of date. Syncing...`);
    await syncStoreFromNetwork(storeId);

    /* This might cause problems when the latest root isnt on any available peers yet
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
      */
  } catch (error: any) {
    console.trace(`Error processing store ${storeId}: ${error.message}`);
  } finally {
    await finalizeStoreSync(storeId);
  }
};

const isStoreUpToDate = async (storeId: string): Promise<boolean> => {
  console.log(`Checking if store ${storeId} is up to date...`);

  const rootHistory = await getRootHistory(Buffer.from(storeId, "hex"));

  const manifestFilePath = getManifestFilePath(storeId);
  if (!fs.existsSync(manifestFilePath)) {
    console.log(`Manifest file not found for store ${storeId}.`);
    return false;
  }
  
  const manifest = fs
    .readFileSync(getManifestFilePath(storeId), "utf-8")
    .trim();
  const manifestRootHashes = manifest.split("\n");

  return rootHistory.length === manifestRootHashes.length;
};

const syncStoreFromNetwork = async (storeId: string): Promise<void> => {
  try {
    console.log(`Attempting to sync store ${storeId} from the network...`);
    await pullFilesFromNetwork(storeId, STORE_PATH, false, false);
  } catch (error: any) {
    console.warn(
      `Initial sync attempt failed for ${storeId}: ${error.message}`
    );
    if (error.message.includes("No DIG Peers found")) {
      console.error(`No DIG Peers found for store ${storeId}. Skipping...`);
      return;
    }
    console.log(`Retrying sync for store ${storeId} with forced download...`);
    await pullFilesFromNetwork(storeId, STORE_PATH, true, false);
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
  await pullFilesFromNetwork(storeId, STORE_PATH, true, false);
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
  let publicIp: string | null | undefined;

  try {
    publicIp = await nconfManager.getConfigValue(PUBLIC_IP_KEY);
    if (publicIp) {
      console.log(`Retrieved public IP from configuration: ${publicIp}`);
    } else {
      console.warn(
        "No public IP found in configuration, skipping server coin creation."
      );
    }
  } catch (error: any) {
    console.error(
      `Failed to retrieve public IP from configuration: ${error.message}`
    );
    return; // Exit the task if we can't retrieve the public IP
  }

  for (const storeId of storeList) {
    try {
      await syncStore(storeId);
      if (publicIp) {
        await ensureServerCoinExists(storeId, publicIp);
      } else {
        console.warn(
          `Skipping server coin check for store ${storeId} due to missing public IP.`
        );
      }
    } catch (error: any) {
      console.error(`Failed to sync store ${storeId}: ${error.message}`);
    }
  }

  console.log("Sync-stores task completed.");
});

const job = new SimpleIntervalJob(
  {
    //seconds: 300,
    seconds: 60,
    runImmediately: true,
  },
  task,
  { id: "sync-stores", preventOverrun: true }
);

export default job;
