import fs from "fs";
import { askForStoreDetails } from "../prompts";
import { mintDataLayerStore } from "./datastore";
import { waitForConfirmation } from "./coins";
import { getPeer } from "./peer";
import { getCoinId } from "datalayer-driver";
import { CreateStoreUserInputs } from "../types";

export async function createDataLayerStore(inputs: CreateStoreUserInputs = {}) {
  const finalInputs = await askForStoreDetails(inputs);

  try {
    const newStoreCoin = await mintDataLayerStore(
      finalInputs.label!,
      finalInputs.description!,
      BigInt(0),
      finalInputs.authorizedWriter
    );

    console.log("Store submitted to mempool");
    console.log(`Store ID: ${newStoreCoin.launcherId.toString("hex")}`);

    try {
      const peer = await getPeer();

      console.log(`Coin ID: ${getCoinId(newStoreCoin.coin).toString("hex")}`);
      await waitForConfirmation(peer, newStoreCoin.coin.parentCoinInfo);
    } catch (error: any) {
      console.error(error.message);
    }

    return newStoreCoin;
  } catch (error) {
    console.error("Failed to mint Data Layer Store:", error);
  }
}
