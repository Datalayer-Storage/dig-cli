import fs from "fs";
import path from "path";
import {
  writerDelegatedPuzzleFromKey,
  adminDelegatedPuzzleFromKey,
  oracleDelegatedPuzzle,
  mintStore,
  signCoinSpends,
  CoinSpend,
  DataStore,
  getCoinId,
  DataStoreMetadata,
  addFee,
  updateStoreMetadata,
  syntheticKeyToPuzzleHash,
} from "datalayer-driver";
import { getPeer } from "./peer";
import { Wallet } from "./Wallet";
import {
  NETWORK_AGG_SIG_DATA,
  MIN_HEIGHT,
  MIN_HEIGHT_HEADER_HASH,
  getManifestFilePath,
  getHeightFilePath,
  getActiveStoreId,
  STORE_PATH,
} from "../utils/config";
import { selectUnspentCoins, calculateFeeForCoinSpends } from "./coins";
import { RootHistoryItem, DatFile } from "../types";
import { validateFileSha256 } from "../utils";
import { getCachedStoreInfo, cacheStoreInfo } from "./cache";

export const mintDataLayerStore = async (
  label?: string,
  description?: string,
  sizeInBytes?: bigint,
  authorizedWriterPublicSyntheticKey?: string,
  adminPublicSyntheticKey?: string
): Promise<DataStore> => {
  try {
    const peer = await getPeer();
    const wallet = await Wallet.load('main');
    const publicSyntheticKey = await wallet.getPublicSyntheticKey();
    const ownerSyntheicPuzzleHash =
      syntheticKeyToPuzzleHash(publicSyntheticKey);
    const storeCreationCoins = await selectUnspentCoins(
      peer,
      BigInt(1),
      BigInt(0)
    );
    const delegationLayers = [];

    if (adminPublicSyntheticKey) {
      delegationLayers.push(
        adminDelegatedPuzzleFromKey(Buffer.from(adminPublicSyntheticKey, "hex"))
      );
    }

    if (authorizedWriterPublicSyntheticKey) {
      delegationLayers.push(
        writerDelegatedPuzzleFromKey(
          Buffer.from(authorizedWriterPublicSyntheticKey, "hex")
        )
      );
    }

    delegationLayers.push(
      oracleDelegatedPuzzle(ownerSyntheicPuzzleHash, BigInt(100000))
    );

    const rootHash = Buffer.from(
      "0000000000000000000000000000000000000000000000000000000000000000",
      "hex"
    );

    // Array of parameters for mintStore
    const mintStoreParams = [
      publicSyntheticKey,
      storeCreationCoins,
      rootHash,
      label || undefined,
      description || undefined,
      sizeInBytes || BigInt(0),
      ownerSyntheicPuzzleHash,
      delegationLayers,
    ];

    // Preflight call to mintStore without a fee
    const { coinSpends: preflightCoinSpends } = await mintStore.apply(null, [
      // @ts-ignore
      ...mintStoreParams,
      // @ts-ignore
      BigInt(0),
    ]);

    // Calculate fee based on the coin spends from the preflight call
    const fee = await calculateFeeForCoinSpends(peer, preflightCoinSpends);

    // Final call to mintStore with the calculated fee
    const storeCreationResponse = await mintStore.apply(null, [
      // @ts-ignore
      ...mintStoreParams,
      // @ts-ignore
      fee,
    ]);

    const sig = signCoinSpends(
      storeCreationResponse.coinSpends,
      [await wallet.getPrivateSyntheticKey()],
      false
    );

    const err = await peer.broadcastSpend(
      storeCreationResponse.coinSpends as CoinSpend[],
      [sig]
    );

    if (err) {
      throw new Error(err);
    }

    // Add some time to get out of the mempool
    await new Promise((resolve) => setTimeout(resolve, 5000));

    return storeCreationResponse.newStore;
  } catch (error) {
    console.error("Unable to mint store");
    console.trace(error);
    throw error;
  }
};

