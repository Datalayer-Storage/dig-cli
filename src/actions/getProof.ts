import {DataIntegrityTree} from "../DataIntegrityTree";
import {findStoreId} from "../blockchain/datastore";

export const getProof = (key, sha256) => {
  try {
    const storeId = findStoreId()?.toString();
    if (!storeId){
      throw new Error('Failed to find datastore');
    }
    const datalayer = new DataIntegrityTree(storeId);
    const proof = datalayer.getProof(key, sha256);

    console.log(`Proof for key ${key}\nand sha256 hash ${sha256}:`);
    console.log(proof);
  } catch (error) {
    console.error('Cannot get proof:', error)
  }
}