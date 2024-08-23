import {CONFIG_FILE_PATH, loadDigConfig} from "../utils/config";
import {promptCredentials} from "../utils";
import keytar from "keytar";

export const login = async (username = '', password = '') => {
  try {
    const config = loadDigConfig('');
    if (!config?.origin) {
      throw new Error(`Field "origin" is not set in ${CONFIG_FILE_PATH}`);
    }

    const existingUserName = await keytar.getPassword(config.origin, 'username');
    if (existingUserName){
      throw new Error('You are already logged in to this datastore. Run "dig logout" to login again');
    }

    if (username && password){
      await keytar.setPassword(config.origin, 'username', username);
      await keytar.setPassword(config.origin, 'password', password);
    } else if (!username && !password){
      await promptCredentials(config.origin);
    } else {
      throw new Error('Missing username or password')
    }
  } catch (error: any) {
    console.error('Failed to login to datastore:', error.message);
  }
}