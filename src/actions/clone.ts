import fs from "fs";
import { pullFilesFromNetwork } from "../utils/download";
import { DIG_FOLDER_PATH, CONFIG_FILE_PATH } from "../utils/config";
import { waitForPromise } from "../utils";
import { validateStore } from "../blockchain/datastore";

export const clone = async (storeId: string): Promise<void> => {
  console.log(`Cloning store: ${storeId}`);

  try {
    // Pull files from the remote
    await pullFilesFromNetwork(storeId, DIG_FOLDER_PATH);
  } catch (error: any) {
    console.error(error.message);
    process.exit(1); // Exit the process with an error code
  }

  try {
    let storeIntegrityCheck = await waitForPromise(
      () => validateStore(),
      "Checking store integrity...",
      "Store integrity check passed.",
      "Store integrity check failed."
    );
    if (!storeIntegrityCheck) {
      console.error("Store integrity check failed. Reverting Clone");
      fs.rmdirSync(DIG_FOLDER_PATH, { recursive: true });
    }
  } catch (error: any) {
    console.trace(error.message);
    console.error("Store integrity check failed. Reverting Clone");
    fs.rmdirSync(DIG_FOLDER_PATH, { recursive: true });
  }
};
