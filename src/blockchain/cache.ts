import fs from "fs";
import path from "path";
import { DataStoreInfo } from "datalayer-driver";
import { DIG_FOLDER_PATH } from "../utils/config";
import { serializeStoreInfo, deserializeStoreInfo } from "./serialization";

// Define a file path to store the cached data
export const getCacheFilePath = (launcherId: string): string => {
  return path.join(DIG_FOLDER_PATH, `${launcherId}.json`);
};

// Function to get cached store info
export const getCachedStoreInfo = (launcherId: string): { latestInfo: DataStoreInfo, latestHeight: number, latestHash: Buffer } | null => {
  const cacheFilePath = getCacheFilePath(launcherId);

  // If the cache file doesn't exist, return null
  if (!fs.existsSync(cacheFilePath)) {
    return null;
  }

  // Deserialize the store info from the cache file
  return deserializeStoreInfo(cacheFilePath);
};

// Function to cache the store info
export const cacheStoreInfo = (launcherId: string, storeInfo: DataStoreInfo, latestHeight: number, latestHash: Buffer): void => {
  const cacheFilePath = getCacheFilePath(launcherId);

  // Serialize the store info and write it to the cache file
  const serializedData = JSON.stringify({
    latestInfo: serializeStoreInfo(storeInfo),
    latestHeight,
    latestHash: latestHash.toString("base64")
  });

  fs.writeFileSync(cacheFilePath, serializedData);
};


