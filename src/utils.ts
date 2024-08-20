import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import * as readline from "readline";
import keytar from "keytar";
import superagent from "superagent";
import { DataIntegrityTree } from "./DataIntegrityTree";
import { FileDetails, Credentials } from "./types";
import ignore from "ignore";
import zlib from "zlib";
import { createSpinner, Spinner } from "nanospinner";
import { uploadDirectory } from "./upload";

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
  datalayer: DataIntegrityTree,
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

// Function to prompt for username and password
export const promptCredentials = async (host: string): Promise<Credentials> => {
  // Check if credentials are already stored in keytar
  const storedUsername = await keytar.getPassword(host, "username");
  const storedPassword = await keytar.getPassword(host, "password");

  if (storedUsername && storedPassword) {
    console.log(`Using stored credentials for origin`);
    return { username: storedUsername, password: storedPassword };
  }

  // If not stored, prompt the user for credentials
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const askQuestion = (question: string): Promise<string> =>
    new Promise((resolve) => rl.question(question, resolve));

  const username = await askQuestion(`Enter your username for ${host}: `);
  const password = await askQuestion(`Enter your password for ${host}: `);

  // Ask if the user wants to store the credentials
  const storeCredentials = await askQuestion(
    `Would you like to store these credentials for later use? (y/n): `
  );

  rl.close();

  if (storeCredentials.toLowerCase() === "y") {
    await keytar.setPassword(host, "username", username);
    await keytar.setPassword(host, "password", password);
    console.log("Credentials stored securely.");
  }

  return { username, password };
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

  // Disable console.log while the spinner is active
  const originalConsoleLog = console.log;
  console.log = () => {};

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
  } finally {
    // Restore the original console.log function
    console.log = originalConsoleLog;
  }
};

// Helper function to log API requests and responses if DIG_DEBUG is enabled
export const logApiRequest = async (request: superagent.SuperAgentRequest) => {
  if (process.env.DIG_DEBUG === "1") {
    console.group("API Request");

    console.log(
      `%cMethod: %c${request.method.toUpperCase()}`,
      "font-weight: bold;",
      "color: cyan;"
    );
    console.log(
      `%cURL: %c${request.url}`,
      "font-weight: bold;",
      "color: cyan;"
    );

    // @ts-ignore
    if (request.header) {
      console.groupCollapsed("%cHeaders", "font-weight: bold;");
      // @ts-ignore
      console.table(request.header);
      console.groupEnd();
    }

    // @ts-ignore
    if (request._data) {
      console.groupCollapsed("%cBody", "font-weight: bold;");
      // @ts-ignore
      const requestBody = JSON.parse(JSON.stringify(request._data));
      if (typeof requestBody === "object" && requestBody !== null) {
        for (const [key, value] of Object.entries(requestBody)) {
          console.groupCollapsed(
            `%c${key}`,
            "font-weight: bold; border: 1px solid #ccc; padding: 2px;"
          );
          if (Array.isArray(value) || typeof value === "object") {
            console.table(value);
          } else {
            console.log(`%c${value}`, "border: 1px solid #ccc; padding: 2px;");
          }
          console.groupEnd();
        }
      } else {
        console.log(
          `%c${requestBody}`,
          "border: 1px solid #ccc; padding: 2px;"
        );
      }
      console.groupEnd();
    }

    console.groupEnd();

    try {
      const response = await request;

      console.group("API Response");

      console.log(
        `%cStatus: %c${response.status} ${response.statusCode}`,
        "font-weight: bold;",
        "color: green;"
      );
      console.groupCollapsed(
        "%cHeaders",
        "font-weight: bold; border: 1px solid #ccc; padding: 2px;"
      );
      console.table(response.headers);
      console.groupEnd();

      console.groupCollapsed("%cBody", "font-weight: bold;");
      const responseBody = response.body;
      if (typeof responseBody === "object" && responseBody !== null) {
        for (const [key, value] of Object.entries(responseBody)) {
          console.groupCollapsed(
            `%c${key}`,
            "font-weight: bold; border: 1px solid #ccc; padding: 2px;"
          );
          if (Array.isArray(value) || typeof value === "object") {
            console.table(value);
          } else {
            console.log(`%c${value}`, "border: 1px solid #ccc; padding: 2px;");
          }
          console.groupEnd();
        }
      } else {
        console.log(
          `%c${responseBody}`,
          "border: 1px solid #ccc; padding: 2px;"
        );
      }
      console.groupEnd();

      console.groupEnd();

      return response;
    } catch (error: any) {
      console.group("API Response");

      if (error.response) {
        console.log(
          `%cStatus: %c${error.response.status} ${error.response.statusText}`,
          "font-weight: bold;",
          "color: red;"
        );
        console.groupCollapsed(
          "%cHeaders",
          "font-weight: bold; border: 1px solid #ccc; padding: 2px;"
        );
        console.table(error.response.headers);
        console.groupEnd();

        console.groupCollapsed("%cBody", "font-weight: bold;");
        const errorBody = error.response.body;
        if (typeof errorBody === "object" && errorBody !== null) {
          for (const [key, value] of Object.entries(errorBody)) {
            console.groupCollapsed(
              `%c${key}`,
              "font-weight: bold; border: 1px solid #ccc; padding: 2px;"
            );
            if (Array.isArray(value) || typeof value === "object") {
              console.table(value);
            } else {
              console.log(
                `%c${value}`,
                "border: 1px solid #ccc; padding: 2px;"
              );
            }
            console.groupEnd();
          }
        } else {
          console.log(
            `%c${errorBody}`,
            "border: 1px solid #ccc; padding: 2px;"
          );
        }
        console.groupEnd();
      } else {
        console.error(`Request failed: ${error.message}`);
      }

      console.groupEnd();

      throw error;
    }
  } else {
    return request;
  }
};

