import * as fs from "fs-extra";
import * as path from "path";
import * as crypto from "crypto";
import * as bip39 from "bip39";
import nconf from "nconf";
import WalletRpc from "chia-wallet";
import os from "os";
// @ts-ignore
import { getChiaRoot } from "chia-root-resolver";
import { getChiaConfig } from "chia-config-loader";
import { askForMnemonicAction, askForMnemonicInput } from "../prompts";

const DIG_FOLDER_PATH = process.env.DIG_FOLDER_PATH || path.join(os.homedir(), ".dig");
const KEYS_DIR_PATH = path.join(DIG_FOLDER_PATH, "keys");
const KEYRING_FILE_PATH = path.join(KEYS_DIR_PATH, "keyring.json");
const ALGORITHM = "aes-256-gcm";

// Ensure the keys directory exists
async function ensureKeysDirectory() {
  if (!(await fs.pathExists(KEYS_DIR_PATH))) {
    await fs.mkdirp(KEYS_DIR_PATH);
    console.log("Keys directory created:", KEYS_DIR_PATH);
  }
}

interface KeyringData {
  data: string;
  nonce: string;
  salt: string;
}

function generateKey(salt: string): Buffer {
  return crypto.pbkdf2Sync("mnemonic-seed", salt, 100000, 32, "sha512");
}

function encryptMnemonic(mnemonic: string, key: Buffer, nonce: string): string {
  const cipher = crypto.createCipheriv(ALGORITHM, key, Buffer.from(nonce, "hex"));
  let encrypted = cipher.update(mnemonic, "utf8", "hex");
  encrypted += cipher.final("hex");
  return encrypted;
}

