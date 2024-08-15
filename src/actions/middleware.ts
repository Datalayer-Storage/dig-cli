import path from "path";
import fs from "fs";
import { checkStoreOwnership } from "../blockchain/datastore";
import { Config } from "../types";
import { CONFIG_FILE_PATH, COIN_STATE_FILE_PATH } from "../config";
import { isCoinSpendable } from "../blockchain/coins";
import { getPeer } from "../blockchain/peer";
import { deserializeStoreInfo, getLatestStoreInfo } from "../blockchain/datastore";
import { getCoinId } from "datalayer-driver";

export const checkStorePermissions = async (): Promise<void> => {
  const storeIsWritable = await checkStoreOwnership();
  if (!storeIsWritable) {
    throw new Error(
      "Store is not writable by the current user. Please transfer ownership or add your key as an authorized writer."
    );
  }
};
export const ensureStoreIsSpendable = async (): Promise<void> => {
  const peer = await getPeer();
  const storeInfo = await getLatestStoreInfo();
  if (storeInfo) {
    console.log("Checking if Store is spendable:", storeInfo.launcherId.toString("hex"));
    
    const isSpendable = await isCoinSpendable(
      peer,
      getCoinId(storeInfo.coin)
    );

    if (!isSpendable) {
      throw new Error("Store is not spendable. Please wait for confirmation.");
    }

  }
};

export const ensureDigFolderIntegrity = async (): Promise<void> => {
  // Check if the dig.config.json file exists
  if (!fs.existsSync(CONFIG_FILE_PATH)) {
    throw new Error("Config file not found. Please run init first.");
  }

  // Load the config
  const config: Config = JSON.parse(fs.readFileSync(CONFIG_FILE_PATH, "utf-8"));

  // Check if deploy_dir is set
  if (!config.deploy_dir) {
    throw new Error('The "deploy_dir" field is not set in the config file.');
  }

  // Check if the deployDir exists
  const deployDir = path.join(process.cwd(), config.deploy_dir);
  if (!fs.existsSync(deployDir)) {
    throw new Error(`The deploy directory (${deployDir}) does not exist.`);
  }
};
