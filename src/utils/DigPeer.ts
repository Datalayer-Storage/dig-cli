import fs from "fs";
import path from "path";
import https from "https";
import _ from "lodash";
import { URL } from "url";
import { getOrCreateSSLCerts } from "./ssl";
import { createKeyOwnershipSignature } from "../blockchain/signature";
import { getPublicSyntheticKey } from "../blockchain/keys";
import { promptCredentials } from ".";
import { DigConfig } from "../types";
import { waitForPromise } from ".";
import { DIG_FOLDER_PATH, ensureDigConfig, STORE_PATH } from "./config";
import { getRootHistory } from "../blockchain/datastore";
import { validateFileSha256 } from "../utils/validationUtils";

interface FileData {
  sha256: string;
}

interface DatFile {
  root: string;
  files: Record<string, FileData>;
}

interface PaymentAddress {
  xch_address: string;
}

class DigPeer {
  public ipAddress: string;
  public storeId: string;

  // SSL certificates
  private static certPath: string;
  private static keyPath: string;

  // Retry configuration
  private static readonly maxRetries = 5;
  private static readonly initialDelay = 2000; // 2 seconds
  private static readonly maxDelay = 10000; // 10 seconds
  private static readonly delayMultiplier = 1.5;

  // Credentials
  private username: string | undefined;
  private password: string | undefined;

  constructor(ipAddress: string, storeId: string) {
    this.ipAddress = ipAddress;
    this.storeId = storeId;

    if (!DigPeer.certPath || !DigPeer.keyPath) {
      const { certPath, keyPath } = getOrCreateSSLCerts();
      DigPeer.certPath = certPath;
      DigPeer.keyPath = keyPath;
    }
  }

  // Method to get the content of a specified key from the peer
  public async getKey(key: string): Promise<string> {
    const url = `https://${this.ipAddress}:4159/${this.storeId}/${key}`;
    return this.fetchWithRetries(url);
  }

  // Method to validate the store remotely by fetching necessary data from the peer
  public async validateStore(
    rootHash: string,
    keys: string[]
  ): Promise<boolean> {
    console.log(
      `Validating store ${this.storeId} on peer ${this.ipAddress}...`
    );

    try {
      // Fetch the root history from the peer
      const rootHistory = await getRootHistory(
        Buffer.from(this.storeId, "hex")
      );

      if (rootHistory.length === 0) {
        console.error("No root history found for the store.");
        return false;
      }

      // Fetch the manifest.dat file content from the peer
      const manifestContent = await this.getKey("manifest.dat");
      const manifestHashes: string[] = manifestContent
        .split("\n")
        .filter(Boolean);

      // Ensure all hashes in root history are present in the manifest in the same order
      for (let i = 0; i < rootHistory.length; i++) {
        if (rootHistory[i].root_hash !== manifestHashes[i]) {
          console.error(
            `Hash mismatch at index ${i}: manifest hash ${manifestHashes[i]} does not match root history hash ${rootHistory[i].root_hash}`
          );
          return false;
        }
      }

      console.log("Manifest file validated.");

      // Fetch the .dat file content for the specified root hash from the peer
      const datFileContent: DatFile = JSON.parse(
        await this.getKey(`${rootHash}.dat`)
      );

      if (datFileContent.root !== rootHash) {
        console.error(
          `Root hash in .dat file does not match: ${datFileContent.root} !== ${rootHash}`
        );
        return false;
      }

      let filesIntegrityIntact = true;

      // Validate SHA256 hashes of the specified keys
      for (const key of keys) {
        const fileData = datFileContent.files[key];
        if (!fileData) {
          console.error(`File key ${key} not found in .dat file.`);
          filesIntegrityIntact = false;
          continue;
        }

        const integrityCheck = validateFileSha256(
          fileData.sha256,
          path.join(STORE_PATH, this.storeId, "data")
        );

        if (!integrityCheck) {
          console.error(`File ${key} failed SHA256 validation.`);
          filesIntegrityIntact = false;
        }
      }

      if (!filesIntegrityIntact) {
        console.error("Store Corrupted: Data failed SHA256 validation.");
        return false;
      }

      console.log("Store validation successful.");
      return true;
    } catch (error: any) {
      console.error(`Failed to validate store: ${error.message}`);
      return false;
    }
  }

