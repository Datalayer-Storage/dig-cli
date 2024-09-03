import * as fs from "fs";
import * as path from "path";
import { MultiBar, Presets } from "cli-progress";
import { getFilePathFromSha256 } from "./hashUtils";
import { sampleCurrentEpochServerCoins } from "../blockchain/server_coin";
import { getRootHistory } from "../blockchain/datastore";
import { NconfManager } from "./nconfManager";
import { errorCorrectManifest } from "./directoryUtils";
import { DigPeer } from "./DigPeer";

const nconfManager = new NconfManager("config.json");

// Function to download a single file using DigPeer class
const downloadFileFromDigPeer = async (
  digPeer: DigPeer,
  key: string,
  filePath: string,
  overwrite: boolean = true
): Promise<void> => {
  // Ensure the directory for the file exists before each attempt
  const fileDir = path.dirname(filePath);
  if (!fs.existsSync(fileDir)) {
    fs.mkdirSync(fileDir, { recursive: true });
  }

  // Skip download if the file exists and overwrite is not allowed
  if (!overwrite && fs.existsSync(filePath)) {
    return;
  }

  try {
    const fileContent = await digPeer.getKey(key);
    fs.writeFileSync(filePath, fileContent);
  } catch (error: any) {
    console.error(`Failed to download file from ${digPeer.ipAddress}:`, error.message);
    throw error;
  }
};

// Function to download the height.dat file from the remote store
const downloadHeightFile = async (
  storeId: string,
  digPeers: DigPeer[],
  storeDir: string,
  forceDownload: boolean = false
): Promise<void> => {
  const heightFilePath = path.join(storeDir, "height.dat");
  for (const digPeer of digPeers) {
    try {
      await downloadFileFromDigPeer(digPeer, "height.dat", heightFilePath, forceDownload);
      break; // Exit loop if successful
    } catch (error) {
      console.warn(`Failed to download height.dat from ${digPeer.ipAddress}, trying next peer...`);
    }
  }
};

// Function to check if a digPeer is synced with the storeId
const isPeerSynced = async (digPeer: DigPeer, storeId: string): Promise<boolean> => {
  try {
    const status = await digPeer.getKey(`status/${storeId}`);
    const parsedStatus = JSON.parse(status);
    return parsedStatus.synced === true;
  } catch (error: any) {
    console.error(`Failed to check sync status for ${digPeer.ipAddress}:`, error.message);
    return false;
  }
};

// Function to filter out peers that are not synced
const filterSyncedPeers = async (digPeers: DigPeer[], storeId: string): Promise<DigPeer[]> => {
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
    const publicIp: string | null | undefined =
      await nconfManager.getConfigValue("publicIp");

    let digPeers = (
      await sampleCurrentEpochServerCoins(Buffer.from(storeId, "hex"), 10)
    ).filter((peer) => peer !== publicIp)
      .map((ip) => new DigPeer(ip, storeId)); // Instantiate DigPeer objects

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
      for (const digPeer of digPeers) {
        try {
          await downloadFileFromDigPeer(digPeer, `${rootHash}.dat`, datFilePath, forceDownload);
          break; // Exit loop if successful
        } catch (error) {
          console.warn(`Failed to download ${rootHash}.dat from ${digPeer.ipAddress}, trying next peer...`);
        }
      }

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
        for (const digPeer of digPeers) {
          try {
            await downloadFileFromDigPeer(digPeer, file, filePath, forceDownload || !isInDataDir);
            break; // Exit loop if successful
          } catch (error) {
            console.warn(`Failed to download ${file} from ${digPeer.ipAddress}, trying next peer...`);
          }
        }
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
