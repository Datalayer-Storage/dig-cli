import fs from "fs";
import path from "path";
import {
  writerDelegatedPuzzleFromKey,
  adminDelegatedPuzzleFromKey,
  oracleDelegatedPuzzle,
  mintStore,
  signCoinSpends,
  CoinSpend,
  DataStoreInfo,
  addressToPuzzleHash,
  updateStoreOwnership,
  selectCoins,
  getCoinId,
  Peer,
  Coin,
  Proof,
  DelegatedPuzzle,
  DelegatedPuzzleInfo,
  puzzleHashToAddress,
  DataStoreMetadata,
  meltStore,
  addFee,
  updateStoreMetadata,
} from "datalayer-driver";
import { getPeer } from "./peer";
import {
  getPublicSyntheticKey,
  getPrivateSyntheticKey,
  getOwnerPuzzleHash,
  getOwnerPublicKey,
} from "./keys";
import {
  NETWORK_AGG_SIG_DATA,
  MIN_HEIGHT,
  MIN_HEIGHT_HEADER_HASH,
  HEIGHT_FILE_PATH,
  DIG_FOLDER_PATH,
  getManifestFilePath,
} from "../config";
import { selectUnspentCoins } from "./coins";
import { RootHistoryItem, DatFile } from "../types";
import { validateFileSha256 } from "../utils";

export const mintDataLayerStore = async (
  label?: string,
  description?: string,
  sizeInBytes?: bigint,
  authorizedWriterPublicAddress?: string
): Promise<DataStoreInfo> => {
  try {
    const peer = await getPeer();
    const publicSyntheticKey = await getPublicSyntheticKey();
    const ownerPuzzleHash = await getOwnerPuzzleHash();
    const feeBigInt = BigInt(100000000);
    const coins = await selectUnspentCoins(peer, feeBigInt);
    const delegationLayers = [];

    if (authorizedWriterPublicAddress) {
      delegationLayers.push(
        adminDelegatedPuzzleFromKey(
          Buffer.from(authorizedWriterPublicAddress, "hex")
        ),
        writerDelegatedPuzzleFromKey(
          Buffer.from(authorizedWriterPublicAddress, "hex")
        )
      );
    }

    delegationLayers.push(
      oracleDelegatedPuzzle(ownerPuzzleHash, BigInt(100000))
    );
    const successResponse = await mintStore(
      publicSyntheticKey,
      coins,
      Buffer.from(
        "0000000000000000000000000000000000000000000000000000000000000000",
        "hex"
      ),
      label || "",
      description || "",
      sizeInBytes || BigInt(0),
      ownerPuzzleHash,
      delegationLayers,
      feeBigInt
    );

    const sig = signCoinSpends(
      successResponse.coinSpends as CoinSpend[],
      [await getPrivateSyntheticKey()],
      Buffer.from(NETWORK_AGG_SIG_DATA, "hex")
    );

    const err = await peer.broadcastSpend(
      successResponse.coinSpends as CoinSpend[],
      [sig]
    );

    if (err) {
      throw new Error(err);
    }

    await new Promise((resolve) => setTimeout(resolve, 5000));

    return successResponse.newInfo;
  } catch (error) {
    console.error("Unable to mint store");
    console.trace(error);
    throw error;
  }
};

