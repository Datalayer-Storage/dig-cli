
import fs from "fs";
import { pullFilesFromNetwork } from "../utils/download";
import { DIG_FOLDER_PATH, CONFIG_FILE_PATH, getActiveStoreId} from "../utils/config";

export const pull = async (): Promise<void> => {
    const storeId = await getActiveStoreId();
    if (!storeId) {
        throw new Error("Store not found.");
    }
    
    await pullFilesFromNetwork(storeId.toString('hex'), DIG_FOLDER_PATH);
};