// Function to get the latest store info with caching and synchronization
export const getLatestStoreInfo = async (
  storeId: Buffer
): Promise<{
  latestStore: DataStore;
  latestHeight: number;
  latestHash: Buffer;
}> => {
  const cachedInfo = getCachedStoreInfo(storeId.toString("hex"));

  if (cachedInfo) {
    try {
      const {
        latestStore: previousInfo,
        latestHeight: previousHeight,
        latestHash: previousHash,
      } = cachedInfo;

      const peer = await getPeer();
      const { latestStore, latestHeight } = await peer.syncStore(
        previousInfo,
        previousHeight,
        previousHash,
        false
      );

      const latestHash = await peer.getHeaderHash(latestHeight);

      // Cache the latest store info in the file system
      cacheStoreInfo(
        storeId.toString("hex"),
        latestStore,
        latestHeight,
        latestHash
      );

      return { latestStore, latestHeight, latestHash };
    } catch {
      // Any error usually indicates unknown coin meaning no new coin spend since last cache
      return cachedInfo;
    }
  }

  const heightFilePath = getHeightFilePath(storeId.toString("hex"));

  let createdAtHeight: number | undefined;
  let createdAtHash: string | undefined;

  // Check if the height.dat file exists and read it if it does
  if (fs.existsSync(heightFilePath)) {
    try {
      const heightFile = fs.readFileSync(heightFilePath, "utf-8");
      const parsedHeightFile = JSON.parse(heightFile || "{}");
      createdAtHeight = parsedHeightFile.createdAtHeight;
      createdAtHash = parsedHeightFile.createdAtHash;
    } catch (error) {
      console.error("Error reading or parsing height.dat file:", error);
    }
  }

  const peer = await getPeer();

  // If not cached, retrieve the latest store info from the blockchain
  const { latestStore, latestHeight } = await peer.syncStoreFromLauncherId(
    storeId,
    createdAtHeight || MIN_HEIGHT,
    Buffer.from(createdAtHash || MIN_HEIGHT_HEADER_HASH, "hex"),
    false
  );

  const latestHash = await peer.getHeaderHash(latestHeight);

  // Cache the latest store info in the file system
  cacheStoreInfo(
    storeId.toString("hex"),
    latestStore,
    latestHeight,
    latestHash
  );

  return { latestStore, latestHeight, latestHash };
};

export const getStoreCreatedAtHeight = async (): Promise<{
  createdAtHeight: number;
  createdAtHash: Buffer;
}> => {
  const defaultHeight = MIN_HEIGHT;
  const defaultHash = Buffer.from(MIN_HEIGHT_HEADER_HASH, "hex");

  try {
    const storeId = await getActiveStoreId();
    if (!storeId) {
      return { createdAtHeight: defaultHeight, createdAtHash: defaultHash };
    }

    const heightFilePath = getHeightFilePath(storeId.toString("hex"));

    // Check if the file exists before attempting to read it
    if (!fs.existsSync(heightFilePath)) {
      return { createdAtHeight: defaultHeight, createdAtHash: defaultHash };
    }

    const heightFile = fs.readFileSync(heightFilePath, "utf-8");
    const { height, hash } = JSON.parse(heightFile);

    return {
      createdAtHeight: height || defaultHeight,
      createdAtHash: Buffer.from(hash || MIN_HEIGHT_HEADER_HASH, "hex"),
    };
  } catch {
    return { createdAtHeight: defaultHeight, createdAtHash: defaultHash };
  }
};

export const getRootHistory = async (
  launcherId: Buffer
): Promise<RootHistoryItem[]> => {
  const peer = await getPeer();

  if (!launcherId) {
    throw new Error("No valid data store folder found.");
  }

  const { createdAtHeight, createdAtHash } = await getStoreCreatedAtHeight();

  const { rootHashes, rootHashesTimestamps } =
    await peer.syncStoreFromLauncherId(
      launcherId,
      createdAtHeight,
      createdAtHash,
      true
    );

  if (!rootHashes) {
    return [];
  }

  const rootHistory: RootHistoryItem[] = rootHashes.map((rootHash, index) => {
    return {
      root_hash: rootHash.toString("hex"),
      timestamp: Number(rootHashesTimestamps?.[index].toString()),
    };
  });

  // hack until fixed in datalayer-driver
  return rootHistory;
};

