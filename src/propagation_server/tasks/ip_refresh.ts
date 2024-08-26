import { SimpleIntervalJob, Task } from "toad-scheduler";
import { getPublicIpAddress } from "../../utils/network";
import { NconfManager } from "../../utils/nconfManager";

const PUBLIC_IP_KEY = "publicIp";

// Function to save the public IP address to nconf
const savePublicIp = async (): Promise<void> => {
  const nconfManager = new NconfManager("config.json"); // Assuming you have a config file named config.json
  try {
    const publicIp = await getPublicIpAddress();
    if (publicIp) {
      await nconfManager.setConfigValue(PUBLIC_IP_KEY, publicIp);
      console.log(`Public IP address saved: ${publicIp}`);
    } else {
      console.warn("No public IP address found.");
    }
  } catch (error: any) {
    console.error(`Failed to retrieve public IP address: ${error.message}`);
  }
};

// Task that runs at a regular interval to save the public IP
const task = new Task("save-public-ip", async () => {
  console.log("Starting save-public-ip task...");
  await savePublicIp();
  console.log("save-public-ip task completed.");
});

const job = new SimpleIntervalJob(
  {
    days: 7,
    runImmediately: true,
  },
  task,
  { id: "save-public-ip", preventOverrun: true }
);

export default job;