export const getDeltaFiles = async (
  storeId: string,
  generationIndex: number = 0,
  directoryPath: string
): Promise<string[]> => {
  if (isNaN(generationIndex)) {
    generationIndex = 0;
  }

  // Load manifest file
  const manifestFilePath = path.join(directoryPath, storeId, "manifest.dat");
  if (!fs.existsSync(manifestFilePath)) {
    console.error("Manifest file not found");
    return [];
  }

  const manifestHashes = fs
    .readFileSync(manifestFilePath, "utf-8")
    .split("\n")
    .filter(Boolean);

  console.log("");
  console.log(`Uploading delta from generation ${generationIndex}`);

  const filesInvolved: string[] = [];

  // Include the height.dat file at the top of the directory
  const heightDatFilePath = path.join(directoryPath, storeId, "height.dat");
  if (fs.existsSync(heightDatFilePath)) {
    filesInvolved.push(heightDatFilePath);
  }

  // Collect files starting from generationIndex + 1
  for (let i = generationIndex; i < manifestHashes.length; i++) {
    const rootHash = manifestHashes[i];

    const datFilePath = path.join(directoryPath, storeId, `${rootHash}.dat`);

    if (!fs.existsSync(datFilePath)) {
      console.error(`Data file for root hash ${rootHash} not found`);
      return [];
    }

    const datFileContent = JSON.parse(fs.readFileSync(datFilePath, "utf-8"));

    if (datFileContent.root !== rootHash) {
      console.error(
        `Root hash in data file does not match: ${datFileContent.root} !== ${rootHash}`
      );
      return [];
    }

    // Add the .dat file itself to the list of files involved
    filesInvolved.push(datFilePath);

    // Collect all files involved, ensuring correct paths
    for (const file of Object.keys(datFileContent.files)) {
      const filePath = getFilePathFromSha256(
        datFileContent.files[file].sha256,
        path.join(directoryPath, storeId, "data")
      );
      filesInvolved.push(filePath);
    }
  }

  if (process.env.DIG_DEBUG === "1") {
    console.log("Files involved in the delta:");
    console.table(filesInvolved);
  }

  // list the manifest file last, this actually
  // helps with upload because by overriding the manifest file last, 
  // the store can still be considered valid even when the upload is interrupted
  filesInvolved.push(manifestFilePath);

  return filesInvolved;
};

// Helper function to derive file path from SHA256 hash
export const getFilePathFromSha256 = (
  sha256: string,
  dataDir: string
): string => {
  return path.join(dataDir, sha256.match(/.{1,2}/g)!.join("/"));
};
