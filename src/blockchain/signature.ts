import { signMessage, verifySignedMessage } from "datalayer-driver";
import { getPrivateSyntheticKey } from "./keys";


export const createKeyOwnershipSignature = async (nonce: string): Promise<string> => {
    const message = `Signing this message to prove ownership of key.\n\nNonce: ${nonce}`;
    const privateSyntheticKey = await getPrivateSyntheticKey();
    const signature = signMessage(Buffer.from(message, "utf-8"), privateSyntheticKey);
    console.log(signature.toString("hex"));
    console.log(signature.length)
    return signature.toString("hex");
}

export const verifyKeyOwnershipSignature = async (nonce: string, signature: string, publicKey: string): Promise<boolean> => {
    const message = `Signing this message to prove ownership of key.\n\nNonce: ${nonce}`;
    return verifySignedMessage(Buffer.from(signature, "hex"),  Buffer.from(publicKey, "hex"), Buffer.from(message, "utf-8"));
}