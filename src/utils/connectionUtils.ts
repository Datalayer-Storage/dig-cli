/**
 * Verifies if a connection string is valid based on the given format.
 *
 * Format: dig://hostname:username/distributionname.dig
 *
 * @param {string} connectionString - The connection string to verify.
 * @returns {boolean} - Returns true if the connection string is valid, otherwise false.
 */
export const verifyConnectionString = (connectionString: string): boolean => {
    // Define the regular expression pattern to match the connection string format
    const pattern: RegExp =
      /^dig:\/\/([a-zA-Z0-9.-]+):([a-zA-Z0-9]+)\/([a-zA-Z0-9_-]+)\.dig$/;
  
    // Test the connection string against the pattern
    return pattern.test(connectionString);
  };
  