import * as fs from "fs";
import * as path from "path";
import { Tls } from "chia-server-coin";
import os from "os";

export const getOrCreateSSLCerts = () => {
  // Path to the SSL certificates in the user's home directory
  const homeDir = os.homedir();
  const sslDir = path.join(homeDir, ".dig", "ssl");
  const certPath = path.join(sslDir, "client.cert");
  const keyPath = path.join(sslDir, "client.key");

  // Ensure the SSL directory exists
  if (!fs.existsSync(sslDir)) {
    fs.mkdirSync(sslDir, { recursive: true });
  }

  // Check if the certificate and key exist, if not, generate them
  if (!fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
    new Tls(certPath, keyPath);
    console.log("Client certificate and key generated successfully.");
  }

  // Return the paths to the cert and key files
  return {
    certPath,
    keyPath,
  };
};
