import _ from "lodash";
import {
  morphLauncherId,
  createServerCoin,
  addFee,
  getCoinId,
  CoinSpend,
  signCoinSpends,
  ServerCoin,
  lookupAndSpendServerCoins,
  Peer
} from "datalayer-driver";
import { getPeer } from "./peer";
import { selectUnspentCoins, waitForConfirmation } from "./coins";
import { getPublicSyntheticKey, getPrivateSyntheticKey } from "./Wallet";
import { NconfManager } from "../utils/NconfManager";
import { calculateFeeForCoinSpends } from "./coins";
import { CoinData, ServerCoinData } from "../types";
import { peer } from ".";

const serverCoinCollateral = 300_000_000;
const serverCoinManager = new NconfManager("server_coin.json");

export const createServerCoinForEpoch = async (
  storeId: Buffer,
  peerIp: string
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
    //   const fee = await calculateFeeForCoinSpends(peer, newServerCoin.coinSpends);
    // const unspentCoinsForFee = await selectUnspentCoins(peer, BigInt(0), fee, serverCoinCreationCoins);
    //   console.log("Unspent coins for fee: ", getCoinId(unspentCoinsForFee[0]).toString("hex"));
    // const feeCoinSpends = await addFee(
    //   publicSyntheticKey,
    //   unspentCoinsForFee,
    //   newServerCoin.coinSpends.map((coinSpend) => getCoinId(coinSpend.coin)),
    //    fee
    // );

    //   console.log(serverCoinCreationCoins, feeCoinSpends);

    const combinedCoinSpends = [
      ...(newServerCoin.coinSpends as CoinSpend[]),
      //   ...(feeCoinSpends as CoinSpend[]),
    ];

    const sig = signCoinSpends(
      combinedCoinSpends,
      [await getPrivateSyntheticKey()],
      false
    );

    const err = await peer.broadcastSpend(combinedCoinSpends, [sig]);

    if (err) {
      if (err.includes("no spendable coins")) {
        console.log("No coins available will try again in 5 seconds");
        await new Promise((resolve) => setTimeout(resolve, 5000));
        return createServerCoinForEpoch(storeId, peerIp);
        // Auto Split Coins
      }
      throw new Error(err);
    }

    return newServerCoin.serverCoin;
  } catch (error: any) {
    throw new Error("Failed to create server coin: " + error.message);
  }
};

export const meltServerCoin = async (peer: Peer, serverCoin: CoinData) => {
  const publicSyntheticKey = await getPublicSyntheticKey();
  const feeCoins = await selectUnspentCoins(peer, BigInt(0), BigInt(1000000));

  const coin = {
    amount: BigInt(serverCoin.amount),
    puzzleHash: Buffer.from(serverCoin.puzzleHash, "hex"),
    parentCoinInfo: Buffer.from(serverCoin.parentCoinInfo, "hex"),
  };

  const serverCoinId = getCoinId(coin);

  console.log("Melt Coin ID: ", serverCoinId.toString("hex"));

  const spendBundle = await lookupAndSpendServerCoins(
    peer,
    publicSyntheticKey,
    [coin, ...feeCoins],
    BigInt(1000000),
    false
  );

  const sig = signCoinSpends(
    spendBundle,
    [await getPrivateSyntheticKey()],
    false
  );

  const err = await peer.broadcastSpend(spendBundle, [sig]);

  if (err) {
    throw new Error(err);
  }

  await waitForConfirmation(serverCoinId);
};

export const sampleCurrentEpochServerCoins = async (
  storeId: Buffer,
  sampleSize: number = 5,
  blacklist: string[] = []
): Promise<string[]> => {
  const epoch = getCurrentEpoch();
  return sampleServerCoinsByEpoch(epoch, storeId, sampleSize, blacklist);
};

export const sampleServerCoinsByEpoch = async (
  epoch: number,
  storeId: Buffer,
  sampleSize: number = 5,
  blacklist: string[] = []
): Promise<string[]> => {
  const epochBasedHint = morphLauncherId(storeId, BigInt(epoch));

  const peer = await getPeer();
  const maxClvmCost = BigInt(11_000_000_000);

  const hintedCoinStates = await peer.getHintedCoinStates(
    epochBasedHint,
    false
  );

  const filteredCoinStates = hintedCoinStates.filter(
    (coinState) => coinState.coin.amount >= serverCoinCollateral
  );

  // Use a Set to ensure uniqueness
  const serverCoinPeers = new Set<string>();

  for (const coinState of filteredCoinStates) {
    const serverCoin = await peer.fetchServerCoin(coinState, maxClvmCost);
    const peerUrl = serverCoin.memoUrls[0];
    if (!blacklist.includes(peerUrl)) {
      serverCoinPeers.add(peerUrl);
    }
  }

  if (process.env.DIG_DEBUG === "1") {
    console.log("Server Coin Peers: ", serverCoinPeers);
  }

  // Convert the Set back to an array if needed
  return _.sampleSize(Array.from(serverCoinPeers), sampleSize);
};

