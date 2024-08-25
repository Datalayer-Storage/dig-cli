import {DataIntegrityTree} from "../DataIntegrityTree";
import {Buffer} from "buffer";
import {getActiveStoreId} from "../utils/config";

export const getKey = async (key: string) => {
  try {
    const storeIdResult = await getActiveStoreId();
    const storeId = storeIdResult?.toString();
    if (!storeId){
      throw new Error('Failed to find datastore');
    }

    const datalayer = new DataIntegrityTree(storeId);
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