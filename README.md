
# DataIntegrityTree

`DataIntegrityTree` is a TypeScript class designed to efficiently organize and manage any arbitrary file data using a Merkle tree. A Merkle tree is a cryptographic data structure that allows for secure and efficient verification of data integrity. By organizing files into a Merkle tree, `DataIntegrityTree` enables you to verify that a specific piece of data belongs to a dataset and ensures that the data has not been altered.

This class provides methods to store, retrieve, and verify data, making it particularly useful in scenarios where data integrity is critical, such as distributed systems, blockchain, or secure file storage.

## Store ID
The storeId is a 64-character hexadecimal string that uniquely represents a data store within DataIntegrityTree. This ID is crucial as it ensures that each data store is distinct and isolated. While the storeId can be generated from any source, it is important to ensure that storeIds are generated in a manner that guarantees their uniqueness. This can typically be achieved using cryptographic hash functions or UUIDs. The uniqueness of storeIds is vital to prevent data collisions and ensure that each data store maintains its integrity independently.

## Features

- **Upsert Key**: Store a binary stream, compress it, calculate its SHA-256 hash, and store it in a Merkle tree.
- **Verify Key Integrity**: Verify the integrity of a file based on its SHA-256 hash and check if it is part of a specified Merkle tree root.
- **Get Value Stream**: Retrieve a readable stream of a stored file, with automatic decompression.
- **Merkle Tree Management**: Rebuild, serialize, deserialize, and commit Merkle trees.
- **Proof and Verification**: Generate proofs for files and verify them against the Merkle tree.
- **Delete Operations**: Delete individual keys or all keys in the Merkle tree.

## Filesystem Structure

The `DataIntegrityTree` class organizes files in a hierarchical directory structure to efficiently manage a large number of files. This approach enhances performance and scalability, especially when dealing with millions of files.

### Storage Modes

- **Local Mode**: In local mode, the data directory is specific to each store. Data is stored inside the `storeDir/storeId/data` directory, which is structured using the first few characters of each file’s SHA-256 hash. This creates multiple levels of directories to prevent overloading any single directory.
  
- **Unified Mode**: In unified mode, the data directory is shared across all stores, residing in the `storeDir/data` directory. Files are still organized using their SHA-256 hash to ensure efficient storage and retrieval.

### Manifest File

The manifest file (`manifest.dat`) stores the history of Merkle tree root hashes. It is located directly under the store's directory. Each line in the manifest file corresponds to a different state of the Merkle tree.

### Merkle Tree Data Files

Serialized Merkle trees are stored as `.dat` files named after their root hash. This allows the `DataIntegrityTree` to load the state of the Merkle tree at any given point in time.

### Binary Files Storage

Binary files are stored in a directory structure that reflects the first few characters of their SHA-256 hash, with each level of the directory corresponding to two characters from the hash. This structure efficiently distributes files across the filesystem, enhancing performance when dealing with large datasets.

## Usage

### Importing and Initializing

```typescript
import { DataIntegrityTree } from './DataIntegrityTree';

const storeId = 'a'.repeat(64); // A 64-character hexadecimal string
const dataLayer = new DataIntegrityTree(storeId, { storageMode: 'local' });
```

### Upsert a Key

Store a binary stream in the Merkle tree:

```typescript
import { Readable } from 'stream';

const data = "This is some test data";
const readStream = Readable.from([data]);

dataLayer.upsertKey(readStream, 'test_key')
  .then(() => console.log('Key upserted successfully'))
  .catch(err => console.error('Error upserting key:', err));
```

### Verify Key Integrity

Verify the integrity of a stored file:

```typescript
const sha256 = crypto.createHash("sha256").update(data).digest("hex");
const rootHash = dataLayer.getRoot();

dataLayer.verifyKeyIntegrity(sha256, rootHash)
  .then(isValid => {
    if (isValid) {
      console.log('File integrity verified.');
    } else {
      console.log('File integrity verification failed.');
    }
  })
  .catch(err => console.error('Error verifying key integrity:', err));
```

### Get a Value Stream

Retrieve and decompress a stored file:

```typescript
const hexKey = Buffer.from('test_key').toString('hex');
const fileStream = dataLayer.getValueStream(hexKey);

fileStream.on('data', chunk => {
  console.log('Received chunk:', chunk.toString());
});

fileStream.on('end', () => {
  console.log('File streaming completed.');
});
```

### Commit the Merkle Tree

Commit the current state of the Merkle tree:

```typescript
const rootHash = dataLayer.commit();
console.log('Committed Merkle tree with root hash:', rootHash);
```

### Generate and Verify Proofs

Generate a proof for a file and verify it:

```typescript
const proof = dataLayer.getProof(hexKey, sha256);
const isValid = dataLayer.verifyProof(proof, sha256);

if (isValid) {
  console.log('Proof verified successfully.');
} else {
  console.log('Proof verification failed.');
}
```

### Delete Keys and Leaves

Delete a key or all keys in the Merkle tree:

```typescript
dataLayer.deleteKey('test_key');
console.log('Key deleted.');

dataLayer.deleteAllLeaves();
console.log('All leaves deleted from the Merkle tree.');
```

### Get Root Difference

Compare two Merkle tree roots:

```typescript
const diff = dataLayer.getRootDiff(rootHash1, rootHash2);
console.log('Added keys:', Array.from(diff.added.keys()));
console.log('Deleted keys:', Array.from(diff.deleted.keys()));
```

## Methods

- **constructor(storeId: string, options: DataIntegrityTreeOptions = {})**: Initializes a new `DataIntegrityTree` instance.
- **upsertKey(readStream: Readable, key: string): Promise<void>**: Stores a binary stream in the Merkle tree.
- **verifyKeyIntegrity(sha256: string, rootHash: string): Promise<boolean>**: Verifies the integrity of a file and checks if it is part of the specified Merkle root.
- **getValueStream(hexKey: string, rootHash?: string): Readable**: Retrieves a readable stream for a file.
- **commit(): string**: Commits the current state of the Merkle tree.
- **getProof(hexKey: string, sha256: string, rootHash?: string): string**: Generates a proof for a file.
- **verifyProof(proofObjectHex: string, sha256: string): boolean**: Verifies a proof against the Merkle tree.
- **deleteKey(key: string): void**: Deletes a key from the Merkle tree.
- **deleteAllLeaves(): void**: Deletes all keys from the Merkle tree.
- **getRootDiff(rootHash1: string, rootHash2: string): { added: Map<string, string>, deleted: Map<string, string> }**: Compares two Merkle tree roots.
- **getRoot(): string**: Returns the root hash of the Merkle tree.
- **serialize(rootHash?: string): object**: Serializes the Merkle tree to a JSON object.
- **deserializeTree(rootHash: string): MerkleTree**: Deserializes a JSON object to a Merkle tree.
- **clearPendingRoot(): void**: Clears pending changes and reverts to the latest committed state.

## License

This project is licensed under the MIT License.
