import * as fs from "fs";
import * as path from "path";
import * as https from "https";
import { URL } from "url";
import { MultiBar, Presets } from "cli-progress";
import { getOrCreateSSLCerts } from "./ssl";
import { getFilePathFromSha256 } from "./hashUtils";
import { getServerCoinsByLauncherId } from "../blockchain/server_coin";
import { getRootHistory } from "../blockchain/datastore";
import { NconfManager } from "./nconfManager";
import { errorCorrectManifest } from "./directoryUtils";

// Retrieve or generate SSL certificates
const { certPath, keyPath } = getOrCreateSSLCerts();
const nconfManager = new NconfManager("config.json");

// Function to download a single file using a list of URLs, with retry and less aggressive exponential backoff
const downloadFileFromUrls = async (
  urls: string[],
  filePath: string,
  overwrite: boolean = true,
  maxRetries: number = 5
): Promise<void> => {
  let delay = 2000; // Start with a 2-second delay
  const maxDelay = 10000; // Cap the delay at 10 seconds
  const delayMultiplier = 1.5; // Use a less aggressive multiplier

  for (const url of urls) {
    let attempt = 0;
    while (attempt < maxRetries) {
      try {
        // Ensure the directory for the file exists before each attempt
        const fileDir = path.dirname(filePath);
        if (!fs.existsSync(fileDir)) {
          fs.mkdirSync(fileDir, { recursive: true });
        }

        // Skip download if the file exists and overwrite is not allowed
        if (!overwrite && fs.existsSync(filePath)) {
          return;
        }

        await new Promise<void>((resolve, reject) => {
          const urlObj = new URL(url);

          const requestOptions = {
            hostname: urlObj.hostname,
            port: urlObj.port || 443,
            path: urlObj.pathname + urlObj.search,
            method: "GET",
            key: fs.readFileSync(keyPath),
            cert: fs.readFileSync(certPath),
            rejectUnauthorized: false, // Allow self-signed certificates
          };

          const request = https.request(requestOptions, (response) => {
            if (response.statusCode === 200) {
              // Create the directory structure again as a safeguard
              const fileDir = path.dirname(filePath);
              if (!fs.existsSync(fileDir)) {
                fs.mkdirSync(fileDir, { recursive: true });
              }

              const writeStream = fs.createWriteStream(filePath);

              response.pipe(writeStream);

              writeStream.on("finish", resolve);
              writeStream.on("error", (error) => {
                console.error("Write stream error:", error);
                reject(error);
              });
            } else if (
              response.statusCode === 301 ||
              response.statusCode === 302
            ) {
              // Handle redirects
              downloadFileFromUrls(
                [response.headers.location!],
                filePath,
                overwrite,
                maxRetries
              )
                .then(resolve)
                .catch((error) => {
                  console.error("Redirect error:", error);
                  reject(error);
                });
            } else {
              const error = new Error(
                `Request failed with status code ${response.statusCode}`
              );
              console.error("Request error:", error);
              reject(error);
            }
          });

          request.on("error", (error: any) => {
            if (error.code === "ECONNREFUSED") {
              console.warn(
                `Connection refused to ${url}. Trying next peer if available...`
              );
              reject(error);
            } else {
              console.error("Request error:", error);
              reject(error);
            }
          });
          request.end();
        });

        return; // Exit if successful
      } catch (error: any) {
        console.warn(
          `Download attempt ${attempt + 1} from ${url} failed: ${error.message}`
        );
      }

      attempt++;
      if (attempt < maxRetries) {
        console.warn(
          `Retrying download from ${url} in ${delay / 1000} seconds...`
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay = Math.min(maxDelay, delay * delayMultiplier); // Less aggressive backoff with a max delay cap
      }
    }
  }

  console.error(`All URLs failed for ${filePath}. Aborting.`);
};

// Function to download the height.dat file from the remote store
const downloadHeightFile = async (
  storeId: string,
  digPeers: string[],
  storeDir: string,
  forceDownload: boolean = false
): Promise<void> => {
  const heightFilePath = path.join(storeDir, "height.dat");
  const heightFileUrls = digPeers.map(
    (digPeer) => `https://${digPeer}:4159/${storeId}/height.dat`
  );

  await downloadFileFromUrls(heightFileUrls, heightFilePath, forceDownload);
};

// Function to check if a digPeer is synced with the storeId
const isPeerSynced = async (
  digPeer: string,
  storeId: string
): Promise<boolean> => {
  return new Promise((resolve) => {
    const url = `https://${digPeer}:4159/status/${storeId}`;
    const urlObj = new URL(url);

    const requestOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || 443,
      path: urlObj.pathname,
      method: "GET",
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certPath),
      rejectUnauthorized: false, // Allow self-signed certificates
    };

    const request = https.request(requestOptions, (response) => {
      if (response.statusCode === 200) {
        let data = "";
        response.on("data", (chunk) => {
          data += chunk;
        });
        response.on("end", () => {
          try {
            const status = JSON.parse(data);
            console.log(`${digPeer} sync status:`, status.synced);
            resolve(status.synced === true);
          } catch (error) {
            console.error(`Error parsing response from ${url}:`, error);
            resolve(false);
          }
        });
      } else {
        console.warn(
          `Failed to get sync status from ${url}, status code: ${response.statusCode}`
        );
        resolve(false);
      }
    });

    request.on("error", (error: any) => {
      console.error(`Request error for ${url}:`, error);
      resolve(false);
    });

    request.end();
  });
};

