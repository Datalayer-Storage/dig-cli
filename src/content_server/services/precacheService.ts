import { getStoresList } from "../../utils/config";
import { getLatestStoreInfo } from "../../blockchain/datastore";

export const precacheStoreInfo = async () => {
  const storeList = getStoresList();
  for (const storeId of storeList) {
    try {
      console.log(`Precaching store info for ${storeId}`);
      await getLatestStoreInfo(Buffer.from(storeId, "hex"));
    } catch (e) {
      console.error(`Error precaching store info for ${storeId}`, e);
    }

  }
};
