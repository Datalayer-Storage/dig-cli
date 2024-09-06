import * as bip39 from "bip39";
import { PrivateKey } from "chia-bls";
import { mnemonicToSeedSync } from "bip39";
import { NconfManager } from "../utils/NconfManager";
import { askForMnemonicAction, askForMnemonicInput } from "../prompts";
import WalletRpc from "chia-wallet";
// @ts-ignore
import { getChiaRoot } from "chia-root-resolver";
import { getChiaConfig } from "chia-config-loader";
import { encryptData, decryptData, EncryptedData } from "../utils/encryption";
import { Buffer } from "buffer";
import {
  secretKeyToPublicKey,
  masterPublicKeyToWalletSyntheticKey,
  masterSecretKeyToWalletSyntheticSecretKey,
  masterPublicKeyToFirstPuzzleHash,
  puzzleHashToAddress,
  signMessage,
  verifySignedMessage,
} from "datalayer-driver";

const KEYRING_FILE = "keyring.json";

export class Wallet {
  private mnemonic: string | null = null;

  // Private constructor
  private constructor(mnemonic: string | null) {
    this.mnemonic = mnemonic;
  }

  // Static async method to load a wallet instance
  public static async load(
    walletName: string = "default",
    createOnUndefined: boolean = true
  ): Promise<Wallet> {
    const mnemonic = await Wallet.getWalletFromKeyring(walletName);

    if (mnemonic) {
      return new Wallet(mnemonic);
    }

    if (createOnUndefined) {
      const { action } = await askForMnemonicAction();

      let newMnemonic: string;
      if (action === "Provide") {
        newMnemonic = await Wallet.importWallet(walletName);
      } else if (action === "Generate") {
        newMnemonic = await Wallet.createNewWallet(walletName);
        console.log("Please fund your address using this seed phrase.");
      } else if (action === "Import From Chia Client") {
        newMnemonic = await Wallet.importWalletFromChia(walletName);
        console.log("Mnemonic imported from Chia client.");
      } else {
        throw new Error("Mnemonic seed phrase is required.");
      }

      return new Wallet(newMnemonic);
    }

    throw new Error("Wallet Not Found");
  }

  // Get the mnemonic
  public getMnemonic(): string {
    if (!this.mnemonic) {
      throw new Error("Mnemonic seed phrase is not loaded.");
    }
    return this.mnemonic;
  }

  // Create a new wallet and save the mnemonic to the keyring
  public static async createNewWallet(walletName: string): Promise<string> {
    const mnemonic = bip39.generateMnemonic(256);
    console.log("Generated new 24-word mnemonic seed phrase:", mnemonic);
    await Wallet.saveWalletToKeyring(walletName, mnemonic);
    return mnemonic;
  }

  // Import a wallet with a given mnemonic
  public static async importWallet(
    walletName: string,
    seed?: string
  ): Promise<string> {
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

    await Wallet.saveWalletToKeyring(walletName, mnemonic);
    console.log("Mnemonic seed phrase securely stored.");
    return mnemonic;
  }

  // Import mnemonic from Chia Client and save it to the keyring
  public static async importWalletFromChia(
    walletName: string
  ): Promise<string> {
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
    await Wallet.saveWalletToKeyring(walletName, mnemonic);
    return mnemonic;
  }

  // Fetch the master secret key from the mnemonic
  public async getMasterSecretKey(): Promise<Buffer> {
    const mnemonic = this.getMnemonic();
    const seed = mnemonicToSeedSync(mnemonic);
    return Buffer.from(PrivateKey.fromSeed(seed).toHex(), "hex");
  }

  // Fetch the public synthetic key derived from the master secret key
  public async getPublicSyntheticKey(): Promise<Buffer> {
    const master_sk = await this.getMasterSecretKey();
    const master_pk = secretKeyToPublicKey(master_sk);
    return masterPublicKeyToWalletSyntheticKey(master_pk);
  }

  // Fetch the private synthetic key derived from the master secret key
  public async getPrivateSyntheticKey(): Promise<Buffer> {
    const master_sk = await this.getMasterSecretKey();
    return masterSecretKeyToWalletSyntheticSecretKey(master_sk);
  }

  // Fetch the owner's puzzle hash derived from the master public key
  public async getOwnerPuzzleHash(): Promise<Buffer> {
    const master_sk = await this.getMasterSecretKey();
    const master_pk = secretKeyToPublicKey(master_sk);
    return masterPublicKeyToFirstPuzzleHash(master_pk);
  }

  // Get the owner's public key address
  public async getOwnerPublicKey(): Promise<string> {
    const ownerPuzzleHash = await this.getOwnerPuzzleHash();
    return puzzleHashToAddress(ownerPuzzleHash, "xch");
  }

  // Static method to delete a wallet from the keyring
  public static async deleteWallet(walletName: string): Promise<boolean> {
    const nconfManager = new NconfManager(KEYRING_FILE);
    if (await nconfManager.configExists()) {
      await nconfManager.deleteConfigValue(walletName);
      console.log("Mnemonic seed phrase successfully deleted from keyring.");
      return true;
    }
    console.log("No mnemonic seed phrase found to delete in keyring.");
    return false;
  }

  // Static method to list all available wallets in the keyring file
  public static async listWallets(): Promise<string[]> {
    const nconfManager = new NconfManager(KEYRING_FILE);
    if (!(await nconfManager.configExists())) {
      return [];
    }

    const config = nconfManager.getFullConfig();
    return Object.keys(config);
  }

  // Internal static method to retrieve the wallet (mnemonic) from the keyring
  private static async getWalletFromKeyring(
    walletName: string
  ): Promise<string | null> {
    const nconfManager = new NconfManager(KEYRING_FILE);
    if (await nconfManager.configExists()) {
      const encryptedData: EncryptedData | null =
        await nconfManager.getConfigValue(walletName);
      if (encryptedData) {
        return decryptData(encryptedData);
      }
    }
    return null;
  }

  // Internal static method to save the wallet (mnemonic) to the keyring
  private static async saveWalletToKeyring(
    walletName: string,
    mnemonic: string
  ): Promise<void> {
    const nconfManager = new NconfManager(KEYRING_FILE);
    const encryptedData = encryptData(mnemonic);
    await nconfManager.setConfigValue(walletName, encryptedData);
    console.log("Mnemonic seed phrase securely stored in keyring.");
  }

  public async createKeyOwnershipSignature(nonce: string): Promise<string> {
    const message = `Signing this message to prove ownership of key.\n\nNonce: ${nonce}`;
    const privateSyntheticKey = await this.getPrivateSyntheticKey();
    const signature = signMessage(
      Buffer.from(message, "utf-8"),
      privateSyntheticKey
    );
    return signature.toString("hex");
  }

  public async verifyKeyOwnershipSignature(
    nonce: string,
    signature: string,
    publicKey: string
  ): Promise<boolean> {
    const message = `Signing this message to prove ownership of key.\n\nNonce: ${nonce}`;
    return verifySignedMessage(
      Buffer.from(signature, "hex"),
      Buffer.from(publicKey, "hex"),
      Buffer.from(message, "utf-8")
    );
  }
}
