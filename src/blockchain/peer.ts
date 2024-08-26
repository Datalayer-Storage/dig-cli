import path from "path";
import os from "os";
import fs from "fs";
import { Peer } from "datalayer-driver";
import { Tls, Peer as ServerCoinPeer } from "chia-server-coin";
import { resolve4 } from "dns/promises";
import net from "net";
import { memoize } from "lodash";

// Constants
const FULLNODE_PORT = 8444;
const LOCALHOST = "127.0.0.1";
const DNS_HOSTS = [
  "dns-introducer.chia.net",
  "chia.ctrlaltdel.ch",
  "seeder.dexie.space",
  "chia.hoffmang.com",
];
const CONNECTION_TIMEOUT = 2000;
const CACHE_DURATION = 30000; // Cache duration in milliseconds (e.g., 30 seconds)
const METHOD_TIMEOUT = 60000; // Timeout duration for peer methods (1 minute)
const MAX_RETRIES = 3; // Maximum number of retries before giving up

let cachedPeer: { peer: Peer; timestamp: number } | null = null;
let retryCount = 0;

// Utility Functions
const isPortReachable = (
  host: string,
  port: number,
  timeout = CONNECTION_TIMEOUT
): Promise<boolean> =>
  new Promise((resolve) => {
    const socket = new net.Socket()
      .setTimeout(timeout)
      .once("error", () => resolve(false))
      .once("timeout", () => resolve(false))
      .connect(port, host, () => {
        socket.end();
        resolve(true);
      });
  });

const fetchNewPeerIPs = async (): Promise<string[]> => {
  for (const DNS_HOST of DNS_HOSTS) {
    try {
      const ips = await resolve4(DNS_HOST);
      if (ips.length > 0) {
        const reachableIps = await filterReachableIps(ips);
        if (reachableIps.length > 0) {
          return reachableIps;
        }
      }
    } catch (error: any) {
      console.error(`Failed to resolve IPs from ${DNS_HOST}: ${error.message}`);
    }
  }
  throw new Error("No reachable IPs found in any DNS records.");
};

const filterReachableIps = async (ips: string[]): Promise<string[]> => {
  const shuffledIps = ips.sort(() => 0.5 - Math.random());
  const reachableIps: string[] = [];

  if (await isPortReachable(LOCALHOST, FULLNODE_PORT)) {
    console.log(
      `Connecting to Peer: ${LOCALHOST} (reachable on port ${FULLNODE_PORT})`
    );
    reachableIps.push(LOCALHOST);
  }

  for (const ip of shuffledIps) {
    if (await isPortReachable(ip, FULLNODE_PORT)) {
      console.log(
        `Connecting to Peer: ${ip} (reachable on port ${FULLNODE_PORT})`
      );
      reachableIps.push(ip);
    }
    if (reachableIps.length === 5) break; // Stop after finding 5 reachable IPs
  }

  return reachableIps;
};

// Memoized Fetch with Clear Capability
let memoizedFetchNewPeerIPs = memoize(fetchNewPeerIPs);

const clearMemoizedIPs = () => {
  if (memoizedFetchNewPeerIPs.cache.clear) {
    memoizedFetchNewPeerIPs.cache.clear();
  }
  memoizedFetchNewPeerIPs = memoize(fetchNewPeerIPs); // Recreate the memoized function
};

const getPeerIPs = async (): Promise<string[]> => {
  const ips = await memoizedFetchNewPeerIPs();
  const reachableIps = await filterReachableIps(ips);

  if (reachableIps.length > 0) {
    return reachableIps;
  }

  console.log(`Memoized IPs are not reachable. Fetching new IPs...`);
  clearMemoizedIPs();
  return memoizedFetchNewPeerIPs();
};

// Peer Proxy with Timeout Handling
const createErrorHandlingProxy = (peer: Peer): Peer => {
  return new Proxy(peer, {
    get(target, prop) {
      const originalMethod = (target as any)[prop];

      if (typeof originalMethod === "function") {
        return async (...args: any[]) => {
          try {
            const result = await originalMethod.apply(target, args);
            return result;
          } catch (error: any) {
            if (error.message.includes("AlreadyClosed)")) {
              cachedPeer = null;
              clearMemoizedIPs();
              const newPeer = await getPeer();
              return (newPeer as any)[prop](...args);
            }
          }
        };
      }

      return originalMethod;
    },
  });
};

// Main Functions
export const getPeer = async (): Promise<Peer> => {
  const now = Date.now();

  if (cachedPeer && now - cachedPeer.timestamp < CACHE_DURATION) {
    return cachedPeer.peer;
  }

  const { certFile, keyFile } = await setupTlsFiles();

  const peerIPs = await getPeerIPs();
  const peers = await createPeers(peerIPs, certFile, keyFile);

  if (peers.length === 0) {
    throw new Error("No peers available, please try again.");
  }

  const bestPeerIndex = await selectBestPeer(peers, peerIPs);
  const bestPeer = createErrorHandlingProxy(peers[bestPeerIndex]);

  cachedPeer = { peer: bestPeer, timestamp: now };

  return bestPeer;
};

const setupTlsFiles = async () => {
  const sslFolder = path.resolve(os.homedir(), ".dig", "ssl");
  const certFile = path.join(sslFolder, "public_dig.crt");
  const keyFile = path.join(sslFolder, "public_dig.key");

  if (!fs.existsSync(sslFolder)) {
    fs.mkdirSync(sslFolder, { recursive: true });
  }

  new Tls(certFile, keyFile);
  return { certFile, keyFile };
};

const createPeers = async (
  peerIPs: string[],
  certFile: string,
  keyFile: string
) => {
  return Promise.all(
    peerIPs.map(async (ip) => {
      if (ip) {
        try {
          const peer = await Peer.new(
            `${ip}:${FULLNODE_PORT}`,
            "mainnet",
            certFile,
            keyFile
          );
          return peer;
        } catch (error: any) {
          console.error(`Failed to create peer for IP ${ip}: ${error.message}`);
          return null;
        }
      }
      return null;
    })
  ).then((results) => results.filter((peer) => peer !== null) as Peer[]);
};

const selectBestPeer = async (
  peers: Peer[],
  peerIPs: string[]
): Promise<number> => {
  const peakHeights = await Promise.all(
    peers.map((peer) =>
      peer
        .getPeak()
        .then((height) => height)
        .catch((error) => {
          console.error(`Failed to get peak for peer: ${error.message}`);
          return null;
        })
    )
  );

  const validHeights = peakHeights.filter(
    (height) => height !== null
  ) as number[];

  if (validHeights.length === 0) {
    throw new Error("No valid peak heights obtained from any peer.");
  }

  const highestPeak = Math.max(...validHeights);
  return validHeights.findIndex((height, idx) =>
    peerIPs[idx] === LOCALHOST && height === highestPeak
      ? true
      : height === highestPeak
  );
};

export const getServerCoinPeer = async (): Promise<ServerCoinPeer> => {
  const { certFile, keyFile } = await setupTlsFiles();

  try {
    const tls = new Tls(certFile, keyFile);
    const hosts = await getPeerIPs();
    const peer = ServerCoinPeer.connect(
      `${hosts[0]}:${FULLNODE_PORT}`,
      "mainnet",
      tls
    );
    return peer;
  } catch (error: any) {
    console.error(`Failed to get valid peer for ServerCoin: ${error.message}`);
    console.log("Trying again...");
    return getServerCoinPeer();
  }
};
