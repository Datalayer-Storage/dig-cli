import * as fs from "fs";
import * as path from "path";
import { createDataLayerStore } from "../blockchain/datalayer";
import { DataIntegrityTree, DataIntegrityTreeOptions } from "../DataIntegrityTree";
import { DIG_FOLDER_PATH, MIN_HEIGHT, getHeightFilePath, setActiveStore, CONFIG_FILE_PATH, createInitialConfig } from "../utils/config";
import { CreateStoreUserInputs } from "../types";
import { getPeer } from "../blockchain/peer";

export const init = async (inputs: CreateStoreUserInputs = {}): Promise<void> => {
  if (!fs.existsSync(DIG_FOLDER_PATH)) {
    fs.mkdirSync(DIG_FOLDER_PATH);
  }

  if (!fs.existsSync(CONFIG_FILE_PATH)) {
    createInitialConfig();
  }

  const peer = await getPeer();
  const currentHeight = (await peer.getPeak()) || MIN_HEIGHT;
  const currentHeaderHash = await peer.getHeaderHash(currentHeight);

  const storeInfo = await createDataLayerStore(inputs);
  if (storeInfo) {
    const storeId = storeInfo.launcherId.toString("hex");

    const options: DataIntegrityTreeOptions = {
      storageMode: "local",
      storeDir: DIG_FOLDER_PATH
    };

    new DataIntegrityTree(storeId, options);

    fs.writeFileSync(
      getHeightFilePath(storeInfo.launcherId.toString("hex")),
      JSON.stringify({
        createdAtHeight: currentHeight,
        createdAtHash: currentHeaderHash.toString("hex"),
      })
    );

    setActiveStore(storeId);

    console.log(`Store initialized at Block Height: ${currentHeight} | ${currentHeaderHash.toString('hex')}`);
  } else {
    console.log("Failed to initialize the data layer store.");
    fs.rmSync(DIG_FOLDER_PATH, { recursive: true, force: true });
  }
};
