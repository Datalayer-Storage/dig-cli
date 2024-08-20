import { bytesEqual, toCoinId, Wallet, Peer } from "chia-server-coin";
import { getServerCoinPeer } from "./peer";
import { NETWORK_AGG_SIG_DATA } from "../utils/config";
import { getMnemonic } from "./mnemonic";

const stringToUint8Array = (str: String) => {
  const buffer = Buffer.from(str, "hex");
  return new Uint8Array(buffer);
};

const getWallet = async (peer: Peer): Promise<Wallet> => {
  const mnemonic = await getMnemonic();
  if (!mnemonic) {
    throw new Error("Mnemonic not found");
  }
  return Wallet.initialSync(
    peer,
    mnemonic,
    Buffer.from(NETWORK_AGG_SIG_DATA, "hex")
  );
};

export const createServerCoin = async (
  launcherId: String,
  urls: string[],
  amount: number = 300_000_000
) => {
  const peer = await getServerCoinPeer();
  const wallet = await getWallet(peer);
  console.log("Creating server coin", launcherId, urls, amount);

  await wallet.createServerCoin(
    Buffer.from(launcherId, "hex"),
    amount,
    300_000_000,
    urls
  );
};

export const deleteServerCoin = async (storeId: string, coinId: string) => {
  const peer = await getServerCoinPeer();
  const wallet = await getWallet(peer);

  const serverCoinIter = await peer.fetchServerCoins(
    stringToUint8Array(storeId)
  );

  const coinsToDelete = [];

  while (true) {
    const next = await serverCoinIter.next();
    if (next === null) {
      break;
    }

    if (bytesEqual(toCoinId(next.coin), stringToUint8Array(coinId))) {
      coinsToDelete.push(next);
    }
  }

  await wallet.deleteServerCoins(
    coinsToDelete.map((coin) => coin.coin),
    300_000_000
  );

  console.log(`Deleted coin ${coinId}`);
};

export const getServerCoinsByLauncherId = async (launcherId: String) => {
  const peer = await getServerCoinPeer();

  const serverCoins = [];

  const serverCoinIter = await peer.fetchServerCoins(
    stringToUint8Array(launcherId)
  );

  while (true) {
    const next = await serverCoinIter.next();
    if (next === null) {
      break;
    }
    serverCoins.push(next);
  }

  const wallet = await getWallet(peer);

  const serverInfo = await Promise.all(
    serverCoins.map(async (coinRecord) => {
      const ours = await wallet.hasPuzzleHash(coinRecord.p2PuzzleHash);
      return {
        amount: coinRecord.coin.amount,
        launcher_id: launcherId,
        ours,
        coin_id: Buffer.from(toCoinId(coinRecord.coin)).toString("hex"),
        urls: coinRecord.memoUrls,
      };
    })
  );

  return serverInfo;
};

export const doesHostExistInMirrors = async (
  launcherId: string,
  host: string
) => {
  const mirrors = await getServerCoinsByLauncherId(launcherId);

  if (process.env.DIG_DEBUG === "1") {
    console.log("Mirrors", mirrors);
  }
  return mirrors.some((server) => server.urls.some((url) => url === host));
};
