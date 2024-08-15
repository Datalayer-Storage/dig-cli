import path from "path";
import os from "os";
import fs from "fs";
import { Peer } from "datalayer-driver";
import { Tls } from "chia-server-coin";
import { resolve4 } from "dns/promises";
import net from "net";
import { memoize } from "lodash";

const FULLNODE_PORT = 8444;
const LOCALHOST = "127.0.0.1";
const DNS_HOST = "dns-introducer.chia.net";
const CONNECTION_TIMEOUT = 2000;

const isPortReachable = (host: string, port: number, timeout = CONNECTION_TIMEOUT): Promise<boolean> =>
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

const fetchNewPeerIP = async (): Promise<string> => {
  // Always check localhost first
  if (await isPortReachable(LOCALHOST, FULLNODE_PORT)) {
    console.log(`Using local Fullnode: ${LOCALHOST} (reachable on port ${FULLNODE_PORT})`);
    return LOCALHOST;
  }

  // If localhost is not reachable, proceed with DNS resolution
  const ips = await resolve4(DNS_HOST);
  if (ips.length === 0) throw new Error("No IPs found in DNS records.");

  const shuffledIps = ips.sort(() => 0.5 - Math.random());

  for (const ip of shuffledIps) {
    if (await isPortReachable(ip, FULLNODE_PORT)) {
      console.log(`Chosen Fullnode: ${ip} (reachable on port ${FULLNODE_PORT})`);
      return ip;
    }
  }

  throw new Error("No reachable IPs found in DNS records.");
};

const memoizedFetchNewPeerIP = memoize(fetchNewPeerIP);

const getPeerIP = async (): Promise<string> => {
  let ip = await memoizedFetchNewPeerIP();

  if (await isPortReachable(ip, FULLNODE_PORT)) {
    return ip;
  }

  console.log(`Memoized IP ${ip} is not reachable. Fetching a new IP...`);
  if (memoizedFetchNewPeerIP?.cache?.clear) {
    memoizedFetchNewPeerIP.cache.clear();
  }

  return memoizedFetchNewPeerIP();
};

export const getPeer = async (): Promise<Peer> => {
  const sslFolder = path.resolve(os.homedir(), ".dig", "ssl");
  const certFile = path.join(sslFolder, "public_dig.crt");
  const keyFile = path.join(sslFolder, "public_dig.key");

  if (!fs.existsSync(sslFolder)) {
    fs.mkdirSync(sslFolder, { recursive: true });
  }

  new Tls(certFile, keyFile);

  const host = await getPeerIP();
  return Peer.new(`${host}:${FULLNODE_PORT}`, "mainnet", certFile, keyFile);
};
