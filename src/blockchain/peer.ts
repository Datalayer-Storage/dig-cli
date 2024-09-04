import path from "path";
import os from "os";
import fs from "fs";
import { Peer } from "datalayer-driver";
import { Tls, Peer as ServerCoinPeer } from "chia-server-coin";
import { resolve4 } from "dns/promises";
import net from "net";
import { memoize } from "lodash";

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

let cachedPeer: { peer: Peer; timestamp: number } | null = null;

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
      if (ips && ips.length > 0) {
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

const memoizedFetchNewPeerIPs = memoize(fetchNewPeerIPs);

const getPeerIPs = async (): Promise<string[]> => {
  const ips = await memoizedFetchNewPeerIPs();

  // Re-check all the memoized IPs to ensure they're still reachable
  const reachableIps = await Promise.all(
    ips.map(async (ip) => {
      if (ip && (await isPortReachable(ip, FULLNODE_PORT))) {
        return ip;
      }
      return null;
    })
  ).then((results) => results.filter((ip) => ip !== null) as string[]);

  if (reachableIps.length > 0) {
    return reachableIps;
  }

  console.log(`Memoized IPs are not reachable. Fetching new IPs...`);
  if (memoizedFetchNewPeerIPs?.cache?.clear) {
    memoizedFetchNewPeerIPs.cache.clear();
  }

  return memoizedFetchNewPeerIPs();
};

const createPeerProxy = (
  peer: Peer,
  certFile: string,
  keyFile: string
): Peer => {
  return new Proxy(peer, {
    get(target, prop) {
      const originalMethod = (target as any)[prop];

      if (typeof originalMethod === "function") {
        return async (...args: any[]) => {
          try {
            return await originalMethod.apply(target, args);
          } catch (error: any) {
            if (error.message.includes("WebSocket")) {
              cachedPeer = null; // Invalidate the cached peer

              const newPeer = await getPeer(); // Get a new peer instance
              return (newPeer as any)[prop](...args); // Retry the operation with the new peer
            }

            throw error; // Allow other errors to pass through
          }
        };
      }

      // If not a function, return as is (e.g., properties)
      return originalMethod;
    },
  });
};

export const getPeer = async (): Promise<Peer> => {
  const now = Date.now();

  // Check if the cached peer is still valid
  if (cachedPeer && now - cachedPeer.timestamp < CACHE_DURATION) {
    return cachedPeer.peer;
  }

  const sslFolder = path.resolve(os.homedir(), ".dig", "ssl");
  const certFile = path.join(sslFolder, "public_dig.crt");
  const keyFile = path.join(sslFolder, "public_dig.key");

  if (!fs.existsSync(sslFolder)) {
    fs.mkdirSync(sslFolder, { recursive: true });
  }

  new Tls(certFile, keyFile);

  const peerIPs = await getPeerIPs();
  const peers = await Promise.all(
    peerIPs.map(async (ip) => {
      if (ip) {
        try {
          const peer = await Peer.new(
            `${ip}:${FULLNODE_PORT}`,
            false,
            certFile,
            keyFile
          );
          return createPeerProxy(peer, certFile, keyFile);
        } catch (error: any) {
          console.error(`Failed to create peer for IP ${ip}: ${error.message}`);
          return null;
        }
      }
      return null;
    })
  ).then((results) => results.filter((peer) => peer !== null) as Peer[]);

  if (peers.length === 0) {
    throw new Error("No peers available found, please try again.");
  }

  await new Promise((resolve) => setTimeout(resolve, 1000));

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

  let highestPeak = Math.max(...validHeights);
  let bestPeerIndex = validHeights.findIndex((height, idx) =>
    peerIPs[idx] === LOCALHOST && height === highestPeak
      ? true
      : height === highestPeak
  );

  const bestPeerIP = peerIPs[bestPeerIndex];
  if (process.env.DIG_DEBUG === "1") {
    console.log(`Selected Peer IP: ${bestPeerIP}`);
  }

  const bestPeer = peers[bestPeerIndex];

  // Cache the selected peer
  cachedPeer = { peer: bestPeer, timestamp: now };

  return bestPeer;
};