import fs from "fs";
import { DigNetwork } from "../DigNetwork"; // Import DigNetwork class
import { STORE_PATH, getActiveStoreId } from "../utils/config";

export const pull = async (): Promise<void> => {
    // Retrieve the active storeId
    const storeId = await getActiveStoreId();
    if (!storeId) {
        throw new Error("Store not found.");
    }
    
    // Instantiate the DigNetwork with the storeId
    const digNetwork = new DigNetwork(storeId.toString('hex'));
    
    // Pull files from the network using DigNetwork's downloadFiles method
    await digNetwork.downloadFiles(false, true);
};
