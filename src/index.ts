#!/usr/bin/env node

import { setupCommands } from "./yargs/setupCommands";
import { DataIntegrityTree } from "./DataIntegrityTree";
import * as utils from "./utils";
import * as blockchain from "./blockchain";
import * as types from "./types";

// Run the command setup
setupCommands();

export {
    DataIntegrityTree, 
    utils,
    blockchain,
    types
}
