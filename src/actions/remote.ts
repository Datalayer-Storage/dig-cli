import * as fs from "fs";
import * as path from "path";
import { verifyConnectionString } from "../utils";
import { digFolderName, configFileName } from "../config";
import { Config } from "../types";

export const setRemote = ({ origin }: { origin: string }): void => {
  const digDir = path.join(process.cwd(), digFolderName);
  const configFilePath = path.join(digDir, configFileName);

  if (!fs.existsSync(configFilePath)) {
    throw new Error("Config file not found.");
  }

  const config: Config = JSON.parse(fs.readFileSync(configFilePath, "utf-8"));

  if (!verifyConnectionString(origin)) {
    throw new Error(
      "Invalid origin format. The format should be dig://hostname:username/distributionname.dig"
    );
  }

  config.origin = origin;

  fs.writeFileSync(configFilePath, JSON.stringify(config, null, 4));
  console.log(`Origin set to ${origin}`);
};
