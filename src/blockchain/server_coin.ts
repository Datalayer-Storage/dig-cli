import _ from "lodash";
import {
  morphLauncherId,
  createServerCoin,
  addFee,
  getCoinId,
  CoinSpend,
  signCoinSpends,
  ServerCoin
} from "datalayer-driver";
import { getPeer } from "./peer";
import { selectUnspentCoins } from "./coins";
import { getPublicSyntheticKey, getPrivateSyntheticKey } from "./keys";
import { calculateFeeForCoinSpends } from "./coins";

const serverCoinCollateral = 300_000_000;

export const createServerCoinForEpoch = async (
  storeId: Buffer,
  peerIp: string,
): Promise<ServerCoin> => {
  try {
    const peer = await getPeer();
    const publicSyntheticKey = await getPublicSyntheticKey();
    const serverCoinCreationCoins = await selectUnspentCoins(
      peer,
      BigInt(serverCoinCollateral),
      BigInt(1000000)
    );

    const currentEpoch = getCurrentEpoch();
    const epochBasedHint = morphLauncherId(storeId, BigInt(currentEpoch));

    const newServerCoin = createServerCoin(
      publicSyntheticKey,
      serverCoinCreationCoins,
      epochBasedHint,
      [peerIp],
      BigInt(serverCoinCollateral),
      BigInt(1000000)
    );
  //  const fee = await calculateFeeForCoinSpends(peer, newServerCoin.coinSpends);
   // const unspentCoinsForFee = await selectUnspentCoins(peer, BigInt(0), fee);
  //  const feeCoinSpends = await addFee(
  //    publicSyntheticKey,
   //   unspentCoinsForFee,
   //   newServerCoin.coinSpends.map((coinSpend) => getCoinId(coinSpend.coin)),
   //   fee
   // );

    const combinedCoinSpends = [
      ...(newServerCoin.coinSpends as CoinSpend[]),
    //  ...(feeCoinSpends as CoinSpend[]),
    ];

    const sig = signCoinSpends(
      combinedCoinSpends,
      [await getPrivateSyntheticKey()],
      false
    );

    const err = await peer.broadcastSpend(combinedCoinSpends, [sig]);

    if (err) {
      throw new Error(err);
    }

    return newServerCoin.serverCoin;
  } catch (error: any) {
    throw new Error("Failed to create server coin: " + error.message);
  }
};

export const meltServerCoin = async (storeId: string, coinId: string) => {};

export const sampleCurrentEpochServerCoins = async (storeId: Buffer, sampleSize: number = 5) => {
  const epoch = getCurrentEpoch();
  return sampleServerCoinsByEpoch(epoch, storeId, sampleSize);
};

export const sampleServerCoinsByEpoch = async (
  epoch: number,
  storeId: Buffer,
  sampleSize: number = 5
) => {
  const epochBasedHint = morphLauncherId(storeId, BigInt(epoch));

  const peer = await getPeer();
  const maxClvmCost = BigInt(11_000_000_000);

  const hintedCoinStates = await peer.getHintedCoinStates(
    epochBasedHint,
    false
  );

  const filteredCoinStates = hintedCoinStates.filter(
    (coinState) => coinState.coin.amount > serverCoinCollateral
  );

  // Use a Set to ensure uniqueness
  const serverCoinPeers = new Set<string>();

  for (const coinState of filteredCoinStates) {
    const serverCoin = await peer.fetchServerCoin(coinState, maxClvmCost);
    serverCoinPeers.add(serverCoin.memoUrls[0]);
  }

  // Convert the Set back to an array if needed
  return _.sampleSize(Array.from(serverCoinPeers), sampleSize);
};

export const getCurrentEpoch = () => {
  return calculateEpoch(new Date());
};

/**
 * Calculates the current epoch based on the provided timestamp in UTC.
 * The first epoch starts on Monday, September 2, 2024, at 8:00 PM EDT.
 * Each epoch is 7 days long.
 *
 * @param {Date} currentTimestampUTC - The current timestamp in UTC.
 * @returns {number} The epoch number the given timestamp belongs to.
 */
export const calculateEpoch = (currentTimestampUTC: Date): number => {
  // Start date of the first epoch (September 2, 2024, 8:00 PM EDT).
  const firstEpochStart = new Date(Date.UTC(2024, 8, 3, 0, 0)); // September 3, 2024, 00:00 UTC (September 2, 2024, 8:00 PM EDT)

  // Convert the current timestamp to milliseconds
  const currentTimestampMillis = currentTimestampUTC.getTime();

  // Calculate the number of milliseconds in one epoch (7 days)
  const millisecondsInEpoch = 7 * 24 * 60 * 60 * 1000;

  // Calculate the difference in milliseconds between the current timestamp and the first epoch start
  const differenceMillis = currentTimestampMillis - firstEpochStart.getTime();

  // Calculate the current epoch number
  const epochNumber = Math.floor(differenceMillis / millisecondsInEpoch) + 1;

  return epochNumber;
};
