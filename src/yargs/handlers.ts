import { getOrCreateMnemonic, deleteMnemonic, getMnemonic, importMnemonic } from "../blockchain/mnemonic";
import {commit, push, pull, clone, setRemote, init, validate, getProof} from "../actions";
import {CreateStoreUserInputs, ManageStoreArgs} from '../types';

// Command handlers
export const handlers = {
  init: async (inputs: CreateStoreUserInputs) => {
    await init(inputs);
  },
  commit: async () => {
   // await checkStorePermissions();
   // await ensureStoreIsSpendable();
    await commit();
  },
  push: async () => {
    await push();
    console.log("Success!");
  },
  pull: async () => {
    await pull();
    console.log("Pull command executed");
  },
  clone: async () => {
    //await clone();
    console.log("Clone command executed");
  },
  upsertStore: async (writer?: string, oracle_fee?: number, admin?: string) => {
    //await upsertStore(writer, oracle_fee, admin);
    console.log("Store upsert executed");
  },
  removeStore: async (writer?: string, oracle_fee?: number, admin?: string) => {
   // await removeStore(writer, oracle_fee, admin);
    console.log("Store remove executed");
  },
  setRemote: async (connectionString: string) => {
   // await setRemote(connectionString);
    console.log(`Remote set executed with connectionString: ${connectionString}`);
  },
  validateStore: async () => {
    await validate();
    console.log("Store validated");
  },
  manageStore: async (argv) => {
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
          console.error(`Unknown action ${argv.action}`)
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
};
