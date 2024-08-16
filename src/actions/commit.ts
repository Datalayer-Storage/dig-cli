import path from "path";
import fs from "fs";
import { addDirectory, calculateFolderSize, waitForPromise } from "../utils";
import { DataIntegrityLayer } from "../DataIntegrityLayer";
import {
  validateStore,
  updateDataStoreMetadata,
  serializeStoreInfo,
  getLatestStoreInfo,
} from "../blockchain/datastore";
import {
  DIG_FOLDER_PATH,
  COIN_STATE_FILE_PATH,
  getManifestFilePath,
  loadDigConfig,
} from "../config";
import { waitForConfirmation } from "../blockchain/coins";
import { getPeer } from "../blockchain/peer";

export const commit = async (): Promise<void> => {
  try {
    let storeIntegrityCheck = await waitForPromise(
      () => validateStore({ verbose: false }),
      "Checking store integrity...",
      "Store integrity check passed.",
      "Store integrity check failed."
    );
    if (!storeIntegrityCheck) {
      throw new Error("Store integrity check failed.");
    }

    const latestStoreInfo = await getLatestStoreInfo();

    if (!latestStoreInfo) {
      throw new Error("Store info not found. Please run init first.");
    }

    const onChainRootHash = latestStoreInfo.metadata.rootHash.toString("hex");
    fs.writeFileSync(
      COIN_STATE_FILE_PATH,
      JSON.stringify(serializeStoreInfo(latestStoreInfo), null, 4)
    );

    await catchUpWithManifest(
      onChainRootHash,
      latestStoreInfo.launcherId.toString("hex")
    );

    const storeId = latestStoreInfo.launcherId.toString("hex");

    const datalayer = new DataIntegrityLayer(storeId, {
      storageMode: "local",
      storeDir: DIG_FOLDER_PATH,
    });
    const digConfig = await loadDigConfig(process.cwd());

    await addDirectory(
      datalayer,
      path.join(process.cwd(), digConfig.deploy_dir)
    );

    const newRootHash = datalayer.commit();

    const totalSize = calculateFolderSize(DIG_FOLDER_PATH);

    console.log(
      `Updating store metadata with new root hash: ${newRootHash}, bytes: ${totalSize}`
    );

    const updatedStoreInfo = await updateDataStoreMetadata({
      rootHash: Buffer.from(newRootHash, "hex"),
      size: totalSize,
    });

    const peer = await getPeer();

    await waitForConfirmation(peer, updatedStoreInfo.coin.parentCoinInfo);
    storeIntegrityCheck = await waitForPromise(
      () => validateStore({ verbose: false }),
      "Checking store integrity...",
      "Store integrity check passed.",
      "Store integrity check failed."
    );
    if (!storeIntegrityCheck) {
      throw new Error("Store integrity check failed.");
    }

    console.log("Commit successful");
  } catch (error: any) {
    console.error("Failed to commit:", error.message);
  }
};

const catchUpWithManifest = async (
  onChainRootHash: string,
  launcherId: string
) => {
  const peer = await getPeer();
  const manifest = fs
    .readFileSync(getManifestFilePath(launcherId), "utf-8")
    .trim();
  const manifestRootHashes = manifest.split("\n");

  // Find the index of the last on-chain root hash in the manifest
  const lastOnChainIndex = manifestRootHashes.lastIndexOf(onChainRootHash);

  if (lastOnChainIndex === -1) {
    throw new Error("On-chain root hash not found in the manifest file.");
  }

  // Get the subsequent root hashes that need to be committed
  const hashesToCommit = manifestRootHashes.slice(lastOnChainIndex + 1);

  if (hashesToCommit.length > 0) {
    console.log(
      `Committing ${hashesToCommit.length} root hashes from the manifest.`
    );

    for (const rootHash of hashesToCommit) {
      console.log(`Committing root hash: ${rootHash}`);
      const updatedStoreInfo = await updateDataStoreMetadata({
        rootHash: Buffer.from(rootHash, "hex"),
        size: calculateFolderSize(DIG_FOLDER_PATH),
      });

      await waitForConfirmation(peer, updatedStoreInfo.coin.parentCoinInfo);
      fs.writeFileSync(
        COIN_STATE_FILE_PATH,
        JSON.stringify(serializeStoreInfo(updatedStoreInfo), null, 4)
      );
    }

    console.log("Catch-up with manifest completed.");
  } else {
    console.log(
      "On-chain root hash matches the last manifest root hash. No catch-up required."
    );
  }
};
