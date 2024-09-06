import { NconfManager } from "../../utils/NconfManager";
import { IncentiveProgramData } from "../../types";

class IncentiveProgram {
  private data: IncentiveProgramData;
  private static nconfManager = new NconfManager('payment_programs.json');
  private static blacklistManager = new NconfManager('blacklist.json');

  // Private constructor to prevent direct instantiation
  private constructor(data: IncentiveProgramData) {
    this.data = data;
  }

  // Static method to load an existing IncentiveProgram
  public static async from(storeId: string): Promise<IncentiveProgram | null> {
    const programData = await this.nconfManager.getConfigValue<IncentiveProgramData>(storeId);
    if (programData) {
      return new IncentiveProgram(programData);
    }
    return null;
  }

  // Static method to create a new IncentiveProgram
  public static async create(data: IncentiveProgramData): Promise<IncentiveProgram> {
    const existingProgram = await this.from(data.storeId);
    if (existingProgram) {
      throw new Error(`IncentiveProgram for storeId ${data.storeId} already exists.`);
    }
    await this.nconfManager.setConfigValue(data.storeId, data);
    return new IncentiveProgram(data);
  }

  // Getters for the data properties
  public get storeId(): string {
    return this.data.storeId;
  }

  public get xchRewardPerEpoch(): number {
    return this.data.xchRewardPerEpoch;
  }

  public get totalRoundsCompleted(): number | undefined {
    return this.data.totalRoundsCompleted;
  }

  public get paymentTotalToDate(): number | undefined {
    return this.data.paymentTotalToDate;
  }

  public get active(): boolean {
    return this.data.active;
  }

  public get lastEpochPaid(): number | undefined {
    return this.data.lastEpochPaid;
  }

  public get walletName(): string {
    return this.data.walletName;
  }

  // Method to activate the incentive program
  public async activate(): Promise<void> {
    this.data.active = true;
    await this.save();
  }

  // Method to pause the incentive program
  public async pause(): Promise<void> {
    this.data.active = false;
    await this.save();
  }

  // Method to delete the incentive program
  public async delete(): Promise<void> {
    await IncentiveProgram.nconfManager.deleteConfigValue(this.data.storeId);
    await IncentiveProgram.blacklistManager.deleteConfigValue(this.data.storeId);
  }

  // Method to set the reward per epoch
  public async setReward(xchRewardPerEpoch: number): Promise<void> {
    this.data.xchRewardPerEpoch = xchRewardPerEpoch;
    await this.save();
  }

  // Method to increment the paymentTotalToDate by a specific amount
  public async incrementPaymentTotal(amount: number): Promise<void> {
    this.data.paymentTotalToDate = (this.data.paymentTotalToDate || 0) + amount;
    await this.save();
  }

  // Method to increment the totalRoundsCompleted by a specific number
  public async incrementTotalRoundsCompleted(count: number): Promise<void> {
    this.data.totalRoundsCompleted = (this.data.totalRoundsCompleted || 0) + count;
    await this.save();
  }

  // Method to set the lastEpochPaid and reset blacklist if necessary
  public async setLastEpochPaid(epoch: number): Promise<void> {
    if (this.data.lastEpochPaid !== epoch) {
      this.data.lastEpochPaid = epoch;
      // Reset the blacklist for this store ID
      await IncentiveProgram.blacklistManager.setConfigValue(this.data.storeId, []);
    }
    await this.save();
  }

  public async getBlacklist(): Promise<string[]> {
    const blacklist: string[] = await IncentiveProgram.blacklistManager.getConfigValue<string[]>(this.data.storeId) || [];
    return blacklist;
  }

  // Method to add an IP address to the blacklist
  public async addToBlacklist(ipAddress: string): Promise<void> {
    const currentBlacklist: string[] = await IncentiveProgram.blacklistManager.getConfigValue(this.data.storeId) || [];
    if (!currentBlacklist.includes(ipAddress)) {
      currentBlacklist.push(ipAddress);
      await IncentiveProgram.blacklistManager.setConfigValue(this.data.storeId, currentBlacklist);
    }
  }

  // Private method to save the current state of the incentive program to nconf
  private async save(): Promise<void> {
    await IncentiveProgram.nconfManager.setConfigValue(this.data.storeId, this.data);
  }

  public async runContest() {
    
  }
}

export { IncentiveProgram, IncentiveProgramData };
