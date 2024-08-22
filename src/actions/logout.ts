import {clearCredentials, promptCredentials} from "../utils";
import {CONFIG_FILE_PATH, loadDigConfig} from "../utils/config";

export const logout = async () => {
  try {
    const config = loadDigConfig('');
    if (!config?.origin) {
      throw new Error(`Field "origin" is not set in ${CONFIG_FILE_PATH}`);
    }

    await clearCredentials(config.origin);

  } catch (error: any) {
    console.error('Failed to logout from to datastore:', error.message);
  }
}
