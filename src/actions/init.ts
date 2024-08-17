import * as fs from "fs";
import * as path from "path";
import { createDataLayerStore } from "../blockchain/datalayer";
import { serializeStoreInfo } from "../blockchain/datastore";
import { DataIntegrityLayer, DataIntegrityLayerOptions } from "../DataIntegrityLayer";
import { DIG_FOLDER_PATH, COIN_STATE_FILE_PATH } from "../config";
import { askToDeleteAndReinit } from "../prompts";
import { CreateStoreUserInputs } from "../types";

export const init = async (inputs: CreateStoreUserInputs = {}): Promise<void> => {
  if (fs.existsSync(DIG_FOLDER_PATH)) {
    const shouldDelete = await askToDeleteAndReinit();

    if (!shouldDelete) {
      console.log("Initialization aborted.");
      return;
    }

    // Delete the .dig directory
    fs.rmSync(DIG_FOLDER_PATH, { recursive: true, force: true });
    console.log(".dig folder deleted.");
  }

  // Re-create the .dig directory
  fs.mkdirSync(DIG_FOLDER_PATH);

  if (!fs.existsSync(path.join(process.cwd(), 'dig.config.json'))) {
    const initialConfig = { deploy_dir: "./dist", origin: "" };
    fs.writeFileSync(path.join(process.cwd(), 'dig.config.json'), JSON.stringify(initialConfig, null, 4));
    console.log("Created dig.config.json file.");
  }

  const storeInfo = await createDataLayerStore(inputs);
  if (storeInfo) {
    const storeId = storeInfo.launcherId.toString("hex");
    console.log("Store ID:", storeId);

    // Serialize storeInfo to state.dat
    const serializedStoreInfo = serializeStoreInfo(storeInfo);
    fs.writeFileSync(COIN_STATE_FILE_PATH, JSON.stringify(serializedStoreInfo, null, 4));

    const options: DataIntegrityLayerOptions = {
      storageMode: "local",
      storeDir: DIG_FOLDER_PATH,
    };

    new DataIntegrityLayer(storeId, options);
  } else {
    console.log("Failed to initialize the data layer store.");
    fs.rmSync(DIG_FOLDER_PATH, { recursive: true, force: true });
  }
};
