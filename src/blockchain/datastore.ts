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
  DataStoreMetadata
} from "datalayer-driver";
import { getPeer } from "./peer";
import { getPublicSyntheticKey, getPrivateSyntheticKey, getOwnerPuzzleHash } from "./keys";
import { NETWORK_AGG_SIG_DATA, MIN_HEIGHT, MIN_HEIGHT_HEADER_HASH } from "../config";
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

export const deserializeStoreInfo = (filePath: string): DataStoreInfo | null => {
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

export const checkStoreOwnership = async () => {
  const peer = await getPeer();

  const dataStoreInfo = deserializeStoreInfo(
    path.join(process.cwd(), ".dig", "state.data")
  );

  if (!dataStoreInfo) {
    return true;
  }

  const { latestInfo, latestHeight } = await peer.syncStoreFromLauncherId(
    dataStoreInfo.launcherId,
    MIN_HEIGHT,
    Buffer.from(MIN_HEIGHT_HEADER_HASH, "hex")
  );

  const ownerPuzzleHash = await getOwnerPuzzleHash();

  return latestInfo.ownerPuzzleHash === ownerPuzzleHash;
};

export const transferStoreOwnership = async (newOwner: string) => {
  const peer = await getPeer();

  const dataStoreInfo = deserializeStoreInfo(
    path.join(process.cwd(), ".dig", "state.data")
  );

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

  const err = await peer.broadcastSpend(
    coinSpends as CoinSpend[],
    [sig]
  );

  if (err) {
    throw new Error(err);
  }

  return newInfo;
};
