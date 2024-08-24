import express from "express";
import { storeRoutes } from "./routes";
import { verifyStoreId } from "./middleware";

const app = express();
const PORT = process.env.PORT || 3000;

// Apply store routes
app.use("/:storeId", verifyStoreId);
app.use("/", storeRoutes);

export { app, PORT };
