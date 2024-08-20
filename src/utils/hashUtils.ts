import * as crypto from "crypto";
import * as path from "path";

/**
 * Calculate the SHA-256 hash of a buffer using the crypto module.
 * @param buffer - The buffer.
 * @returns The SHA-256 hash of the buffer.
 */
export const calculateSHA256 = (buffer: Buffer): string => {
  const hash = crypto.createHash("sha256");
  hash.update(buffer);
  return hash.digest("hex");
};

// Helper function to derive file path from SHA256 hash
export const getFilePathFromSha256 = (
  sha256: string,
  dataDir: string
): string => {
  return path.join(dataDir, sha256.match(/.{1,2}/g)!.join("/"));
};

// Function to generate file paths based on SHA-256 hashes
export const getFilePathFromSHA256 = (sha256: string): string => {
  const parts = sha256.match(/.{1,2}/g); // Split into chunks of 2 characters
  if (!parts) {
    throw new Error(`Invalid sha256 hash: ${sha256}`);
  }
  return path.join(
    ".dig",
    "data",
    ...parts.slice(0, -1),
    parts[parts.length - 1]
  );
};
