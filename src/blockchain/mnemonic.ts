import * as bip39 from "bip39";
import { NconfManager } from '../utils/nconfManager';
import { askForMnemonicAction, askForMnemonicInput } from "../prompts";
import WalletRpc from "chia-wallet";
// @ts-ignore
import { getChiaRoot } from "chia-root-resolver";
import { getChiaConfig } from "chia-config-loader";
import { encryptData, decryptData, EncryptedData } from "../utils/encryption";

const KEYRING_FILE = "keyring.json";

export const readMnemonicFromKeyring = async (): Promise<string | null> => {
  const nconfManager = new NconfManager(KEYRING_FILE);
  if (await nconfManager.configExists()) {
    const encryptedData: EncryptedData | null = await nconfManager.getConfigValue("keyring");

    if (encryptedData) {
      return decryptData(encryptedData);
    }
  }
  return null;
};

export const writeMnemonicToKeyring = async (mnemonic: string): Promise<void> => {
  const nconfManager = new NconfManager(KEYRING_FILE);
  const encryptedData = encryptData(mnemonic);
  await nconfManager.setConfigValue("keyring", encryptedData);
  console.log("Mnemonic seed phrase securely stored in keyring.");
};

export const deleteMnemonicFromKeyring = async (): Promise<boolean> => {
  const nconfManager = new NconfManager(KEYRING_FILE);
  if (await nconfManager.configExists()) {
    await nconfManager.deleteConfigValue("keyring");
    console.log("Mnemonic seed phrase successfully deleted from keyring.");
    return true;
  }
  console.log("No mnemonic seed phrase found to delete in keyring.");
  return false;
};

export const getMnemonic = async (): Promise<string | null> => {
  return await readMnemonicFromKeyring();
};

export const createMnemonic = async (): Promise<string> => {
  const mnemonic = bip39.generateMnemonic(256);
  console.log("Generated new 24-word mnemonic seed phrase:", mnemonic);
  await writeMnemonicToKeyring(mnemonic);
  return mnemonic;
};

export const importMnemonic = async (seed: string | undefined): Promise<string> => {
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
};

export const getOrCreateMnemonic = async (): Promise<string> => {
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
};

export const deleteMnemonic = deleteMnemonicFromKeyring;

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
  await writeMnemonicToKeyring(mnemonic);
  return mnemonic;
};
