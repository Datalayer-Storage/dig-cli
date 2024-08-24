import * as fs from "fs";
import * as path from "path";
import { MultiBar, Presets } from "cli-progress";
import { getDeltaFiles } from ".";
import superagent from "superagent";
import { createKeyOwnershipSignature } from "../blockchain/signature";
import { getPublicSyntheticKey } from "../blockchain/keys";
import { getStoreCreatedAtHeight } from "../blockchain/datastore";

// Function to request a signed upload URL
const getUploadUrl = async (
  remote: string,
  username: string,
  password: string,
  nonce: string,
  filename: string,
): Promise<string | undefined> => {
  try {
    const keyOwnershipSig = await createKeyOwnershipSignature(nonce);
    const publicSyntheticKey = await getPublicSyntheticKey();
    const { createdAtHeight, createdAtHash } = await getStoreCreatedAtHeight();

    const response = await superagent
      .post(remote)
      .auth(username, password)
      .send({
        key_ownership_sig: keyOwnershipSig,
        public_key: publicSyntheticKey.toString("hex"),
        filename: filename.replace(/\\/g, "/"),
        nonce
      })
      .set("x-created-at-height", String(createdAtHeight))
      .set("x-created-at-hash", createdAtHash.toString("hex"));

    return response.body.uploadUrl;
  } catch (error: any) {
    if (error.status === 409) {
      return undefined; // Skip this file by returning undefined
    } else {
      throw error; // Abort the process on any other error
    }
  }
};

// Function to upload a single file using the signed URL
const uploadFile = async (
  filePath: string,
  uploadUrl: string,
): Promise<void> => {
  const fileBuffer = fs.readFileSync(filePath);
  const fileSize = fileBuffer.length;

  const response = await superagent
    .put(uploadUrl)
    .set("Content-Type", "application/octet-stream")
    .set("Content-Length", String(fileSize))
    .send(fileBuffer);

  if (response.status !== 200) {
    throw new Error(`Upload failed with status ${response.status}: ${response.text}`);
  }
};

// Function to retry the entire upload process (get URL + upload file) with less aggressive exponential backoff
const retryUpload = async (
  remote: string,
  username: string,
  password: string,
  nonce: string,
  filePath: string,
  relativePath: string,
  maxRetries: number = 5
): Promise<void> => {
  let attempt = 0;
  let delay = 2000; // Start with a 2-second delay
  const maxDelay = 10000; // Cap the delay at 10 seconds
  const delayMultiplier = 1.5; // Use a less aggressive multiplier

  while (attempt < maxRetries) {
    try {
      const uploadUrl = await getUploadUrl(remote, username, password, nonce, relativePath);

      if (!uploadUrl) {
        return; // Skip this file if it already exists
      }

      await uploadFile(filePath, uploadUrl);
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
  remote: string,
  username: string,
  password: string,
  nonce: string,
  directory: string,
  storeId: string,
  generationIndex: number
): Promise<void> => {
  const storeDir = path.resolve(directory, storeId);
  const filesToUpload = await getDeltaFiles(storeId, generationIndex, directory);

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

  const uploadBar = multiBar.create(filesToUpload.length, 0, { name: "Store Data" });

  try {
    for (const filePath of filesToUpload) {
      const relativePath = path.relative(storeDir, filePath).replace(/\\/g, "/"); // Convert to forward slashes

      await retryUpload(remote, username, password, nonce, filePath, relativePath);
      uploadBar.increment();
    }

  } catch (error: any) {
    console.error("Upload process failed:", error.message || error);
    throw error;
  } finally {
    multiBar.stop();
  }
};
