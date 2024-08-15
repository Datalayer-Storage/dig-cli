import { selectCoins, Peer, Coin } from "datalayer-driver";
import { getOwnerPuzzleHash } from "./keys";
import { MIN_HEIGHT, MIN_HEIGHT_HEADER_HASH } from "../config";
import { createSpinner } from "nanospinner";

export const selectUnspentCoins = async (
  peer: Peer,
  feeBigInt: bigint
): Promise<Coin[]> => {
  const ownerPuzzleHash = await getOwnerPuzzleHash();
  const coinsResp = await peer.getAllUnspentCoins(
    ownerPuzzleHash,
    MIN_HEIGHT,
    Buffer.from(MIN_HEIGHT_HEADER_HASH, "hex")
  );

  const unspentCoins = selectCoins(coinsResp.coins, feeBigInt + BigInt(1));
  if (unspentCoins.length === 0) {
    throw new Error("No unspent coins available.");
  }
  return unspentCoins;
};

export const waitForConfirmation = async (
  peer: Peer,
  parentCoinInfo: Buffer
): Promise<boolean> => {
  const spinner = createSpinner("Waiting for confirmation...").start();

  try {
    while (true) {
      const confirmed = await peer.isCoinSpent(
        parentCoinInfo,
        MIN_HEIGHT,
        Buffer.from(MIN_HEIGHT_HEADER_HASH, "hex")
      );

      if (confirmed) {
        spinner.success({ text: "Coin confirmed!" });
        return true;
      }

      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  } catch (error) {
    spinner.error({ text: "Error while waiting for confirmation." });
    throw error;
  }
};

export const isCoinSpendable = async (
  peer: Peer,
  coinId: Buffer
): Promise<boolean> => {
  try {
    const spent = await peer.isCoinSpent(
      coinId,
      MIN_HEIGHT,
      Buffer.from(MIN_HEIGHT_HEADER_HASH, "hex")
    );
    return spent;
  } catch (error) {
    return false;
  }
};
