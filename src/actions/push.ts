import * as fs from "fs";
import * as path from "path";
import superagent from "superagent";
import archiver from "archiver";
import { PassThrough } from "stream";
import { promptPassword } from "../utils";
import { DIG_FOLDER_PATH, CONFIG_FILE_PATH } from "../config";
import { doesHostExistInMirrors, createServerCoin} from '../blockchain/server_coin';
import { createStoreAuthorizationSig } from "../blockchain/signature";

export const push = async (): Promise<void> => {
  if (!fs.existsSync(DIG_FOLDER_PATH)) {
    throw new Error(".dig folder not found. Please run init first.");
  }

  if (!fs.existsSync(CONFIG_FILE_PATH)) {
    throw new Error("Config file not found.");
  }

  const config: { origin: string } = JSON.parse(fs.readFileSync(CONFIG_FILE_PATH, "utf-8"));

  if (!config.origin) {
    throw new Error('The "origin" field is not set in the config file.');
  }

  const [, hostname, username, storeId] =
    config.origin.match(
      /^dig@([a-zA-Z0-9.-]+):([a-zA-Z0-9]+)\/([a-zA-Z0-9_-]+)\.dig$/
    ) || [];

  const password = await promptPassword(hostname);

  let userNonce, lastUploadedHash;

  try {
    const headResponse = await superagent
      .head(`https://${hostname}/upload/${storeId}`)
      .auth(username, password);
    lastUploadedHash = headResponse.headers["x-last-uploaded-hash"];
    userNonce = headResponse.headers["x-nonce"];
    console.log(`Last uploaded hash: ${lastUploadedHash}`);
  } catch (error) {
    console.error("Failed to get the last uploaded hash:", error);
    return;
  }

  let uploadUrl;
  try {
    const storeAuthorizationSig = await createStoreAuthorizationSig(storeId, userNonce);

    const postResponse = await superagent
      .post(`https://${hostname}/upload/${username}/${storeId}`)
      .auth(username, password)
      .send({ 
        storeId,
        authorization_sig: storeAuthorizationSig,
      });
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
    archive.directory(DIG_FOLDER_PATH, false);
    archive.finalize();

    // Check server coin to make sure there is a coin with the origin on it, if not create it
    const serverCoinExistsForOrigin = await doesHostExistInMirrors(storeId, `https://${hostname}`);
    if (!serverCoinExistsForOrigin) {
      console.log(`Creating server coin for ${hostname}`);
      await createServerCoin(storeId, [`https://${hostname}`]);
    }

    await uploadPromise;
    console.log(`Uploaded ${storeId}.dig to ${hostname}`);
  } catch (error) {

  }
}
