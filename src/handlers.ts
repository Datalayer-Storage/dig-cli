import { getOrCreateMnemonic, deleteMnemonic, getMnemonic, importMnemonic } from "./blockchain/mnemonic";
import { checkStorePermissions } from "./actions/middleware";
import { commit, push, pull, clone, setRemote, init } from "./actions";

// Command handlers
export const handlers = {
  init: async () => {
    await init();
  },
  commit: async () => {
    await checkStorePermissions();
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
  manageKeys: async (action: string) => {
    if (action === "import") {
      const mnemonic = await importMnemonic();
      console.log(`Mnemonic imported: ${mnemonic}`);
    } else if (action === "generate") {
      const mnemonic = await getOrCreateMnemonic();
      console.log(`Mnemonic generated: ${mnemonic}`);
    } else if (action === "delete") {
      const result = await deleteMnemonic();
      console.log(result ? "Mnemonic seed deleted successfully." : "No mnemonic seed found to delete.");
    } else if (action === "show") {
      const mnemonic = await getMnemonic();
      console.log(`Stored mnemonic: ${mnemonic}`);
    } else {
      console.error("Unknown keys action");
    }
  },
};
