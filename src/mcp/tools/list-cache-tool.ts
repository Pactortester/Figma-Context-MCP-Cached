import { FigmaService } from "~/services/figma.js";
import { Logger } from "~/utils/logger.js";

const parameters = {};

export type ListCacheParams = Record<string, never>;

async function listCache(
  _params: ListCacheParams,
  figmaService: FigmaService,
) {
  try {
    const stats = await figmaService.getCacheStats();

    if (!stats) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                enabled: false,
                message: "Caching is not enabled. Configure --figma-caching or FIGMA_CACHING environment variable to enable caching.",
              },
              null,
              2,
            ),
          },
        ],
      };
    }

    const formatBytes = (bytes: number): string => {
      if (bytes === 0) return "0 B";
      const k = 1024;
      const sizes = ["B", "KB", "MB", "GB"];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
    };

    const formatMs = (ms: number): string => {
      if (ms < 1000) return `${ms}ms`;
      if (ms < 60 * 1000) return `${(ms / 1000).toFixed(0)}s`;
      if (ms < 60 * 60 * 1000) return `${(ms / (60 * 1000)).toFixed(0)}m`;
      if (ms < 24 * 60 * 60 * 1000) return `${(ms / (60 * 60 * 1000)).toFixed(0)}h`;
      return `${(ms / (24 * 60 * 60 * 1000)).toFixed(0)}d`;
    };

    const result = {
      enabled: true,
      cacheDir: stats.cacheDir,
      fileCount: stats.fileCount,
      totalSize: formatBytes(stats.totalSizeBytes),
      totalSizeBytes: stats.totalSizeBytes,
      ttl: formatMs(stats.ttlMs),
      ttlMs: stats.ttlMs,
    };

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : JSON.stringify(error);
    Logger.error(`Error listing cache:`, message);
    return {
      isError: true,
      content: [{ type: "text" as const, text: `Error listing cache: ${message}` }],
    };
  }
}

// Export tool configuration
export const listCacheTool = {
  name: "list_cache",
  description:
    "List and display the current cache status including cached files, total size, cache directory, and TTL configuration. Use this tool to inspect what Figma files are currently cached and manage cache storage.",
  parameters,
  handler: listCache,
} as const;