  // Method to check if the store is synced
  public async isStoreSynced(): Promise<boolean> {
    console.log(
      `Checking if store ${this.storeId} on peer ${this.ipAddress} is up to date...`
    );

    try {
      const rootHistory = await getRootHistory(
        Buffer.from(this.storeId, "hex")
      );
      const manifestContent = await this.getKey("manifest.dat");
      const manifestHashes = manifestContent.split("\n").filter(Boolean);

      return rootHistory.length === manifestHashes.length;
    } catch (error: any) {
      console.error(`Failed to check if store is synced: ${error.message}`);
      return false;
    }
  }

  // Method to upload a file to the peer, handles the nonce and credentials internally
  public async pushFile(filePath: string, relativePath: string): Promise<void> {
    const { nonce, username, password } = await this.getUploadDetails();
    const keyOwnershipSig = await createKeyOwnershipSignature(nonce);
    const publicKey = await getPublicSyntheticKey();

    const uploadUrl = `https://${this.ipAddress}:4159/${this.storeId}/${relativePath}`;
    await this.retryOperation(
      () =>
        this.uploadFileDirect(
          filePath,
          uploadUrl,
          username,
          password,
          keyOwnershipSig,
          publicKey.toString("hex"),
          nonce
        ),
      `Upload failed for ${relativePath}`
    );
  }

  // Helper method to fetch content with retries and redirection handling
  private async fetchWithRetries(url: string): Promise<string> {
    return this.retryOperation(
      () => this.fetch(url),
      `Failed to retrieve data from ${url}`
    );
  }

