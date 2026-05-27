import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { FigmaService, type FigmaAuthOptions } from "../services/figma.js";
import { Logger } from "../utils/logger.js";
import {
  downloadFigmaImagesTool,
  figmaPrepareFileTool,
  getFigmaDataTool,
  listCacheTool,
  cleanupCacheTool,
  type DownloadImagesParams,
  type FigmaPrepareFileParams,
  type GetFigmaDataParams,
  type ListCacheParams,
  type CleanupCacheParams,
} from "./tools/index.js";
import type { FigmaCachingOptions } from "~/services/figma-file-cache.js";

const serverInfo = {
  name: "Figma MCP Server",
  version: process.env.NPM_PACKAGE_VERSION ?? "unknown",
};

type CreateServerOptions = {
  isHTTP?: boolean;
  outputFormat?: "yaml" | "json";
  skipImageDownloads?: boolean;
  caching?: FigmaCachingOptions;
};

function createServer(
  authOptions: FigmaAuthOptions,
  {
    isHTTP = false,
    outputFormat = "yaml",
    skipImageDownloads = false,
    caching,
  }: CreateServerOptions = {},
) {
  const server = new McpServer(serverInfo);
  const figmaService = new FigmaService(authOptions, caching);
  registerTools(server, figmaService, { outputFormat, skipImageDownloads });

  Logger.isHTTP = isHTTP;

  return server;
}

function registerTools(
  server: McpServer,
  figmaService: FigmaService,
  options: {
    outputFormat: "yaml" | "json";
    skipImageDownloads: boolean;
  },
): void {
  // Register figma_prepare_file tool
  server.tool(
    figmaPrepareFileTool.name,
    figmaPrepareFileTool.description,
    figmaPrepareFileTool.parameters,
    (params: FigmaPrepareFileParams) => figmaPrepareFileTool.handler(params, figmaService),
  );

  // Register get_figma_data tool
  server.tool(
    getFigmaDataTool.name,
    getFigmaDataTool.description,
    getFigmaDataTool.parameters,
    (params: GetFigmaDataParams) =>
      getFigmaDataTool.handler(params, figmaService, options.outputFormat),
  );

  // Register download_figma_images tool if CLI flag or env var is not set
  if (!options.skipImageDownloads) {
    server.tool(
      downloadFigmaImagesTool.name,
      downloadFigmaImagesTool.description,
      downloadFigmaImagesTool.parameters,
      (params: DownloadImagesParams) => downloadFigmaImagesTool.handler(params, figmaService),
    );
  }

  // Register cache management tools
  server.tool(
    listCacheTool.name,
    listCacheTool.description,
    listCacheTool.parameters,
    (params: ListCacheParams) => listCacheTool.handler(params, figmaService),
  );

  server.tool(
    cleanupCacheTool.name,
    cleanupCacheTool.description,
    cleanupCacheTool.parameters,
    (params: CleanupCacheParams) => cleanupCacheTool.handler(params, figmaService),
  );
}

export { createServer };