export const hasMetadataWritePermissions = async (
  storeId: Buffer,
  publicSyntheticKey?: Buffer,
  retryCount: number = 10
): Promise<boolean> => {
  try {
    const { latestStore } = await getLatestStoreInfo(storeId);

    let ownerPuzzleHash;

    if (publicSyntheticKey) {
      ownerPuzzleHash = syntheticKeyToPuzzleHash(publicSyntheticKey);
    } else {
      const wallet = await Wallet.load("main");
      ownerPuzzleHash = await wallet.getOwnerPuzzleHash();
    }

    const isStoreOwner = latestStore.ownerPuzzleHash.equals(ownerPuzzleHash);

    const hasWriteAccess = latestStore.delegatedPuzzles.some(
      (puzzle) =>
        puzzle.adminInnerPuzzleHash?.equals(ownerPuzzleHash) ||
        puzzle.writerInnerPuzzleHash?.equals(ownerPuzzleHash)
    );

    return isStoreOwner || hasWriteAccess;
  } catch (error: any) {
    if (error.message.includes("AlreadyClosed") && retryCount > 0) {
      console.warn(
        `Retrying hasMetadataWritePermissions due to WebSocket closure... (${retryCount} retries left)`
      );
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return hasMetadataWritePermissions(
        storeId,
        publicSyntheticKey,
        retryCount - 1
      );
    } else {
      console.trace(error.message);
      throw new Error("Failed to check store ownership.");
    }
  }
};

export const updateDataStoreMetadata = async ({
  rootHash,
  label,
  description,
  bytes,
}: DataStoreMetadata) => {
  const storeId = await getActiveStoreId();
  if (!storeId) {
    throw new Error("No data store found in the current directory");
  }

  const { latestStore } = await getLatestStoreInfo(storeId);

  const peer = await getPeer();
  const wallet = await Wallet.load("main");
  const ownerPublicKey = await wallet.getPublicSyntheticKey();

  // TODO: to make this work for all users we need a way to get the authorized writer public key as well and not just assume its the owner
  const updateStoreResponse = updateStoreMetadata(
    latestStore,
    rootHash,
    label,
    description,
    bytes,
    ownerPublicKey,
    null,
    null
  );

  const fee = await calculateFeeForCoinSpends(peer, null);
  const unspentCoins = await selectUnspentCoins(peer, BigInt(0), fee);
  const feeCoinSpends = await addFee(
    ownerPublicKey,
    unspentCoins,
    updateStoreResponse.coinSpends.map((coinSpend) =>
      getCoinId(coinSpend.coin)
    ),
    fee
  );

  const combinedCoinSpends = [
    ...(updateStoreResponse.coinSpends as CoinSpend[]),
    ...(feeCoinSpends as CoinSpend[]),
  ];

  const sig = signCoinSpends(
    combinedCoinSpends,
    [await wallet.getPrivateSyntheticKey()],
    false
  );

  const err = await peer.broadcastSpend(combinedCoinSpends, [sig]);

  if (err) {
    throw new Error(err);
  }

  return updateStoreResponse.newStore;
};

export const getLocalRootHistory = async (): Promise<
  RootHistoryItem[] | undefined
> => {
  const storeId = await getActiveStoreId();

  if (!storeId) {
    throw new Error("No launcher ID found in the current directory");
  }

  // Load manifest file
  const manifestFilePath = getManifestFilePath(storeId.toString("hex"));
  if (!fs.existsSync(manifestFilePath)) {
    console.error("Manifest file not found", manifestFilePath);
    return undefined;
  }

  const manifestHashes = fs
    .readFileSync(manifestFilePath, "utf-8")
    .split("\n")
    .filter(Boolean);

  return manifestHashes.map((rootHash) => ({
    root_hash: rootHash,
    // TODO: alter the manifest file to include timestamps
    timestamp: 0,
  }));
};

