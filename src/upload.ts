import * as fs from "fs";
import * as path from "path";
import crypto from "crypto";
import { MultiBar, Presets } from "cli-progress";
import { getDeltaFiles } from "./utils";
import superagent from "superagent";
import { createKeyOwnershipSignature } from "./blockchain/signature";
import { getPublicSyntheticKey } from "./blockchain/keys";
import { getStoreCreatedAtHeight } from "./blockchain/datastore";

// Function to request a signed upload URL
const getUploadUrl = async (
  origin: string,
  username: string,
  password: string,
  nonce: string,
  filename: string,
  sha256: string
): Promise<string | undefined> => {
  try {
    const keyOwnershipSig = await createKeyOwnershipSignature(nonce);
    const publicSyntheticKey = await getPublicSyntheticKey();
    const { createdAtHeight, createdAtHash } = await getStoreCreatedAtHeight();

    const response = await superagent
      .post(origin)
      .auth(username, password)
      .send({
        key_ownership_sig: keyOwnershipSig,
        public_key: publicSyntheticKey.toString("hex"),
        filename: filename.replace(/\\/g, "/"),
        sha256, // Include the SHA-256 checksum in the request
      })
      .set("x-created-at-height", String(createdAtHeight))
      .set("x-created-at-hash", createdAtHash.toString("hex"));

    return response.body.uploadUrl;
  } catch (error: any) {
    console.error("Failed to get signed upload URL:", error.message || error);
    return undefined;
  }
};

// Function to upload a single file using the signed URL
const uploadFile = async (
  filePath: string,
  relativePath: string,
  uploadUrl: string
): Promise<void> => {
  try {
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

  } catch (error: any) {
    console.error("Upload failed:", error.message || error);
    throw error; // Re-throw to stop the upload process
  }
};

// Function to handle the upload process for a directory
export const uploadDirectory = async (
  origin: string,
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

  const uploadBar = multiBar.create(filesToUpload.length, 0, { name: "Files" });

  try {
    for (const filePath of filesToUpload) {
      const relativePath = path.relative(storeDir, filePath).replace(/\\/g, "/"); // Convert to forward slashes

      // Calculate the SHA-256 checksum for the file
      const fileBuffer = fs.readFileSync(filePath);
      const fileChecksum = crypto.createHash("sha256").update(fileBuffer).digest("hex");

      const uploadUrl = await getUploadUrl(
        origin,
        username,
        password,
        nonce,
        relativePath,
        fileChecksum // Pass the checksum when requesting the signed URL
      );

      if (!uploadUrl) {
        throw new Error("Could not obtain upload URL");
      }

      await uploadFile(filePath, relativePath, uploadUrl);
      uploadBar.increment();
    }

  } catch (error: any) {
    console.error("Upload process failed:", error.message || error);
    throw error;
  } finally {
    multiBar.stop();
  }
};
