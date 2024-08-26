import path from "path";
import fs from "fs";
import { addDirectory, calculateFolderSize, waitForPromise } from "../utils";
import { DataIntegrityTree } from "../DataIntegrityTree";
import {
  validateStore,
  updateDataStoreMetadata,
  getLatestStoreInfo,
} from "../blockchain/datastore";
import {
  DIG_FOLDER_PATH,
  getManifestFilePath,
  loadDigConfig,
  getActiveStoreId,
  STORE_PATH
} from "../utils/config";
import { waitForConfirmation } from "../blockchain/coins";
import { getPeer } from "../blockchain/peer";

export const commit = async (): Promise<void> => {
  try {
    let storeIntegrityCheck = await waitForPromise(
      () => validateStore(),
      "Checking store integrity...",
      "Store integrity check passed.",
      "Store integrity check failed."
    );

    if (!storeIntegrityCheck) {
      throw new Error("Store integrity check failed.");
    }

    const storeId = await getActiveStoreId();

    if (!storeId) {
      throw new Error("Store ID not found. Please run init first.");
    }

    const { latestInfo } = await getLatestStoreInfo(storeId);
    if (!latestInfo) {
      throw new Error("Store info not found. Please run init first.");
    }

    const onChainRootHash = latestInfo.metadata.rootHash.toString("hex");
    await catchUpWithManifest(
      onChainRootHash,
      latestInfo.launcherId.toString("hex")
    );

    const datalayer = new DataIntegrityTree(storeId.toString("hex"), {
      storageMode: "local",
      storeDir: STORE_PATH,
      disableInitialize: true,
    });

    // When doing file based inserts, we want the tree to be an exact replica of the build directory
    // regardless of what was previously in the tree, so we are zeroing it out first before we add a new generation
    datalayer.deleteAllLeaves();

    const digConfig = await loadDigConfig(process.cwd());

    await addDirectory(
      datalayer,
      path.join(process.cwd(), digConfig.deploy_dir)
    );

    const newRootHash = datalayer.commit();

    if (!newRootHash) {
      return;
    }

    const totalBytes = calculateFolderSize(DIG_FOLDER_PATH);

    console.log(
      `Updating store metadata with new root hash: ${newRootHash}, bytes: ${totalBytes}`
    );

    const updatedStoreInfo = await updateDataStoreMetadata({
      ...latestInfo.metadata,
      rootHash: Buffer.from(newRootHash, "hex"),
      bytes: totalBytes,
    });

    const peer = await getPeer();

    await waitForConfirmation(peer, updatedStoreInfo.coin.parentCoinInfo);
    storeIntegrityCheck = await waitForPromise(
      () => validateStore(),
      "Checking store integrity...",
      "Store integrity check passed.",
      "Store integrity check failed."
    );

    if (!storeIntegrityCheck) {
      throw new Error("Store integrity check failed.");
    }

    await waitForPromise(
      () => getLatestStoreInfo(storeId),
      "Finalizing commit...",
      "Commit successful",
      "Failed to commit."
    );

    console.log("Commit successful");
  } catch (error: any) {
    console.error("Failed to commit:", error.message);
  } finally {
    process.exit();
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
        bytes: calculateFolderSize(DIG_FOLDER_PATH),
      });

      await waitForConfirmation(peer, updatedStoreInfo.coin.parentCoinInfo);
    }

    console.log("Catch-up with manifest completed.");
  } else {
    console.log(
      "On-chain root hash matches the last manifest root hash. No catch-up required."
    );
  }
};
