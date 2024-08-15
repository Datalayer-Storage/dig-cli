import inquirer from "inquirer";
import * as bip39 from "bip39";
import { CreateStoreUserInputs } from "./types";

export const askForStoreDetails = async (
  inputs: CreateStoreUserInputs = {}
): Promise<CreateStoreUserInputs> => {
  const questions: any = [];

  if (!inputs.label) {
    questions.push({
      type: "input",
      name: "label",
      message: "Enter the label for the data layer store:",
      validate: (input: any) => input.length > 0 || "Label is required.",
    });
  }

  if (!inputs.description) {
    questions.push({
      type: "input",
      name: "description",
      message: "Enter a description for the data layer store (max 50 chars):",
      validate: (input: any) =>
        input.length <= 50 || "Description must be 50 characters or less.",
    });
  }

  if (!inputs.authorizedWriter) {
    questions.push({
      type: "input",
      name: "authorizedWriter",
      message: "Enter the authorized writer public address (optional):",
      default: undefined,
    });
  }

  if (inputs.oracleFee === undefined) {
    questions.push({
      type: "input",
      name: "oracleFee",
      message: "Enter the oracle fee (optional, default is 100000):",
      default: 100000,
      filter: (input: any) => parseInt(input, 10),
      validate: (input: any) => !isNaN(input) || "Oracle fee must be a number.",
    });
  }

  const answers = await inquirer.prompt<CreateStoreUserInputs>(questions);
  return { ...inputs, ...answers };
};

export const askToDeleteAndReinit = async (): Promise<boolean> => {
  const questions: any = [
    {
      type: "confirm",
      name: "shouldDelete",
      message:
        "The .dig folder already exists. Do you want to delete it and re-init? This process is irreversible.",
      default: false,
    },
  ];

  const { shouldDelete } = await inquirer.prompt(questions);
  return shouldDelete;
};

/**
 * Prompts the user to select an action (Provide, Generate, or Import).
 * 
 * @returns {Promise<{ action: string }>} The action selected by the user.
 */
export const askForMnemonicAction = async (): Promise<{ action: string }> => {
  const questions: any = [
    {
      type: "list",
      name: "action",
      message: "No mnemonic seed found. Would you like to provide, generate, or import one?",
      choices: ["Provide", "Generate", "Import From Chia Client"],
    },
  ];

  return inquirer.prompt(questions);
};

/**
 * Prompts the user to input a mnemonic seed phrase and validates it.
 * 
 * @returns {Promise<{ providedMnemonic: string }>} The mnemonic provided by the user.
 */
export const askForMnemonicInput = async (): Promise<{ providedMnemonic: string }> => {
  const questions: any = [
    {
      type: "input",
      name: "providedMnemonic",
      message: "Please enter your mnemonic seed phrase:",
      validate: (input: string) =>
        bip39.validateMnemonic(input)
          ? true
          : "Invalid mnemonic phrase. Please try again.",
    },
  ];

  return inquirer.prompt(questions);
};
