import { Router } from "express";
import {
  getStoresIndex,
  getKeysIndex,
  getKey,
} from "../controllers/storeController";
import { verifyStoreId } from "../middleware/verifyStoreId";

const router = Router();

// Route to display the index of all stores
router.get("/", getStoresIndex);

// Route to display the index of keys or serve the index.html file if it exists
router.get("/:storeId", verifyStoreId, getKeysIndex);

// Route to stream the value of a specific key
router.get("/:storeId/*", verifyStoreId, getKey);

export { router as storeRoutes };
