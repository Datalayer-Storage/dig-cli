import * as https from "https";
import * as http from "http";
import * as fs from "fs";
import * as path from "path";
import archiver from "archiver";
import { URL } from "url";
import { tmpdir } from "os";
import { MultiBar, Presets } from "cli-progress";
import { getDeltaFiles } from "./utils"; // Adjust the import path as needed

const getHttpModule = (url: URL) => (url.protocol === "https:" ? https : http);

const uploadArchive = async (
  uploadUrl: string,
  storeId: string,
  origin: URL,
  archivePath: string
): Promise<void> => {
  console.log("");
  const multiBar = new MultiBar(
    {
      clearOnComplete: false,
      hideCursor: true,
      format: "{bar} | {percentage}% | {name}",
    },
    Presets.shades_classic
  );

  const uploadBar = multiBar.create(100, 0, { name: "Uploading" });

  const totalSize = fs.statSync(archivePath).size;

  const url = new URL(uploadUrl);
  const httpModule = getHttpModule(url);

  const request = httpModule.request(
    {
      method: "PUT",
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: {
        "Content-Type": "application/zip",
        "Content-Length": totalSize,
      },
    },
    (response) => {
      let responseData = "";
      response.on("data", (chunk) => {
        responseData += chunk;
      });

      response.on("end", () => {
        console.log(`Uploaded ${storeId}.dig to ${origin.hostname}`);
      });
    }
  );

  request.on("error", (err) => {
    console.error("Upload failed:", err);
  });

  const fileStream = fs.createReadStream(archivePath);
  fileStream.pipe(request);

  let uploadedSize = 0;
  fileStream.on("data", (chunk) => {
    uploadedSize += chunk.length;
    const percent = Math.round((uploadedSize / totalSize) * 100);
    uploadBar.update(percent);
  });

  fileStream.on("end", () => {
    request.end();
  });

  await new Promise<void>((resolve, reject) => {
    request.on("finish", resolve);
    request.on("error", reject);
  });

  multiBar.stop();
};

export const uploadDirectory = async (
  uploadUrl: string,
  storeId: string,
  origin: URL,
  directory: string,
  generationIndex: number
): Promise<void> => {
  const tempDir = path.join(tmpdir(), `upload-${Date.now()}`);
  const archivePath = path.join(tempDir, `${storeId}.zip`);

  try {
    // Ensure the temp directory exists
    fs.mkdirSync(tempDir, { recursive: true });

    // Get the list of files to archive using getDeltaFiles
    const filesToArchive = await getDeltaFiles(storeId, generationIndex, directory);

    if (filesToArchive.length === 0) {
      console.log("No files to upload.");
      return;
    }

    // Create the archive and write it to the temp file
    const output = fs.createWriteStream(archivePath);
    const archive = archiver("zip", { zlib: { level: 9 } });

    archive.pipe(output);

    // Add only the necessary files to the archive
    filesToArchive.forEach((filePath) => {
      const relativePath = path.relative(directory, filePath);
      archive.file(filePath, { name: relativePath });
    });

    await archive.finalize();

    // Upload the archive
    await uploadArchive(uploadUrl, storeId, origin, archivePath);

    console.log("");
    console.log(`Upload completed successfully.`);
  } catch (error) {
    console.error("Upload failed:", error);
    throw error;
  } finally {
    // Cleanup: delete the temporary archive file and directory
    fs.rmSync(tempDir, { recursive: true, force: true });
    console.log(`Temporary files cleaned up.`);
  }
};
