import { createSpinner, Spinner } from "nanospinner";

export const waitForPromise = async <T>(
  promiseFn: () => Promise<T>,
  spinnerText: string = "Processing...",
  successText: string = "OK!",
  errorText: string = "Error."
): Promise<T> => {
  const spinner: Spinner = createSpinner(spinnerText).start();

  // Disable console.log while the spinner is active
  const originalConsoleLog = console.log;
  console.log = () => {};

  try {
    const result = await promiseFn();
    if (result) {
      spinner.success({ text: successText });
    } else {
      spinner.error({ text: errorText });
    }

    return result;
  } catch (error) {
    spinner.error({ text: errorText });
    throw error;
  } finally {
    // Restore the original console.log function
    console.log = originalConsoleLog;
  }
};
