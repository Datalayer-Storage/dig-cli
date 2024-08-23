import yargs, { Argv } from "yargs";
import { handlers } from "./handlers";
import { CreateStoreUserInputs } from '../types';

export function initCommand(yargs: Argv<{}>) {
  return yargs.command<CreateStoreUserInputs>(
    "init",
    "Initialize a new Data Store",
    (yargs: Argv<CreateStoreUserInputs>) => {
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
  );
}

export function commitCommand(yargs: Argv<{}>) {
  return yargs.command(
    "commit",
    "Commit changes to the data store",
    {},
    handlers.commit
  );
}

export function pushCommand(yargs: Argv<{}>) {
  return yargs.command(
    "push",
    "Push changes to the remote data store",
    {},
    handlers.push
  );
}

export function pullCommand(yargs: Argv<{}>) {
  return yargs.command(
    "pull",
    "Pull changes from the remote data store",
    {},
    handlers.pull
  );
}

export function cloneCommand(yargs: Argv<{}>) {
  return yargs.command(
    "clone",
    "Clone a data store",
    {},
    handlers.clone
  );
}

export function storeCommand(yargs: Argv<{}>) {
  // @ts-ignore
  return yargs.command<{ action: string }>(
    "store <action>",
    "Manage data store",
    (yargs: Argv<{ action: string }>) => {
      return yargs
        .positional("action", {
          describe: "Action to perform on keys",
          type: "string",
          choices: ["validate", "update", "remove", "get_proof"],
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
        })
        .check((argv) => {
          if (argv.action === "get_proof") {
            if (!argv.key || !argv.sha256) {
              throw new Error("The --key and --sha256 options are required for the 'get_proof' action.");
            }
          } else {
            if (argv.key || argv.sha256) {
              throw new Error("The --key and --sha256 options are only valid for the 'get_proof' action.");
            }
          }
          return true;
        })
        .strict();
    },
    async (argv) => {
      await handlers.manageStore(argv);
    }
  );
}

export function remoteSetCommand(yargs: Argv<{}>) {
  // @ts-ignore
  return yargs.command<{ connectionString: string }>(
    "remote set <connectionString>",
    "Set a remote connection",
    (yargs: Argv<{ connectionString: string }>) => {
      return yargs.positional("connectionString", {
        type: "string",
        describe: "The connection string for the remote",
      });
    },
    handlers.setRemote
  );
}

export function keysCommand(yargs: Argv<{}>) {
  // @ts-ignore
  return yargs.command<{ action: string; mnemonic?: string }>(
    "keys <action>",
    "Manage cryptographic keys",
    (yargs: Argv<{ action: string; mnemonic?: string }>) => {
      return yargs
        .positional("action", {
          describe: "Action to perform on keys",
          type: "string",
          choices: ["import", "generate", "delete", "show"],
        })
        .option("mnemonic", {
          type: "string",
          describe: "Mnemonic seed phrase for import (only for 'import' action)",
        })
        .strict();  // Ensures that only the defined options are accepted
    },
    async (argv: { action: string; mnemonic?: string }) => {
      await handlers.manageKeys(argv.action, argv.mnemonic);
    }
  );
}
