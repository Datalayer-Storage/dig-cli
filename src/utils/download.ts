import * as fs from "fs";
import * as path from "path";
import { MultiBar, Presets } from "cli-progress";
import superagent from "superagent";
import { getFilePathFromSha256 } from "./hashUtils";

// Function to download a single file using the URL, following redirects, with retry and less aggressive exponential backoff
const downloadFile = async (
  url: string,
  filePath: string,
  overwrite: boolean = true,
  maxRetries: number = 5
): Promise<void> => {
  let attempt = 0;
  let delay = 2000; // Start with a 2-second delay
  const maxDelay = 10000; // Cap the delay at 10 seconds
  const delayMultiplier = 1.5; // Use a less aggressive multiplier

  while (attempt < maxRetries) {
    try {
      // Ensure the directory for the file exists
      const fileDir = path.dirname(filePath);
      if (!fs.existsSync(fileDir)) {
        fs.mkdirSync(fileDir, { recursive: true });
      }

      // Skip download if the file exists and overwrite is not allowed
      if (!overwrite && fs.existsSync(filePath)) {
        return;
      }

      const response = await superagent
        .get(url)
        .redirects(5) // Follow up to 5 redirects
        .buffer(true)  // Buffer the response body
        .parse(superagent.parse.text); // Parse the body as text

      // Only save the file if the status is 200 (new data)
      if (response.status === 200) {
        fs.writeFileSync(filePath, response.text);
      }
      return; // Exit if successful

    } catch (error: any) {
      attempt++;
      if (attempt < maxRetries) {
        console.warn(`Download attempt ${attempt} failed. Retrying in ${delay / 1000} seconds...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay = Math.min(maxDelay, delay * delayMultiplier); // Less aggressive backoff with a max delay cap
      } else {
        console.error(`Max retries reached for ${filePath}. Aborting.`);
        throw error; // Abort the process after max retries
      }
    }
  }
};

// Function to pull files from the origin based on the manifest
export const pullFilesFromOrigin = async (
  origin: string,
  storeId: string,
  directoryPath: string,
  forceDownload: boolean = false // Optional parameter to force redownload
): Promise<void> => {
  try {
    // Ensure the base directoryPath exists
    const storeDir = path.join(directoryPath, storeId);
    if (!fs.existsSync(storeDir)) {
      fs.mkdirSync(storeDir, { recursive: true });
    }

    // Load the manifest file from the origin
    const manifestUrl = `${origin}/manifest.dat`;
    const manifestResponse = await superagent
      .get(manifestUrl)
      .redirects(5) // Follow up to 5 redirects
      .buffer(true)  // Buffer the response body
      .parse(superagent.parse.text); // Parse the body as text

    if (manifestResponse.status === 200) {
      const remoteManifestHashes = manifestResponse.text.split("\n").filter(Boolean);

      // Load the local manifest.dat if it exists
      const localManifestPath = path.join(storeDir, "manifest.dat");
      let localManifestHashes: string[] = [];

      if (fs.existsSync(localManifestPath)) {
        localManifestHashes = fs.readFileSync(localManifestPath, "utf-8").split("\n").filter(Boolean);
      }

      // Check if the local manifest has more hashes than the remote manifest
      if (localManifestHashes.length > remoteManifestHashes.length) {
        console.log("Local manifest has more hashes than the remote manifest. Consider pushing updates to the origin.");
        return;
      }

      // Check if the local and remote manifest files are identical
      if (!forceDownload && remoteManifestHashes.join() === localManifestHashes.join()) {
        console.log("Local and remote manifests are identical. Exiting early.");
        return;
      }

      // Determine which hashes are missing locally
      let missingHashes = remoteManifestHashes.filter(hash => !localManifestHashes.includes(hash));

      // Setup progress bars
      const multiBar = new MultiBar(
        {
          clearOnComplete: false,
          hideCursor: true,
          format: "{bar} | {percentage}% | {name}",
        },
        Presets.shades_classic
      );

      const downloadBar = multiBar.create(missingHashes.length, 0, { name: "Syncing Store" });

      // Immediately download and save the height.dat file (overwritable)
      const heightDatUrl = `${origin}/height.dat`;
      const heightDatPath = path.join(storeDir, "height.dat");
      await downloadFile(heightDatUrl, heightDatPath, true);

      // Process each missing or all hashes in order
      for (const rootHash of missingHashes) {
        // Construct the path for the .dat file associated with the hash
        const datFilePath = path.join(storeDir, `${rootHash}.dat`);

        // .dat files are overwritable
        await downloadFile(`${origin}/${rootHash}.dat`, datFilePath, false);

        // Load the .dat file content
        const datFileContent = JSON.parse(fs.readFileSync(datFilePath, "utf-8"));

        // Verify the root hash in the .dat file
        if (datFileContent.root !== rootHash) {
          throw new Error("Root hash mismatch");
        }

        // Download all the files associated with the current generation
        for (const file of Object.keys(datFileContent.files)) {
          const filePath = getFilePathFromSha256(
            datFileContent.files[file].sha256,
            path.join(storeDir, "data")
          );

          // Files in the store/data directory should not be overwritten if they exist
          const isInDataDir = filePath.startsWith(path.join(storeDir, "data"));
          await downloadFile(`${origin}/${path.relative(storeDir, filePath)}`, filePath, !isInDataDir);
        }

        // Append the processed hash to the local manifest.dat file
        fs.appendFileSync(localManifestPath, `${rootHash}\n`);

        // Update the progress bar
        downloadBar.increment();
      }

      // Finalize the progress bar
      multiBar.stop();

    } else {
      throw new Error("Failed to retrieve manifest.dat");
    }

  } catch (error: any) {
    throw error;
  }
};
