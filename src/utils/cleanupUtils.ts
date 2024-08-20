import superagent from "superagent";
import { FileDetails } from "../types";

export const cleanupOnFailure = async (
  hostname: string,
  username: string,
  distributionName: string,
  files: FileDetails[],
  password: string
) => {
  try {
    await superagent
      .delete(`https://${hostname}/upload/${username}/${distributionName}`)
      .auth(username, password)
      .send({ username, distributionName, files });
    console.log("Cleanup completed successfully.");
  } catch (cleanupError) {
    console.error("Failed to cleanup files:", cleanupError);
  }
};
