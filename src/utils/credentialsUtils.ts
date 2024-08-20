import keytar from "keytar";
import * as readline from "readline";
import { Credentials } from "../types";

// Function to prompt for username and password
export const promptCredentials = async (host: string): Promise<Credentials> => {
  // Check if credentials are already stored in keytar
  const storedUsername = await keytar.getPassword(host, "username");
  const storedPassword = await keytar.getPassword(host, "password");

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

  const username = await askQuestion(`Enter your username for ${host}: `);
  const password = await askQuestion(`Enter your password for ${host}: `);

  // Ask if the user wants to store the credentials
  const storeCredentials = await askQuestion(
    `Would you like to store these credentials for later use? (y/n): `
  );

  rl.close();

  if (storeCredentials.toLowerCase() === "y") {
    await keytar.setPassword(host, "username", username);
    await keytar.setPassword(host, "password", password);
    console.log("Credentials stored securely.");
  }

  return { username, password };
};
