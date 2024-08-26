import {
  getOrCreateMnemonic,
  deleteMnemonic,
  getMnemonic,
  importMnemonic,
} from "../blockchain/mnemonic";
import {
  commit,
  push,
  pull,
  clone,
  setRemote,
  init,
  validate,
  login,
  syncRemoteSeed as _syncRemoteSeed,
  setRemoteSeed as _setRemoteSeed,
  generateEntropyValue
} from "../actions";
import { CreateStoreUserInputs } from "../types";
import { logout } from "../actions/logout";
import { startContentServer } from "../content_server/server";
import { checkStoreWritePermissions } from "../actions";
import { getActiveStoreId } from "../utils/config";

// Command handlers
export const handlers = {
  init: async (inputs: CreateStoreUserInputs) => {
    await init(inputs);
  },
  commit: async () => {
    await getActiveStoreId();
    await checkStoreWritePermissions();
    await commit();
  },
  push: async () => {
    await getActiveStoreId();
    await checkStoreWritePermissions();
    await push();
  },
  pull: async () => {
    await pull();
    console.log("Pull command executed");
  },
  server: async () => {
    await getActiveStoreId();
    await startContentServer();
  },
  clone: async (storeId: string) => {
    await clone(storeId);
  },
  upsertStore: async (writer?: string, oracle_fee?: number, admin?: string) => {
    //await upsertStore(writer, oracle_fee, admin);
    console.log("Store upsert executed");
  },
  removeStore: async (writer?: string, oracle_fee?: number, admin?: string) => {
    // await removeStore(writer, oracle_fee, admin);
    console.log("Store remove executed");
  },
  setRemote: async (peer: string) => {
    await setRemote(peer);
  },
  syncRemoteSeed: async () => {
    await _syncRemoteSeed();
  },
  setRemoteSeed: async (seed: string) => {
    await _setRemoteSeed(seed);
  },
  validateStore: async () => {
    await validate();
  },
  generateCreds: async () => {
    await generateEntropyValue();
  },
  manageStore: async (action: string) => {
    switch (action) {
      case "validate":
        await validate();
        break;
      case "update":
        //  await upsertStore();
        break;
      case "remove":
        // await removeStore();
        break;
      default:
        console.error("Unknown store action");
    }
  },
  manageKeys: async (action: string, providedMnemonic?: string) => {
    switch (action) {
      case "import":
        await importMnemonic(providedMnemonic);
        break;
      case "generate":
        await getOrCreateMnemonic();
        break;
      case "delete":
        await deleteMnemonic();
        break;
      case "show":
        console.log(await getMnemonic());
        break;
      default:
        console.error("Unknown keys action");
    }
  },
  login: async (username: string, password: string) => {
    await login(username, password);
  },
  logout: async () => {
    await logout();
  },
};
