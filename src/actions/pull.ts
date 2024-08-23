
import fs from "fs";
import { pullFilesFromNetwork } from "../utils/download";
import { DIG_FOLDER_PATH, CONFIG_FILE_PATH, getActiveStoreId} from "../utils/config";

const getConfig = (): { origin: string } => {
    const config = JSON.parse(fs.readFileSync(CONFIG_FILE_PATH, "utf-8"));
    if (!config.origin) {
      throw new Error('The "origin" field is not set in the config file.');
    }
    return config;
  };

export const pull = async (): Promise<void> => {
    const config = getConfig();
    const storeId = await getActiveStoreId();
    if (!storeId) {
        throw new Error("Store not found.");
    }
    
    await pullFilesFromNetwork(storeId.toString('hex'), DIG_FOLDER_PATH);
};
