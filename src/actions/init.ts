import * as fs from "fs";
import { createDataLayerStore } from "../blockchain/datalayer";
import {
  DataIntegrityTree,
  DataIntegrityTreeOptions,
} from "../DataIntegrityTree";
import {
  DIG_FOLDER_PATH,
  MIN_HEIGHT,
  getHeightFilePath,
  setActiveStore,
  CONFIG_FILE_PATH,
  createInitialConfig,
} from "../utils/config";
import { CreateStoreUserInputs } from "../types";
import { getPeer } from "../blockchain/peer";
import { getLatestStoreInfo } from "../blockchain/datastore";
import { waitForPromise } from "../utils";

export const init = async (
  inputs: CreateStoreUserInputs = {}
): Promise<void> => {
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

    setActiveStore(storeId);

    await waitForPromise(
      () => getLatestStoreInfo(Buffer.from(storeId, "hex")),
      "Final store initialization...",
      "Store initialized.",
      "Failed to initialize the data layer store."
    );

    console.log(
      `Store initialized at Block Height: ${currentHeight} | ${currentHeaderHash.toString(
        "hex"
      )}`
    );
  } else {
    console.log("Failed to initialize the data layer store.");
    fs.rmSync(DIG_FOLDER_PATH, { recursive: true, force: true });
  }
};
