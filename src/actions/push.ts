import * as fs from "fs";
import { promptCredentials, waitForPromise } from "../utils";
import {
  DIG_FOLDER_PATH,
  getActiveStoreId,
  setRemote,
  CONFIG_FILE_PATH,
  ensureDigConfig,
} from "../utils/config";
import {
  doesHostExistInMirrors,
  createServerCoin,
} from "../blockchain/server_coin";
import { getLocalRootHistory } from "../blockchain/datastore";
import { uploadDirectory } from "../utils/upload";
import { promptForRemote } from "../prompts";
import * as https from "https";
import { URL } from "url";
import { getOrCreateSSLCerts } from "../utils/ssl";
import { DigConfig } from "../types";

// Retrieve or generate SSL certificates
const { certPath, keyPath } = getOrCreateSSLCerts();

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

// Helper function to get upload details using https
const getUploadDetails = async (
  remote: string,
  username: string,
  password: string
) => {
  return waitForPromise(
    () => {
      return new Promise<
        | { lastUploadedHash: string; generationIndex: number; nonce: string }
        | false
      >((resolve, reject) => {
        const url = new URL(remote);

        const options = {
          hostname: url.hostname,
          port: url.port || 4159,
          path: url.pathname,
          method: "HEAD",
          key: fs.readFileSync(keyPath),
          cert: fs.readFileSync(certPath),
          headers: {
            Authorization: `Basic ${Buffer.from(
              `${username}:${password}`
            ).toString("base64")}`,
          },
          rejectUnauthorized: false,
        };

        const req = https.request(options, (res) => {
          if (res.statusCode === 200) {
            resolve({
              lastUploadedHash: res.headers["x-generation-hash"] as string,
              generationIndex: Number(res.headers["x-generation-index"]),
              nonce: res.headers["x-nonce"] as string,
            });
          } else {
            reject(
              new Error(
                `Failed to perform preflight check: ${res.statusCode} ${res.statusMessage}`
              )
            );
          }
        });

        req.on("error", (err) => {
          console.error(err.message);
          resolve(false);
        });

        req.end();
      });
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

    const config = await getConfig();

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

    const standardOriginEndpoint = `https://${config.remote}/${storeId.toString(
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

    const { lastUploadedHash, generationIndex, nonce } = preflight;

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
      config.remote,
      DIG_FOLDER_PATH,
      storeId.toString("hex"),
      username,
      password,
      nonce,
      generationIndex
    );
  } catch (error: any) {
    console.error(`Push failed: ${error.message}`);
  } finally {
    process.exit();
  }
};
