import http from "http";
import { URL } from "url";
import { Readable } from "stream";

export class ContentServer {
  private ipAddress: string;
  private storeId: string;
  private static readonly port = 80;

  constructor(ipAddress: string, storeId: string) {
    this.ipAddress = ipAddress;
    this.storeId = storeId;
  }

  // Method to get the content of a specified key from the peer
  public async getKey(key: string): Promise<string> {
    const url = `http://${this.ipAddress}:${ContentServer.port}/${this.storeId}/${key}`;
    return this.fetchWithRetries(url);
  }

  // Method to get the payment address from the peer
  public async getPaymentAddress(): Promise<string> {
    console.log(`Fetching payment address from peer ${this.ipAddress}...`);

    try {
      const wellKnown = await this.getWellKnown();
      return wellKnown.xch_address;
    } catch (error: any) {
      console.error(
        `Failed to fetch payment address from ${this.ipAddress}: ${error.message}`
      );
      throw new Error(`Failed to fetch payment address: ${error.message}`);
    }
  }

  // Method to get the .well-known information
  public async getWellKnown(): Promise<any> {
    const url = `http://${this.ipAddress}:${ContentServer.port}/.well-known`;
    return this.fetchJson(url);
  }

  // Method to get the list of known stores
  public async getKnownStores(): Promise<any> {
    const url = `http://${this.ipAddress}:${ContentServer.port}/.well-known/stores`;
    return this.fetchJson(url);
  }

  // Method to get the index of all stores
  public async getStoresIndex(): Promise<any> {
    const url = `http://${this.ipAddress}:${ContentServer.port}/`;
    return this.fetchJson(url);
  }

  // Method to get the index of keys in a store
  public async getKeysIndex(): Promise<any> {
    const url = `http://${this.ipAddress}:${ContentServer.port}/${this.storeId}`;
    return this.fetchJson(url);
  }

  // Method to check if a specific key exists (HEAD request)
  public async headKey(key: string): Promise<boolean> {
    const url = `http://${this.ipAddress}:${ContentServer.port}/${this.storeId}/${key}`;
    return this.head(url);
  }

  // Method to check if a specific store exists (HEAD request)
  public async headStore(): Promise<boolean> {
    const url = `http://${this.ipAddress}:${ContentServer.port}/${this.storeId}`;
    return this.head(url);
  }

  public streamKey(key: string): Promise<Readable> {
    return new Promise((resolve, reject) => {
      const url = `http://${this.ipAddress}:${ContentServer.port}/${this.storeId}/${key}`;
      const urlObj = new URL(url);

      const requestOptions = {
        hostname: urlObj.hostname,
        port: urlObj.port || ContentServer.port,
        path: urlObj.pathname + urlObj.search,
        method: "GET",
      };

      const request = http.request(requestOptions, (response) => {
        if (response.statusCode === 200) {
          resolve(response); // Resolve with the readable stream
        } else if (response.statusCode === 301 || response.statusCode === 302) {
          // Handle redirects
          const redirectUrl = response.headers.location;
          if (redirectUrl) {
            this.streamKey(redirectUrl).then(resolve).catch(reject);
          } else {
            reject(new Error("Redirected without a location header"));
          }
        } else {
          reject(
            new Error(
              `Failed to retrieve data from ${url}. Status code: ${response.statusCode}`
            )
          );
        }
      });

      request.on("error", (error) => {
        console.error(`Request error for ${url}:`, error);
        reject(error);
      });

      request.end();
    });
  }

  // Helper method to perform HEAD requests
  private async head(url: string): Promise<boolean> {
    return new Promise<boolean>((resolve, reject) => {
      const urlObj = new URL(url);

      const requestOptions = {
        hostname: urlObj.hostname,
        port: urlObj.port || ContentServer.port,
        path: urlObj.pathname + urlObj.search,
        method: "HEAD",
      };

      const request = http.request(requestOptions, (response) => {
        if (response.statusCode === 200) {
          resolve(true);
        } else {
          resolve(false);
        }
      });

      request.on("error", (error) => {
        console.error(`Request error for ${url}:`, error);
        reject(false);
      });

      request.end();
    });
  }

  // Helper method to fetch JSON data from a URL
  private async fetchJson(url: string): Promise<any> {
    const response = await this.fetchWithRetries(url);
    return JSON.parse(response);
  }

  // Helper method to fetch content with retries and redirection handling
  private async fetchWithRetries(url: string): Promise<string> {
    let attempt = 0;
    const maxRetries = 5;
    const initialDelay = 2000; // 2 seconds
    const maxDelay = 10000; // 10 seconds
    const delayMultiplier = 1.5;
    let delay = initialDelay;

    while (attempt < maxRetries) {
      try {
        return await this.fetch(url);
      } catch (error: any) {
        if (attempt < maxRetries - 1) {
          console.warn(
            `Attempt ${attempt + 1} failed: ${error.message}. Retrying in ${
              delay / 1000
            } seconds...`
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
          delay = Math.min(maxDelay, delay * delayMultiplier);
        } else {
          console.error(`Failed to retrieve data from ${url}. Aborting.`);
          throw new Error(`Failed to retrieve data: ${error.message}`);
        }
      }
      attempt++;
    }
    throw new Error(`Failed to retrieve data from ${url} after ${maxRetries} attempts.`);
  }

  // Core method to fetch content from a URL
  private async fetch(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);

      const requestOptions = {
        hostname: urlObj.hostname,
        port: urlObj.port || ContentServer.port,
        path: urlObj.pathname + urlObj.search,
        method: "GET",
      };

      const request = http.request(requestOptions, (response) => {
        let data = "";

        if (response.statusCode === 200) {
          response.on("data", (chunk) => {
            data += chunk;
          });

          response.on("end", () => {
            resolve(data);
          });
        } else if (response.statusCode === 301 || response.statusCode === 302) {
          // Handle redirects
          const redirectUrl = response.headers.location;
          if (redirectUrl) {
            this.fetch(redirectUrl).then(resolve).catch(reject);
          } else {
            reject(new Error("Redirected without a location header"));
          }
        } else {
          reject(
            new Error(
              `Failed to retrieve data from ${url}. Status code: ${response.statusCode}`
            )
          );
        }
      });

      request.on("error", (error) => {
        console.error(`Request error for ${url}:`, error);
        reject(error);
      });

      request.end();
    });
  }
}
