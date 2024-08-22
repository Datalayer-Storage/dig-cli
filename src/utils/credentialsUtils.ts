import keytar from "keytar";
import * as readline from "readline";
import { Credentials } from "../types";

// Function to prompt for username and password
export const promptCredentials = async (origin: string): Promise<Credentials> => {
  // Check if credentials are already stored in keytar
  const storedUsername = await keytar.getPassword(origin, "username");
  const storedPassword = await keytar.getPassword(origin, "password");

  if (storedUsername && storedPassword) {
    console.log(`Using stored credentials for origin`);
    return { username: storedUsername, password: storedPassword };
  }

  // If not stored, prompt the user for credentials
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const askQuestion = (question: string): Promise<string> =>
    new Promise((resolve) => rl.question(question, resolve));

  const username = await askQuestion(`Enter your username for ${origin}: `);
  const password = await askQuestion(`Enter your password for ${origin}: `);

  // Ask if the user wants to store the credentials
  const storeCredentials = await askQuestion(
    `Would you like to store these credentials for later use? (y/n): `
  );

  rl.close();

  if (storeCredentials.toLowerCase() === "y") {
    await keytar.setPassword(origin, "username", username);
    await keytar.setPassword(origin, "password", password);
    console.log("Credentials stored securely.");
  }

  return { username, password };
};

export const clearCredentials = async (origin: string) => {
  const username = await keytar.getPassword(origin, "username");

  const usernameDeleted = await keytar.deletePassword(origin, "username");
  if (!usernameDeleted) {
    throw new Error('unable to delete username credential');
  }

  const passwordDeleted = await keytar.deletePassword(origin, "password");
  if (!passwordDeleted){
    throw new Error(`unable to delete password credential for user ${username}`);
  }

  if (usernameDeleted && passwordDeleted){
    console.log('Logged out of', origin);
  }
}
