import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import * as zlib from "zlib";
import * as os from "os";
import { SHA256 } from "crypto-js";
import { MerkleTree } from "merkletreejs";
import { Readable } from "stream";
import { promisify } from "util";

const copyFile = promisify(fs.copyFile);
const unlink = promisify(fs.unlink);
const sleep = promisify(setTimeout);

/**
 * Convert a string to hexadecimal representation.
 * @param str - The input string.
 * @returns The hexadecimal representation of the input string.
 */
const toHex = (str: string): string => {
  return Buffer.from(str).toString("hex");
};

/**
 * Remove empty directories recursively.
 * @param dir - The directory path.
 */
const removeEmptyDirectories = (dir: string): void => {
  if (fs.existsSync(dir)) {
    const files = fs.readdirSync(dir);
    if (files.length === 0) {
      fs.rmdirSync(dir);
      const parentDir = path.dirname(dir);
      removeEmptyDirectories(parentDir);
    }
  }
};

/**
 * DataStoreManager class to manage Merkle tree operations.
 */
class MerkleManager {
  private storeId: string;
  private storeBaseDir: string;
  private storeDir: string;
  public files: Map<string, { hash: string; sha256: string }>;
  private tree: MerkleTree;

  constructor(storeId: string) {
    if (storeId.length !== 64) {
      throw new Error("storeId must be a 64 char hex string");
    }
    this.storeId = storeId;
    this.storeBaseDir = path.join(require("os").homedir(), ".dig", "stores");
    this.storeDir = path.join(this.storeBaseDir, this.storeId);

    if (!fs.existsSync(this.storeBaseDir)) {
      fs.mkdirSync(this.storeBaseDir, { recursive: true });
    }

    if (!fs.existsSync(this.storeDir)) {
      fs.mkdirSync(this.storeDir, { recursive: true });
    }

    this.files = new Map();
    this.tree = this._loadLatestTree();

    // Commit the empty Merkle tree immediately upon creation
    if (this.tree.getLeafCount() === 0) {
      this.commit();
    }
  }

  /**
   * Load the manifest file.
   * @private
   */
  private _loadManifest(): string[] {
    const manifestPath = path.join(this.storeDir, "manifest.dat");
    if (fs.existsSync(manifestPath)) {
      return fs.readFileSync(manifestPath, "utf8").trim().split("\n");
    }
    return [];
  }

  /**
   * Load the latest tree from the manifest file.
   * @private
   */
  private _loadLatestTree(): MerkleTree {
    const manifest = this._loadManifest();
    if (manifest.length > 0) {
      const latestRootHash = manifest[manifest.length - 1];
      return this.deserializeTree(latestRootHash);
    } else {
      return new MerkleTree([], SHA256, { sortPairs: true });
    }
  }

  /**
   * Save a binary stream to the store's data directory.
   * @param sha256 - The SHA-256 hash of the buffer.
   * @returns The write stream for the file.
   */
  private _createWriteStream(sha256: string): fs.WriteStream {
    const dataDir = path.join(this.storeDir, "data");

    // Create the subdirectories and file path
    const subDirs = sha256.match(/.{1,2}/g) || [];
    const fileDir = path.join(dataDir, ...subDirs.slice(0, -1));
    const fileName = subDirs[subDirs.length - 1];
    const fileSavePath = path.join(fileDir, fileName);

    if (!fs.existsSync(fileDir)) {
      fs.mkdirSync(fileDir, { recursive: true });
    }

    return fs.createWriteStream(fileSavePath);
  }