export const validateStore = async (
  storeId?: Buffer | null
): Promise<boolean> => {
  if (!storeId) {
    storeId = await getActiveStoreId();

    if (!storeId) {
      console.error("No launcher ID found in the current directory");
      return false;
    }
  }

  const rootHistory = await getRootHistory(storeId);

  if (process.env.DIG_DEBUG == "1") {
    console.log(rootHistory);
  }

  if (process.env.DIG_DEBUG == "1") {
    console.log(rootHistory);
  }

  // Load manifest file
  const manifestFilePath = getManifestFilePath(storeId.toString("hex"));
  if (!fs.existsSync(manifestFilePath)) {
    console.error("Manifest file not found", manifestFilePath);
    return false;
  }

  const manifestHashes = fs
    .readFileSync(manifestFilePath, "utf-8")
    .split("\n")
    .filter(Boolean);

  // Check if the manifest file has more hashes than the root history
  if (manifestHashes.length > rootHistory.length) {
    console.error(
      "The store is corrupted: Manifest file has more hashes than the root history."
    );
    return false;
  }

  // Check if the root history has more hashes than the manifest file
  if (rootHistory.length > manifestHashes.length) {
    console.error(rootHistory.length, manifestHashes.length);
    console.error(rootHistory);
    console.error(manifestHashes);
    console.error(
      "The store is not synced: Root history has more hashes than the manifest file."
    );
    return false;
  }

  // Ensure manifest root hashes exist in root history in the same order
  for (let i = 0; i < manifestHashes.length; i++) {
    if (manifestHashes[i] !== rootHistory[i]?.root_hash) {
      console.error(
        `Root hash mismatch at position ${i}: expected ${manifestHashes[i]} but found ${rootHistory[i]?.root_hash}`
      );
      return false;
    }
  }

  let filesIntegrityIntact = true;
  // Validate each root hash
  for (const rootHash of manifestHashes) {
    const datFilePath = path.join(
      STORE_PATH,
      storeId.toString("hex"),
      `${rootHash}.dat`
    );

    if (!fs.existsSync(datFilePath)) {
      console.error(`Data file for root hash ${rootHash} not found`);
      return false;
    }

    const datFileContent = JSON.parse(
      fs.readFileSync(datFilePath, "utf-8")
    ) as DatFile;

    if (datFileContent.root !== rootHash) {
      console.error(
        `Root hash in data file does not match: ${datFileContent.root} !== ${rootHash}`
      );
      return false;
    }

    // Validate SHA256 hashes of the files
    for (const [fileKey, fileData] of Object.entries(datFileContent.files)) {
      const integrityCheck = validateFileSha256(
        fileData.sha256,
        path.join(STORE_PATH, storeId.toString("hex"), "data")
      );

      if (process.env.DIG_DEBUG == "1") {
        console.log(
          `Key ${fileKey}: SHA256 = ${fileData.sha256}, integrity: ${
            integrityCheck ? "OK" : "FAILED"
          }`
        );
      }

      if (!integrityCheck) {
        filesIntegrityIntact = false;
      }
    }
  }

  if (!filesIntegrityIntact) {
    console.error(`Store Corrupted: Data failed SHA256 validation.`);

    return false;
  }

  if (process.env.DIG_DEBUG == "1") {
    console.log("Store validation successful.");
  }

  return true;
};

export const isStoreSynced = async (storeId: Buffer): Promise<boolean> => {
  if (!storeId) {
    console.error("No launcher ID found in the current directory");
    return false;
  }

  console.log(`Checking if store ${storeId.toString("hex")} is up to date...`);

  const rootHistory = await getRootHistory(storeId);

  console.log("Root history length:", rootHistory.length);

  // Load manifest file
  const manifestFilePath = getManifestFilePath(storeId.toString("hex"));
  if (!fs.existsSync(manifestFilePath)) {
    return false;
  }

  const manifestHashes = fs
    .readFileSync(manifestFilePath, "utf-8")
    .split("\n")
    .filter(Boolean);

  console.log("Manifest length:", manifestHashes.length);

  return rootHistory.length === manifestHashes.length;
};