function decryptMnemonic(data: string, key: Buffer, nonce: string): string {
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(nonce, "hex"));
  let decrypted = decipher.update(data, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

function generateBinaryMnemonicData(mnemonic: string): KeyringData {
  const nonce = crypto.randomBytes(12).toString("hex");
  const salt = crypto.randomBytes(16).toString("hex");
  const key = generateKey(salt);

  const data = encryptMnemonic(mnemonic, key, nonce);

  return {
    data,
    nonce,
    salt,
  };
}

async function readMnemonicFromKeyring(): Promise<string | null> {
  await ensureKeysDirectory(); // Ensure the keys directory exists
  try {
    if (await fs.pathExists(KEYRING_FILE_PATH)) {
      nconf.file(KEYRING_FILE_PATH);
      const keyringData: KeyringData = nconf.get("keyring");

      if (keyringData) {
        const { data, nonce, salt } = keyringData;
        const key = generateKey(salt);
        const mnemonic = decryptMnemonic(data, key, nonce);
        console.log("Retrieved and decrypted mnemonic seed phrase from keyring.");
        return mnemonic;
      }
    }
  } catch (error) {
    console.error("An error occurred while reading the mnemonic from keyring:", error);
  }
  return null;
}

async function writeMnemonicToKeyring(mnemonic: string): Promise<void> {
  await ensureKeysDirectory(); // Ensure the keys directory exists
  try {
    nconf.file(KEYRING_FILE_PATH);
    const keyringData = generateBinaryMnemonicData(mnemonic);

    nconf.set("keyring", keyringData);
    await new Promise((resolve, reject) =>
      nconf.save((err: any) => (err ? reject(err) : resolve(undefined)))
    );

    console.log("Mnemonic seed phrase securely stored in keyring.");
  } catch (error) {
    console.error("An error occurred while writing the mnemonic to keyring:", error);
  }
}

async function deleteMnemonicFromKeyring(): Promise<boolean> {
  await ensureKeysDirectory(); // Ensure the keys directory exists
  try {
    if (await fs.pathExists(KEYRING_FILE_PATH)) {
      nconf.file(KEYRING_FILE_PATH);
      nconf.clear("keyring");
      await new Promise((resolve, reject) =>
        nconf.save((err: any) => (err ? reject(err) : resolve(undefined)))
      );
      console.log("Mnemonic seed phrase successfully deleted from keyring.");
      return true;
    }
    console.log("No mnemonic seed phrase found to delete in keyring.");
  } catch (error) {
    console.error("An error occurred while deleting the mnemonic from keyring:", error);
  }
  return false;
}

/**
 * Retrieves the mnemonic seed phrase from the keyring file.
 */
export async function getMnemonic(): Promise<string | null> {
  console.log("Reading mnemonic seed phrase from keyring...");
  return await readMnemonicFromKeyring();
}

/**
 * Generates a new 24-word mnemonic seed phrase, stores it in the keyring file, and returns it.
 */
export async function createMnemonic(): Promise<string> {
  const mnemonic = bip39.generateMnemonic(256); // 256 bits generates a 24-word mnemonic
  console.log("Generated new 24-word mnemonic seed phrase:", mnemonic);

  await writeMnemonicToKeyring(mnemonic);

  return mnemonic;
}

/**
 * Imports a mnemonic seed phrase, validates it, and stores it in the keyring file.
 */
export async function importMnemonic(seed: string | undefined): Promise<string> {
  let mnemonic: string;

  if (seed) {
    mnemonic = seed;
  } else {
    const { providedMnemonic } = await askForMnemonicInput();
    mnemonic = providedMnemonic;
  }

  if (!bip39.validateMnemonic(mnemonic)) {
    throw new Error("Provided mnemonic is invalid.");
  }

  await writeMnemonicToKeyring(mnemonic);
  
  console.log("Mnemonic seed phrase securely stored.");
  return mnemonic;
}

/**
 * Retrieves or generates a mnemonic seed phrase, storing it in the keyring file.
 */
export async function getOrCreateMnemonic(): Promise<string> {
  let mnemonic: string | null | undefined = process.env.CHIA_MNEMONIC;

  if (mnemonic) {
    console.log("Using mnemonic from environment variable.");
  } else {
    mnemonic = await getMnemonic();
  }

  if (!mnemonic) {
    const { action } = await askForMnemonicAction();

    if (action === "Provide") {
      mnemonic = await importMnemonic(undefined);
    } else if (action === "Generate") {
      mnemonic = await createMnemonic();
      console.log("Please fund your address using this seed phrase.");
    } else if (action === "Import From Chia Client") {
      mnemonic = await importChiaMnemonic();
      console.log("Mnemonic imported from Chia client.");
    }

    if (!mnemonic) {
      throw new Error("Mnemonic seed phrase is required.");
    }
  }

  return mnemonic;
}

/**
 * Deletes the mnemonic seed phrase from the keyring file.
 */
export async function deleteMnemonic(): Promise<boolean> {
  return await deleteMnemonicFromKeyring();
}

// The importChiaMnemonic function remains unchanged
export const importChiaMnemonic = async (): Promise<string> => {
  const chiaRoot = getChiaRoot();
  const certificateFolderPath = `${chiaRoot}/config/ssl`;
  const config = getChiaConfig();
  const defaultWalletPort = config?.wallet?.rpc_port || 9256;

  const walletHost = "127.0.0.1";
  const port = defaultWalletPort;

  const walletRpc = new WalletRpc({
    wallet_host: `https://${walletHost}:${port}`,
    certificate_folder_path: certificateFolderPath,
  });

  const fingerprintInfo = await walletRpc.getLoggedInFingerprint({});

  if (fingerprintInfo?.success === false) {
    throw new Error("Could not get fingerprint");
  }

  const privateKeyInfo = await walletRpc.getPrivateKey({
    fingerprint: fingerprintInfo.fingerprint,
  });

  if (privateKeyInfo?.success === false) {
    throw new Error("Could not get private key");
  }

  const mnemonic = privateKeyInfo?.private_key.seed;

  return mnemonic;
};
