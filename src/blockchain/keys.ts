import { PrivateKey } from "chia-bls";
import { mnemonicToSeedSync } from "bip39";
import { getMnemonic } from "./mnemonic";
import { Buffer } from "buffer";
import {
  secretKeyToPublicKey,
  masterPublicKeyToWalletSyntheticKey,
  masterSecretKeyToWalletSyntheticSecretKey,
  masterPublicKeyToFirstPuzzleHash
} from "datalayer-driver";

export const getMasterSecretKey = async (): Promise<Buffer> => {
  const mnemonic = await getMnemonic();
  if (!mnemonic) {
    throw new Error("Mnemonic seed phrase not found.");
  }
  const seed = mnemonicToSeedSync(mnemonic);
  return Buffer.from(PrivateKey.fromSeed(seed).toHex(), "hex");
};

export const getPublicSyntheticKey = async (): Promise<Buffer> => {
  const master_sk = await getMasterSecretKey();
  const master_pk = secretKeyToPublicKey(master_sk);
  return masterPublicKeyToWalletSyntheticKey(master_pk);
};

export const getPrivateSyntheticKey = async (): Promise<Buffer> => {
  const master_sk = await getMasterSecretKey();
  return masterSecretKeyToWalletSyntheticSecretKey(master_sk);
};

export const getOwnerPuzzleHash = async (): Promise<Buffer> => {
  const master_sk = await getMasterSecretKey();
  const master_pk = secretKeyToPublicKey(master_sk);
  return masterPublicKeyToFirstPuzzleHash(master_pk);
};
