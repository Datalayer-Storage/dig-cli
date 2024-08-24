import * as fs from "fs";
import superagent from "superagent";
import { promptCredentials, logApiRequest, waitForPromise } from "../utils";
import { DIG_FOLDER_PATH, CONFIG_FILE_PATH, getActiveStoreId, setRemote } from "../utils/config";
import {
  doesHostExistInMirrors,
  createServerCoin,
} from "../blockchain/server_coin";
import { getLocalRootHistory } from "../blockchain/datastore";
import { uploadDirectory } from "../utils/upload";
import { promptForRemote } from '../prompts';

// Helper function to check if necessary files exist
const checkRequiredFiles = (): void => {
  if (!fs.existsSync(DIG_FOLDER_PATH)) {
    throw new Error(".dig folder not found. Please run init first.");
  }
  if (!fs.existsSync(CONFIG_FILE_PATH)) {
    throw new Error("Config file not found.");
  }
};

// Helper function to read and parse the config file
const getConfig = (): { remote: string } => {
  return JSON.parse(fs.readFileSync(CONFIG_FILE_PATH, "utf-8"));
};

// Helper function to get upload details
const getUploadDetails = async (
  remote: string,
  username: string,
  password: string
) => {
  return waitForPromise(
    async () => {
      try {
        console.log(username, password);
        const request = superagent.head(remote).auth(username, password);
        const response = await logApiRequest(request);

        return {
          lastUploadedHash: response.headers["x-generation-hash"],
          uploadType: response.headers["x-upload-type"],
          nonce: response.headers["x-nonce"],
          generationIndex: Number(response.headers["x-generation-index"]),
        };
      } catch (error: any) {
        console.error(error.message);
        return false;
      }
    },
    "Performing remote preflight",
    "Preflight succeeded.",
    "Error on preflight."
  );
};

// Main push function
export const push = async (): Promise<void> => {
  try {
    checkRequiredFiles();

    const config = getConfig();

    if (!config?.remote) {
      const remote = await promptForRemote();
      setRemote(remote);
      config.remote = remote;
    }

    const { username, password } = await promptCredentials(config.remote);
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

    const standardOriginEndpoint = `https://${config.remote}/stores/${storeId.toString(
      "hex"
    )}`;

    const preflight = await getUploadDetails(
      standardOriginEndpoint,
      username,
      password
    );

    if (!preflight) {
      throw new Error("Failed to perform preflight check.");
    }

    const { lastUploadedHash, generationIndex, nonce } = preflight as {
      lastUploadedHash: string;
      generationIndex: number;
      nonce: string;
    };

    // Handle conditions based on the upload details
    if (
      lastUploadedHash !== lastLocalRootHash &&
      generationIndex === localGenerationIndex
    ) {
      console.log(
        "The repository seems to be currupepted. Please pull the latest changes before pushing."
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

    await uploadDirectory(
      standardOriginEndpoint,
      username,
      password,
      nonce,
      DIG_FOLDER_PATH,
      storeId.toString("hex"),
      generationIndex
    );

    // Ensure server coin exists for the remote
    const serverCoinExists = await doesHostExistInMirrors(
      storeId.toString("hex"),
      config.remote
    );
    if (!serverCoinExists) {
      await createServerCoin(storeId.toString("hex"), [config.remote]);
    }
  } catch (error: any) {
    console.error(`Push failed: ${error.message}`);
  }
};
