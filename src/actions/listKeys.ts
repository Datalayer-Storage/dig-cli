import {getActiveStoreId} from "../utils/config";
import {DataIntegrityTree} from "../DataIntegrityTree";

export const listKeys = async () => {
  try {
    const storeIdResult = await getActiveStoreId();
    const storeId = storeIdResult?.toString();
    if (!storeId){
      throw new Error('Failed to find datastore');
    }
    const datalayer = new DataIntegrityTree(storeId);
    const keysArr = datalayer.listKeys();

    if  (keysArr.length > 0){
      let printableList: string = '';
      keysArr.forEach(key => {
        printableList += `${key}\n`;
      });

      console.log(`Keys for store ${storeId}:\n\n${printableList}`);
    } else {
      console.log(`Store ${storeId} has no keys`);
    }

  } catch (error: any) {
    console.error('Failed to get store keys:', error.message);
  }
}