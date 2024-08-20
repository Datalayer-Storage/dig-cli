import { ensureDigConfig } from "../utils/config";
import { checkStoreWritePermissions } from "../actions/middleware";

export async function setupMiddleware() {
  ensureDigConfig(process.cwd());
  await checkStoreWritePermissions();
}
