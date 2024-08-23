import { ensureDigConfig } from "../utils/config";

export async function setupMiddleware() {
  ensureDigConfig(process.cwd());
}
