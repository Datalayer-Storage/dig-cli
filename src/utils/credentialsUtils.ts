import keytar from "keytar";
import * as readline from "readline";
import { randomBytes } from "crypto";
import { Credentials } from "../types";

// Function to prompt for username and password
export const promptCredentials = async (remote: string): Promise<Credentials> => {
  // Check if credentials are already stored in keytar
  const storedUsername = await keytar.getPassword(remote, "username");
  const storedPassword = await keytar.getPassword(remote, "password");

  if (storedUsername && storedPassword) {
    console.log(`Using stored credentials for remote`);
    return { username: storedUsername, password: storedPassword };
  }

  // If not stored, prompt the user for credentials
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const askQuestion = (question: string): Promise<string> =>
    new Promise((resolve) => rl.question(question, resolve));

  const username = await askQuestion(`Enter your username for ${remote}: `);
  const password = await askQuestion(`Enter your password for ${remote}: `);

  // Ask if the user wants to store the credentials
  const storeCredentials = await askQuestion(
    `Would you like to store these credentials for later use? (y/n): `
  );

  rl.close();

  if (storeCredentials.toLowerCase() === "y") {
    await keytar.setPassword(remote, "username", username);
    await keytar.setPassword(remote, "password", password);
    console.log("Credentials stored securely.");
  }

  return { username, password };
};

export const clearCredentials = async (remote: string) => {
  const username = await keytar.getPassword(remote, "username");

  const usernameDeleted = await keytar.deletePassword(remote, "username");
  if (!usernameDeleted) {
    throw new Error('unable to delete username credential');
  }

  const passwordDeleted = await keytar.deletePassword(remote, "password");
  if (!passwordDeleted){
    throw new Error(`unable to delete password credential for user ${username}`);
  }

  if (usernameDeleted && passwordDeleted){
    console.log('Logged out of', remote);
  }
}

export function generateHighEntropyValue(length: number = 10): string {
  const possibleChars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()-_=+[]{}|;:',.<>?/~`";
  const charSetSize = possibleChars.length;
  let result = "";
  let remainingBytes = randomBytes(length * 2); // Generate more random bytes than needed

  for (let i = 0; i < length; i++) {
    let randomValue;
    do {
      if (remainingBytes.length < 1) {
        remainingBytes = randomBytes(length * 2); // Refill the buffer if it runs out
      }
      randomValue = remainingBytes[0];
      remainingBytes = remainingBytes.slice(1); // Remove the used byte
    } while (randomValue >= charSetSize * Math.floor(256 / charSetSize)); // Discard biased values

    const randomIndex = randomValue % charSetSize;
    result += possibleChars.charAt(randomIndex);
  }

  return result;
}