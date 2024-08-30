import { Request, Response, NextFunction } from "express";
import { renderUnknownChainView } from "../views";
import { getLatestStoreInfo } from "../../blockchain/datastore";

const validChainNames = ["chia"]; // List of valid chain names

export const parseUdi = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // Skip verification if the route is under the .well-known root
    if (req.originalUrl.startsWith("/.well-known")) {
      return next();
    }

    const pathSegment = req.params.storeId || ""; // Expecting storeId to be the first path segment
    const referrer = req.get("Referer") || "";

    let chainName: string | null = null;
    let storeId: string = "";
    let rootHash: string | null = null;

    // Split the pathSegment by periods to extract potential components
    const parts = pathSegment.split(".");

    if (parts.length === 3) {
      chainName = parts[0];
      storeId = parts[1];
      rootHash = parts[2];
    } else if (parts.length === 2) {
      if (parts[0].length === 64) {
        storeId = parts[0];
        rootHash = parts[1];
      } else {
        chainName = parts[0];
        storeId = parts[1];
      }
    } else if (parts.length === 1) {
      storeId = parts[0];
    }

    // Handle missing storeId by redirecting to referrer + path
    if (!storeId || storeId.length !== 64) {
      if (referrer) {
        return res.redirect(302, referrer + req.originalUrl);
      }
      return res.status(400).send("Invalid or missing storeId.");
    }

    // Early exit: If both chainName and rootHash are missing, redirect with both added
    if (!chainName && !rootHash) {
      const storeInfo = await getLatestStoreInfo(Buffer.from(storeId, "hex"));
      rootHash = storeInfo.latestInfo.metadata.rootHash.toString("hex");
      return res.redirect(302, `/chia.${storeId}.${rootHash}`);
    }

    // If chainName is missing, redirect with "chia" added
    if (!chainName) {
      return res.redirect(302, `/chia.${pathSegment}`);
    }

    // Validate the chainName
    if (!validChainNames.includes(chainName)) {
      return res.status(400).send(renderUnknownChainView(storeId, chainName));
    }

    // If rootHash is missing, fetch it and redirect with the rootHash added
    if (!rootHash) {
      const storeInfo = await getLatestStoreInfo(Buffer.from(storeId, "hex"));
      rootHash = storeInfo.latestInfo.metadata.rootHash.toString("hex");
      return res.redirect(302, `/${chainName}.${storeId}.${rootHash}`);
    }

    // Attach extracted components to the request object
    // @ts-ignore
    req.chainName = chainName;
    // @ts-ignore
    req.storeId = storeId;
    // @ts-ignore
    req.rootHash = rootHash;

    next();
  } catch (error) {
    console.error("Error in parseUdi middleware:", error);
    res.status(500).send("An error occurred while verifying the identifier.");
  }
};
