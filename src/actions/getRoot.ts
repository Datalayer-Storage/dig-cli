import {getActiveStoreId} from "../utils/config";
import {DataIntegrityTree} from "../DataIntegrityTree";

export const getRoot = async () => {
  try {
    const storeIdResult = await getActiveStoreId();
    const storeId = storeIdResult?.toString();
    if (!storeId){
      throw new Error('Failed to find datastore');
    }
    const datalayer = new DataIntegrityTree(storeId);
    const rootHash = datalayer.getRoot();
    console.log(`The root hash is ${rootHash}`);

  } catch (error: any) {
    console.error('Failed to get root hash:', error.message);
  }
}