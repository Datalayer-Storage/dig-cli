import express from "express";
import {
  headStore,
  getStore,
  putStore,
} from "../controllers/merkleTreeController";

import { setMnemonic } from "../controllers/configController";


const router = express.Router();

router.post("/mnemonic", express.json(), setMnemonic);

// Route to handle HEAD, GET, and PUT requests for /stores/:storeId
router.head("/:storeId", headStore);
router.get("/:storeId/*", getStore);
router.put("/:storeId/*", putStore);


export { router as storeRoutes };
