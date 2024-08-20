import yargs from "yargs/yargs";
import { hideBin } from "yargs/helpers";
import { handlers } from "./handlers";
import { ensureDigConfig } from "../utils/config";
import { CreateStoreUserInputs } from '../types';
import { checkStoreWritePermissions } from "../actions/middleware";

// Configure and run Yargs
export async function setupCommands() {
  await yargs(hideBin(process.argv))
    .middleware(async () => {
      ensureDigConfig(process.cwd());
      await checkStoreWritePermissions();
    })
    .command(
      "init",
      "Initialize a new Data Store",
      // @ts-ignore
      (yargs) => {
        return yargs
          .option("label", {
            type: "string",
            describe: "Specify the label for the store",
          })
          .option("description", {
            type: "string",
            describe: "Specify the description for the store (max 50 chars)",
          })
          .option("authorizedWriter", {
            type: "string",
            describe: "Specify an authorized writer for the store",
          })
          .option("oracleFee", {
            type: "number",
            describe: "Specify the oracle fee (default is 100000)",
          });
      },
      async (argv: CreateStoreUserInputs) => {
        await handlers.init(argv);
      }
    )
    .command("commit", "Commit changes to the data store", {}, handlers.commit)
    .command("push", "Push changes to the remote data store", {}, handlers.push)
    .command(
      "pull",
      "Pull changes from the remote data store",
      {},
      handlers.pull
    )
    .command("clone", "Clone a data store", {}, handlers.clone)
    .command(
      "store <action>",
      "Manage data store",
      // @ts-ignore
      (yargs) => {
        return yargs
          .positional("action", {
            describe: "Action to perform on keys",
            type: "string",
            choices: ["validate", "update", "remove"],
          })
          .option("writer", {
            type: "string",
            describe: "Specify an authorized writer for the store",
          })
          .option("oracle_fee", {
            type: "number",
            describe: "Specify the oracle fee",
          })
          .option("admin", {
            type: "string",
            describe: "Specify an admin for the store",
          });
      },
      async (argv: { action: string }) => {
        await handlers.manageStore(argv.action);
      }
    )
    .command(
      "remote set <connectionString>",
      "Set a remote connection",
      // @ts-ignore
      (yargs) => {
        return yargs.positional("connectionString", {
          type: "string",
          describe: "The connection string for the remote",
        });
      },
      handlers.setRemote
    )
    .command(
      "keys <action>",
      "Manage cryptographic keys",
      // @ts-ignore
      (yargs) => {
        return yargs
          .positional("action", {
            describe: "Action to perform on keys",
            type: "string",
            choices: ["import", "generate", "delete", "show"],
          })
          .option("mnemonic", {
            type: "string",
            describe: "Mnemonic seed phrase for import (only for 'import' action)",
           // demandOption: (argv: any) => argv.action === "import",
            implies: "action",
          });
      },
      async (argv: { action: string, mnemonic?: string }) => {
        await handlers.manageKeys(argv.action, argv.mnemonic);
      }
    )
    .demandCommand(1, "You need at least one command before moving on")
    .help()
    .alias("h", "help")
    .parse();
}
