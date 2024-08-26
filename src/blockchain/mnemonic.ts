import * as fs from "fs-extra";
import * as path from "path";
import * as keytar from "keytar";
import * as bip39 from "bip39";
import WalletRpc from "chia-wallet";
// @ts-ignore
import { getChiaRoot } from "chia-root-resolver";
import { getChiaConfig } from "chia-config-loader";
import { askForMnemonicAction, askForMnemonicInput } from "../prompts";

const SERVICE_NAME = "dig-datalayer";
const ACCOUNT_NAME = "mnemonic-seed";
const MNEMONIC_FILE_PATH = path.join(process.env.HOME || "", ".mnemonic-seed");

// Determine whether to use file-based storage
const useFileStorage = process.env.REMOTE_NODE === "1";

async function readMnemonicFromFile(): Promise<string | null> {
  try {
    if (await fs.pathExists(MNEMONIC_FILE_PATH)) {
      const mnemonic = await fs.readFile(MNEMONIC_FILE_PATH, "utf-8");
      console.log("Retrieved mnemonic seed phrase from file storage.");
      return mnemonic;
    }
  } catch (error) {
    console.error("An error occurred while reading the mnemonic from file:", error);
  }
  return null;
}

async function writeMnemonicToFile(mnemonic: string): Promise<void> {
  try {
    await fs.outputFile(MNEMONIC_FILE_PATH, mnemonic);
    console.log("Mnemonic seed phrase securely stored in file.");
  } catch (error) {
    console.error("An error occurred while writing the mnemonic to file:", error);
  }
}

async function deleteMnemonicFile(): Promise<boolean> {
  try {
    if (await fs.pathExists(MNEMONIC_FILE_PATH)) {
      await fs.remove(MNEMONIC_FILE_PATH);
      console.log("Mnemonic seed phrase successfully deleted from file.");
      return true;
    }
    console.log("No mnemonic seed phrase found to delete in file.");
  } catch (error) {
    console.error("An error occurred while deleting the mnemonic file:", error);
  }
  return false;
}

/**
 * Retrieves the mnemonic seed phrase from the keychain or file storage.
 */
export async function getMnemonic(): Promise<string | null> {
  if (useFileStorage) {
    return await readMnemonicFromFile();
  } else {
    try {
      const mnemonic = keytar.getPassword(SERVICE_NAME, ACCOUNT_NAME);
      console.log("Retrieved mnemonic seed phrase from the keychain.");
      return mnemonic;
    } catch (error) {
      console.error(
        "An error occurred while retrieving the mnemonic seed phrase:",
        error
      );
      return null;
    }
  }
}

/**
 * Generates a new 24-word mnemonic seed phrase, stores it in the keychain or file, and returns it.
 */
export async function createMnemonic(): Promise<string> {
  const mnemonic = bip39.generateMnemonic(256); // 256 bits generates a 24-word mnemonic
  console.log("Generated new 24-word mnemonic seed phrase:", mnemonic);

  if (useFileStorage) {
    await writeMnemonicToFile(mnemonic);
  } else {
    await keytar.setPassword(SERVICE_NAME, ACCOUNT_NAME, mnemonic);
    console.log("Mnemonic seed phrase securely stored in keychain.");
  }

  return mnemonic;
}

/**
 * Imports a mnemonic seed phrase, validates it, and stores it in the keychain or file.
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

  if (useFileStorage) {
    await writeMnemonicToFile(mnemonic);
  } else {
    await keytar.setPassword(SERVICE_NAME, ACCOUNT_NAME, mnemonic);
  }
  
  console.log("Mnemonic seed phrase securely stored.");
  return mnemonic;
}

/**
 * Retrieves or generates a mnemonic seed phrase, storing it in the keychain or file.
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

    if (!useFileStorage) {
      await keytar.setPassword(SERVICE_NAME, ACCOUNT_NAME, mnemonic);
    }
  }

  return mnemonic;
}

/**
 * Deletes the mnemonic seed phrase from the keychain or file.
 */
export async function deleteMnemonic(): Promise<boolean> {
  if (useFileStorage) {
    return await deleteMnemonicFile();
  } else {
    try {
      const result = await keytar.deletePassword(SERVICE_NAME, ACCOUNT_NAME);
      if (result) {
        console.log(
          "Mnemonic seed phrase successfully deleted from the keychain."
        );
      } else {
        console.log("No mnemonic seed phrase found to delete.");
      }
      return result;
    } catch (error) {
      console.error(
        "An error occurred while deleting the mnemonic seed phrase:",
        error
      );
      return false;
    }
  }
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
