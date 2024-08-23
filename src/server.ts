import express, { Request, Response, NextFunction } from "express";
import { extname } from "path";
import {
  DataIntegrityTree,
  DataIntegrityTreeOptions,
} from "./DataIntegrityTree";
import { DIG_FOLDER_PATH } from "./utils/config";
import { findStoreId } from "./blockchain/datastore"; // Import findStoreId

const mimeTypes: { [key: string]: string } = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/vnd.microsoft.icon",
  ".webp": "image/webp",
  ".tiff": "image/tiff",
  ".bmp": "image/bmp",
  ".txt": "text/plain",
  ".csv": "text/csv",
  ".md": "text/markdown",
  ".xml": "application/xml",
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".ppt": "application/vnd.ms-powerpoint",
  ".pptx":
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".odt": "application/vnd.oasis.opendocument.text",
  ".ods": "application/vnd.oasis.opendocument.spreadsheet",
  ".zip": "application/zip",
  ".rar": "application/vnd.rar",
  ".tar": "application/x-tar",
  ".7z": "application/x-7z-compressed",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".mp4": "video/mp4",
  ".avi": "video/x-msvideo",
  ".mkv": "video/x-matroska",
  ".webm": "video/webm",
  ".otf": "font/otf",
  ".ttf": "font/ttf",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".eot": "application/vnd.ms-fontobject",
  ".yaml": "text/plain",
  ".yml": "text/plain",
};

const hexToUtf8 = (hex: string): string => {
  return Buffer.from(hex, "hex").toString("utf-8");
};

const verifyStoreId = (req: Request, res: Response, next: NextFunction) => {
  const { storeId } = req.params;
  const expectedStoreId = findStoreId();

  if (storeId !== expectedStoreId?.toString("hex")) {
    res.status(302).send(`
      <html>
        <body>
          <h1>Incorrect Store ID</h1>
          <p>The store ID you provided does not match the expected store ID.</p>
          <p>Click <a href="/${expectedStoreId?.toString(
            "hex"
          )}">here</a> to go to the correct store.</p>
        </body>
      </html>
    `);
    return;
  }

  next();
};

const startPreviewServer = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    try {
      const app = express();
      const PORT = process.env.PORT || 3000;

      app.use("/:storeId", verifyStoreId);

      app.get("/:storeId", (req: Request, res: Response) => {
        const { storeId } = req.params;
        const showKeys = req.query.showKeys === "true";

        const options: DataIntegrityTreeOptions = {
          storageMode: "local",
          storeDir: DIG_FOLDER_PATH,
        };

        const datalayer = new DataIntegrityTree(storeId, options);

        if (!showKeys) {
          const indexKey = Buffer.from("index.html").toString("hex");
          const hasIndex = datalayer.hasKey(indexKey);

          if (hasIndex) {
            const stream = datalayer.getValueStream(indexKey);
            const fileExtension = extname("index.html").toLowerCase();

            const mimeType =
              mimeTypes[fileExtension] || "application/octet-stream";
            res.setHeader("Content-Type", mimeType);

            stream.pipe(res);

            stream.on("error", (err) => {
              console.error("Stream error:", err);
              res.status(500).send("Error streaming file.");
            });

            return;
          }
        }

        const keys = datalayer.listKeys();
        const links = keys.map((key) => {
          const utf8Key = hexToUtf8(key);
          const link = `/${storeId}/${encodeURIComponent(utf8Key)}`;
          return `<a href="${link}">${utf8Key}</a>`;
        });

        res.send(`
          <html>
            <body>
              <h1>Index Of</h1>
              <ul>
                ${links.map((link) => `<li>${link}</li>`).join("")}
              </ul>
            </body>
          </html>
        `);
      });

      app.get("/:storeId/*", (req: Request, res: Response) => {
        const { storeId } = req.params;
        const catchall = req.params[0];

        const key = Buffer.from(catchall, "utf-8").toString("hex");

        const options: DataIntegrityTreeOptions = {
          storageMode: "local",
          storeDir: DIG_FOLDER_PATH,
        };

        const datalayer = new DataIntegrityTree(storeId, options);

        try {
          const stream = datalayer.getValueStream(key);
          const fileExtension = extname(catchall).toLowerCase();

          const mimeType =
            mimeTypes[fileExtension] || "application/octet-stream";
          res.setHeader("Content-Type", mimeType);

          stream.pipe(res);

          stream.on("error", (err) => {
            console.error("Stream error:", err);
            res.status(500).send("Error streaming file.");
          });
        } catch (err) {
          console.error("Error retrieving stream:", err);
          res.status(500).send("Error retrieving the requested file.");
        }
      });

      const server = app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);

        const storeId = findStoreId(); // Get the correct store ID
        console.log(
          `Preview your store at: http://localhost:${PORT}/${storeId?.toString(
            "hex"
          )}`
        );
      });

      // Resolve when the server is closed
      server.on("close", resolve);
    } catch (error) {
      reject(error);
    }
  });
};

export { startPreviewServer };
