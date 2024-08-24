import { Request, Response, NextFunction } from "express";

export const verifyStoreId = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { storeId } = req.params;
    const referrer = req.get("Referrer");

    let expectedStoreId: string | null = null;

    if (referrer) {
      const referrerPath = new URL(referrer).pathname.split("/");
      if (referrerPath.length > 1 && /^[a-f0-9]{64}$/.test(referrerPath[1])) {
        expectedStoreId = referrerPath[1];
      }
    }

    if (storeId.length !== 64) {
      if (expectedStoreId) {
        return res.redirect(302, `/${expectedStoreId}${req.originalUrl}`);
      } else {
        return res.status(400).send("Invalid store ID format.");
      }
    }

    next();
  } catch (error) {
    console.error("Error in verifyStoreId middleware:", error);
    res.status(500).send("An error occurred while verifying the store ID.");
  }
};
