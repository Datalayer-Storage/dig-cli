import { server, PORT } from "./app";

const startPropagationServer = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    try {
      server.listen(PORT, async () => {
        console.log(`DIG Propagation Server Started on port ${PORT}`);
      });

      server.on("close", resolve);
    } catch (error) {
      reject(error);
    }
  });
};

export { startPropagationServer };
