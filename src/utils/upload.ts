import * as path from "path";
import { MultiBar, Presets } from "cli-progress";
import { getDeltaFiles } from ".";
import { DigPeer } from "./DigPeer"; // Import the DigPeer class

// Function to handle the upload process for a directory using DigPeer
export const uploadDirectory = async (
  digPeerIp: string,
  directory: string,
  storeId: string,
  generationIndex: number
): Promise<void> => {
  // Instantiate DigPeer
  const digPeer = new DigPeer(digPeerIp, storeId);

  const storeDir = path.resolve(directory, storeId);
  const filesToUpload = await getDeltaFiles(
    storeId,
    generationIndex,
    directory
  );

  if (filesToUpload.length === 0) {
    console.log("No files to upload.");
    return;
  }

  const multiBar = new MultiBar(
    {
      clearOnComplete: false,
      hideCursor: true,
      format: "{bar} | {percentage}% | {name}",
      noTTYOutput: true,
    },
    Presets.shades_classic
  );

  const uploadBar = multiBar.create(filesToUpload.length, 0, {
    name: "Store Data",
  });

  try {
    for (const filePath of filesToUpload) {
      const relativePath = path
        .relative(storeDir, filePath)
        .replace(/\\/g, "/"); // Convert to forward slashes

      // Handle direct uploads using DigPeer
      await digPeer.pushFile(filePath, relativePath);

      uploadBar.increment();
    }
  } catch (error: any) {
    console.error("Upload process failed:", error.message || error);
    throw error; // Re-throw the error to ensure the process halts
  } finally {
    multiBar.stop();
  }
};
