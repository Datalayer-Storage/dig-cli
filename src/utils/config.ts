import * as fs from "fs";
import * as path from "path";
import { DigConfig } from '../types';

export const NETWORK_AGG_SIG_DATA = 
  "ccd5bb71183532bff220ba46c268991a3ff07eb358e8255a65c30a2dce0e5fbb";

export const MIN_HEIGHT = 5777842;
export const MIN_HEIGHT_HEADER_HASH = 
  "b29a4daac2434fd17a36e15ba1aac5d65012d4a66f99bed0bf2b5342e92e562c";

export const DIG_FOLDER_PATH = path.join(process.cwd(), '.dig');
export const CONFIG_FILE_PATH = path.join(process.cwd(), 'dig.config.json');
export const getManifestFilePath = (storeId: string): string => path.join(DIG_FOLDER_PATH, storeId, 'manifest.dat');
export const getHeightFilePath = (storeId: string): string => path.join(DIG_FOLDER_PATH, storeId, 'height.dat');


  /**
 * Loads the dig.config.json file from the base directory.
 * 
 * @param baseDir - The base directory where the config file is located.
 * @returns {DigConfig} - The parsed configuration object.
 * @throws Will throw an error if the config file does not exist or cannot be parsed.
 */
export const loadDigConfig = (baseDir: string): DigConfig => {  
    if (!fs.existsSync(CONFIG_FILE_PATH)) {
        throw new Error(`Configuration file not found at ${CONFIG_FILE_PATH}`);
    }
  
    try {
        const configContent = fs.readFileSync(CONFIG_FILE_PATH, 'utf-8');
        const config: DigConfig = JSON.parse(configContent);
        return config;
    } catch (error: any) {
        throw new Error(`Failed to load configuration: ${error.message}`);
    }
  };
  
  /**
   * Ensures that the dig.config.json file exists in the base directory.
   * If the file doesn't exist, it creates it with the deploy_dir set to "./dist".
   * 
   * @param baseDir - The base directory where the config file should be located.
   * @returns {DigConfig} - The configuration object.
   */
  export const ensureDigConfig = (baseDir: string): DigConfig => {  
    if (!fs.existsSync(CONFIG_FILE_PATH)) {
        const defaultConfig: DigConfig = { deploy_dir: './dist' };
        fs.writeFileSync(CONFIG_FILE_PATH, JSON.stringify(defaultConfig, null, 4), 'utf-8');
        console.log(`Created new dig.config.json at ${CONFIG_FILE_PATH}`);
        return defaultConfig;
    }
  
    try {
        const configContent = fs.readFileSync(CONFIG_FILE_PATH, 'utf-8');
        const config: DigConfig = JSON.parse(configContent);
        return config;
    } catch (error: any) {
        throw new Error(`Failed to load configuration: ${error.message}`);
    }
  };

  /**
 * Sets a key-value pair in the dig.config.json file.
 * If the file or key doesn't exist, it will create them.
 * 
 * @param baseDir - The base directory where the config file is located.
 * @param key - The configuration key to set.
 * @param value - The value to set for the given key.
 */
export const setDigConfigKey = (baseDir: string, key: string, value: any): void => {
    const config = ensureDigConfig(baseDir);
    config[key] = value;

    fs.writeFileSync(CONFIG_FILE_PATH, JSON.stringify(config, null, 4), 'utf-8');
    console.log(`Set ${key} to ${value} in ${CONFIG_FILE_PATH}`);
};

/**
 * Deletes a key from the dig.config.json file.
 * 
 * @param baseDir - The base directory where the config file is located.
 * @param key - The configuration key to delete.
 */
export const deleteDigConfigKey = (baseDir: string, key: string): void => {
    const config = ensureDigConfig(baseDir);

    if (config.hasOwnProperty(key)) {
        delete config[key];
        fs.writeFileSync(CONFIG_FILE_PATH, JSON.stringify(config, null, 4), 'utf-8');
        console.log(`Deleted ${key} from ${CONFIG_FILE_PATH}`);
    } else {
        console.log(`Key ${key} does not exist in ${CONFIG_FILE_PATH}`);
    }
};