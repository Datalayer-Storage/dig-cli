import {HttpError } from "./HttpError";
import keytar from "keytar";

export const getCredentials = async () => {
    const username = process.env.DIG_USERNAME || await keytar.getPassword('storeService', 'username');
    const password = process.env.DIG_PASSWORD || await keytar.getPassword('storeService', username || 'username');
    
    if (!username || !password) {
      throw new HttpError(500, "Missing credentials for authentication");
    }
  
    return { username, password };
  };