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
  COIN_STATE_FILE_PATH,
} from "../config";
import { selectUnspentCoins } from "./coins";

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
      size: storeInfo.metadata.size?.toString(),
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
    size: data.metadata.size ? BigInt(data.metadata.size) : undefined,
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

  // Define the .dig folder path
  const digFolderPath = path.resolve(process.cwd(), ".dig");

  // Find the folder that has a 64-character hex name
  const launcherId = findLauncherId(digFolderPath);

  if (!launcherId) {
    throw new Error("No valid data store folder found.");
  }

  const { latestInfo } = await peer.syncStoreFromLauncherId(
    Buffer.from(launcherId, 'hex'),
    MIN_HEIGHT,
    Buffer.from(MIN_HEIGHT_HEADER_HASH, "hex")
  );

  return latestInfo;
};

/**
 * Finds the first top-level folder that is a 64-character hex string within the .dig directory.
 *
 * @param {string} dirPath - The .dig directory path.
 * @returns {string | null} The name of the folder if found, otherwise null.
 */
const findLauncherId = (dirPath: string): string | null => {
  if (!fs.existsSync(dirPath)) {
    throw new Error(`Directory does not exist: ${dirPath}`);
  }

  const folders = fs.readdirSync(dirPath);

  for (const folder of folders) {
    const folderPath = path.join(dirPath, folder);
    if (fs.lstatSync(folderPath).isDirectory() && /^[a-f0-9]{64}$/.test(folder)) {
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
    Buffer.from(MIN_HEIGHT_HEADER_HASH, "hex")
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

    fs.writeFileSync(HEIGHT_FILE_PATH, JSON.stringify(resetHeightCache, null, 4));
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
  const feeCoinSpends = await addFee(await getPublicSyntheticKey(), unspentCoins, meltStoreCoinSpends.map(coinSpend => getCoinId(coinSpend.coin)), defaultFee);
  
  const combinedCoinSpends = [...meltStoreCoinSpends as CoinSpend[], ...feeCoinSpends as CoinSpend[]];

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
  size,
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
    size,
    ownerPublicKey,
    null,
    null
  );

  const feeBigInt = BigInt(100000000);
  const unspentCoins = await selectUnspentCoins(peer, feeBigInt);
  const feeCoinSpends = await addFee(ownerPublicKey, unspentCoins, updateStoreResponse.coinSpends.map(coinSpend => getCoinId(coinSpend.coin)), feeBigInt);

  const combinedCoinSpends = [...updateStoreResponse.coinSpends as CoinSpend[], ...feeCoinSpends as CoinSpend[]];

  const sig = signCoinSpends(
    combinedCoinSpends,
    [await getPrivateSyntheticKey()],
    Buffer.from(NETWORK_AGG_SIG_DATA, "hex")
  );

  const err = await peer.broadcastSpend(
    combinedCoinSpends,
    [sig]
  );

  if (err) {
    throw new Error(err);
  }

  return updateStoreResponse.newInfo;
};
