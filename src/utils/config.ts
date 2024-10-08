import * as fs from "fs";
import * as path from "path";
import { DigConfig } from "../types";
import { Config } from "../types";
import inquirer from "inquirer";
import os from "os";

export const NETWORK_AGG_SIG_DATA =
  "ccd5bb71183532bff220ba46c268991a3ff07eb358e8255a65c30a2dce0e5fbb";

export const MIN_HEIGHT = 5777842;
export const MIN_HEIGHT_HEADER_HASH =
  "b29a4daac2434fd17a36e15ba1aac5d65012d4a66f99bed0bf2b5342e92e562c";

export const DIG_FOLDER_PATH =
  process.env.DIG_FOLDER_PATH || path.join(process.cwd(), ".dig");

export const STORE_PATH = path.join(DIG_FOLDER_PATH, "stores");

export const USER_DIR_PATH = path.join(os.homedir(), ".dig");
export const CONFIG_FILE_PATH = path.join(DIG_FOLDER_PATH, "dig.config.json");

export const getManifestFilePath = (storeId: string): string =>
  path.join(STORE_PATH, storeId, "manifest.dat");

export const getHeightFilePath = (storeId: string): string =>
  path.join(STORE_PATH, storeId, "height.dat");

export const createInitialConfig = (): void => {
  const initialConfig = { deploy_dir: "./dist", remote: "" };
  fs.writeFileSync(CONFIG_FILE_PATH, JSON.stringify(initialConfig, null, 4));
  console.log("Created dig.config.json file.");
};

export const setRemote = (remote: string): void => {
  if (!fs.existsSync(CONFIG_FILE_PATH)) {
    throw new Error("Config file not found.");
  }

  const config: Config = JSON.parse(fs.readFileSync(CONFIG_FILE_PATH, "utf-8"));
  config.remote = remote;

  fs.writeFileSync(CONFIG_FILE_PATH, JSON.stringify(config, null, 4));
  console.log(`Remote set to ${remote}`);
};

export const setActiveStore = (storeId: string): void => {
  if (!fs.existsSync(CONFIG_FILE_PATH)) {
    throw new Error("Config file not found.");
  }

  const config: Config = JSON.parse(fs.readFileSync(CONFIG_FILE_PATH, "utf-8"));
  config.active_store = storeId;

  fs.writeFileSync(CONFIG_FILE_PATH, JSON.stringify(config, null, 4));
  console.log(`Active Store set to ${storeId}`);
};

/**
 * Prompts the user to select an active store from a list of folders.
 * @param {string[]} options - The list of folder options to choose from.
 * @returns {Promise<string>} The selected folder name.
 */
const promptUserForSelection = async (options: string[]): Promise<string> => {
  const questions: any = [
    {
      type: "list",
      name: "selectedStore",
      message: "Select the active store:",
      choices: options.map((option) => ({ name: option, value: option })),
    },
  ];

  const answer = await inquirer.prompt(questions);
  return answer.selectedStore;
};

export const getCoinState = (
  storeId: string
): {
  metadata: {
    rootHash: string;
    bytes: string;
    label: string;
    description: string;
  };
} => {
  const stateFile = path.join(STORE_PATH, `${storeId}.json`);
  if (!fs.existsSync(stateFile)) {
    return {
      metadata: { rootHash: "", bytes: "", label: "", description: "" },
    };
  }

  const stateContent = fs.readFileSync(stateFile, "utf-8");
  const { latestStore } = JSON.parse(stateContent);
  return latestStore;
};

/**
 * Retrieves a list of valid store folders (64-character hexadecimal names) in the DIG folder.
 *
 * @returns {string[]} An array of valid folder names.
 */
export const getStoresList = (): string[] => {
  const folders = fs.readdirSync(STORE_PATH);
  return folders.filter(
    (folder) =>
      /^[a-f0-9]{64}$/.test(folder) &&
      fs.lstatSync(path.join(STORE_PATH, folder)).isDirectory()
  );
};

/**
 * Retrieves the active_store value from the dig.config.json file within the .dig directory.
 * If not set, checks the subfolders and prompts the user to choose the active one if necessary.
 *
 * @returns {Promise<Buffer | null>} The active_store value as a Buffer if found, otherwise null.
 */
export const getActiveStoreId = async (): Promise<Buffer | null> => {
  const configFilePath = path.join(DIG_FOLDER_PATH, "dig.config.json");

  if (!fs.existsSync(configFilePath)) {
    createInitialConfig();
  }

  const configContent = fs.readFileSync(configFilePath, "utf-8");
  const config = JSON.parse(configContent);

  if (
    config &&
    config.active_store &&
    /^[a-f0-9]{64}$/.test(config.active_store)
  ) {
    return Buffer.from(config.active_store, "hex");
  }

  const validFolders = getStoresList();

  if (validFolders.length === 1 || process.env.REMOTE_NODE === "1") {
    // If only one valid folder exists, set it as the active_store and return it
    config.active_store = validFolders[0];
    fs.writeFileSync(configFilePath, JSON.stringify(config, null, 4));
    return Buffer.from(validFolders[0], "hex");
  } else if (validFolders.length > 1) {
    // Prompt the user to select the active store
    const selectedStore = await promptUserForSelection(validFolders);
    config.active_store = selectedStore;
    fs.writeFileSync(configFilePath, JSON.stringify(config, null, 4));
    return Buffer.from(selectedStore, "hex");
  }

  return null;
};

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
    const configContent = fs.readFileSync(CONFIG_FILE_PATH, "utf-8");
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
    const defaultConfig: DigConfig = { deploy_dir: "./dist" };
    fs.writeFileSync(
      CONFIG_FILE_PATH,
      JSON.stringify(defaultConfig, null, 4),
      "utf-8"
    );
    console.log(`Created new dig.config.json at ${CONFIG_FILE_PATH}`);
    return defaultConfig;
  }

  try {
    const configContent = fs.readFileSync(CONFIG_FILE_PATH, "utf-8");
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
export const setDigConfigKey = (
  baseDir: string,
  key: string,
  value: any
): void => {
  const config = ensureDigConfig(baseDir);
  config[key] = value;

  fs.writeFileSync(CONFIG_FILE_PATH, JSON.stringify(config, null, 4), "utf-8");
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
    fs.writeFileSync(
      CONFIG_FILE_PATH,
      JSON.stringify(config, null, 4),
      "utf-8"
    );
    console.log(`Deleted ${key} from ${CONFIG_FILE_PATH}`);
  } else {
    console.log(`Key ${key} does not exist in ${CONFIG_FILE_PATH}`);
  }
};
