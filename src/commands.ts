import yargs from "yargs/yargs";
import { hideBin } from "yargs/helpers";
import { handlers } from "./handlers";
import { ensureDigConfig } from "./config";

// Configure and run Yargs
export async function setupCommands() {
  await yargs(hideBin(process.argv))
    .middleware(async () => {
      ensureDigConfig(process.cwd());
      await handlers.manageKeys("generate");
    })
    .command("init", "Initialize a new repository", {}, handlers.init)
    .command("commit", "Commit changes to the repository", {}, handlers.commit)
    .command("push", "Push changes to the remote repository", {}, handlers.push)
    .command(
      "pull",
      "Pull changes from the remote repository",
      {},
      handlers.pull
    )
    .command("clone", "Clone a repository", {}, handlers.clone)
    .command(
      "store upsert",
      "Upsert a store",
      // @ts-ignore
      (yargs) => {
        return yargs
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
      handlers.upsertStore
    )
    .command(
      "store remove",
      "Remove a store setting",
      // @ts-ignore
      (yargs) => {
        return yargs
          .option("writer", {
            type: "string",
            describe: "Remove an authorized writer",
          })
          .option("oracle_fee", {
            type: "number",
            describe: "Remove the oracle fee",
          })
          .option("admin", {
            type: "string",
            describe: "Remove an admin",
          });
      },
      handlers.removeStore
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
        return yargs.positional("action", {
          describe: "Action to perform on keys",
          type: "string",
          choices: ["import", "generate", "delete", "show"],
        });
      },
      async (argv: { action: string }) => {
        await handlers.manageKeys(argv.action);
      }
    )
    .demandCommand(1, "You need at least one command before moving on")
    .help()
    .alias("h", "help")
    .parse();
}
