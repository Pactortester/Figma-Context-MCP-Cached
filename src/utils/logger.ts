import { access, mkdir, writeFile } from "fs/promises";
import fs from "fs";

export const Logger = {
  isHTTP: false,
  log: (...args: any[]) => {
    if (Logger.isHTTP) {
      console.log("[INFO]", ...args);
    } else {
      console.error("[INFO]", ...args);
    }
  },
  error: (...args: any[]) => {
    console.error("[ERROR]", ...args);
  },
};

export function writeLogs(name: string, value: any): void {
  if (process.env.NODE_ENV !== "development") return;

  const logsDir = "logs";
  const logPath = `${logsDir}/${name}`;

  // Fire-and-forget async write - non-blocking for callers
  Promise.resolve()
    .then(() => access(process.cwd(), fs.constants.W_OK))
    .then(() => mkdir(logsDir, { recursive: true }).catch(() => {}))
    .then(() => writeFile(logPath, JSON.stringify(value, null, 2)))
    .then(() => Logger.log(`Debug log written to: ${logPath}`))
    .catch((error) => {
      const errorMessage = error instanceof Error ? error.message : String(error);
      Logger.log(`Failed to write logs to ${name}: ${errorMessage}`);
    });
}