  /**
   * Upsert a key with a binary stream to the Merkle tree.
   * Compresses the file, calculates the SHA-256 of the uncompressed file, and stores it.
   * @param readStream - The binary data stream.
   * @param key - The key for the binary data.
   */
  async upsertKey(readStream: Readable, key: string): Promise<void> {
    const hexKey = toHex(key);
    const uncompressedHash = crypto.createHash("sha256");
    const gzip = zlib.createGzip();

    let sha256: string;
    const tempDir = path.join(this.storeDir, "tmp");
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    const tempFilePath = path.join(tempDir, `${crypto.randomUUID()}.gz`);

    return new Promise((resolve, reject) => {
      const tempWriteStream = fs.createWriteStream(tempFilePath);

      readStream.on("data", (chunk) => {
        uncompressedHash.update(chunk);
      });

      readStream.pipe(gzip).pipe(tempWriteStream);

      tempWriteStream.on("finish", async () => {
        sha256 = uncompressedHash.digest("hex");

        const finalWriteStream = this._createWriteStream(sha256);
        const finalPath = finalWriteStream.path as string;

        // Ensure the directory exists before copying the file
        const finalDir = path.dirname(finalPath);
        if (!fs.existsSync(finalDir)) {
          fs.mkdirSync(finalDir, { recursive: true });
        }

        try {
          await this.streamFile(tempFilePath, finalPath);
          await unlink(tempFilePath);

          const combinedHash = crypto
            .createHash("sha256")
            .update(`${hexKey}/${sha256}`)
            .digest("hex");

          if (
            Array.from(this.files.values()).some(
              (file) => file.hash === combinedHash
            )
          ) {
            console.log(`No changes detected for key: ${key}`);
            return resolve();
          }

          if (this.files.has(hexKey)) {
            this.deleteKey(key);
          }

          console.log(`Successfully inserted key: ${key}`);
          this.files.set(hexKey, {
            hash: combinedHash,
            sha256: sha256,
          });
          this._rebuildTree();
          resolve();
        } catch (err) {
          reject(err);
        }
      });

      tempWriteStream.on("error", (err) => {
        reject(err);
      });

      readStream.on("error", (err) => {
        reject(err);
      });
    });
  }