// Function to filter out peers that are not synced
const filterSyncedPeers = async (
  digPeers: string[],
  storeId: string
): Promise<string[]> => {
  const syncStatuses = await Promise.all(
    digPeers.map((peer) => isPeerSynced(peer, storeId))
  );
  return digPeers.filter((_, index) => syncStatuses[index]);
};

// Function to pull files from remote based on the manifest and server coins
export const pullFilesFromNetwork = async (
  storeId: string,
  directoryPath: string,
  forceDownload: boolean = false, // Optional parameter to force redownload
  renderProgressBar: boolean = true // Optional parameter to control progress bar rendering
): Promise<void> => {
  try {
    errorCorrectManifest(`${directoryPath}/${storeId}`);
    const serverCoins = await getServerCoinsByLauncherId(storeId);

    const publicIp: string | null | undefined =
      await nconfManager.getConfigValue("publicIp");
    let digPeers = serverCoins
      .flatMap((coin) => coin.urls)
      .filter((peer) => peer !== publicIp); // Remove self from the list of peers

    const rootHistory = await getRootHistory(Buffer.from(storeId, "hex"));

    if (rootHistory.length === 0) {
      throw new Error(
        "No roots found in rootHistory. Cannot proceed with file download."
      );
    }

    if (digPeers.length === 0) {
      throw new Error("No DIG Peers found to download files from.");
    }

    digPeers = await filterSyncedPeers(digPeers, storeId);

    // Ensure the base directoryPath exists
    const storeDir = path.join(directoryPath, storeId);
    if (!fs.existsSync(storeDir)) {
      fs.mkdirSync(storeDir, { recursive: true });
    }

    // Download height.dat file
    await downloadHeightFile(storeId, digPeers, storeDir, forceDownload);

    // Read the local manifest file to get the existing root hashes
    const localManifestPath = path.join(storeDir, "manifest.dat");
    let localManifestHashes: string[] = [];

    if (fs.existsSync(localManifestPath)) {
      const localManifestContent = fs
        .readFileSync(localManifestPath, "utf-8")
        .trim();
      localManifestHashes = localManifestContent.split("\n");
    }

    const progressBar = renderProgressBar
      ? new MultiBar(
          {
            clearOnComplete: false,
            hideCursor: true,
            format: "Syncing Store | {bar} | {percentage}%",
            noTTYOutput: true,
          },
          Presets.shades_classic
        )
      : null;

    const totalFiles = rootHistory.length;
    const progress = progressBar ? progressBar.create(totalFiles, 0) : null;

    // Track the new root hashes to be appended to the manifest
    const newRootHashes: string[] = [];

    // Process each root hash by index
    for (let i = 0; i < rootHistory.length; i++) {
      const { root_hash: rootHash } = rootHistory[i];

      // Construct the path for the .dat file associated with the hash
      const datFilePath = path.join(storeDir, `${rootHash}.dat`);

      // Download the .dat file
      const datUrls = digPeers.map(
        (digPeer) => `https://${digPeer}:4159/${storeId}/${rootHash}.dat`
      );
      await downloadFileFromUrls(datUrls, datFilePath, forceDownload);

      // Load and verify the .dat file content
      const datFileContent = JSON.parse(fs.readFileSync(datFilePath, "utf-8"));
      if (datFileContent.root !== rootHash) {
        throw new Error("Root hash mismatch");
      }

      // Download all files associated with the current generation
      for (const file of Object.keys(datFileContent.files)) {
        const filePath = getFilePathFromSha256(
          datFileContent.files[file].sha256,
          path.join(storeDir, "data")
        );

        // Files in the store/data directory should not be overwritten if they exist, unless forceDownload is true
        const isInDataDir = filePath.startsWith(path.join(storeDir, "data"));
        const fileUrls = digPeers.map(
          (digPeer) =>
            `https://${digPeer}:4159/${storeId}/${path.relative(
              storeDir,
              filePath
            )}`
        );

        await downloadFileFromUrls(
          fileUrls,
          filePath,
          forceDownload || !isInDataDir
        );
      }

      // Append the processed hash to the manifest file only if it doesn't exist at the current index
      if (localManifestHashes[i] !== rootHash) {
        newRootHashes.push(rootHash);
      }

      if (progress) {
        progress.increment();
      }
    }

    // Append the new root hashes to the local manifest file
    if (newRootHashes.length > 0) {
      fs.appendFileSync(localManifestPath, newRootHashes.join("\n") + "\n");
    }

    if (progressBar) {
      progressBar.stop();
    }

    errorCorrectManifest(`${directoryPath}/${storeId}`);

    console.log("Syncing store complete.");
  } catch (error: any) {
    throw error;
  }
};
