import * as keytar from "keytar";
import * as bip39 from "bip39";
import WalletRpc from "chia-wallet";
// @ts-ignore
import { getChiaRoot } from "chia-root-resolver";
import { getChiaConfig } from "chia-config-loader";
import { askForMnemonicAction, askForMnemonicInput } from "../prompts";

const SERVICE_NAME = "dig-datalayer";
const ACCOUNT_NAME = "mnemonic-seed";

/**
 * Retrieves the mnemonic seed phrase from the OS keychain.
 *
 * @returns {Promise<string | null>} The mnemonic seed phrase, or null if not found.
 */
export async function getMnemonic(): Promise<string | null> {
  return keytar.getPassword(SERVICE_NAME, ACCOUNT_NAME);
}

/**
 * Generates a new 24-word mnemonic seed phrase, stores it in the keychain, and returns it.
 *
 * @returns {Promise<string>} The newly generated mnemonic seed phrase.
 */
export async function createMnemonic(): Promise<string> {
  const mnemonic = bip39.generateMnemonic(256); // 256 bits generates a 24-word mnemonic
  console.log("Generated new 24-word mnemonic seed phrase:", mnemonic);

  await keytar.setPassword(SERVICE_NAME, ACCOUNT_NAME, mnemonic);
  console.log("Mnemonic seed phrase securely stored.");

  return mnemonic;
}

/**
 * Imports a mnemonic seed phrase, validates it, and stores it in the keychain.
 * If a seed is provided as an argument, it will be used directly. Otherwise, it will prompt the user to input one.
 *
 * @param {string | undefined} seed - The mnemonic seed phrase provided as an argument, or undefined.
 * @returns {Promise<string>} The validated mnemonic seed phrase.
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

  await keytar.setPassword(SERVICE_NAME, ACCOUNT_NAME, mnemonic);
  console.log("Mnemonic seed phrase securely stored.");

  return mnemonic;
}

/**
 * Retrieves the mnemonic seed phrase from the OS keychain or environment variable.
 * If the seed doesn't exist and the environment variable is not set, prompts the user to provide, generate, or import a new one.
 * Stores the seed in the keychain if a new one is generated or imported.
 *
 * @returns {Promise<string>} The mnemonic seed phrase.
 */
export async function getOrCreateMnemonic(): Promise<string> {
  // Check if the MNEMONIC environment variable is set
  let mnemonic: string | null | undefined = process.env.CHIA_MNEMONIC;

  if (mnemonic) {
    console.log("Using mnemonic from environment variable.");
  } else {
    // If not, retrieve the mnemonic from the keychain
    mnemonic = await getMnemonic();
  }

  if (!mnemonic) {
    // If still not available, prompt the user
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

    // Store the mnemonic in the keychain
    await keytar.setPassword(SERVICE_NAME, ACCOUNT_NAME, mnemonic);
    console.log("Mnemonic seed phrase securely stored.");
  }

  return mnemonic;
}

/**
 * Deletes the mnemonic seed phrase from the OS keychain.
 *
 * @returns {Promise<boolean>} Returns true if the deletion was successful, false otherwise.
 */
export async function deleteMnemonic(): Promise<boolean> {
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

/**
 * Imports the mnemonic seed phrase from the Chia client and it active wallet.
 * @returns {Promise<string>} The mnemonic seed phrase.
 */
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
