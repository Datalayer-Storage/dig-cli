import express from "express";
import {
  headStore,
  getStore,
  putStore,
} from "../controllers/merkleTreeController";

import { setMnemonic } from "../controllers/configController";
import { verifyMnemonic } from "../middleware/verifyMnemonic";


const router = express.Router();

router.post("/mnemonic", express.json(), setMnemonic);

// Route to handle HEAD, GET, and PUT requests for /stores/:storeId
router.head("/:storeId", verifyMnemonic, headStore);
router.get("/:storeId/*", getStore);
router.put("/:storeId/*", putStore);


export { router as storeRoutes };
