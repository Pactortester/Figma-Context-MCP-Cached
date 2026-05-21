import { execFile } from "child_process";
import { promisify } from "util";
import { Logger } from "./logger.js";

const execFileAsync = promisify(execFile);

type RequestOptions = RequestInit & {
  /**
   * Force format of headers to be a record of strings, e.g. { "Authorization": "Bearer 123" }
   *
   * Avoids complexity of needing to deal with `instanceof Headers`, which is not supported in some environments.
   */
  headers?: Record<string, string>;
};

class FatalFetchError extends Error {
  public readonly isFatal = true;
  constructor(message: string) {
    super(message);
    this.name = "FatalFetchError";
  }
}

export async function fetchWithRetry<T extends { status?: number }>(
  url: string,
  options: RequestOptions = {},
): Promise<T> {
  const maxRetries = 3;
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        Logger.log(`[fetchWithRetry] Retrying fetch for ${url} (Attempt ${attempt}/${maxRetries})...`);
      }
      const response = await fetch(url, options);

      if (!response.ok) {
        const message = `Fetch failed with status ${response.status}: ${response.statusText}`;
        // 只有 429 和 5xx 属于可重试的暂态错误，其余（如 400, 401, 403, 404 等）为致命错误，直接中断重试
        if (response.status === 429 || response.status >= 500) {
          throw new Error(message);
        } else {
          throw new FatalFetchError(message);
        }
      }
      return (await response.json()) as T;
    } catch (fetchError: unknown) {
      lastError = fetchError;
      
      const isFatal = fetchError instanceof FatalFetchError;
      if (isFatal) {
        Logger.log(`[fetchWithRetry] Fatal error encountered: ${(fetchError as Error).message}. Skipping retries.`);
        break; // 直接中断重试循环
      }
      
      if (attempt < maxRetries) {
        const backoffDelay = Math.pow(2, attempt) * 300 + Math.random() * 100;
        Logger.log(
          `[fetchWithRetry] Fetch attempt ${attempt + 1}/${maxRetries + 1} failed for ${url}: ${(fetchError as Error).message}. Retrying in ${Math.round(backoffDelay)}ms...`,
        );
        await new Promise((resolve) => setTimeout(resolve, backoffDelay));
      }
    }
  }

  Logger.log(
    `[fetchWithRetry] All ${maxRetries + 1} fetch attempts failed for ${url}: ${lastError instanceof Error ? lastError.message : String(lastError)}. Attempting curl fallback.`,
  );

  const curlHeaders = formatHeadersForCurl(options.headers);
  // Most options here are to ensure stderr only contains errors, so we can use it to confidently check if an error occurred.
  // -s: Silent mode—no progress bar in stderr
  // -S: Show errors in stderr
  // --fail-with-body: curl errors with code 22, and outputs body of failed request, e.g. "Fetch failed with status 404"
  // -L: Follow redirects
  const curlArgs = ["-s", "-S", "--fail-with-body", "-L", ...curlHeaders, url];

  try {
    // Fallback to curl for corporate networks that have proxies that sometimes block fetch
    Logger.log(`[fetchWithRetry] Executing curl with args: ${JSON.stringify(curlArgs)}`);
    const { stdout, stderr } = await execFileAsync("curl", curlArgs);

    if (stderr) {
      // curl often outputs progress to stderr, so only treat as error if stdout is empty
      // or if stderr contains typical error keywords.
      if (
        !stdout ||
        stderr.toLowerCase().includes("error") ||
        stderr.toLowerCase().includes("fail")
      ) {
        throw new Error(`Curl command failed with stderr: ${stderr}`);
      }
      Logger.log(
        `[fetchWithRetry] Curl command for ${url} produced stderr (but might be informational): ${stderr}`,
      );
    }

    if (!stdout) {
      throw new Error("Curl command returned empty stdout.");
    }

    const result = JSON.parse(stdout) as T;

    // Successful Figma requests don't have a status property, and some endpoints return 200 with an
    // error status in the body, e.g. https://www.figma.com/developers/api#get-images-endpoint
    if (result.status && result.status !== 200) {
      throw new Error(`Curl command failed: ${result}`);
    }

    return result;
  } catch (curlError: any) {
    Logger.error(`[fetchWithRetry] Curl fallback also failed for ${url}: ${curlError.message}`);
    // Re-throw the original fetch error to give context about the initial failure
    throw lastError;
  }
}

/**
 * Converts HeadersInit to an array of curl header arguments for execFile.
 * @param headers Headers to convert.
 * @returns Array of strings for curl arguments: ["-H", "key: value", "-H", "key2: value2"]
 */
function formatHeadersForCurl(headers: Record<string, string> | undefined): string[] {
  if (!headers) {
    return [];
  }

  const headerArgs: string[] = [];
  for (const [key, value] of Object.entries(headers)) {
    headerArgs.push("-H", `${key}: ${value}`);
  }
  return headerArgs;
}
