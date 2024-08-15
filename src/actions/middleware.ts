import path from "path";
import fs from "fs";
import { checkStoreOwnership } from "../blockchain/datastore";
import { Config } from "../types";
import { digFolderName, configFileName } from "../config";

export const checkStorePermissions = async (): Promise<void> => {
  const storeIsWritable = await checkStoreOwnership();
  if (!storeIsWritable) {
    throw new Error(
      "Store is not writable by the current user. Please transfer ownership or add your key as an authorized writer."
    );
  }
};

export const ensureDigFolderIntegrity = async (): Promise<void> => {
  const digDir = path.join(process.cwd(), digFolderName);
  const configFilePath = path.join(process.cwd(), configFileName);

  // Check if the dig.config.json file exists
  if (!fs.existsSync(configFilePath)) {
    throw new Error("Config file not found. Please run init first.");
  }

  // Load the config
  const config: Config = JSON.parse(fs.readFileSync(configFilePath, "utf-8"));

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
