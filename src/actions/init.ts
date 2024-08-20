import * as fs from "fs";
import * as path from "path";
import { createDataLayerStore } from "../blockchain/datalayer";
import { DataIntegrityTree, DataIntegrityLayerOptions } from "../DataIntegrityTree";
import { DIG_FOLDER_PATH, MIN_HEIGHT, getHeightFilePath } from "../utils/config";
import { askToDeleteAndReinit } from "../prompts";
import { CreateStoreUserInputs } from "../types";
import { getPeer } from "../blockchain/peer";

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

  const peer = await getPeer();
  const currentHeight = (await peer.getPeak()) || MIN_HEIGHT;
  const currentHeaderHash = await peer.getHeaderHash(currentHeight);

  

  const storeInfo = await createDataLayerStore(inputs);
  if (storeInfo) {
    const storeId = storeInfo.launcherId.toString("hex");

    const options: DataIntegrityLayerOptions = {
      storageMode: "local",
      storeDir: DIG_FOLDER_PATH,
    };

    new DataIntegrityTree(storeId, options);

    fs.writeFileSync(
      getHeightFilePath(storeInfo.launcherId.toString("hex")),
      JSON.stringify({
        createdAtHeight: currentHeight,
        createdAtHash: currentHeaderHash.toString("hex"),
      })
    );

    console.log(`Store initialized at Height: ${currentHeight} | ${currentHeaderHash.toString('hex')}`);
  } else {
    console.log("Failed to initialize the data layer store.");
    fs.rmSync(DIG_FOLDER_PATH, { recursive: true, force: true });
  }
};
