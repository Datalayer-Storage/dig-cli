import { DataStoreInfo, Coin, Proof, DataStoreMetadata, DelegatedPuzzle, DelegatedPuzzleInfo } from "datalayer-driver";
import fs from "fs";

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
            parentParentCoinId: storeInfo.proof.lineageProof.parentParentCoinId.toString("hex"),
            parentInnerPuzzleHash: storeInfo.proof.lineageProof.parentInnerPuzzleHash.toString("hex"),
            parentAmount: storeInfo.proof.lineageProof.parentAmount.toString(),
          }
        : undefined,
      eveProof: storeInfo.proof.eveProof
        ? {
            parentCoinInfo: storeInfo.proof.eveProof.parentCoinInfo.toString("hex"),
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
        adminInnerPuzzleHash: puzzle.puzzleInfo.adminInnerPuzzleHash?.toString("hex"),
        writerInnerPuzzleHash: puzzle.puzzleInfo.writerInnerPuzzleHash?.toString("hex"),
        oraclePaymentPuzzleHash: puzzle.puzzleInfo.oraclePaymentPuzzleHash?.toString("hex"),
        oracleFee: puzzle.puzzleInfo.oracleFee?.toString(),
      },
    })),
  };
};

export const deserializeStoreInfo = (
  filePath: string
): { latestInfo: DataStoreInfo, latestHeight: number, latestHash: Buffer } | null => {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  const rawData = fs.readFileSync(filePath, "utf-8");
  const data = JSON.parse(rawData);

  const coin: Coin = {
    parentCoinInfo: Buffer.from(data.latestInfo.coin.parentCoinInfo, "hex"),
    puzzleHash: Buffer.from(data.latestInfo.coin.puzzleHash, "hex"),
    amount: BigInt(data.latestInfo.coin.amount),
  };

  const proof: Proof = {
    lineageProof: data.latestInfo.proof.lineageProof
      ? {
          parentParentCoinId: Buffer.from(
            data.latestInfo.proof.lineageProof.parentParentCoinId,
            "hex"
          ),
          parentInnerPuzzleHash: Buffer.from(
            data.latestInfo.proof.lineageProof.parentInnerPuzzleHash,
            "hex"
          ),
          parentAmount: BigInt(data.latestInfo.proof.lineageProof.parentAmount),
        }
      : undefined,
    eveProof: data.latestInfo.proof.eveProof
      ? {
          parentCoinInfo: Buffer.from(
            data.latestInfo.proof.eveProof.parentCoinInfo,
            "hex"
          ),
          amount: BigInt(data.latestInfo.proof.eveProof.amount),
        }
      : undefined,
  };

  const metadata: DataStoreMetadata = {
    rootHash: Buffer.from(data.latestInfo.metadata.rootHash, "hex"),
    label: data.latestInfo.metadata.label,
    description: data.latestInfo.metadata.description,
    bytes: data.latestInfo.metadata.bytes ? BigInt(data.latestInfo.metadata.bytes) : undefined,
  };

  const delegatedPuzzles: DelegatedPuzzle[] = data.latestInfo.delegatedPuzzles.map(
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
    launcherId: Buffer.from(data.latestInfo.launcherId, "hex"),
    proof,
    metadata,
    ownerPuzzleHash: Buffer.from(data.latestInfo.ownerPuzzleHash, "hex"),
    delegatedPuzzles,
  };

  return {
    latestInfo: dataStoreInfo,
    latestHeight: parseInt(data.latestHeight, 10),
    latestHash: Buffer.from(data.latestHash, "base64"),
  };
};
