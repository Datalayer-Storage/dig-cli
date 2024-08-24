import { Router } from "express";
import {
  headStore,
  getStore,
  putStore,
} from "../controllers/merkleTreeController";


const router = Router();

// Route to handle HEAD, GET, and PUT requests for /stores/:storeId
router.head("/:storeId", headStore);
router.get("/:storeId/*", getStore);
router.put("/:storeId/*", putStore);


export { router as storeRoutes };