export const serializeStoreInfo = (storeInfo: DataStoreInfo): any => {
  return {
    coin: {
      parentCoinInfo: storeInfo.coin.parentCoinInfo.toString("hex"),
      puzzleHash: storeInfo.coin.puzzleHash.toString("hex"),
      amount: storeInfo.coin.amount.toString(),
    },
    launcherId: storeInfo.launcherId.toString("hex"),
    proof: {
      lineageProof: storeInfo.proof.lineageProof
        ? {
            parentParentCoinId:
              storeInfo.proof.lineageProof.parentParentCoinId.toString("hex"),
            parentInnerPuzzleHash:
              storeInfo.proof.lineageProof.parentInnerPuzzleHash.toString(
                "hex"
              ),
            parentAmount: storeInfo.proof.lineageProof.parentAmount.toString(),
          }
        : undefined,
      eveProof: storeInfo.proof.eveProof
        ? {
            parentCoinInfo:
              storeInfo.proof.eveProof.parentCoinInfo.toString("hex"),
            amount: storeInfo.proof.eveProof.amount.toString(),
          }
        : undefined,
    },
    metadata: {
      rootHash: storeInfo.metadata.rootHash.toString("hex"),
      label: storeInfo.metadata.label,
      description: storeInfo.metadata.description,
      bytes: storeInfo.metadata.bytes?.toString(),
    },
    ownerPuzzleHash: storeInfo.ownerPuzzleHash.toString("hex"),
    delegatedPuzzles: storeInfo.delegatedPuzzles.map((puzzle) => ({
      puzzleHash: puzzle.puzzleHash.toString("hex"),
      puzzleInfo: {
        adminInnerPuzzleHash:
          puzzle.puzzleInfo.adminInnerPuzzleHash?.toString("hex"),
        writerInnerPuzzleHash:
          puzzle.puzzleInfo.writerInnerPuzzleHash?.toString("hex"),
        oraclePaymentPuzzleHash:
          puzzle.puzzleInfo.oraclePaymentPuzzleHash?.toString("hex"),
        oracleFee: puzzle.puzzleInfo.oracleFee?.toString(),
      },
    })),
  };
};

export const deserializeStoreInfo = (
  filePath: string
): DataStoreInfo | null => {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  const rawData = fs.readFileSync(filePath, "utf-8");
  const data = JSON.parse(rawData);

  const coin: Coin = {
    parentCoinInfo: Buffer.from(data.coin.parentCoinInfo, "hex"),
    puzzleHash: Buffer.from(data.coin.puzzleHash, "hex"),
    amount: BigInt(data.coin.amount),
  };

  const proof: Proof = {
    lineageProof: data.proof.lineageProof
      ? {
          parentParentCoinId: Buffer.from(
            data.proof.lineageProof.parentParentCoinId,
            "hex"
          ),
          parentInnerPuzzleHash: Buffer.from(
            data.proof.lineageProof.parentInnerPuzzleHash,
            "hex"
          ),
          parentAmount: BigInt(data.proof.lineageProof.parentAmount),
        }
      : undefined,
    eveProof: data.proof.eveProof
      ? {
          parentCoinInfo: Buffer.from(
            data.proof.eveProof.parentCoinInfo,
            "hex"
          ),
          amount: BigInt(data.proof.eveProof.amount),
        }
      : undefined,
  };

  const metadata: DataStoreMetadata = {
    rootHash: Buffer.from(data.metadata.rootHash, "hex"),
    label: data.metadata.label,
    description: data.metadata.description,
    bytes: data.metadata.bytes ? BigInt(data.metadata.bytes) : undefined,
  };

  const delegatedPuzzles: DelegatedPuzzle[] = data.delegatedPuzzles.map(
    (puzzle: any) => ({
      puzzleHash: Buffer.from(puzzle.puzzleHash, "hex"),
      puzzleInfo: {
        adminInnerPuzzleHash: puzzle.puzzleInfo.adminInnerPuzzleHash
          ? Buffer.from(puzzle.puzzleInfo.adminInnerPuzzleHash, "hex")
          : undefined,
        writerInnerPuzzleHash: puzzle.puzzleInfo.writerInnerPuzzleHash
          ? Buffer.from(puzzle.puzzleInfo.writerInnerPuzzleHash, "hex")
          : undefined,
        oraclePaymentPuzzleHash: puzzle.puzzleInfo.oraclePaymentPuzzleHash
          ? Buffer.from(puzzle.puzzleInfo.oraclePaymentPuzzleHash, "hex")
          : undefined,
        oracleFee: puzzle.puzzleInfo.oracleFee
          ? BigInt(puzzle.puzzleInfo.oracleFee)
          : undefined,
      } as DelegatedPuzzleInfo,
    })
  );

  const dataStoreInfo: DataStoreInfo = {
    coin,
    launcherId: Buffer.from(data.launcherId, "hex"),
    proof,
    metadata,
    ownerPuzzleHash: Buffer.from(data.ownerPuzzleHash, "hex"),
    delegatedPuzzles,
  };

  return dataStoreInfo;
};

/**
 * Retrieves the latest DataStoreInfo by finding the top-level folder in the .dig directory that is a 64-character hex string.
 *
 * @returns {Promise<DataStoreInfo>} The latest DataStoreInfo.
 */
