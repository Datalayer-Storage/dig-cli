"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const path_1 = __importDefault(require("path"));
const cors_1 = __importDefault(require("cors"));
const fs_1 = __importDefault(require("fs"));
const compression_1 = __importDefault(require("compression"));
const app = (0, express_1.default)();
const port = 8576;
// Enable CORS for all routes
app.use((0, cors_1.default)());
// Enable compression
app.use((0, compression_1.default)());
// Define the base directory for the stores
const storesDir = path_1.default.join(require("os").homedir(), ".dig", "stores");
app.get("/:storeId/data/:sha256", (req, res, next) => {
    const storeId = req.params.storeId;
    const sha256 = req.params.sha256;
    if (!sha256 || sha256.length !== 64) {
        return res.status(400).send("Invalid SHA-256 hash");
    }
    // Map the SHA-256 hash to the directory structure
    const subDirs = sha256.match(/.{1,2}/g) || [];
    const fileDir = path_1.default.join(storesDir, storeId, "data", ...subDirs.slice(0, -1));
    const fileName = subDirs[subDirs.length - 1];
    const filePath = path_1.default.join(fileDir, fileName);
    if (!fs_1.default.existsSync(filePath)) {
        return res.status(404).send("File not found");
    }
    const readStream = fs_1.default.createReadStream(filePath);
    readStream.pipe(res);
});
// Middleware to serve only .dat files
app.use("/:storeId", (req, res, next) => {
    const storeId = req.params.storeId;
    const requestPath = req.path;
    const filePath = path_1.default.join(storesDir, storeId, requestPath);
    if (path_1.default.extname(filePath) !== ".dat") {
        return res.status(403).send("Forbidden");
    }
    if (!fs_1.default.existsSync(filePath)) {
        return res.status(404).send("File not found");
    }
    const readStream = fs_1.default.createReadStream(filePath);
    readStream.pipe(res);
});
// Start the server
app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}/`);
});
