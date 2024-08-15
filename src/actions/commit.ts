import path from 'path';
import { addDirectory } from '../utils';
import { DataIntegrityLayer } from "../DataIntegrityLayer"; 
import { deserializeStoreInfo } from "../blockchain/datastore";
import { digFolderName, stateFileName, loadDigConfig } from '../config';

export const commit = async (): Promise<void> => {
    const digDir = path.join(process.cwd(), digFolderName);
    const stateFilePath = path.join(digDir, stateFileName);
    const storeInfo = deserializeStoreInfo(stateFilePath);

    if (!storeInfo) {
        throw new Error("Store info not found. Please run init first.");
    }

    const storeId = storeInfo.launcherId.toString('hex');

    const datalayer = new DataIntegrityLayer(storeId, {storageMode: 'local', storeDir: digDir});
    const digConfig = await loadDigConfig(process.cwd());
    await addDirectory(datalayer, path.join(process.cwd(), digConfig.deploy_dir));
    const newRootHash = datalayer.commit();

    // update the roothash on chain

    console.log("Commit successful");
};