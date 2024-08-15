import * as fs from "fs";
import * as path from "path";
import superagent from "superagent";
import archiver from "archiver";
import { PassThrough } from "stream";
import { promptPassword } from "../utils";
import { digFolderName, configFileName } from "../config";

export const push = async (): Promise<void> => {
  const digDir = path.join(process.cwd(), digFolderName);
  const configFilePath = path.join(digDir, configFileName);

  if (!fs.existsSync(digDir)) {
    throw new Error(".dig folder not found. Please run init first.");
  }

  if (!fs.existsSync(configFilePath)) {
    throw new Error("Config file not found.");
  }

  const config: { origin: string } = JSON.parse(fs.readFileSync(configFilePath, "utf-8"));

  if (!config.origin) {
    throw new Error('The "origin" field is not set in the config file.');
  }

  const [, hostname, username, deploymentName] =
    config.origin.match(
      /^dig@([a-zA-Z0-9.-]+):([a-zA-Z0-9]+)\/([a-zA-Z0-9_-]+)\.dig$/
    ) || [];

  const password = await promptPassword(hostname);

  try {
    const headResponse = await superagent
      .head(`https://${hostname}/upload/${username}/${deploymentName}`)
      .auth(username, password);
    const lastUploadedHash = headResponse.headers["x-last-uploaded-hash"];
    console.log(`Last uploaded hash: ${lastUploadedHash}`);
  } catch (error) {
    console.error("Failed to get the last uploaded hash:", error);
    return;
  }

  let uploadUrl;
  try {
    const postResponse = await superagent
      .post(`https://${hostname}/upload/${username}/${deploymentName}`)
      .auth(username, password)
      .send({ username, deploymentName, filename: `${deploymentName}.dig` });
    uploadUrl = postResponse.body.uploadUrl;
  } catch (error) {
    console.error("Failed to get signed URL for upload:", error);
    return;
  }

  try {
    const passThroughStream = new PassThrough();
    const uploadPromise = superagent
      .put(uploadUrl)
      .set("Content-Type", "application/zip")
      .send(passThroughStream);

    const archive = archiver("zip", { zlib: { level: 9 } });
    archive.on("error", (err) => { throw err; });

    archive.pipe(passThroughStream);
    archive.directory(digDir, false);
    archive.finalize();

    await uploadPromise;
    console.log(`Uploaded ${deploymentName}.dig to ${hostname}`);
  } catch (error) {

  }
}
