import fs from "fs";
import { STORE_PATH } from "../utils/config";
import { startPropagationServer } from "./server";
import tasks from "./tasks";

if (!fs.existsSync(STORE_PATH)) {
  fs.mkdirSync(STORE_PATH, { recursive: true });
}

tasks.start();
startPropagationServer();
