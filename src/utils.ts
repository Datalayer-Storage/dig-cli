import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import * as readline from "readline";
import superagent from "superagent";
import { DataIntegrityLayer } from "./DataIntegrityLayer";
import { FileDetails } from "./types";
import ignore from "ignore";
import zlib from "zlib";
import { createSpinner, Spinner } from "nanospinner";

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

/**
 * Recursively add all files in a directory to the Merkle tree, skipping the .dig, .git folders, and files in .gitignore.
 * @param datalayer - The DataStoreManager instance.
 * @param dirPath - The directory path.
 * @param baseDir - The base directory for relative paths.
 */
export const addDirectory = async (
  datalayer: DataIntegrityLayer,
  dirPath: string,
  baseDir: string = dirPath
): Promise<void> => {
  const ig = ignore();
  const gitignorePath = path.join(baseDir, ".gitignore");

  // Load .gitignore rules if the file exists
  if (fs.existsSync(gitignorePath)) {
    const gitignoreContent = fs.readFileSync(gitignorePath, "utf-8");
    ig.add(gitignoreContent);
  }

  const files = fs.readdirSync(dirPath);

  for (const file of files) {
    const filePath = path.join(dirPath, file);
    const relativePath = path.relative(baseDir, filePath).replace(/\\/g, "/");

    // Skip the .dig, .git folders and files or directories ignored by .gitignore
    if (file === ".dig" || file === ".git" || ig.ignores(relativePath)) {
      continue;
    }

    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      await addDirectory(datalayer, filePath, baseDir);
    } else {
      await new Promise<void>((resolve, reject) => {
        const stream = fs.createReadStream(filePath);
        datalayer
          .upsertKey(stream, Buffer.from(relativePath).toString("hex"))
          .then(resolve)
          .catch(reject);
      });
    }
  }
};

/**
 * Verifies if a connection string is valid based on the given format.
 *
 * Format: dig://hostname:username/distributionname.dig
 *
 * @param {string} connectionString - The connection string to verify.
 * @returns {boolean} - Returns true if the connection string is valid, otherwise false.
 */
export const verifyConnectionString = (connectionString: string): boolean => {
  // Define the regular expression pattern to match the connection string format
  const pattern: RegExp =
    /^dig:\/\/([a-zA-Z0-9.-]+):([a-zA-Z0-9]+)\/([a-zA-Z0-9_-]+)\.dig$/;

  // Test the connection string against the pattern
  return pattern.test(connectionString);
};

// Function to prompt for a password
export const promptPassword = (host: string): Promise<string> => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`Enter your password for ${host}:`, (password) => {
      rl.close();
      resolve(password);
    });
  });
};

// Function to generate file paths based on SHA-256 hashes
export const getFilePathFromSHA256 = (sha256: string): string => {
  const parts = sha256.match(/.{1,2}/g); // Split into chunks of 2 characters
  if (!parts) {
    throw new Error(`Invalid sha256 hash: ${sha256}`);
  }
  const filePath = path.join(
    ".dig",
    "data",
    ...parts.slice(0, -1),
    parts[parts.length - 1]
  );
  return filePath;
};

/**
 * Validates if the SHA256 hash of the decompressed file matches the provided hash.
 *
 * @param sha256 - The expected SHA256 hash of the decompressed file.
 * @param dataDir - The root folder where the data files are stored.
 * @returns A boolean indicating whether the decompressed file's hash matches the provided hash.
 */
export const validateFileSha256 = (
  sha256: string,
  dataDir: string
): boolean => {
  // Derive the file path from the SHA256 hash
  const filePath = path.join(dataDir, sha256.match(/.{1,2}/g)!.join("/"));

  if (!fs.existsSync(filePath)) {
    return false;
  }

  // Read and decompress the file
  const fileBuffer = fs.readFileSync(filePath);
  const decompressedBuffer = zlib.gunzipSync(fileBuffer);

  // Calculate the SHA256 hash of the decompressed content
  const hash = crypto
    .createHash("sha256")
    .update(decompressedBuffer)
    .digest("hex");

  // Compare the calculated hash with the provided hash
  return hash === sha256;
};

export const cleanupOnFailure = async (
  hostname: string,
  username: string,
  distributionName: string,
  files: FileDetails[],
  password: string
) => {
  try {
    await superagent
      .delete(`https://${hostname}/upload/${username}/${distributionName}`)
      .auth(username, password)
      .send({ username, distributionName, files });
    console.log("Cleanup completed successfully.");
  } catch (cleanupError) {
    console.error("Failed to cleanup files:", cleanupError);
  }
};

// Calculate the total size of the DIG_FOLDER_PATH
export const calculateFolderSize = (folderPath: string): bigint => {
  let totalSize = BigInt(0);

  const files = fs.readdirSync(folderPath);

  for (const file of files) {
    const filePath = path.join(folderPath, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      totalSize += calculateFolderSize(filePath);
    } else {
      totalSize += BigInt(stat.size);
    }
  }

  return totalSize;
};

export const waitForPromise = async <T>(
  promiseFn: () => Promise<T>,
  spinnerText: string = "Processing...",
  successText: string = "OK!",
  errorText: string = "Error."
): Promise<T> => {
  const spinner: Spinner = createSpinner(spinnerText).start();

  try {
    const result = await promiseFn();
    if (result) {
      spinner.success({ text: successText });
    } else {
      spinner.error({ text: errorText });
    }

    return result;
  } catch (error) {
    spinner.error({ text: errorText });
    throw error;
  }
};
