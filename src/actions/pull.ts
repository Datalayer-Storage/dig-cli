import fs from "fs";
import { DigNetwork } from "../DigNetwork"; // Import DigNetwork class
import { STORE_PATH } from "../utils/config";
import { DataStore } from "../blockchain";

export const pull = async (): Promise<void> => {
    // Retrieve the active storeId
    const dataStore = await DataStore.getActiveStore();
    if (!dataStore) {
        throw new Error("Store not found.");
    }
    
    // Instantiate the DigNetwork with the storeId
    const digNetwork = new DigNetwork(dataStore.StoreId);
    
    // Pull files from the network using DigNetwork's downloadFiles method
    await digNetwork.downloadFiles(false, true);
};
