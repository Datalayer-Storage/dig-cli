
import fs from "fs";
import { pullFilesFromOrigin } from "../utils/download";
import { DIG_FOLDER_PATH, CONFIG_FILE_PATH} from "../utils/config";
import { findStoreId } from "../blockchain/datastore";

const getConfig = (): { origin: string } => {
    const config = JSON.parse(fs.readFileSync(CONFIG_FILE_PATH, "utf-8"));
    if (!config.origin) {
      throw new Error('The "origin" field is not set in the config file.');
    }
    return config;
  };

export const pull = async (): Promise<void> => {
    const config = getConfig();
    const storeId = await findStoreId();
    if (!storeId) {
        throw new Error("Store not found.");
    }
    
    await pullFilesFromOrigin(config.origin, storeId.toString('hex'), DIG_FOLDER_PATH);
};
