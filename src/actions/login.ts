import {CONFIG_FILE_PATH, loadDigConfig} from "../utils/config";
import {promptCredentials} from "../utils";

export const login = async () => {
  try {
    const config = loadDigConfig('');
    if (!config?.origin) {
      throw new Error(`Field "origin" is not set in ${CONFIG_FILE_PATH}`);
    }

    await promptCredentials(config.origin);

  } catch (error: any) {
    console.error('Failed to login to datastore:', error.message);
  }
}