  // Generic retry operation handler to reduce redundancy
  private async retryOperation<T>(
    operation: () => Promise<T>,
    errorMessage: string
  ): Promise<T> {
    let attempt = 0;
    let delay = DigPeer.initialDelay;

    while (attempt < DigPeer.maxRetries) {
      try {
        return await operation();
      } catch (error: any) {
        if (attempt < DigPeer.maxRetries - 1) {
          console.warn(
            `Attempt ${attempt + 1} failed: ${error.message}. Retrying in ${
              delay / 1000
            } seconds...`
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
          delay = Math.min(DigPeer.maxDelay, delay * DigPeer.delayMultiplier);
        } else {
          console.error(`${errorMessage}. Aborting.`);
          throw error;
        }
      }
      attempt++;
    }
    throw new Error(errorMessage);
  }

  // Core method to fetch content from a URL
  private async fetch(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);

      const requestOptions = this.buildRequestOptions(urlObj);

      const request = https.request(requestOptions, (response) => {
        let data = "";

        if (response.statusCode === 200) {
          response.on("data", (chunk) => {
            data += chunk;
          });

          response.on("end", () => {
            resolve(data);
          });
        } else if (response.statusCode === 301 || response.statusCode === 302) {
          // Handle redirects
          const redirectUrl = response.headers.location;
          if (redirectUrl) {
            this.fetch(redirectUrl).then(resolve).catch(reject);
          } else {
            reject(new Error("Redirected without a location header"));
          }
        } else {
          reject(
            new Error(
              `Failed to retrieve data from ${url}. Status code: ${response.statusCode}`
            )
          );
        }
      });

      request.on("error", (error) => {
        console.error(`Request error for ${url}:`, error);
        reject(error);
      });

      request.end();
    });
  }

  // Core method to upload a file directly to the URL using a stream
  private async uploadFileDirect(
    filePath: string,
    uploadUrl: string,
    username: string,
    password: string,
    keyOwnershipSig: string,
    publicKey: string,
    nonce: string
  ): Promise<void> {
    const fileStream = fs.createReadStream(filePath);
    const fileSize = fs.statSync(filePath).size;

    return new Promise<void>((resolve, reject) => {
      const url = new URL(uploadUrl);

      const options = {
        ...this.buildRequestOptions(url),
        method: "PUT",
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Length": fileSize,
          Authorization: `Basic ${Buffer.from(
            `${username}:${password}`
          ).toString("base64")}`,
          "x-key-ownership-sig": keyOwnershipSig,
          "x-public-key": publicKey,
          "x-nonce": nonce,
        },
      };

      const req = https.request(options, (res) => {
        if (res.statusCode === 200) {
          resolve();
        } else {
          reject(
            new Error(
              `Upload failed with status ${res.statusCode}: ${res.statusMessage}`
            )
          );
        }
      });

      req.on("error", (err) => {
        reject(err);
      });

      fileStream.pipe(req);

      fileStream.on("error", (err) => {
        reject(err);
      });

      req.on("end", () => {
        resolve(); // Resolve the promise when the upload is fully completed
      });
    });
  }

  // Helper method to get upload details including nonce
  private async getUploadDetails(): Promise<{
    nonce: string;
    username: string;
    password: string;
  }> {
    if (!this.username || !this.password) {
      const config: DigConfig = await this.getConfig();

      if (!config.remote) {
        throw new Error("Failed to read configuration.");
      }

      const credentials = await promptCredentials(config.remote);
      this.username = credentials.username;
      this.password = credentials.password;
    }

    const uploadDetails = await this.fetchUploadDetails(
      this.username,
      this.password
    );
    if (!uploadDetails) {
      throw new Error("Failed to retrieve upload details.");
    }

    return {
      nonce: uploadDetails.nonce,
      username: this.username,
      password: this.password,
    };
  }

  // Method to fetch upload details from the server
  private async fetchUploadDetails(
    username: string,
    password: string
  ): Promise<{ nonce: string } | false> {
    const remote = `https://${this.ipAddress}:4159/${this.storeId}`;
    return waitForPromise(
      () => {
        return new Promise<{ nonce: string } | false>((resolve, reject) => {
          const url = new URL(remote);

          const options = {
            ...this.buildRequestOptions(url),
            method: "HEAD",
            headers: {
              Authorization: `Basic ${Buffer.from(
                `${username}:${password}`
              ).toString("base64")}`,
            },
          };

          const req = https.request(options, (res) => {
            if (res.statusCode === 200) {
              resolve({
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
  }

  // Helper method to build common request options
  private buildRequestOptions(url: URL) {
    return {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname + url.search,
      key: fs.readFileSync(DigPeer.keyPath),
      cert: fs.readFileSync(DigPeer.certPath),
      rejectUnauthorized: false, // Allow self-signed certificates
    };
  }

  // Helper function to read and parse the config file
  private async getConfig(): Promise<DigConfig> {
    const config = await ensureDigConfig(DIG_FOLDER_PATH);
    return config;
  }

  public async getPaymentAddress(): Promise<string> {
    console.log(`Fetching payment address from peer ${this.ipAddress}...`);

    try {
      const url = `http://${this.ipAddress}/.well-known`;
      const response = await this.fetchWithRetries(url);
      const paymentInfo: PaymentAddress = JSON.parse(response);
      return paymentInfo.xch_address;
    } catch (error: any) {
      console.error(
        `Failed to fetch payment address from ${this.ipAddress}: ${error.message}`
      );
      throw new Error(`Failed to fetch payment address: ${error.message}`);
    }
  }

  public async sendPayment(amount: number): Promise<void> {
    try {
      const paymentAddress = await this.getPaymentAddress();
      console.log(
        `Sending ${amount} XCH to ${paymentAddress} for peer ${this.ipAddress}...`
      );
      // TODO: Implement the payment sending logic
    } catch (error: any) {
      console.error(`Failed to send payment: ${error.message}`);
      throw new Error(`Failed to send payment: ${error.message}`);
    }
  }
}

export { DigPeer };
