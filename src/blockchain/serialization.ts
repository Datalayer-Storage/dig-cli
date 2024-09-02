import fs from "fs";
import { DataStore, Coin, Proof, DataStoreMetadata, DelegatedPuzzle } from "datalayer-driver";

export const serializeStoreInfo = (storeInfo: DataStore): any => {
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
            parentParentCoinInfo: storeInfo.proof.lineageProof.parentParentCoinInfo.toString("hex"),
            parentInnerPuzzleHash: storeInfo.proof.lineageProof.parentInnerPuzzleHash.toString("hex"),
            parentAmount: storeInfo.proof.lineageProof.parentAmount.toString(),
          }
        : undefined,
      eveProof: storeInfo.proof.eveProof
        ? {
            parentParentCoinInfo: storeInfo.proof.eveProof.parentParentCoinInfo.toString("hex"),
            parentAmount: storeInfo.proof.eveProof.parentAmount.toString(),
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
      adminInnerPuzzleHash: puzzle.adminInnerPuzzleHash?.toString("hex"),
      writerInnerPuzzleHash: puzzle.writerInnerPuzzleHash?.toString("hex"),
      oraclePaymentPuzzleHash: puzzle.oraclePaymentPuzzleHash?.toString("hex"),
      oracleFee: puzzle.oracleFee?.toString(),
    })),
  };
};

export const deserializeStoreInfo = (
  filePath: string
): { latestStore: DataStore, latestHeight: number, latestHash: Buffer } | null => {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  const rawData = fs.readFileSync(filePath, "utf-8");
  const data = JSON.parse(rawData);

  const coin: Coin = {
    parentCoinInfo: Buffer.from(data.latestStore.coin.parentCoinInfo, "hex"),
    puzzleHash: Buffer.from(data.latestStore.coin.puzzleHash, "hex"),
    amount: BigInt(data.latestStore.coin.amount),
  };

  const proof: Proof = {
    lineageProof: data.latestStore.proof.lineageProof
      ? {
          parentParentCoinInfo: Buffer.from(data.latestStore.proof.lineageProof.parentParentCoinInfo, "hex"),
          parentInnerPuzzleHash: Buffer.from(data.latestStore.proof.lineageProof.parentInnerPuzzleHash, "hex"),
          parentAmount: BigInt(data.latestStore.proof.lineageProof.parentAmount),
        }
      : undefined,
    eveProof: data.latestStore.proof.eveProof
      ? {
          parentParentCoinInfo: Buffer.from(data.latestStore.proof.eveProof.parentParentCoinInfo, "hex"),
          parentAmount: BigInt(data.latestStore.proof.eveProof.parentAmount),
        }
      : undefined,
  };

  const metadata: DataStoreMetadata = {
    rootHash: Buffer.from(data.latestStore.metadata.rootHash, "hex"),
    label: data.latestStore.metadata.label,
    description: data.latestStore.metadata.description,
    bytes: data.latestStore.metadata.bytes ? BigInt(data.latestStore.metadata.bytes) : undefined,
  };

  const delegatedPuzzles: DelegatedPuzzle[] = data.latestStore.delegatedPuzzles.map(
    (puzzle: any) => ({
      adminInnerPuzzleHash: puzzle.adminInnerPuzzleHash
        ? Buffer.from(puzzle.adminInnerPuzzleHash, "hex")
        : undefined,
      writerInnerPuzzleHash: puzzle.writerInnerPuzzleHash
        ? Buffer.from(puzzle.writerInnerPuzzleHash, "hex")
        : undefined,
      oraclePaymentPuzzleHash: puzzle.oraclePaymentPuzzleHash
        ? Buffer.from(puzzle.oraclePaymentPuzzleHash, "hex")
        : undefined,
      oracleFee: puzzle.oracleFee
        ? BigInt(puzzle.oracleFee)
        : undefined,
    })
  );

  const dataStoreInfo: DataStore = {
    coin,
    launcherId: Buffer.from(data.latestStore.launcherId, "hex"),
    proof,
    metadata,
    ownerPuzzleHash: Buffer.from(data.latestStore.ownerPuzzleHash, "hex"),
    delegatedPuzzles,
  };

  return {
    latestStore: dataStoreInfo,
    latestHeight: parseInt(data.latestHeight, 10),
    latestHash: Buffer.from(data.latestHash, "base64"),
  };
};

