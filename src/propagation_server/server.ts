import { server, PORT } from "./app";

const startPreviewServer = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    try {
      server.listen(PORT, async () => {
        console.log(`DIG Propagation Server Started`);
      });

      server.on("close", resolve);
    } catch (error) {
      reject(error);
    }
  });
};

export { startPreviewServer };
