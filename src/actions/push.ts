import * as fs from "fs";
import {
  DIG_FOLDER_PATH,
  getActiveStoreId,
  setRemote,
  CONFIG_FILE_PATH,
  ensureDigConfig,
} from "../utils/config";
import { getLocalRootHistory } from "../blockchain/datastore";
import { DigNetwork } from "../DigNetwork";
import { DigPeer } from "../DigNetwork";
import { promptForRemote } from "../prompts";
import { DigConfig } from "../types";

// Check that required files exist
const checkRequiredFiles = (): void => {
  if (!fs.existsSync(DIG_FOLDER_PATH)) {
    throw new Error(".dig folder not found. Please run init first.");
  }
  if (!fs.existsSync(CONFIG_FILE_PATH)) {
    throw new Error("Config file not found.");
  }
};

// Helper function to read and parse the config file
const getConfig = async (): Promise<DigConfig> => {
  const config = await ensureDigConfig(DIG_FOLDER_PATH);
  return config;
};

// Main push function
export const push = async (): Promise<void> => {
  try {
    checkRequiredFiles();

    const config = await getConfig();

    if (!config?.remote) {
      const remote = await promptForRemote();
      setRemote(remote);
      config.remote = remote;
    }

    const storeId = await getActiveStoreId();

    if (!storeId) {
      throw new Error(
        "Could not find the store ID. Make sure you have committed your changes."
      );
    }

    const rootHistory = await getLocalRootHistory();

    if (!rootHistory || rootHistory.length === 0) {
      throw new Error(
        "No root hashes found. Please commit your changes first."
      );
    }

    const lastLocalRootHash = rootHistory[rootHistory.length - 1].root_hash;
    const localGenerationIndex = rootHistory.length - 1;

    // Instantiate DigPeer
    const digPeer = new DigPeer(config.remote, storeId.toString("hex"));

    // Preflight check is handled internally by PropagationServer if needed
    const { lastUploadedHash, generationIndex } = await digPeer.propagationServer.getUploadDetails();

    // Handle conditions based on the upload details
    if (
      lastUploadedHash !== lastLocalRootHash &&
      generationIndex === localGenerationIndex
    ) {
      console.log(
        "The repository seems to be corrupted. Please pull the latest changes before pushing."
      );
      return;
    }

    if (
      lastUploadedHash === lastLocalRootHash &&
      generationIndex === localGenerationIndex
    ) {
      console.log("No changes detected. Skipping push.");
      return;
    }

    if (
      lastUploadedHash !== lastLocalRootHash &&
      generationIndex > localGenerationIndex
    ) {
      throw new Error(
        "Remote repository is ahead of the local repository. Please pull the latest changes before pushing."
      );
    }

    // Instantiate DigNetwork and perform the upload
    const digNetwork = new DigNetwork(storeId.toString("hex"));
    await digNetwork.uploadStore(digPeer, generationIndex);
  } catch (error: any) {
    console.error(`Push failed: ${error.message}`);
  } finally {
    process.exit();
  }
};
