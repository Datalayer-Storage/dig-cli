import express, { Request, Response, NextFunction } from "express";
import path from "path";
import cors from "cors";
import fs from "fs";
import compression from "compression";

const app = express();
const port = 8576;

// Enable CORS for all routes
app.use(cors());

// Enable compression
app.use(compression());

// Define the base directory for the stores
const storesDir = path.join(require("os").homedir(), ".dig", "stores");

app.get("/:storeId/data/:sha256", (req: Request, res: Response, next: NextFunction) => {
  const storeId = req.params.storeId;
  const sha256 = req.params.sha256;

  if (!sha256 || sha256.length !== 64) {
    return res.status(400).send("Invalid SHA-256 hash");
  }

  // Map the SHA-256 hash to the directory structure
  const subDirs = sha256.match(/.{1,2}/g) || [];
  const fileDir = path.join(storesDir, storeId, "data", ...subDirs.slice(0, -1));
  const fileName = subDirs[subDirs.length - 1];
  const filePath = path.join(fileDir, fileName);

  if (!fs.existsSync(filePath)) {
    return res.status(404).send("File not found");
  }

  const readStream = fs.createReadStream(filePath);
  readStream.pipe(res);
});

// Middleware to serve only .dat files
app.use("/:storeId", (req: Request, res: Response, next: NextFunction) => {
  const storeId = req.params.storeId;
  const requestPath = req.path;

  const filePath = path.join(storesDir, storeId, requestPath);
  if (path.extname(filePath) !== ".dat") {
    return res.status(403).send("Forbidden");
  }

  if (!fs.existsSync(filePath)) {
    return res.status(404).send("File not found");
  }

  const readStream = fs.createReadStream(filePath);
  readStream.pipe(res);
});

// Start the server
app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}/`);
});
