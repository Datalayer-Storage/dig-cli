import {getActiveStoreId, STORE_PATH} from "../utils/config";
import {DataIntegrityTree, DataIntegrityTreeOptions} from "../DataIntegrityTree";
import {Buffer} from "buffer";
import {Readable} from "stream";
import fs from "fs";

/*
export const remove = async ({ writerPublicAddress, adminPublicAddress, oracleFee  }): Promise<void> => {

}

export const transfer = async ({ receivePublicAddress }): Promise<void> => {

}

export const melt = async (): Promise<void> => {

}*/

export const upsertData = async (key: string, data: string): Promise<void> => {
  try {
    const storeIdResult = getActiveStoreId();
    const storeId = storeIdResult?.toString();
    if (!storeId){
      throw new Error('Failed to find datastore');
    }

    const dataStream = new Readable();
    dataStream.push(data);
    dataStream.push(null);

    const options: DataIntegrityTreeOptions = {
      storageMode: "local",
      storeDir: STORE_PATH,
    };
    const datalayer = new DataIntegrityTree(storeId, options);
    await datalayer.upsertKey(dataStream, key);

    console.log(`Upserted data to datastore ${storeId} with key ${key}`);
  } catch (error: any) {
    console.error('Cannot upsert data:', error.message);
  }
}

export const upsertFile = async (key: string, filePath: string): Promise<void> => {
  try {
    const storeIdResult = getActiveStoreId();
    const storeId = storeIdResult?.toString();
    if (!storeId){
      throw new Error('Failed to find datastore');
    }

    const fileStream = fs.createReadStream(filePath);

    const options: DataIntegrityTreeOptions = {
      storageMode: "local",
      storeDir: STORE_PATH,
    };
    const datalayer = new DataIntegrityTree(storeId, options);
    await datalayer.upsertKey(fileStream, key);

  } catch (error: any) {
    console.error('Cannot upsert file:', error.message);
  }
}

export const getKey = async (key: string) => {
  try {
    const storeIdResult = await getActiveStoreId();
    const storeId = storeIdResult?.toString();
    if (!storeId){
      throw new Error('Failed to find datastore');
    }

    const options: DataIntegrityTreeOptions = {
      storageMode: "local",
      storeDir: STORE_PATH,
    };
    const datalayer = new DataIntegrityTree(storeId, options);
    const valueStream = datalayer.getValueStream(key);
    let valueData: Buffer = Buffer.alloc(0);
    const valueDataHexArr: string[] = [];

    valueStream.on('data', (chunk) => {
      const hex = chunk.toString('hex');
      valueDataHexArr.push(hex);
      valueData = Buffer.concat([valueData, chunk]);
    });

    valueStream.on('end', () => {
      const dataUtf8: string = valueData.toString('utf8');
      let dataPrinted = false
      console.log(`Data for key ${key}:\n\n`);

      // print as json
      try {
        JSON.parse(dataUtf8);
        console.log(dataUtf8);
        dataPrinted = true;
      } catch {}

      // print as xml
      if (!dataPrinted) {
        try {
          const parser = new DOMParser();
          parser.parseFromString(dataUtf8, 'text/xml');
          console.log(dataUtf8);
          dataPrinted = true;
        } catch {}
      }

      // print as hex
      if (!dataPrinted) {
        valueDataHexArr.forEach(chunk => {
          let printableHexString = ''
          for (let j = 0; j < chunk.length; j++) {
            printableHexString += chunk[j];
            if (j % 2 === 0){
              printableHexString += ' ';
            }
            if (j % 40 === 0){
              printableHexString += '\n'
            }
          }
          console.log(printableHexString);
        })
      }
    });

    valueStream.on('error', (error) => {
      throw error;
    });

  } catch (error: any) {
    console.error('Cannot get key value:', error.message);
  }
}

export const getProof = async (key: string, sha256: string) => {
  try {
    const storeIdResult = getActiveStoreId();
    const storeId = storeIdResult?.toString();
    if (!storeId){
      throw new Error('Failed to find datastore');
    }

    const options: DataIntegrityTreeOptions = {
      storageMode: "local",
      storeDir: STORE_PATH,
    };
    const datalayer = new DataIntegrityTree(storeId, options);
    const proof = datalayer.getProof(key, sha256);

    console.log(`Proof for key ${key}\nand sha256 hash ${sha256}:`);
    console.log(proof);
  } catch (error: any) {
    console.error('Cannot get proof:', error.message);
  }
}

export const getRoot = async () => {
  try {
    const storeIdResult = await getActiveStoreId();
    const storeId = storeIdResult?.toString();
    if (!storeId){
      throw new Error('Failed to find datastore');
    }

    const options: DataIntegrityTreeOptions = {
      storageMode: "local",
      storeDir: STORE_PATH,
    };
    const datalayer = new DataIntegrityTree(storeId, options);
    const rootHash = datalayer.getRoot();
    console.log(`The root hash is ${rootHash}`);

  } catch (error: any) {
    console.error('Failed to get root hash:', error.message);
  }
}

export const listKeys = async () => {
  try {
    const storeIdResult = await getActiveStoreId();
    const storeId = storeIdResult?.toString();
    if (!storeId){
      throw new Error('Failed to find datastore');
    }

    const options: DataIntegrityTreeOptions = {
      storageMode: "local",
      storeDir: STORE_PATH,
    };
    const datalayer = new DataIntegrityTree(storeId, options);
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

export const verfiyProof = async (proof: string, sha256: string) => {
  try {
    const storeIdResult = getActiveStoreId();
    const storeId = storeIdResult?.toString();
    if (!storeId){
      throw new Error('Failed to find datastore');
    }

    const options: DataIntegrityTreeOptions = {
      storageMode: "local",
      storeDir: STORE_PATH,
    };
    const datalayer = new DataIntegrityTree(storeId, options);
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


