import {
  selectCoins,
  Peer,
} from "datalayer-driver";
import { getOwnerPuzzleHash } from "./keys";
import { MIN_HEIGHT, MIN_HEIGHT_HEADER_HASH } from "../config";
import { createSpinner } from "nanospinner";

export const selectUnspentCoins = async (
  peer: Peer,
  feeBigInt: bigint
): Promise<any> => {
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
    coinId: Buffer
  ): Promise<boolean> => {
    const spinner = createSpinner("Waiting for confirmation...").start();
  
    try {
      while (true) {
        const confirmed = await peer.isCoinSpent(
          coinId,
          MIN_HEIGHT,
          Buffer.from(MIN_HEIGHT_HEADER_HASH, "hex")
        );
  
        if (confirmed) {
          spinner.success({ text: "Coin confirmed!" });
          return true;
        }
  
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    } catch (error) {
      spinner.error({ text: "Error while waiting for confirmation." });
      throw error;
    }
  };
  