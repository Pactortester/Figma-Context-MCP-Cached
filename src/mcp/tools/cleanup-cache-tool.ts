import { FigmaService } from "~/services/figma.js";
import { Logger } from "~/utils/logger.js";

const parameters = {};

export type CleanupCacheParams = Record<string, never>;

async function cleanupCache(
  _params: CleanupCacheParams,
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
                success: false,
                message: "Caching is not enabled. No cache to clean up.",
              },
              null,
              2,
            ),
          },
        ],
      };
    }

    const deletedCount = await figmaService.cleanupExpiredCache();
    const newStats = await figmaService.getCacheStats();

    const formatBytes = (bytes: number): string => {
      if (bytes === 0) return "0 B";
      const k = 1024;
      const sizes = ["B", "KB", "MB", "GB"];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
    };

    const result = {
      success: true,
      deletedFiles: deletedCount,
      previousSize: formatBytes(stats.totalSizeBytes),
      currentSize: newStats ? formatBytes(newStats.totalSizeBytes) : "0 B",
      currentFileCount: newStats?.fileCount ?? 0,
      message: deletedCount > 0
        ? `Cleaned up ${deletedCount} expired/corrupted cache files.`
        : "No expired or corrupted cache files found.",
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
    Logger.error(`Error cleaning up cache:`, message);
    return {
      isError: true,
      content: [{ type: "text" as const, text: `Error cleaning up cache: ${message}` }],
    };
  }
}

// Export tool configuration
export const cleanupCacheTool = {
  name: "cleanup_cache",
  description:
    "Clean up expired and corrupted cache files. This tool removes cache files that have exceeded their TTL (Time To Live) and any corrupted cache entries. Use this to free up disk space and maintain cache health.",
  parameters,
  handler: cleanupCache,
} as const;
