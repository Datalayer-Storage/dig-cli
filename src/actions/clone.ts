import * as fs from "fs";
import * as path from "path";
import { digFolderName } from "../config";

export const clone = (origin: string): void => {
  const digDir = path.join(process.cwd(), digFolderName);

  if (!fs.existsSync(origin)) {
    throw new Error(`Origin folder not found at ${origin}`);
  }

  fs.cpSync(path.join(origin, digFolderName), digDir, { recursive: true });

  console.log("Clone successful");
};
