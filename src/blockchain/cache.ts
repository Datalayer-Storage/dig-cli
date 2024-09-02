import fs from "fs";
import path from "path";
import { DataStore } from "datalayer-driver";
import { STORE_PATH } from "../utils/config";
import { serializeStoreInfo, deserializeStoreInfo } from "./serialization";

// Define a file path to store the cached data
export const getCacheFilePath = (launcherId: string): string => {
  return path.join(STORE_PATH, `${launcherId}.json`);
};

// Function to get cached store info
export const getCachedStoreInfo = (
  launcherId: string
): {
  latestStore: DataStore;
  latestHeight: number;
  latestHash: Buffer;
} | null => {
  const cacheFilePath = getCacheFilePath(launcherId);

  // If the cache file doesn't exist, return null
  if (!fs.existsSync(cacheFilePath)) {
    return null;
  }

  // Deserialize the store info from the cache file
  return deserializeStoreInfo(cacheFilePath);
};

// Function to cache the store info
export const cacheStoreInfo = (
  launcherId: string,
  storeInfo: DataStore,
  latestHeight: number,
  latestHash: Buffer
): void => {
  const cacheFilePath = getCacheFilePath(launcherId);

  // Serialize the store info and write it to the cache file
  const serializedData = JSON.stringify({
    latestStore: serializeStoreInfo(storeInfo),
    latestHeight,
    latestHash: latestHash.toString("base64"),
  });

  fs.writeFileSync(cacheFilePath, serializedData);
};
