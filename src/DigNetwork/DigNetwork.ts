import * as fs from "fs";
import * as path from "path";
import crypto from "crypto";
import { MultiBar, Presets } from "cli-progress";
import { DigPeer } from "./DigPeer";
import { getDeltaFiles } from "../utils/deltaUtils";
import { getFilePathFromSha256 } from "../utils/hashUtils";
import { sampleCurrentEpochServerCoins } from "../blockchain/server_coin";
import { getRootHistory } from "../blockchain/datastore";
import { NconfManager } from "../utils/NconfManager";
import { errorCorrectManifest } from "../utils/directoryUtils";
import { DIG_FOLDER_PATH } from "../utils/config";

export class DigNetwork {
  private storeId: string;
  private storeDir: string;
  private peerBlacklist: Map<string, Set<string>>; // Map of file keys to blacklists

  constructor(storeId: string) {
    this.storeId = storeId;
    this.storeDir = path.resolve(DIG_FOLDER_PATH, "stores", storeId);
    this.peerBlacklist = new Map<string, Set<string>>(); // Initialize empty map for blacklists
  }

  // Uploads the store to a specific peer
  public async uploadStore(
    digPeer: DigPeer,
    generationIndex: number
  ): Promise<void> {
    const filesToUpload = await getDeltaFiles(
      this.storeId,
      generationIndex,
      this.storeDir
    );

    if (!filesToUpload.length) {
      console.log("No files to upload.");
      return;
    }

    this.runProgressBar(
      filesToUpload.length,
      "Store Data",
      async (progress) => {
        for (const filePath of filesToUpload) {
          const relativePath = path
            .relative(this.storeDir, filePath)
            .replace(/\\/g, "/");
          await digPeer.propagationServer.pushFile(filePath, relativePath);
          progress.increment();
        }
      }
    );
  }

  // Downloads files from the network based on the manifest
  public async downloadFiles(
    forceDownload: boolean = false,
    renderProgressBar: boolean = true
  ): Promise<void> {
    try {
      errorCorrectManifest(this.storeDir);
      const rootHistory = await getRootHistory(
        Buffer.from(this.storeId, "hex")
      );
      if (!rootHistory.length)
        throw new Error(
          "No roots found in rootHistory. Cannot proceed with file download."
        );

      await this.downloadHeightFile(forceDownload);

      const localManifestPath = path.join(this.storeDir, "manifest.dat");
      const localManifestHashes = fs.existsSync(localManifestPath)
        ? fs.readFileSync(localManifestPath, "utf-8").trim().split("\n")
        : [];

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

      const progress = progressBar
        ? progressBar.create(rootHistory.length, 0)
        : null;
      const newRootHashes: string[] = [];

      for (let i = 0; i < rootHistory.length; i++) {
        const { root_hash: rootHash } = rootHistory[i];
        const datFilePath = path.join(this.storeDir, `${rootHash}.dat`);

        await this.downloadFileFromPeers(
          `${rootHash}.dat`,
          datFilePath,
          forceDownload
        );

        const datFileContent = JSON.parse(
          fs.readFileSync(datFilePath, "utf-8")
        );
        if (datFileContent.root !== rootHash)
          throw new Error("Root hash mismatch");

        for (const file of Object.keys(datFileContent.files)) {
          const filePath = getFilePathFromSha256(
            datFileContent.files[file].sha256,
            path.join(this.storeDir, "data")
          );
          const isInDataDir = filePath.startsWith(
            path.join(this.storeDir, "data")
          );
          await this.downloadFileFromPeers(
            getFilePathFromSha256(datFileContent.files[file].sha256, "data"),
            filePath,
            forceDownload || !isInDataDir
          );
        }

        if (localManifestHashes[i] !== rootHash) newRootHashes.push(rootHash);

        progress?.increment();
      }

      if (newRootHashes.length)
        fs.appendFileSync(localManifestPath, newRootHashes.join("\n") + "\n");

      progressBar?.stop();

      errorCorrectManifest(this.storeDir);
      console.log("Syncing store complete.");
    } catch (error: any) {
      console.trace(error);
      throw error;
    }
  }

  // Fetches available peers for the store
  private async fetchAvailablePeers(): Promise<DigPeer[]> {
    //const publicIp: string | null | undefined =
    //   await nconfManager.getConfigValue("publicIp");
    const peers = await sampleCurrentEpochServerCoins(
      Buffer.from(this.storeId, "hex"),
      10,
      Array.from(this.peerBlacklist.keys())
    );

    return peers.map((ip) => new DigPeer(ip, this.storeId));
  }

  private async downloadHeightFile(forceDownload: boolean): Promise<void> {
    const heightFilePath = path.join(this.storeDir, "height.dat");
    await this.downloadFileFromPeers(
      "height.dat",
      heightFilePath,
      forceDownload
    );
  }

  private async downloadFileFromPeers(
    dataPath: string,
    filePath: string,
    overwrite: boolean
  ): Promise<void> {
    let digPeers = await this.fetchAvailablePeers();

    while (true) {
      if (!overwrite && fs.existsSync(filePath)) return;

      const blacklist = this.peerBlacklist.get(dataPath) || new Set<string>();

      for (const digPeer of digPeers) {
        if (blacklist.has(digPeer.IpAddress)) continue;

        try {
          // Create directory if it doesn't exist
          const directory = path.dirname(filePath);
          if (!fs.existsSync(directory)) {
            fs.mkdirSync(directory, { recursive: true });
          }

          // Stream the file data directly to the file system
          const fileStream = fs.createWriteStream(filePath);

          // Start streaming the data from the peer
          const peerStream = await digPeer.propagationServer.streamStoreData(
            dataPath
          );

          // Pipe the peer stream directly to the file system
          await new Promise<void>((resolve, reject) => {
            peerStream.pipe(fileStream);

            peerStream.on("end", resolve);
            peerStream.on("error", reject);
            fileStream.on("error", reject);
          });

          if (process.env.DIG_DEBUG === "1") {
            console.log(`Downloaded ${dataPath} from ${digPeer.IpAddress}`);
          }

          return; // Exit the method if download succeeds
        } catch (error) {
          console.warn(
            `Failed to download ${dataPath} from ${digPeer.IpAddress}, blacklisting peer and trying next...`
          );
          blacklist.add(digPeer.IpAddress);
        }
      }

      this.peerBlacklist.set(dataPath, blacklist);

      if (blacklist.size >= digPeers.length) {
        if (process.env.DIG_DEBUG === "1") {
          console.warn(
            `All peers blacklisted for ${dataPath}. Refreshing peers...`
          );
        }

        digPeers = await this.fetchAvailablePeers();
        if (!digPeers.length) {
          throw new Error(
            `Failed to download ${dataPath}: no peers available.`
          );
        }
      }
    }
  }

  private runProgressBar(
    total: number,
    name: string,
    task: (progress: any) => Promise<void>
  ): void {
    // Using 'any' to work around TypeScript issues
    const multiBar = new MultiBar(
      {
        clearOnComplete: false,
        hideCursor: true,
        format: "{bar} | {percentage}% | {name}",
        noTTYOutput: true,
      },
      Presets.shades_classic
    );
    const progress = multiBar.create(total, 0, { name });
    task(progress).finally(() => multiBar.stop());
  }
}
