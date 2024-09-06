import path from 'path';
import { sampleSize } from 'lodash';
import { SimpleIntervalJob, Task } from "toad-scheduler";
import { ServerCoin } from "../../blockchain/ServerCoin";
import { getStoresList } from "../../utils/config";
import { Mutex } from "async-mutex";
import { IncentiveProgram } from "../utils/IncentiveProgram";
import { DataIntegrityTree, DataIntegrityTreeOptions } from "../../DataIntegrityTree";
import { hexToUtf8 } from "../utils/hexUtils";
import { DigPeer } from '../../DigNetwork';
import { DataStore } from '../../blockchain';

const mutex = new Mutex();

const roundsPerEpoch = 1008; // 1 round every 10 mins starting on the first hour of the epoch

const runIncentiveProgram = async (program: IncentiveProgram, currentEpoch: number): Promise<void> => {
  if (!process.env.DIG_FOLDER_PATH) {
    throw new Error("DIG_FOLDER_PATH environment variable not set.");
  }
  
  const options: DataIntegrityTreeOptions = {
    storageMode: "local",
    storeDir: path.resolve(process.env.DIG_FOLDER_PATH, "stores"),
  };

  const datalayer = new DataIntegrityTree(program.storeId, options);

  // If your running an incentive program you must have your own copy of the store you want to incentivize
  // to ensure there is at least one peer everyone can download the latest store from. Dont penalize anyone if
  // you cant even keep your house in order.
  const dataStore = DataStore.from(program.storeId);
  const storeIntegrityCheck = await dataStore.validate();
  
  if (!storeIntegrityCheck) {
    throw new Error(`Store ${program.storeId} failed integrity check.`);
  } 

  if (program.active) {
    const rewardThisRound = program.xchRewardPerEpoch / roundsPerEpoch;
    const peerBlackList = await program.getBlacklist();
    const serverCoin = new ServerCoin(program.storeId);

    let winningPeer: DigPeer | null = null;

    while (!winningPeer) {
      let serverCoins = await serverCoin.sampleCurrentEpoch(5, peerBlackList);

      if (serverCoins.length === 0) {
        throw new Error(`No peers available for storeId ${program.storeId}`);
      }

      const latestRootHash = datalayer.getRoot();
      const storeKeys = datalayer.listKeys();
      const randomKeysHex = sampleSize(storeKeys, 5);
      const randomKeys = randomKeysHex.map(hexToUtf8);

      if (randomKeys.length === 0) {
        throw new Error("No keys found.");
      }

      console.log(`Running contest for store ${program.storeId}...`);

      const peerValidationPromises = serverCoins.map(async (peerIp) => {
        const digPeer = new DigPeer(peerIp, program.storeId);
        const valid = await digPeer.validateStore(latestRootHash, randomKeys);
        if (valid) {
          return digPeer;
        } else {
          await program.addToBlacklist(peerIp);
          return null;
        }
      });

      winningPeer = await Promise.race(peerValidationPromises.filter(p => p !== null));

      if (!winningPeer) {
        console.log("No valid peers found, resampling...");
      }
    }

    // Send payout to winning peer.
    console.log(`Sending ${rewardThisRound} XCH to ${winningPeer.IpAddress} for store ${program.storeId}...`);

    await winningPeer.sendPayment(program.walletName, rewardThisRound);

    await program.setLastEpochPaid(currentEpoch);
    await program.incrementTotalRoundsCompleted(1);
    await program.incrementPaymentTotal(rewardThisRound);
  }
}

// Function to run payouts for all stores
const runPayouts = async (): Promise<void> => {
  const currentEpoch = ServerCoin.getCurrentEpoch();
  const storeList = getStoresList();

  for (const storeId of storeList) {
    const program = await IncentiveProgram.from(storeId);
    if (program) {
      await runIncentiveProgram(program, currentEpoch);
    }
  }
};

// Task that runs at a regular interval to save the public IP
const task = new Task("payouts", async () => {
  if (!mutex.isLocked()) {
    const releaseMutex = await mutex.acquire();
    try {
      console.log("Starting payouts task...");
      await runPayouts();
      console.log("payouts task completed.");
    } catch (error: any) {
      console.error(`Error in payouts task: ${error.message}`);
    } finally {
      releaseMutex();
    }
  }
});

const job = new SimpleIntervalJob(
  {
    minutes: 10,
    runImmediately: true,
  },
  task,
  { id: "payouts", preventOverrun: true }
);

export default job;
