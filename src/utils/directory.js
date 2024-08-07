const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { SHA256 } = require('crypto-js');
const { MerkleTree } = require('merkletreejs');

/**
 * Convert a string to hexadecimal representation.
 * @param {string} str - The input string.
 * @returns {string} - The hexadecimal representation of the input string.
 */
const toHex = (str) => {
  return Buffer.from(str).toString('hex');
};

/**
 * Calculate the SHA-256 hash of a buffer using the crypto module.
 * @param {Buffer} buffer - The buffer.
 * @returns {string} - The SHA-256 hash of the buffer.
 */
const calculateSHA256 = (buffer) => {
  const hash = crypto.createHash('sha256');
  hash.update(buffer);
  return hash.digest('hex');
};

/**
 * Remove empty directories recursively.
 * @param {string} dir - The directory path.
 */
const removeEmptyDirectories = (dir) => {
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
class DataStoreManager {
  constructor(storeId) {
    if (storeId.length !== 64) {
      throw new Error('storeId must be a 64 char hex string');
    }
    this.storeId = storeId;
    this.storeBaseDir = path.join(require('os').homedir(), '.dig', 'stores');
    this.storeDir = path.join(this.storeBaseDir, this.storeId);

    if (!fs.existsSync(this.storeBaseDir)) {
      fs.mkdirSync(this.storeBaseDir, { recursive: true });
    }

    if (!fs.existsSync(this.storeDir)) {
      fs.mkdirSync(this.storeDir, { recursive: true });
    }

    this.files = new Map();
    this.tree = this._loadLatestTree();
  }

  /**
   * Load the manifest file.
   * @private
   */
  _loadManifest() {
    const manifestPath = path.join(this.storeDir, 'manifest.dat');
    if (fs.existsSync(manifestPath)) {
      return fs.readFileSync(manifestPath, 'utf8').trim().split('\n');
    }
    return [];
  }

  /**
   * Load the latest tree from the manifest file.
   * @private
   */
  _loadLatestTree() {
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
   * @param {string} storeDir - The store's directory path.
   * @param {string} sha256 - The SHA-256 hash of the buffer.
   * @returns {stream.Writable} - The write stream for the file.
   */
  _createWriteStream(storeDir, sha256) {
    const dataDir = path.join(storeDir, 'data');

    // Create the subdirectories and file path
    const subDirs = sha256.match(/.{1,2}/g);
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
   * @param {stream.Readable} readStream - The binary data stream.
   * @param {string} key - The key for the binary data.
   * @param {string} providedSha256 - The provided SHA-256 hash of the binary data.
   */
  async upsertKey(readStream, key, providedSha256) {
    const hexKey = toHex(key);
    const hash = crypto.createHash('sha256');
    const writeStream = this._createWriteStream(this.storeDir, providedSha256);

    readStream.on('data', (chunk) => {
      hash.update(chunk);
      writeStream.write(chunk);
    });

    readStream.on('end', () => {
      writeStream.end(() => {
        const calculatedSha256 = hash.digest('hex');

        if (calculatedSha256 !== providedSha256) {
          console.log(`SHA-256 mismatch for key: ${key}`);
          fs.unlinkSync(writeStream.path); // Delete the file if the hash doesn't match
          removeEmptyDirectories(path.dirname(writeStream.path)); // Remove empty directories
          return;
        }

        const combinedHash = SHA256(`${hexKey}/${providedSha256}`).toString();

        if (this.files.has(hexKey) && this.files.get(hexKey).hash === combinedHash) {
          console.log(`No changes detected for key: ${key}`);
          return;
        }

        if (this.files.has(hexKey)) {
          this.deleteKey(key);
        }

        console.log(`Adding key: ${key}, hexKey: ${hexKey}, combinedHash: ${combinedHash}`);
        this.files.set(hexKey, { hash: combinedHash, sha256: providedSha256 });
        this._rebuildTree();
      });
    });
  }

  /**
   * Delete a key from the Merkle tree.
   * @param {string} key - The key to delete.
   */
  deleteKey(key) {
    const hexKey = toHex(key);
    if (this.files.has(hexKey)) {
      console.log(`Deleting key: ${key}, hexKey: ${hexKey}`);
      this.files.delete(hexKey);
      this._rebuildTree();
    }
  }

  /**
   * List all keys in the Merkle tree.
   * @param {string} [rootHash] - The root hash of the tree. Defaults to the latest root hash.
   * @returns {Array<string>} - The list of keys.
   */
  listKeys(rootHash = null) {
    if (rootHash) {
      const tree = this.deserializeTree(rootHash);
      return Array.from(tree.files.keys());
    }
    return Array.from(this.files.keys());
  }

  /**
   * Rebuild the Merkle tree from the current files.
   * @private
   */
  _rebuildTree() {
    const leaves = Array.from(this.files.values()).map(({ hash }) => Buffer.from(hash, 'hex'));
    console.log(`Rebuilding tree with leaves: ${leaves.map(leaf => leaf.toString('hex'))}`);
    this.tree = new MerkleTree(leaves, SHA256, { sortPairs: true });
    console.log(`New Merkle Root: ${this.tree.getRoot().toString('hex')}`);
  }

  /**
   * Get the root of the Merkle tree.
   * @param {string} [rootHash] - The root hash of the tree. Defaults to the latest root hash.
   * @returns {string} - The Merkle root.
   */
  getRoot(rootHash = null) {
    if (rootHash) {
      const tree = this.deserializeTree(rootHash);
      return tree.getRoot().toString('hex');
    }
    return this.tree.getRoot().toString('hex');
  }

  /**
   * Serialize the Merkle tree to a JSON object.
   * @param {string} [rootHash] - The root hash of the tree. Defaults to the latest root hash.
   * @returns {Object} - The serialized Merkle tree.
   */
  serialize(rootHash = null) {
    if (rootHash) {
      const tree = this.deserializeTree(rootHash);
      return {
        root: tree.getRoot().toString('hex'),
        leaves: tree.getLeaves().map(leaf => leaf.toString('hex')),
        files: Object.fromEntries(tree.files)
      };
    }
    return {
      root: this.getRoot(),
      leaves: this.tree.getLeaves().map(leaf => leaf.toString('hex')),
      files: Object.fromEntries(this.files)
    };
  }

  /**
   * Deserialize a JSON object to a Merkle tree.
   * @param {string} rootHash - The root hash of the tree.
   * @returns {MerkleTree} - The deserialized Merkle tree.
   */
  deserializeTree(rootHash) {
    const treeFilePath = path.join(this.storeDir, `${rootHash}.dat`);
    if (!fs.existsSync(treeFilePath)) {
      throw new Error(`Tree file ${treeFilePath} does not exist`);
    }
    const data = JSON.parse(fs.readFileSync(treeFilePath, 'utf8'));
    const leaves = data.leaves.map(leaf => Buffer.from(leaf, 'hex'));
    const tree = new MerkleTree(leaves, SHA256, { sortPairs: true });
    tree.files = new Map(Object.entries(data.files).map(([key, value]) => [key, { hash: value.hash, sha256: value.sha256 }]));
    return tree;
  }

  /**
   * Commit the current state of the Merkle tree.
   */
  commit() {
    const rootHash = this.getRoot();
    const manifest = this._loadManifest();
    const latestRootHash = manifest.length > 0 ? manifest[manifest.length - 1] : null;

    if (rootHash === latestRootHash) {
      console.log('No changes to commit. Aborting commit.');
      return;
    }

    const manifestPath = path.join(this.storeDir, 'manifest.dat');
    fs.appendFileSync(manifestPath, `${rootHash}\n`);

    const treeFilePath = path.join(this.storeDir, `${rootHash}.dat`);
    if (!fs.existsSync(path.dirname(treeFilePath))) {
      fs.mkdirSync(path.dirname(treeFilePath), { recursive: true });
    }
    fs.writeFileSync(treeFilePath, JSON.stringify(this.serialize()));

    console.log(`Committed new root: ${rootHash}`);
  }

  /**
   * Clear pending changes and revert to the latest committed state.
   */
  clearPendingRoot() {
    this.tree = this._loadLatestTree();
    console.log('Reverted to the latest committed state.');
  }

  /**
   * Get a readable stream for a file based on its key.
   * @param {string} hexKey - The hexadecimal key of the file.
   * @param {string} [rootHash] - The root hash of the tree. Defaults to the latest root hash.
   * @returns {stream.Readable} - The readable stream for the file.
   */
  getValueStream(hexKey, rootHash = null) {
    let sha256;
    if (rootHash) {
      const tree = this.deserializeTree(rootHash);
      sha256 = tree.files.get(hexKey).sha256;
    } else {
      sha256 = this.files.get(hexKey).sha256;
    }

    if (!sha256) {
      throw new Error(`File with key ${hexKey} not found.`);
    }

    const filePath = path.join(this.storeDir, 'data', sha256.match(/.{1,2}/g).join('/'));

    if (!fs.existsSync(filePath)) {
      throw new Error(`File at path ${filePath} does not exist`);
    }

    return fs.createReadStream(filePath);
  }
}

// Example usage:
const folderPath = path.resolve('C:\\Users\\micha\\workspace\\sample-project\\dist'); // Replace with your folder path
const storeId = '782dd222ed9510e709ed700ad89e15e398550acf92e8d8ee285999019ff4873a'; // Replace with your storeId or generate one
const manager = new DataStoreManager(storeId);

/**
 * Recursively add all files in a directory to the Merkle tree.
 * @param {DataStoreManager} manager - The DataStoreManager instance.
 * @param {string} dirPath - The directory path.
 * @param {string} baseDir - The base directory for relative paths.
 */
const addDirectory = async (manager, dirPath, baseDir = dirPath) => {
  const files = fs.readdirSync(dirPath);

  for (const file of files) {
    const filePath = path.join(dirPath, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      await addDirectory(manager, filePath, baseDir);
    } else {
      const relativePath = path.relative(baseDir, filePath).replace(/\\/g, '/');
      const fileBuffer = fs.readFileSync(filePath);
      const sha256 = calculateSHA256(fileBuffer);
      await new Promise((resolve) => {
        const stream = fs.createReadStream(filePath);
        manager.upsertKey(stream, relativePath, sha256);
        stream.on('end', resolve);
      });
    }
  }
};

// Adding all files in a directory
addDirectory(manager, folderPath).then(() => {
  console.log('Merkle Root after adding directory:', manager.getRoot());

  // Listing keys
  console.log('Keys:', manager.listKeys());

  // Committing the tree
  manager.commit();

  // Clear pending changes and revert to the last saved root
  manager.clearPendingRoot();

  // Stream out one of the files to the console
  const keyToStream = '6173736574732f696e6465782d44697772675464612e637373'; // Replace with a valid key
  const stream = manager.getValueStream(keyToStream);
  stream.pipe(process.stdout);
});

module.exports = { DataStoreManager, addDirectory };
