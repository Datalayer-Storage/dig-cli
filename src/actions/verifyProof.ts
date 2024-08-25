import {DataIntegrityTree} from "../DataIntegrityTree";
import {getActiveStoreId} from "../utils/config";

export const verfiyProof = async (proof: string, sha256: string) => {
  try {
    const storeIdResult = getActiveStoreId();
    const storeId = storeIdResult?.toString();
    if (!storeId){
      throw new Error('Failed to find datastore');
    }
    const datalayer = new DataIntegrityTree(storeId);
    const proofVerified = datalayer.verifyProof(proof, sha256);

    if (proofVerified) {
      console.log('Proof has been verified');
    } else {
      console.error('Proof verification failed with provided hash');
    }
  } catch (error: any) {
    console.error('Failed to process proof:', error.message);
  }
}