export const getCurrentEpoch = () => {
  return calculateEpoch(new Date());
};

/**
 * Retrieves and iterates through all server coins that are not in the current epoch.
 * Removes the server coin from the nconf configuration file after processing it.
 * @param storeId - The ID of the store.
 * @param publicIp - The public IP associated with the server coins.
 */
export const meltOutdatedEpochs = async (
  storeId: string,
  publicIp: string
): Promise<void> => {
  try {
    const peer = await getPeer();

    const currentEpoch = getCurrentEpoch();
    let serverCoins = await getServerCoinsForStore(storeId, publicIp);

    // Filter out the coins that are not in the current epoch
    const outdatedCoins = serverCoins.filter(
      (coin) => coin.epoch < currentEpoch
    );

    // Iterate through each outdated coin sequentially
    for (const serverCoin of outdatedCoins) {
      await meltServerCoin(peer, serverCoin.coin);

      // Remove the processed coin from the serverCoins array
      serverCoins = serverCoins.filter(
        (coin) => coin.epoch !== serverCoin.epoch
      );

      // Update the nconf file with the updated array
      await serverCoinManager.setConfigValue(
        `${storeId}:${publicIp}`,
        serverCoins
      );
    }
  } catch (error: any) {
    console.error(
      `Error processing outdated epochs for store ${storeId} on IP ${publicIp}: ${error.message}`
    );
    throw error;
  }
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

export const ensureServerCoinExists = async (
  storeId: string,
  publicIp: string
): Promise<void> => {
  try {
    console.log(`Ensuring server coin exists for store ${storeId}...`);
    const currentEpoch = getCurrentEpoch();
    const serverCoins = await getServerCoinsForStore(storeId, publicIp);

    // Check if a server coin already exists for the current epoch
    const existingCoin = serverCoins.find(
      (coin) => coin.epoch === currentEpoch
    );

    if (existingCoin) {
      return;
    }

    console.log(
      `No server coin found for store ${storeId} on IP ${publicIp} for epoch: ${currentEpoch}. Creating new server coin...`
    );
    const serverCoin = await createServerCoinForEpoch(
      Buffer.from(storeId, "hex"),
      publicIp
    );

    const newServerCoinData: ServerCoinData = {
      coin: {
        amount: serverCoin.coin.amount.toString(),
        puzzleHash: serverCoin.coin.puzzleHash.toString("hex"),
        parentCoinInfo: serverCoin.coin.parentCoinInfo.toString("hex"),
      },
      createdAt: new Date().toISOString(),
      epoch: currentEpoch,
    };

    await waitForConfirmation(serverCoin.coin.parentCoinInfo);

    serverCoins.push(newServerCoinData); // Add the new server coin to the array

    await serverCoinManager.setConfigValue(
      `${storeId}:${publicIp}`,
      serverCoins
    );

    console.log(
      `Server coin created and saved for store ${storeId} on IP ${publicIp}. Epoch: ${currentEpoch}`
    );
  } catch (error: any) {
    console.error(
      `Error in ensuring server coin for store ${storeId}: ${error.message}`
    );
    throw error;
  }
};

const getServerCoinsForStore = async (
  storeId: string,
  publicIp: string
): Promise<ServerCoinData[]> => {
  const serverCoins: ServerCoinData[] =
    (await serverCoinManager.getConfigValue<ServerCoinData[]>(
      `${storeId}:${publicIp}`
    )) || [];
  return serverCoins;
};

export const hasEpochCoinBeenCreated = async (
  storeId: string,
  currentEpoch: number,
  publicIp: string
): Promise<boolean> => {
  try {
    const serverCoins = await getServerCoinsForStore(storeId, publicIp);

    const existingCoin = serverCoins.find(
      (coin) => coin.epoch === currentEpoch
    );

    if (!existingCoin) {
      console.log(
        `No server coin found for store ${storeId} on IP ${publicIp} for epoch: ${currentEpoch}.`
      );
      return false;
    }

    console.log(
      `Server coin for epoch ${currentEpoch} found for store ${storeId} on IP ${publicIp}.`
    );

    return true;
  } catch (error: any) {
    console.error(`Error checking for existing server coin: ${error.message}`);
    return false;
  }
};
