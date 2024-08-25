import { getOrCreateMnemonic, deleteMnemonic, getMnemonic, importMnemonic } from "../blockchain/mnemonic";
import {commit, push, pull, clone, setRemote, init, validate, login, logout, getProof} from "../actions";
import { CreateStoreUserInputs } from '../types';
import { startPreviewServer } from '../content_server/server';
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
    await startPreviewServer();
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
  validateStore: async () => {
    await validate();
  },
  manageStore: async (argv: {action: string} & any) => {
    try {
      switch (argv.action) {
        case "validate":
          await validate();
          break;
        case "update":
          //  await upsertStore();
          break;
        case "remove":
          // await removeStore();
          break;
        case "get_proof":
          const {key, sha256} = argv;
          await getProof(key, sha256);
          break;
        default:
          console.error(`Unknown action ${argv.action}`);
      }
    } catch {
      console.error('Invalid command structure')
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
  }
};
