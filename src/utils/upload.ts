import * as fs from "fs";
import * as path from "path";
import * as https from "https";
import { MultiBar, Presets } from "cli-progress";
import { getDeltaFiles } from ".";
import { getOrCreateSSLCerts } from "./ssl";
import { createKeyOwnershipSignature } from "../blockchain/signature";
import { getPublicSyntheticKey } from "../blockchain/keys";

// Retrieve or generate SSL certificates
const { certPath, keyPath } = getOrCreateSSLCerts();

// Function to upload a single file directly to the URL using a stream
const uploadFileDirect = async (
  filePath: string,
  uploadUrl: string,
  username: string,
  password: string,
  keyOwnershipSig: string,
  publicKey: string,
  nonce: string
): Promise<void> => {
  const fileStream = fs.createReadStream(filePath);
  const fileSize = fs.statSync(filePath).size;

  return new Promise<void>((resolve, reject) => {
    const url = new URL(uploadUrl);

    const auth = Buffer.from(`${username}:${password}`).toString("base64");

    const options = {
      hostname: url.hostname,
      port: url.port || 4159,
      path: url.pathname,
      method: "PUT",
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certPath),
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Length": fileSize,
        Authorization: `Basic ${auth}`,
        "x-key-ownership-sig": keyOwnershipSig,
        "x-public-key": publicKey,
        "x-nonce": nonce,
      },
      rejectUnauthorized: false,
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

    req.on("finish", () => {
      resolve();
    });
  });
};

// Function to handle the retry logic for direct uploads
const retryUploadDirect = async (
  digPeer: string,
  storeId: string,
  filePath: string,
  relativePath: string,
  username: string,
  password: string,
  keyOwnershipSig: string,
  publicKey: string,
  nonce: string,
  maxRetries: number = 5
): Promise<void> => {
  let attempt = 0;
  let delay = 2000; // Start with a 2-second delay
  const maxDelay = 10000; // Cap the delay at 10 seconds
  const delayMultiplier = 1.5; // Use a less aggressive multiplier

  while (attempt < maxRetries) {
    try {
      const uploadUrl = `https://${digPeer}:4159/${storeId}/${relativePath}`; // Direct URL constructed here

      await uploadFileDirect(
        filePath,
        uploadUrl,
        username,
        password,
        keyOwnershipSig,
        publicKey,
        nonce
      );
      return; // Successful upload, exit the function
    } catch (error: any) {
      attempt++;
      if (attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay = Math.min(maxDelay, delay * delayMultiplier); // Less aggressive backoff with a max delay cap
      } else {
        console.error(`Max retries reached for ${relativePath}. Aborting.`);
        throw error; // Abort the process after max retries
      }
    }
  }
};

// Function to handle the upload process for a directory
export const uploadDirectory = async (
  digPeer: string,
  directory: string,
  storeId: string,
  username: string,
  password: string,
  nonce: string,
  generationIndex: number
): Promise<void> => {
  const keyOwnershipSig = await createKeyOwnershipSignature(nonce);
  const publicKey = await getPublicSyntheticKey();

  const storeDir = path.resolve(directory, storeId);
  const filesToUpload = await getDeltaFiles(
    storeId,
    generationIndex,
    directory
  );

  if (filesToUpload.length === 0) {
    console.log("No files to upload.");
    return;
  }

  const multiBar = new MultiBar(
    {
      clearOnComplete: false,
      hideCursor: true,
      format: "{bar} | {percentage}% | {name}",
    },
    Presets.shades_classic
  );

  const uploadBar = multiBar.create(filesToUpload.length, 0, {
    name: "Store Data",
  });

  try {
    for (const filePath of filesToUpload) {
      const relativePath = path
        .relative(storeDir, filePath)
        .replace(/\\/g, "/"); // Convert to forward slashes

      // Handle direct uploads
      await retryUploadDirect(
        digPeer,
        storeId,
        filePath,
        relativePath,
        username,
        password,
        keyOwnershipSig,
        publicKey.toString("hex"),
        nonce
      );

      uploadBar.increment();
    }
  } catch (error: any) {
    console.error("Upload process failed:", error.message || error);
    throw error; // Re-throw the error to ensure the process halts
  } finally {
    multiBar.stop();
  }
};
