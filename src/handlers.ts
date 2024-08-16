import { getOrCreateMnemonic, deleteMnemonic, getMnemonic, importMnemonic } from "./blockchain/mnemonic";
import { checkStorePermissions, ensureStoreIsSpendable } from "./actions/middleware";
import { commit, push, pull, clone, setRemote, init, validate } from "./actions";
import { CreateStoreUserInputs } from './types';

// Command handlers
export const handlers = {
  init: async (inputs: CreateStoreUserInputs) => {
    await init(inputs);
  },
  commit: async () => {
   // await checkStorePermissions();
   // await ensureStoreIsSpendable();
    await commit();
    console.log("Commit command executed");
  },
  push: async () => {
    await checkStorePermissions();
    await push();
    console.log("Push command executed");
  },
  pull: async () => {
    await checkStorePermissions();
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
        await getMnemonic();
        break;
      default:
        console.error("Unknown keys action");
    }
  },
};
