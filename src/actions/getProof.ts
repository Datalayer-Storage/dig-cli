import {DataIntegrityTree} from "../DataIntegrityTree";
import {getActiveStoreId} from "../utils/config";

export const getProof = async (key: string, sha256: string) => {
  try {
    const storeId = getActiveStoreId()?.toString();
    if (!storeId){
      throw new Error('Failed to find datastore');
    }
    const datalayer = new DataIntegrityTree(storeId);
    const proof = datalayer.getProof(key, sha256);

    console.log(`Proof for key ${key}\nand sha256 hash ${sha256}:`);
    console.log(proof);
  } catch (error: any) {
    console.error('Cannot get proof:', error.message);
  }
}