export const getLatestStoreInfo = async (): Promise<DataStoreInfo> => {
  const peer = await getPeer();

  // Find the folder that has a 64-character hex name
  const launcherId = findLauncherId(DIG_FOLDER_PATH);

  if (!launcherId) {
    throw new Error("No valid data store folder found.");
  }

  const { latestInfo } = await peer.syncStoreFromLauncherId(
    Buffer.from(launcherId, "hex"),
    MIN_HEIGHT,
    Buffer.from(MIN_HEIGHT_HEADER_HASH, "hex"),
    false
  );

  return latestInfo;
};

export const getRootHistory = async (
  launcherId: Buffer
): Promise<RootHistoryItem[]> => {
  const peer = await getPeer();

  if (!launcherId) {
    throw new Error("No valid data store folder found.");
  }

  const { rootHashes, rootHashesTimestamps } =
    await peer.syncStoreFromLauncherId(
      launcherId,
      MIN_HEIGHT,
      Buffer.from(MIN_HEIGHT_HEADER_HASH, "hex"),
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
  return [{root_hash: '0000000000000000000000000000000000000000000000000000000000000000', timestamp: 0}, ...rootHistory];
};

/**
 * Finds the first top-level folder that is a 64-character hex string within the .dig directory.
 *
 * @param {string} dirPath - The .dig directory path.
 * @returns {string | null} The name of the folder if found, otherwise null.
 */
export const findLauncherId = (dirPath: string): string | null => {
  if (!fs.existsSync(dirPath)) {
    throw new Error(`Directory does not exist: ${dirPath}`);
  }

  const folders = fs.readdirSync(dirPath);

  for (const folder of folders) {
    const folderPath = path.join(dirPath, folder);
    if (
      fs.lstatSync(folderPath).isDirectory() &&
      /^[a-f0-9]{64}$/.test(folder)
    ) {
      return folder;
    }
  }

  return null;
};
export const checkStoreOwnership = async (): Promise<boolean> => {
  try {
    const peer: Peer = await getPeer();

    const dataStoreInfo = await getLatestStoreInfo();

    if (!dataStoreInfo) {
      return true;
    }

    // Load height cache from HEIGHT_FILE_PATH, or use defaults if not found
    let heightCache = {
      minHeight: MIN_HEIGHT,
      minHeightHeaderHash: MIN_HEIGHT_HEADER_HASH,
    };
    if (fs.existsSync(HEIGHT_FILE_PATH)) {
      const fileContent = fs.readFileSync(HEIGHT_FILE_PATH, "utf-8");
      heightCache = JSON.parse(fileContent);
    }

    const minHeight = heightCache.minHeight || MIN_HEIGHT;
    const minHeightHeaderHash =
      heightCache.minHeightHeaderHash || MIN_HEIGHT_HEADER_HASH;

    // Sync store information from the blockchain
    const { latestInfo, latestHeight } = await peer.syncStoreFromLauncherId(
      dataStoreInfo.launcherId,
      MIN_HEIGHT,
      Buffer.from(MIN_HEIGHT_HEADER_HASH, "hex"),
      false
    );

    const latestHeaderHash = await peer.getHeaderHash(latestHeight);

    // Save the latest height and header hash to HEIGHT_FILE_PATH
    const newHeightCache = {
      minHeight: latestHeight,
      minHeightHeaderHash: latestHeaderHash.toString("hex"),
    };
    fs.writeFileSync(HEIGHT_FILE_PATH, JSON.stringify(newHeightCache, null, 4));

    // Get the current owner's puzzle hash
    const ownerPuzzleHash = await getOwnerPuzzleHash();

    // Check if the store's owner matches the current owner's puzzle hash
    return latestInfo.ownerPuzzleHash.equals(ownerPuzzleHash);
  } catch (error) {
    const resetHeightCache = {
      minHeight: MIN_HEIGHT,
      minHeightHeaderHash: MIN_HEIGHT_HEADER_HASH,
    };

    fs.writeFileSync(
      HEIGHT_FILE_PATH,
      JSON.stringify(resetHeightCache, null, 4)
    );
    return checkStoreOwnership();
  }
};

export const meltDataLayerStore = async () => {
  const storeInfo = await getLatestStoreInfo();
  if (!storeInfo) {
    throw new Error("No data store found in donfig.");
  }

  const peer = await getPeer();
  const defaultFee = BigInt(10000);
  const ownerPublicKey = await getOwnerPublicKey();
  const meltStoreCoinSpends = await meltStore(
    storeInfo,
    Buffer.from(ownerPublicKey, "hex")
  );

  const privateKey = await getPrivateSyntheticKey();
  const unspentCoins = await selectUnspentCoins(peer, defaultFee);
  const feeCoinSpends = await addFee(
    await getPublicSyntheticKey(),
    unspentCoins,
    meltStoreCoinSpends.map((coinSpend) => getCoinId(coinSpend.coin)),
    defaultFee
  );

  const combinedCoinSpends = [
    ...(meltStoreCoinSpends as CoinSpend[]),
    ...(feeCoinSpends as CoinSpend[]),
  ];

  const sig = signCoinSpends(
    combinedCoinSpends,
    [privateKey],
    Buffer.from(NETWORK_AGG_SIG_DATA, "hex")
  );
};

export const transferStoreOwnership = async (newOwner: string) => {
  const peer = await getPeer();

  const dataStoreInfo = await getLatestStoreInfo();

  if (!dataStoreInfo) {
    throw new Error("No data store found.");
  }

  const newOwnerPuzzleHash = addressToPuzzleHash(newOwner);
  const currentOwnerPublicKey = puzzleHashToAddress(
    dataStoreInfo.ownerPuzzleHash,
    "mainnet"
  );

  const feeBigInt = BigInt(100000000);

  const { coinSpends, newInfo } = updateStoreOwnership(
    dataStoreInfo,
    newOwnerPuzzleHash,
    dataStoreInfo.delegatedPuzzles,
    Buffer.from(currentOwnerPublicKey, "hex"),
    null
  );

  const sig = signCoinSpends(
    coinSpends as CoinSpend[],
    [await getPrivateSyntheticKey()],
    Buffer.from(NETWORK_AGG_SIG_DATA, "hex")
  );

  const err = await peer.broadcastSpend(coinSpends as CoinSpend[], [sig]);

  if (err) {
    throw new Error(err);
  }

  return newInfo;
};

export const updateDataStoreMetadata = async ({
  rootHash,
  label,
  description,
  bytes,
}: DataStoreMetadata) => {
  const storeInfo = await getLatestStoreInfo();

  const peer = await getPeer();
  const ownerPublicKey = await getPublicSyntheticKey();

  // TODO: to make this work for all users we need a way to get the authorized writer public key as well and not just assume its the owner
  const updateStoreResponse = updateStoreMetadata(
    storeInfo,
    rootHash,
    label,
    description,
    bytes,
    ownerPublicKey,
    null,
    null
  );

  const feeBigInt = BigInt(100000000);
  const unspentCoins = await selectUnspentCoins(peer, feeBigInt);
  const feeCoinSpends = await addFee(
    ownerPublicKey,
    unspentCoins,
    updateStoreResponse.coinSpends.map((coinSpend) =>
      getCoinId(coinSpend.coin)
    ),
    feeBigInt
  );

  const combinedCoinSpends = [
    ...(updateStoreResponse.coinSpends as CoinSpend[]),
    ...(feeCoinSpends as CoinSpend[]),
  ];

  const sig = signCoinSpends(
    combinedCoinSpends,
    [await getPrivateSyntheticKey()],
    Buffer.from(NETWORK_AGG_SIG_DATA, "hex")
  );

  const err = await peer.broadcastSpend(combinedCoinSpends, [sig]);

  if (err) {
    throw new Error(err);
  }

  return updateStoreResponse.newInfo;
};

export const validateStore = async ({
  verbose,
}: {
  verbose: boolean;
}): Promise<boolean> => {
  const launcherId = await findLauncherId(DIG_FOLDER_PATH);

  if (!launcherId) {
    console.error("No launcher ID found in the current directory");
    return false;
  }

  const rootHistory = await getRootHistory(Buffer.from(launcherId, "hex"));

  if (verbose) {
    console.log(rootHistory);
  }

  // Load manifest file
  const manifestFilePath = getManifestFilePath(launcherId);
  if (!fs.existsSync(manifestFilePath)) {
    console.error("Manifest file not found");
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
      DIG_FOLDER_PATH,
      launcherId,
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
        path.join(DIG_FOLDER_PATH, launcherId, "data")
      );

      if (verbose) {
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

  if (verbose) {
    console.log("Store validation successful.");
  }

  return true;
};
