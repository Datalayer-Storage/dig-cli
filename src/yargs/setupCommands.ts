import yargs from "yargs/yargs";
import { hideBin } from "yargs/helpers";
import { setupMiddleware } from "./middleware";
import {
  initCommand,
  commitCommand,
  pushCommand,
  pullCommand,
  cloneCommand,
  storeCommand,
  keysCommand,
  remoteCommand
} from "./commands";
import {set} from "lodash";
import {setRemote} from "../actions";

// Configure and run Yargs
export async function setupCommands() {
  const parser = yargs(hideBin(process.argv));

  // Apply middleware
  parser.middleware(setupMiddleware);

  // Register commands
  initCommand(parser);
  commitCommand(parser);
  pushCommand(parser);
  pullCommand(parser);
  cloneCommand(parser);
  storeCommand(parser);
  remoteCommand(parser);
  keysCommand(parser);

  // Set default command and help
  parser
    .demandCommand(1, "You need at least one command before moving on")
    .help()
    .alias("h", "help")
    .parse();
}
