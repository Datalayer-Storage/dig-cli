import path from "path";
import os from "os";
import fs from "fs";
import { Peer } from "datalayer-driver";
import { Tls } from "chia-server-coin";
import { resolve4 } from "dns/promises";
import net from "net";
import { memoize } from "lodash";
import { createSpinner } from "nanospinner";
import { MIN_HEIGHT, MIN_HEIGHT_HEADER_HASH } from "../utils/config";

const FULLNODE_PORT = 8444;
const LOCALHOST = "127.0.0.1";
const DNS_HOSTS = [
  "dns-introducer.chia.net",
  "chia.ctrlaltdel.ch",
  "seeder.dexie.space",
  "chia.hoffmang.com",
];
const CONNECTION_TIMEOUT = 2000;
const CACHE_DURATION = 30000; // Cache duration in milliseconds

export class FullNodePeer {
  private static cachedPeer: { peer: Peer; timestamp: number } | null = null;
  private static memoizedFetchNewPeerIPs: () => Promise<string[]>;
  private peer: Peer;

  static {
    FullNodePeer.memoizedFetchNewPeerIPs = memoize(
      FullNodePeer.fetchNewPeerIPs
    );
  }

  private constructor(peer: Peer) {
    this.peer = peer;
  }

  public static async connect(): Promise<Peer> {
    const peer = await FullNodePeer.getBestPeer();
    return new FullNodePeer(peer).peer;
  }

  private static isPortReachable(
    host: string,
    port: number,
    timeout = CONNECTION_TIMEOUT
  ): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = new net.Socket()
        .setTimeout(timeout)
        .once("error", () => resolve(false))
        .once("timeout", () => resolve(false))
        .connect(port, host, () => {
          socket.end();
          resolve(true);
        });
    });
  }

  private static isValidIpAddress(ip: string): boolean {
    const ipv4Regex =
      /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;

    return ipv4Regex.test(ip);
  }

  private static async fetchNewPeerIPs(): Promise<string[]> {
    const trustedNodeIp = process.env.TRUSTED_NODE_IP || null;
    const priorityIps: string[] = [];

    // Prioritize trustedNodeIp
    if (
      trustedNodeIp &&
      FullNodePeer.isValidIpAddress(trustedNodeIp) &&
      (await FullNodePeer.isPortReachable(trustedNodeIp, FULLNODE_PORT))
    ) {
      priorityIps.push(trustedNodeIp);
    }

    // Prioritize LOCALHOST
    if (await FullNodePeer.isPortReachable(LOCALHOST, FULLNODE_PORT)) {
      priorityIps.push(LOCALHOST);
    }

    if (priorityIps.length > 0) {
      return priorityIps;
    }

    // Fetch peers from DNS introducers
    for (const DNS_HOST of DNS_HOSTS) {
      try {
        const ips = await resolve4(DNS_HOST);
        if (ips && ips.length > 0) {
          const shuffledIps = ips.sort(() => 0.5 - Math.random());
          const reachableIps: string[] = [];

          for (const ip of shuffledIps) {
            if (await FullNodePeer.isPortReachable(ip, FULLNODE_PORT)) {
              reachableIps.push(ip);
            }
            if (reachableIps.length === 5) break;
          }

          if (reachableIps.length > 0) {
            return reachableIps;
          }
        }
      } catch (error: any) {
        console.error(
          `Failed to resolve IPs from ${DNS_HOST}: ${error.message}`
        );
      }
    }
    throw new Error("No reachable IPs found in any DNS records.");
  }

  private static async getPeerIPs(): Promise<string[]> {
    const ips = await FullNodePeer.memoizedFetchNewPeerIPs();

    const reachableIps = await Promise.all(
      ips.map(async (ip) => {
        if (ip && (await FullNodePeer.isPortReachable(ip, FULLNODE_PORT))) {
          return ip;
        }
        return null;
      })
    ).then((results) => results.filter((ip) => ip !== null) as string[]);

    if (reachableIps.length > 0) {
      return reachableIps;
    }

    // @ts-ignore
    if (FullNodePeer.memoizedFetchNewPeerIPs?.cache?.clear) {
      // @ts-ignore
      FullNodePeer.memoizedFetchNewPeerIPs.cache.clear();
    }

    return FullNodePeer.memoizedFetchNewPeerIPs();
  }

  private static createPeerProxy(
    peer: Peer,
    certFile: string,
    keyFile: string
  ): Peer {
    return new Proxy(peer, {
      get: (target, prop) => {
        const originalMethod = (target as any)[prop];

        if (typeof originalMethod === "function") {
          return async (...args: any[]) => {
            try {
              return await originalMethod.apply(target, args);
            } catch (error: any) {
              if (error.message.includes("WebSocket")) {
                FullNodePeer.cachedPeer = null;
                const newPeer = await FullNodePeer.getBestPeer();
                return (newPeer as any)[prop](...args);
              }
              throw error;
            }
          };
        }
        return originalMethod;
      },
    });
  }

  private static async getBestPeer(): Promise<Peer> {
    const now = Date.now();

    if (
      FullNodePeer.cachedPeer &&
      now - FullNodePeer.cachedPeer.timestamp < CACHE_DURATION
    ) {
      return FullNodePeer.cachedPeer.peer;
    }

    const sslFolder = path.resolve(os.homedir(), ".dig", "ssl");
    const certFile = path.join(sslFolder, "public_dig.crt");
    const keyFile = path.join(sslFolder, "public_dig.key");

    if (!fs.existsSync(sslFolder)) {
      fs.mkdirSync(sslFolder, { recursive: true });
    }

    new Tls(certFile, keyFile);

    const peerIPs = await FullNodePeer.getPeerIPs();
    const trustedNodeIp = process.env.TRUSTED_FULLNODE || null;

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
            return FullNodePeer.createPeerProxy(peer, certFile, keyFile);
          } catch (error: any) {
            console.error(
              `Failed to create peer for IP ${ip}: ${error.message}`
            );
            return null;
          }
        }
        return null;
      })
    ).then((results) => results.filter((peer) => peer !== null) as Peer[]);

    if (peers.length === 0) {
      throw new Error("No peers available, please try again.");
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

    const highestPeak = Math.max(...validHeights);

    // Prioritize LOCALHOST and TRUSTED_NODE_IP if they have the highest peak height
    let bestPeerIndex = validHeights.findIndex(
      (height, index) =>
        height === highestPeak &&
        (peerIPs[index] === LOCALHOST || peerIPs[index] === trustedNodeIp)
    );

    // If LOCALHOST or TRUSTED_NODE_IP don't have the highest peak, select any peer with the highest peak
    if (bestPeerIndex === -1) {
      bestPeerIndex = validHeights.findIndex(
        (height) => height === highestPeak
      );
    }

    const bestPeer = peers[bestPeerIndex];

    FullNodePeer.cachedPeer = { peer: bestPeer, timestamp: now };

    console.log(`Using Peer: ${peerIPs[bestPeerIndex]}`);

    return bestPeer;
  }

  public getPeer(): Peer {
    return this.peer;
  }

  public static async waitForConfirmation(
    parentCoinInfo: Buffer
  ): Promise<boolean> {
    const spinner = createSpinner("Waiting for confirmation...").start();
    const peer = await FullNodePeer.connect();

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
  }
}
