import {
  selectCoins,
  Peer,
  Coin,
  getCost,
  CoinSpend,
  getCoinId,
} from "datalayer-driver";
import { getOwnerPuzzleHash } from "./keys";
import { MIN_HEIGHT, MIN_HEIGHT_HEADER_HASH } from "../utils/config";
import { createSpinner } from "nanospinner";
import { getPeer } from "./peer";

export const DEFAULT_FEE_COIN_COST = 64_000_000;

export const calculateFeeForCoinSpends = async (
  peer: Peer,
  coinSpends: CoinSpend[] | null
): Promise<bigint> => {
  return BigInt(1000000);
  /*
  if (coinSpends === null) {
    return BigInt(DEFAULT_FEE_COIN_COST) * BigInt(2);
  }

  console.log("Calculating fee for coin spends...");
  let costForCoinSpend = await getCost(coinSpends);

  if (costForCoinSpend < BigInt(5)) {
    costForCoinSpend = BigInt(5);
  }

  console.log(`Cost for coin spends: ${costForCoinSpend}`);
  // Confirm in around 60 seconds
  const mojosPerClvmCost = await peer.getFeeEstimate(BigInt(60));

  console.log(`Mojo per clvm cost: ${mojosPerClvmCost}`);
  // Multiply the total cost by 2 just to be extra safe
  const fee =
    (BigInt(DEFAULT_FEE_COIN_COST) + costForCoinSpend * mojosPerClvmCost) *
    BigInt(2);

  console.log(`Fee for coin spends: ${fee}`);
  
  return fee;
  */
};

export const selectUnspentCoins = async (
  peer: Peer,
  coinAmount: bigint,
  feeBigInt: bigint,
  omitCoins: Coin[] = []
): Promise<Coin[]> => {
  const ownerPuzzleHash = await getOwnerPuzzleHash();

  const coinsResp = await peer.getAllUnspentCoins(
    ownerPuzzleHash,
    MIN_HEIGHT,
    Buffer.from(MIN_HEIGHT_HEADER_HASH, "hex")
  );

  if (process.env.DIG_DEBUG == "1") {
    console.log("Unspent Coins:", coinsResp); // Debugging
  }

  const omitCoinIds = omitCoins.map((coin) => getCoinId(coin).toString("hex"));

 // if (process.env.DIG_DEBUG == "1") {
    console.log("Omit Coin IDs:", omitCoinIds); // Debugging
 // }

  const unspentCoins = coinsResp.coins;

  const filteredUnspentCoins = unspentCoins.filter(
    (coin) => !omitCoinIds.includes(getCoinId(coin).toString("hex"))
  );

  if (process.env.DIG_DEBUG == "1") {
    console.log("Unspent Coins after filtering:", filteredUnspentCoins); // Debugging
  }

  const selectedCoins = selectCoins(filteredUnspentCoins, feeBigInt + coinAmount);
  if (process.env.DIG_DEBUG == "1") {
    console.log("Selected Coins:", selectedCoins); // Debugging
  }

  if (selectedCoins.length === 0) {
    throw new Error("No unspent coins available.");
  }
  return selectedCoins;
};

export const waitForConfirmation = async (
  parentCoinInfo: Buffer
): Promise<boolean> => {
  const spinner = createSpinner("Waiting for confirmation...").start();
  const peer = await getPeer();

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
  } catch (error: any) {
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
