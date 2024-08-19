import * as fs from "fs";
import superagent from "superagent";
import { promptCredentials, logApiRequest, waitForPromise } from "../utils";
import { DIG_FOLDER_PATH, CONFIG_FILE_PATH } from "../config";
import {
  doesHostExistInMirrors,
  createServerCoin,
} from "../blockchain/server_coin";
import { createKeyOwnershipSignature } from "../blockchain/signature";
import {
  findLauncherId,
  getLocalRootHistory,
  getStoreCreatedAtHeight,
} from "../blockchain/datastore";
import { getPublicSyntheticKey } from "../blockchain/keys";
import { uploadDirectory } from "../upload";

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
const getConfig = (): { origin: string } => {
  const config = JSON.parse(fs.readFileSync(CONFIG_FILE_PATH, "utf-8"));
  if (!config.origin) {
    throw new Error('The "origin" field is not set in the config file.');
  }
  return config;
};

// Helper function to get upload details
const getUploadDetails = async (
  origin: string,
  username: string,
  password: string
) => {
  return waitForPromise(
    async () => {
      try {
        const request = superagent.head(origin).auth(username, password);
        const response = await logApiRequest(request);

        return {
          lastUploadedHash: response.headers["x-last-uploaded-hash"],
          uploadType: response.headers["x-upload-type"],
          nonce: response.headers["x-nonce"],
          generationIndex: Number(response.headers["x-generation-index"]),
        };
      } catch (error: any) {
        return false;
      }
    },
    "Performing origin preflight",
    "Preflight succeeded.",
    "Error on preflight."
  );
};

// Helper function to get the signed upload URL
const getUploadUrl = async (
  origin: string,
  username: string,
  password: string,
  nonce: string
) => {
  return waitForPromise(
    async () => {
      try {
        const keyOwnershipSig = await createKeyOwnershipSignature(nonce);
        const publicSyntheticKey = await getPublicSyntheticKey();
        const { createdAtHeight, createdAtHash } =
          await getStoreCreatedAtHeight();
        const request = superagent
          .post(origin)
          .auth(username, password)
          .send({
            key_ownership_sig: keyOwnershipSig,
            public_key: publicSyntheticKey.toString("hex"),
          })
          .set("x-created-at-height", String(createdAtHeight))
          .set("x-created-at-hash", createdAtHash.toString("hex"));
        const response = await logApiRequest(request);
        return response.body.uploadUrl;
      } catch (error: any) {
        return undefined;
      }
    },
    "Getting signed upload URL",
    "Proceeding to upload store.",
    "Failed to get signed upload URL"
  );
};

// Main push function
export const push = async (): Promise<void> => {
  try {
    checkRequiredFiles();

    const config = getConfig();
    const origin = new URL(config.origin);

    const { username, password } = await promptCredentials(origin.hostname);
    const storeId = await findLauncherId(DIG_FOLDER_PATH);

    if (!storeId) {
      throw new Error(
        "Could not find the store ID. Make sure you have committed your changes."
      );
    }

    if (!origin.pathname.includes(storeId)) {
      throw new Error("The origin URL is pointing to the wrong store id.");
    }

    const rootHistory = await getLocalRootHistory();

    if (!rootHistory || rootHistory.length === 0) {
      throw new Error(
        "No root hashes found. Please commit your changes first."
      );
    }

    const lastLocalRootHash = rootHistory[rootHistory.length - 1].root_hash;
    const localGenerationIndex = rootHistory.length - 1;

    const preflight = await getUploadDetails(config.origin, username, password);

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

    const signedUploadUrl = await getUploadUrl(
      config.origin,
      username,
      password,
      nonce
    );

    if (!signedUploadUrl) {
      throw new Error("Failed to get the signed upload URL.");
    }

    await uploadDirectory(signedUploadUrl, storeId, origin, DIG_FOLDER_PATH, generationIndex + 1);

    // Ensure server coin exists for the origin
    const serverCoinExists = await doesHostExistInMirrors(
      storeId,
      `${origin.protocol}//${origin.hostname}`
    );
    if (!serverCoinExists) {
      console.log(`Creating server coin for ${origin.hostname}`);
      await createServerCoin(storeId, [
        `${origin.protocol}//${origin.hostname}`,
      ]);
    }
  } catch (error: any) {
    console.error(`Push failed: ${error.message}`);
  }
};
