import path from "path";
import os from "os";
import { Peer } from "datalayer-driver";
import { Tls } from "chia-server-coin";

//export const selectPeer = async (): Promise<Peer> => {
  // implement logic that first looks at the local fullnode to check if its synced, and then if not find a random one
//};

export const getPeer = async (): Promise<Peer> => {
  // Determine the OS home directory
  const homeDir = os.homedir();

  // Define the SSL folder path within the .dig directory in the user's home directory
  const sslFolder = path.resolve(homeDir, ".dig", "ssl");
  const certFile = path.resolve(sslFolder, "public_dig.crt");
  const keyFile = path.resolve(sslFolder, "public_dig.key");

  // this creates the certificate and key files if they don't exist
  new Tls(certFile, keyFile);

  // Return a new Peer instance with the same SSL paths
  return Peer.new(
    "64.95.53.234:8444", // TODO: Create a way to autolook for localhost and back up to remote nodes
    "mainnet",
    certFile,
    keyFile
  );
};
