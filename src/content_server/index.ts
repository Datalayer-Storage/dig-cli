import fs from "fs";
import { STORE_PATH } from "../utils/config";
import { startContentServer } from "./server";

if (!fs.existsSync(STORE_PATH)) {
  fs.mkdirSync(STORE_PATH, { recursive: true });
}

startContentServer();