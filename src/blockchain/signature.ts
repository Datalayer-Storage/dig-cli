import { signMessage } from "datalayer-driver";
import { getMasterSecretKey } from "./keys";


export const createStoreAuthorizationSig = async (storeId: string, nonce: string): Promise<string> => {
    const message = `Signing this message to verify store authorization: ${storeId}\n\nPublic Key: \n\nNonce: ${nonce}`;
    const secretKey = await getMasterSecretKey();
    const signature = signMessage(Buffer.from(message, "utf-8"), secretKey);
    return signature.toString("hex");
}