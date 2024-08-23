import * as fs from "fs";
import * as path from "path";
import * as https from "https";
import * as http from "http";
import { URL } from "url";
import { MultiBar, Presets } from "cli-progress";
import { getFilePathFromSha256 } from "./hashUtils";
import { getServerCoinsByLauncherId } from "../blockchain/server_coin";
import { getRootHistory } from "../blockchain/datastore";

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
          const protocol = urlObj.protocol === "https:" ? https : http;

          const request = protocol.get(url, (response) => {
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
                console.trace("Write stream error:", error);
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
                  console.trace("Redirect error:", error);
                  reject(error);
                });
            } else {
              const error = new Error(
                `Request failed with status code ${response.statusCode}`
              );
              console.trace("Request error:", error);
              reject(error);
            }
          });

          request.on("error", (error) => {
            console.trace("Request error:", error);
            reject(error);
          });
          request.end();
        });

        return; // Exit if successful
      } catch (error: any) {
        console.trace(
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

  const error = new Error(`All URLs failed for ${filePath}. Aborting.`);
  console.trace(error);
  throw error;
};

// Function to pull files from origins based on the manifest and server coins
export const pullFilesFromNetwork = async (
  storeId: string,
  directoryPath: string,
  forceDownload: boolean = false // Optional parameter to force redownload
): Promise<void> => {
  try {
    const serverCoins = await getServerCoinsByLauncherId(storeId);
    const digPeers = serverCoins.flatMap((coin) => coin.urls);
    const rootHistory = await getRootHistory(Buffer.from(storeId, "hex"));

    if (rootHistory.length === 0) {
      const error = new Error(
        "No roots found in rootHistory. Cannot proceed with file download."
      );
      console.trace(error);
      throw error;
    }

    if (digPeers.length === 0) {
      const error = new Error("No DIG Peers found to download files from.");
      console.trace(error);
      throw error;
    }

    // Ensure the base directoryPath exists
    const storeDir = path.join(directoryPath, storeId);
    if (!fs.existsSync(storeDir)) {
      fs.mkdirSync(storeDir, { recursive: true });
    }

    // Calculate the total number of root hashes to be downloaded
    const totalFiles = rootHistory.length;

    const multiBar = new MultiBar(
      {
        clearOnComplete: false,
        hideCursor: true,
        format: "Syncing Store | {bar} | {percentage}%",
      },
      Presets.shades_classic
    );

    const progressBar = multiBar.create(totalFiles, 0);

    // Process each root hash in order
    for (const { root_hash: rootHash } of rootHistory) {
      // Construct the path for the .dat file associated with the hash
      const datFilePath = path.join(storeDir, `${rootHash}.dat`);

      // .dat files are overwritable
      const datUrls = digPeers.map(
        (digPeers) => `https://${digPeers}/stores/${storeId}/${rootHash}.dat`
      );
      await downloadFileFromUrls(datUrls, datFilePath, forceDownload);

      // Load the .dat file content
      const datFileContent = JSON.parse(fs.readFileSync(datFilePath, "utf-8"));

      // Verify the root hash in the .dat file
      if (datFileContent.root !== rootHash) {
        const error = new Error("Root hash mismatch");
        console.trace(error);
        throw error;
      }

      progressBar.increment(); // Update for .dat file

      // Download all the files associated with the current generation
      for (const file of Object.keys(datFileContent.files)) {
        const filePath = getFilePathFromSha256(
          datFileContent.files[file].sha256,
          path.join(storeDir, "data")
        );

        // Files in the store/data directory should not be overwritten if they exist, unless forceDownload is true
        const isInDataDir = filePath.startsWith(path.join(storeDir, "data"));
        const fileUrls = digPeers.map(
          (digPeer) =>
            `https://${digPeer}/stores/${storeId}/${path.relative(storeDir, filePath)}`
        );

        await downloadFileFromUrls(
          fileUrls,
          filePath,
          forceDownload || !isInDataDir
        );
        progressBar.increment(); // Update for each file downloaded
      }

      // Append the processed hash to the local manifest.dat file
      const localManifestPath = path.join(storeDir, "manifest.dat");
      fs.appendFileSync(localManifestPath, `${rootHash}\n`);
    }

    multiBar.stop();
    console.log("Syncing store complete.");
  } catch (error: any) {
    console.trace("Error during sync:", error);
    throw error;
  }
};
