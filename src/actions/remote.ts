import * as fs from "fs";
import { verifyConnectionString } from "../utils";
import { CONFIG_FILE_PATH } from "../config";
import { Config } from "../types";

export const setRemote = ({ origin }: { origin: string }): void => {
  if (!fs.existsSync(CONFIG_FILE_PATH)) {
    throw new Error("Config file not found.");
  }

  const config: Config = JSON.parse(fs.readFileSync(CONFIG_FILE_PATH, "utf-8"));

  if (!verifyConnectionString(origin)) {
    throw new Error(
      "Invalid origin format. The format should be dig://hostname:username/distributionname.dig"
    );
  }

  config.origin = origin;

  fs.writeFileSync(CONFIG_FILE_PATH, JSON.stringify(config, null, 4));
  console.log(`Origin set to ${origin}`);
};
