import {CONFIG_FILE_PATH, loadDigConfig} from "../utils/config";
import {promptCredentials} from "../utils";
import keytar from "keytar";

export const login = async (username = '', password = '') => {
  try {
    const config = loadDigConfig('');
    if (!config?.remote) {
      throw new Error(`Field "remote" is not set in ${CONFIG_FILE_PATH}`);
    }

    const existingUserName = await keytar.getPassword(config.remote, 'username');
    if (existingUserName){
      throw new Error('You are already logged in to this datastore. Run "dig logout" to login again');
    }

    if (username && password){
      await keytar.setPassword(config.remote, 'username', username);
      await keytar.setPassword(config.remote, 'password', password);
    } else if (!username && !password){
      await promptCredentials(config.remote);
    } else {
      throw new Error('Missing username or password')
    }
  } catch (error: any) {
    console.error('Failed to login to datastore:', error.message);
  }
}