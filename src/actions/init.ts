import * as fs from "fs";
import * as path from "path";
import { createDataLayerStore } from "../blockchain/datalayer";
import { serializeStoreInfo } from "../blockchain/datastore";
import { DataIntegrityLayer, DataIntegrityLayerOptions } from "../DataIntegrityLayer";
import { digFolderName, stateFileName } from "../config";
import { askToDeleteAndReinit } from "../prompts";

export const init = async (): Promise<void> => {
  const digDir = path.join(process.cwd(), digFolderName);

  if (fs.existsSync(digDir)) {
    const shouldDelete = await askToDeleteAndReinit();

    if (!shouldDelete) {
      console.log("Initialization aborted.");
      return;
    }

    // Delete the .dig directory
    fs.rmSync(digDir, { recursive: true, force: true });
    console.log(".dig folder deleted.");
  }

  // Re-create the .dig directory
  fs.mkdirSync(digDir);

  const storeInfo = await createDataLayerStore();
  if (storeInfo) {
    const storeId = storeInfo.launcherId.toString("hex");
    console.log("Store ID:", storeId);

    // Serialize storeInfo to state.dat
    const serializedStoreInfo = serializeStoreInfo(storeInfo);
    const stateFilePath = path.join(digDir, stateFileName);
    fs.writeFileSync(stateFilePath, JSON.stringify(serializedStoreInfo, null, 4));

    const options: DataIntegrityLayerOptions = {
      storageMode: "local",
      storeDir: digDir,
    };

    new DataIntegrityLayer(storeId, options);
  } else {
    console.log("Failed to initialize the data layer store.");
    fs.rmSync(digDir, { recursive: true, force: true });
  }
};