  /**
   * Stream file from one path to another.
   * @param src - The source file path.
   * @param dest - The destination file path.
   */
  private async streamFile(src: string, dest: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const readStream = fs.createReadStream(src);
      const writeStream = fs.createWriteStream(dest);

      readStream.pipe(writeStream);

      writeStream.on("finish", resolve);
      writeStream.on("error", reject);
      readStream.on("error", reject);
    });
  }

  /**
   * Delete a key from the Merkle tree.
   * @param key - The key to delete.
   */
  deleteKey(key: string): void {
    const hexKey = toHex(key);
    if (this.files.has(hexKey)) {
      this.files.delete(hexKey);
      this._rebuildTree();
      console.log(`Deleted key: ${key}`);
    }
  }

  /**
   * List all keys in the Merkle tree.
   * @param rootHash - The root hash of the tree. Defaults to the latest root hash.
   * @returns The list of keys.
   */
  listKeys(rootHash: string | null = null): string[] {
    if (rootHash) {
      const tree = this.deserializeTree(rootHash);
      // @ts-ignore
      return Array.from(tree.files.keys());
    }
    return Array.from(this.files.keys());
  }

  /**
   * Rebuild the Merkle tree from the current files.
   * @private
   */
  private _rebuildTree(): void {
    const leaves = Array.from(this.files.values()).map(({ hash }) =>
      Buffer.from(hash, "hex")
    );
    this.tree = new MerkleTree(leaves, SHA256, { sortPairs: true });
  }

  /**
   * Get the root of the Merkle tree.
   * @param rootHash - The root hash of the tree. Defaults to the latest root hash.
   * @returns The Merkle root.
   */
  getRoot(): string {
    return this.tree.getRoot().toString("hex");
  }

  /**
   * Serialize the Merkle tree to a JSON object.
   * @param rootHash - The root hash of the tree. Defaults to the latest root hash.
   * @returns The serialized Merkle tree.
   */
  serialize(rootHash: string | null = null): object {
    if (rootHash) {
      const tree = this.deserializeTree(rootHash);
      return {
        root: tree.getRoot().toString("hex"),
        leaves: tree.getLeaves().map((leaf) => leaf.toString("hex")),
        // @ts-ignore
        files: Object.fromEntries(tree.files),
      };
    }
    return {
      root: this.getRoot(),
      leaves: this.tree.getLeaves().map((leaf) => leaf.toString("hex")),
      files: Object.fromEntries(this.files),
    };
  }

  /**
   * Deserialize a JSON object to a Merkle tree.
   * @param rootHash - The root hash of the tree.
   * @returns The deserialized Merkle tree.
   */
  deserializeTree(rootHash: string): MerkleTree {
    const treeFilePath = path.join(this.storeDir, `${rootHash}.dat`);
    if (!fs.existsSync(treeFilePath)) {
      throw new Error(`Tree file ${treeFilePath} does not exist`);
    }
    const data = JSON.parse(fs.readFileSync(treeFilePath, "utf8"));
    const leaves = data.leaves.map((leaf: string) => Buffer.from(leaf, "hex"));
    const tree = new MerkleTree(leaves, SHA256, { sortPairs: true });
    // @ts-ignore
    tree.files = new Map(
      Object.entries(data.files).map(([key, value]: [string, any]) => [
        key,
        { hash: value.hash, sha256: value.sha256 },
      ])
    );
    // @ts-ignore
    this.files = tree.files;
    return tree;
  }

  /**
   * Commit the current state of the Merkle tree.
   */
  commit(): string | undefined {
    const rootHash =
      this.tree.getLeafCount() === 0
        ? "0000000000000000000000000000000000000000000000000000000000000000"
        : this.getRoot();

    const manifest = this._loadManifest();
    const latestRootHash =
      manifest.length > 0 ? manifest[manifest.length - 1] : null;

    if (rootHash === latestRootHash) {
      console.log("No changes to commit. Aborting commit.");
      return undefined;
    }

    const manifestPath = path.join(this.storeDir, "manifest.dat");
    fs.appendFileSync(manifestPath, `${rootHash}\n`);

    const treeFilePath = path.join(this.storeDir, `${rootHash}.dat`);
    if (!fs.existsSync(path.dirname(treeFilePath))) {
      fs.mkdirSync(path.dirname(treeFilePath), { recursive: true });
    }
    fs.writeFileSync(treeFilePath, JSON.stringify(this.serialize()));

    console.log(`Committed new root`);
    console.log(this.tree.toString());
    return rootHash;
  }

  /**
   * Clear pending changes and revert to the latest committed state.
   */
  clearPendingRoot(): void {
    this.tree = this._loadLatestTree();
  }

  /**
   * Get a readable stream for a file based on its key, with decompression.
   * @param hexKey - The hexadecimal key of the file.
   * @param rootHash - The root hash of the tree. Defaults to the latest root hash.
   * @returns The readable stream for the file.
   */
  getValueStream(hexKey: string, rootHash: string | null = null): Readable {
    let sha256: string | undefined;

    if (rootHash) {
      const tree = this.deserializeTree(rootHash);
      // @ts-ignore
      sha256 = tree.files.get(hexKey)?.sha256;
    } else {
      sha256 = this.files.get(hexKey)?.sha256;
    }

    if (!sha256) {
      throw new Error(`File with key ${hexKey} not found.`);
    }

    const filePath = path.join(
      this.storeDir,
      "data",
      sha256.match(/.{1,2}/g)!.join("/")
    );

    if (!fs.existsSync(filePath)) {
      throw new Error(`File at path ${filePath} does not exist`);
    }

    // Create a read stream and pipe it through a decompression stream using the same algorithm (gzip)
    const readStream = fs.createReadStream(filePath);
    const decompressStream = zlib.createGunzip();

    // Return the combined stream as a generic Readable stream
    return readStream.pipe(decompressStream);
  }

  /**
   * Delete all leaves from the Merkle tree.
   */
  deleteAllLeaves(): void {
    this.files.clear();
    this._rebuildTree();
    console.log("All leaves have been deleted from the Merkle tree.");
    console.log(this.tree.toString());
  }

  /**
   * Get a proof for a file based on its key and SHA-256 hash.
   * @param hexKey - The hexadecimal key of the file.
   * @param sha256 - The SHA-256 hash of the file.
   * @param rootHash - The root hash of the tree. Defaults to the latest root hash.
   * @returns The proof for the file as a hex string.
   */
  getProof(
    hexKey: string,
    sha256: string,
    rootHash: string | null = null
  ): string {
    if (!rootHash) {
      const manifest = this._loadManifest();
      rootHash = manifest[manifest.length - 1];
    }
    const tree = this.deserializeTree(rootHash);
    const combinedHash = SHA256(`${hexKey}/${sha256}`).toString();
    const leaf = Buffer.from(combinedHash, "hex");
    const proof = tree.getProof(leaf);

    // Convert the proof to a single hex string
    const proofHex = proof.map((p) => p.data.toString("hex")).join("");

    // Create an object with the key, rootHash, and proofHex
    const proofObject = {
      key: hexKey,
      rootHash: rootHash,
      proof: proofHex,
    };

    // Convert the proofObject to JSON and then to a hex string
    const proofObjectHex = Buffer.from(JSON.stringify(proofObject)).toString(
      "hex"
    );

    return proofObjectHex;
  }

  /**
   * Verify a proof for a file against the Merkle tree.
   * @param proofObjectHex - The proof object as a hex string.
   * @param sha256 - The SHA-256 hash of the file.
   * @returns True if the proof is valid, false otherwise.
   */
  verifyProof(proofObjectHex: string, sha256: string): boolean {
    // Convert the proofObjectHex back to a proof object
    const proofObject = JSON.parse(
      Buffer.from(proofObjectHex, "hex").toString("utf8")
    );

    const { key, rootHash, proof } = proofObject;
    const tree = this.deserializeTree(rootHash);
    const combinedHash = SHA256(`${key}/${sha256}`).toString();
    const leaf = Buffer.from(combinedHash, "hex");

    // Convert the proofHex string back to the proof array
    const proofBufferArray = [];
    for (let i = 0; i < proof.length; i += 64) {
      proofBufferArray.push(Buffer.from(proof.slice(i, i + 64), "hex"));
    }
    const proofArray = proofBufferArray.map((data) => ({ data }));

    return tree.verify(proofArray, leaf, Buffer.from(rootHash, "hex"));
  }

  /**
   * Get the difference between two Merkle tree roots.
   * @param rootHash1 - The first root hash.
   * @param rootHash2 - The second root hash.
   * @returns An object containing the added and deleted keys and their SHA-256 hashes.
   */
  getRootDiff(
    rootHash1: string,
    rootHash2: string
  ): { added: Map<string, string>; deleted: Map<string, string> } {
    const tree1 = this.deserializeTree(rootHash1);
    const tree2 = this.deserializeTree(rootHash2);

    // @ts-ignore
    const files1 = tree1.files as Map<string, { hash: string; sha256: string }>;
    // @ts-ignore
    const files2 = tree2.files as Map<string, { hash: string; sha256: string }>;

    const added = new Map<string, string>();
    const deleted = new Map<string, string>();

    files1.forEach((value, key) => {
      if (!files2.has(key)) {
        deleted.set(key, value.sha256);
      }
    });

    files2.forEach((value, key) => {
      if (!files1.has(key)) {
        added.set(key, value.sha256);
      }
    });

    return { added, deleted };
  }

  /**
   * Verify the integrity of a file based on its SHA-256 hash.
   * @param sha256 - The SHA-256 hash of the file.
   * @returns True if the file integrity is verified, false otherwise.
   */
  async verifyKeyIntegrity(sha256: string): Promise<boolean> {
    const filePath = path.join(
      this.storeDir,
      "data",
      sha256.match(/.{1,2}/g)!.join("/")
    );

    if (!fs.existsSync(filePath)) {
      throw new Error(`File at path ${filePath} does not exist`);
    }

    const compressedReadStream = fs.createReadStream(filePath);
    const decompressStream = zlib.createGunzip();
    const hash = crypto.createHash("sha256");

    return new Promise((resolve, reject) => {
      compressedReadStream.pipe(decompressStream);

      decompressStream.on("data", (chunk) => {
        hash.update(chunk);
      });

      decompressStream.on("end", () => {
        const uncompressedSha256 = hash.digest("hex");
        const isValid = uncompressedSha256 === sha256;
        console.log(`SHA-256 of uncompressed file: ${uncompressedSha256}`);
        resolve(isValid);
      });

      decompressStream.on("error", (err) => {
        reject(err);
      });

      compressedReadStream.on("error", (err) => {
        reject(err);
      });
    });
  }
}

export { MerkleManager };
