import * as fs from "fs";
import { verifyConnectionString } from "../utils";
import { setRemote as _setRemote, setActiveStore as _setActiveStore } from "../utils/config";
import { Config } from "../types";

export const setRemote = (remote: string): void => {
  _setRemote(remote);
};

export const setActiveStore = (storeId: string): void => {
  _setActiveStore(storeId);
};