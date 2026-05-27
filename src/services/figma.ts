import path from "path";
import type {
  GetImagesResponse,
  GetFileResponse,
  GetFileNodesResponse,
  GetImageFillsResponse,
  Node as FigmaNode,
  DocumentNode,
  Transform,
} from "@figma/rest-api-spec";
import { downloadAndProcessImage, type ImageProcessingResult } from "~/utils/image-processing.js";
import { Logger, writeLogs } from "~/utils/logger.js";
import { fetchWithRetry } from "~/utils/fetch-with-retry.js";
import { FigmaFileCache, type FigmaCachingOptions } from "./figma-file-cache.js";
import { LRUCache } from "~/utils/lru-cache.js";
import { limitConcurrency } from "~/utils/common.js";

export type FigmaAuthOptions = {
  figmaApiKey: string;
  figmaOAuthToken: string;
  useOAuth: boolean;
};

export type CacheInfo = {
  usedCache: boolean;
  cachedAt?: number;
  ttlMs?: number;
};

export type PrepareFileResult = {
  wasCached: boolean; // 文件是否已缓存
  nodeExists?: boolean; // nodeId 是否存在（如果提供了 nodeId）
  action: "no-op" | "fetched" | "refreshed" | "cache-disabled"; // 执行的操作
  message?: string; // 可选的详细消息
};

type SvgOptions = {
  outlineText: boolean;
  includeId: boolean;
  simplifyStroke: boolean;
};

export class FigmaService {
  private readonly apiKey: string;
  private readonly oauthToken: string;
  private readonly useOAuth: boolean;
  private readonly baseUrl = "https://api.figma.com/v1";
  private readonly fileCache?: FigmaFileCache;
  private readonly nodeCache: LRUCache<string, GetFileNodesResponse>;
  private readonly NODE_CACHE_TTL = 5 * 60 * 1000; // 5 minutes TTL for node cache
  private readonly NODE_CACHE_MAX_SIZE = 50; // Maximum 50 nodes in memory

  constructor(
    { figmaApiKey, figmaOAuthToken, useOAuth }: FigmaAuthOptions,
    cachingOptions?: FigmaCachingOptions,
  ) {
    this.apiKey = figmaApiKey || "";
    this.oauthToken = figmaOAuthToken || "";
    this.useOAuth = !!useOAuth && !!this.oauthToken;
    this.nodeCache = new LRUCache(this.NODE_CACHE_MAX_SIZE, this.NODE_CACHE_TTL);
    if (cachingOptions) {
      this.fileCache = new FigmaFileCache(cachingOptions);
    }
  }

  private getAuthHeaders(): Record<string, string> {
    if (this.useOAuth) {
      Logger.log("Using OAuth Bearer token for authentication");
      return { Authorization: `Bearer ${this.oauthToken}` };
    } else {
      Logger.log("Using Personal Access Token for authentication");
      return { "X-Figma-Token": this.apiKey };
    }
  }

  /**
   * Filters out null values from Figma image responses. This ensures we only work with valid image URLs.
   */
  private filterValidImages(
    images: { [key: string]: string | null } | undefined,
  ): Record<string, string> {
    if (!images) return {};
    return Object.fromEntries(Object.entries(images).filter(([, value]) => !!value)) as Record<
      string,
      string
    >;
  }

  private async request<T>(endpoint: string): Promise<T> {
    try {
      Logger.log(`Calling ${this.baseUrl}${endpoint}`);
      const headers = this.getAuthHeaders();

      return await fetchWithRetry<T & { status?: number }>(`${this.baseUrl}${endpoint}`, {
        headers,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Failed to make request to Figma API endpoint '${endpoint}': ${errorMessage}`,
      );
    }
  }

  /**
   * Builds URL query parameters for SVG image requests.
   */
  private buildSvgQueryParams(svgIds: string[], svgOptions: SvgOptions): string {
    const params = new URLSearchParams({
      ids: svgIds.join(","),
      format: "svg",
      svg_outline_text: String(svgOptions.outlineText),
      svg_include_id: String(svgOptions.includeId),
      svg_simplify_stroke: String(svgOptions.simplifyStroke),
    });
    return params.toString();
  }

  /**
   * Gets download URLs for image fills without downloading them.
   *
   * @returns Map of imageRef to download URL
   */
  async getImageFillUrls(fileKey: string): Promise<Record<string, string>> {
    const endpoint = `/files/${fileKey}/images`;
    const response = await this.request<GetImageFillsResponse>(endpoint);
    return response.meta.images || {};
  }

  /**
   * Gets download URLs for rendered nodes without downloading them.
   *
   * @returns Map of node ID to download URL
   */
  async getNodeRenderUrls(
    fileKey: string,
    nodeIds: string[],
    format: "png" | "svg",
    options: { pngScale?: number; svgOptions?: SvgOptions } = {},
  ): Promise<Record<string, string>> {
    if (nodeIds.length === 0) return {};

    if (format === "png") {
      const scale = options.pngScale || 2;
      const endpoint = `/images/${fileKey}?ids=${nodeIds.join(",")}&format=png&scale=${scale}`;
      const response = await this.request<GetImagesResponse>(endpoint);
      return this.filterValidImages(response.images);
    } else {
      const svgOptions = options.svgOptions || {
        outlineText: true,
        includeId: false,
        simplifyStroke: true,
      };
      const params = this.buildSvgQueryParams(nodeIds, svgOptions);
      const endpoint = `/images/${fileKey}?${params}`;
      const response = await this.request<GetImagesResponse>(endpoint);
      return this.filterValidImages(response.images);
    }
  }

  /**
   * Download images method with post-processing support for cropping and returning image dimensions.
   *
   * Supports:
   * - Image fills vs rendered nodes (based on imageRef vs nodeId)
   * - PNG vs SVG format (based on filename extension)
   * - Image cropping based on transform matrices
   * - CSS variable generation for image dimensions
   *
   * @returns Array of local file paths for successfully downloaded images
   */
  async downloadImages(
    fileKey: string,
    localPath: string,
    items: Array<{
      imageRef?: string;
      nodeId?: string;
      fileName: string;
      needsCropping?: boolean;
      cropTransform?: Transform;
      requiresImageDimensions?: boolean;
    }>,
    options: { pngScale?: number; svgOptions?: SvgOptions } = {},
  ): Promise<ImageProcessingResult[]> {
    if (items.length === 0) return [];

    // Normalize the path and resolve to absolute
    const resolvedPath = path.resolve(path.normalize(localPath));

    // Security check: prevent directory traversal attacks
    // Only block if the normalized path still contains ".." segments
    const normalizedSegments = resolvedPath.split(path.sep);
    if (normalizedSegments.includes("..")) {
      throw new Error("Invalid path specified. Directory traversal is not allowed.");
    }

    const { pngScale = 2, svgOptions } = options;

    // Separate items by type
    const imageFills = items.filter(
      (item): item is typeof item & { imageRef: string } => !!item.imageRef,
    );
    const renderNodes = items.filter(
      (item): item is typeof item & { nodeId: string } => !!item.nodeId,
    );

    const pngNodes = renderNodes.filter((node) => !node.fileName.toLowerCase().endsWith(".svg"));
    const svgNodes = renderNodes.filter((node) => node.fileName.toLowerCase().endsWith(".svg"));

    // 1. Gather all API image URLs concurrently (only a few bulk API requests)
    const fillUrlsPromise = imageFills.length > 0 ? this.getImageFillUrls(fileKey) : Promise.resolve({} as Record<string, string>);
    const pngUrlsPromise = pngNodes.length > 0
      ? this.getNodeRenderUrls(fileKey, pngNodes.map((n) => n.nodeId), "png", { pngScale })
      : Promise.resolve({} as Record<string, string>);
    const svgUrlsPromise = svgNodes.length > 0
      ? this.getNodeRenderUrls(fileKey, svgNodes.map((n) => n.nodeId), "svg", { svgOptions })
      : Promise.resolve({} as Record<string, string>);

    const [fillUrls, pngUrls, svgUrls] = await Promise.all([
      fillUrlsPromise,
      pngUrlsPromise,
      svgUrlsPromise,
    ]);

    // 2. Build a flat array of all image download & processing tasks
    const downloadTasks: Array<{
      fileName: string;
      imageUrl: string;
      needsCropping: boolean;
      cropTransform?: Transform;
      requiresImageDimensions: boolean;
    }> = [];

    // Add imageFills tasks
    for (const item of imageFills) {
      const imageUrl = fillUrls[item.imageRef];
      if (imageUrl) {
        downloadTasks.push({
          fileName: item.fileName,
          imageUrl,
          needsCropping: item.needsCropping || false,
          cropTransform: item.cropTransform,
          requiresImageDimensions: item.requiresImageDimensions || false,
        });
      }
    }

    // Add PNG node tasks
    for (const item of pngNodes) {
      const imageUrl = pngUrls[item.nodeId];
      if (imageUrl) {
        downloadTasks.push({
          fileName: item.fileName,
          imageUrl,
          needsCropping: item.needsCropping || false,
          cropTransform: item.cropTransform,
          requiresImageDimensions: item.requiresImageDimensions || false,
        });
      }
    }

    // Add SVG node tasks
    for (const item of svgNodes) {
      const imageUrl = svgUrls[item.nodeId];
      if (imageUrl) {
        downloadTasks.push({
          fileName: item.fileName,
          imageUrl,
          needsCropping: item.needsCropping || false,
          cropTransform: item.cropTransform,
          requiresImageDimensions: item.requiresImageDimensions || false,
        });
      }
    }

    // 3. Process all download & crop tasks with a concurrency limit of 5
    const CONCURRENCY_LIMIT = 5;
    Logger.log(`[FigmaService] Starting batch download of ${downloadTasks.length} images with a concurrency limit of ${CONCURRENCY_LIMIT}`);
    
    const results = await limitConcurrency(downloadTasks, CONCURRENCY_LIMIT, async (task) => {
      return downloadAndProcessImage(
        task.fileName,
        resolvedPath,
        task.imageUrl,
        task.needsCropping,
        task.cropTransform,
        task.requiresImageDimensions,
      );
    });

    return results;
  }

  /**
   * Get raw Figma API response for a file (for use with flexible extractors)
   */
  async getRawFile(
    fileKey: string,
    depth?: number | null,
  ): Promise<{ data: GetFileResponse; cacheInfo: CacheInfo }> {
    let response: GetFileResponse;
    let cacheInfo: CacheInfo;

    if (this.fileCache) {
      const cacheResult = await this.loadFileFromCache(fileKey);
      response = cacheResult.data;
      cacheInfo = cacheResult.cacheInfo;

      if (typeof depth === "number") {
        const truncated = cloneFileResponseWithDepth(response, depth);
        writeLogs("figma-raw.json", truncated);
        return { data: truncated, cacheInfo };
      }
      writeLogs("figma-raw.json", response);
      return { data: response, cacheInfo };
    }

    response = await this.fetchFileFromApi(fileKey, depth);
    writeLogs("figma-raw.json", response);
    return { data: response, cacheInfo: { usedCache: false } };
  }

  /**
   * Get raw Figma API response for specific nodes (for use with flexible extractors)
   */
  async getRawNode(
    fileKey: string,
    nodeId: string,
    depth?: number | null,
  ): Promise<{ data: GetFileNodesResponse; cacheInfo: CacheInfo }> {
    // Create a cache key that includes depth
    const nodeCacheKey = `${fileKey}:${nodeId}:${depth ?? "full"}`;

    // Check node-level memory cache first
    const cachedNode = this.nodeCache.get(nodeCacheKey);
    if (cachedNode) {
      Logger.log(`[FigmaService] Node cache hit for ${nodeId} in ${fileKey}`);
      return { data: cachedNode, cacheInfo: { usedCache: true } };
    }

    if (this.fileCache) {
      const cacheResult = await this.loadFileFromCache(fileKey);
      const nodeResponse = buildNodeResponseFromFile(cacheResult.data, nodeId, depth);

      // Cache the node response in memory
      this.nodeCache.set(nodeCacheKey, nodeResponse);

      writeLogs("figma-raw.json", nodeResponse);
      return { data: nodeResponse, cacheInfo: cacheResult.cacheInfo };
    }

    const endpoint = `/files/${fileKey}/nodes?ids=${nodeId}${depth ? `&depth=${depth}` : ""}`;
    Logger.log(
      `Retrieving raw Figma node: ${nodeId} from ${fileKey} (depth: ${depth ?? "default"})`,
    );

    const response = await this.request<GetFileNodesResponse>(endpoint);

    // Cache the node response in memory
    this.nodeCache.set(nodeCacheKey, response);

    writeLogs("figma-raw.json", response);

    return { data: response, cacheInfo: { usedCache: false } };
  }

  /**
   * Check if a file is cached and valid.
   *
   * @param fileKey - The Figma file key
   * @returns true if cache exists and is valid, false otherwise
   */
  async hasCachedFile(fileKey: string): Promise<boolean> {
    if (!this.fileCache) {
      return false;
    }
    return await this.fileCache.has(fileKey);
  }

  /**
   * Check if a specific node exists in the cached file.
   *
   * @param fileKey - The Figma file key
   * @param nodeId - The node ID to check (can be multiple nodes separated by ;)
   * @returns true if file is cached and node exists, false otherwise
   */
  async hasCachedNode(fileKey: string, nodeId: string): Promise<boolean> {
    if (!this.fileCache) {
      return false;
    }

    // First check if file is cached
    const hasFile = await this.hasCachedFile(fileKey);
    if (!hasFile) {
      return false;
    }

    // Get cached file to check if node exists
    const cacheResult = await this.fileCache.get(fileKey);
    if (!cacheResult) {
      return false;
    }

    // Check if nodeId exists in the cached file
    const nodeIds = nodeId.split(";").filter((id) => id);
    if (nodeIds.length === 0) {
      return false;
    }

    const nodesMap = findNodesById(cacheResult.data.document, new Set(nodeIds));
    const allNodesFound = nodeIds.every((id) => nodesMap.has(id));

    if (allNodesFound) {
      Logger.log(
        `[FigmaService] All nodes (${nodeIds.join(", ")}) found in cached file ${fileKey}`,
      );
    } else {
      const missingNodes = nodeIds.filter((id) => !nodesMap.has(id));
      Logger.log(
        `[FigmaService] Some nodes (${missingNodes.join(", ")}) not found in cached file ${fileKey}`,
      );
    }

    return allNodesFound;
  }

  /**
   * Prepare a file by ensuring it's cached.
   * If cache exists and is valid (and nodeId if provided exists), does nothing.
   * If cache doesn't exist or is expired, or nodeId is not found, fetches the full file and caches it.
   *
   * @param fileKey - The Figma file key
   * @param nodeId - Optional node ID to check in the cached file
   * @param forceRefresh - If true, force fetch fresh data from API even if cache exists
   * @returns Detailed result of the preparation operation
   */
  async prepareFile(fileKey: string, nodeId?: string, forceRefresh?: boolean): Promise<PrepareFileResult> {
    // Check if cache is enabled
    if (!this.fileCache) {
      Logger.log(`[FigmaService] Cache not configured, skipping prepare for ${fileKey}`);
      return {
        wasCached: false,
        action: "cache-disabled",
        message: "Cache is not enabled. Please configure --figma-caching or FIGMA_CACHING environment variable.",
      };
    }

    // If forceRefresh is true, always fetch fresh data
    if (forceRefresh) {
      Logger.log(`[FigmaService] Force refresh requested for ${fileKey}, fetching fresh data...`);
      await this.loadFileFromCache(fileKey, true);

      if (nodeId) {
        const hasNode = await this.hasCachedNode(fileKey, nodeId);
        Logger.log(
          `[FigmaService] Force refreshed ${fileKey}. Node ${nodeId} ${hasNode ? "exists" : "not found"} in file.`,
        );
        return {
          wasCached: false,
          nodeExists: hasNode,
          action: "refreshed",
          message: hasNode
            ? `Force refreshed and cached file ${fileKey}. Node ${nodeId} is present.`
            : `Force refreshed and cached file ${fileKey}, but node ${nodeId} was not found in the file.`,
        };
      }

      Logger.log(`[FigmaService] Force refreshed and cached ${fileKey}`);
      return {
        wasCached: false,
        action: "refreshed",
        message: `Force refreshed and cached file ${fileKey}. The file is now up to date.`,
      };
    }

    // Check if file is cached
    const hasFile = await this.hasCachedFile(fileKey);
    if (!hasFile) {
      Logger.log(`[FigmaService] Cache not found for ${fileKey}, fetching full file...`);
      // Use loadFileFromCache which will fetch and cache if not present
      await this.loadFileFromCache(fileKey);

      // If nodeId is provided, check if it exists after fetching
      if (nodeId) {
        const hasNode = await this.hasCachedNode(fileKey, nodeId);
        Logger.log(
          `[FigmaService] Successfully prepared and cached ${fileKey}. Node ${nodeId} ${hasNode ? "exists" : "not found"} in file.`,
        );
        return {
          wasCached: false,
          nodeExists: hasNode,
          action: "fetched",
          message: hasNode
            ? `Successfully fetched and cached file ${fileKey}. Node ${nodeId} is present.`
            : `Successfully fetched and cached file ${fileKey}, but node ${nodeId} was not found in the file.`,
        };
      }

      Logger.log(`[FigmaService] Successfully prepared and cached ${fileKey}`);
      return {
        wasCached: false,
        action: "fetched",
        message: `Successfully fetched and cached file ${fileKey}.`,
      };
    }

    // File is cached, check nodeId if provided
    if (nodeId) {
      const hasNode = await this.hasCachedNode(fileKey, nodeId);
      if (hasNode) {
        Logger.log(
          `[FigmaService] Cache exists for ${fileKey} and node ${nodeId} is present, no action needed`,
        );
        return {
          wasCached: true,
          nodeExists: true,
          action: "no-op",
          message: `Cache exists for file ${fileKey} and node ${nodeId} is present.`,
        };
      } else {
        // Node not found, refresh cache by fetching full file
        Logger.log(
          `[FigmaService] Cache exists for ${fileKey} but node ${nodeId} not found, fetching full file...`,
        );
        await this.loadFileFromCache(fileKey, true);

        // Re-check nodeId after refresh
        const stillMissing = !(await this.hasCachedNode(fileKey, nodeId));
        if (stillMissing) {
          Logger.log(
            `[FigmaService] Node ${nodeId} still not found in file ${fileKey} after refresh. It may not exist in the file.`,
          );
          return {
            wasCached: true,
            nodeExists: false,
            action: "refreshed",
            message: `Refreshed cache for file ${fileKey}, but node ${nodeId} was not found. It may not exist in the file.`,
          };
        }

        Logger.log(`[FigmaService] Successfully refreshed and cached ${fileKey}. Node ${nodeId} is now present.`);
        return {
          wasCached: true,
          nodeExists: true,
          action: "refreshed",
          message: `Refreshed cache for file ${fileKey}. Node ${nodeId} is now present.`,
        };
      }
    }

    // File is cached and no nodeId to check
    Logger.log(`[FigmaService] Cache already exists for ${fileKey}, no action needed`);
    return {
      wasCached: true,
      action: "no-op",
      message: `Cache already exists for file ${fileKey}.`,
    };
  }

  private async loadFileFromCache(
    fileKey: string,
    forceRefresh?: boolean,
  ): Promise<{ data: GetFileResponse; cacheInfo: CacheInfo }> {
    if (!this.fileCache) {
      const data = await this.fetchFileFromApi(fileKey);
      return { data, cacheInfo: { usedCache: false } };
    }

    // If forceRefresh is true, skip cache check and fetch fresh data
    if (forceRefresh) {
      Logger.log(`[FigmaService] Force refreshing cache for ${fileKey}`);
      const fresh = await this.fetchFileFromApi(fileKey);
      await this.fileCache.set(fileKey, fresh);
      return {
        data: fresh,
        cacheInfo: {
          usedCache: false,
        },
      };
    }

    const cacheResult = await this.fileCache.get(fileKey);
    if (cacheResult) {
      return {
        data: cacheResult.data,
        cacheInfo: {
          usedCache: true,
          cachedAt: cacheResult.cachedAt,
          ttlMs: cacheResult.ttlMs,
        },
      };
    }

    const fresh = await this.fetchFileFromApi(fileKey);
    await this.fileCache.set(fileKey, fresh);
    return {
      data: fresh,
      cacheInfo: {
        usedCache: false,
      },
    };
  }

  private async fetchFileFromApi(fileKey: string, depth?: number | null): Promise<GetFileResponse> {
    const endpoint = `/files/${fileKey}${depth ? `?depth=${depth}` : ""}`;
    Logger.log(
      `Retrieving raw Figma file: ${fileKey} (depth: ${depth ?? (this.fileCache ? "full" : "default")})`,
    );

    return this.request<GetFileResponse>(endpoint);
  }

  /**
   * Get cache statistics if caching is enabled
   */
  async getCacheStats() {
    if (!this.fileCache) {
      return null;
    }
    return this.fileCache.getStats();
  }

  /**
   * Clean up expired cache files if caching is enabled
   */
  async cleanupExpiredCache(): Promise<number> {
    if (!this.fileCache) {
      return 0;
    }
    return this.fileCache.cleanupExpired();
  }

  /**
   * Destroy the service and clean up resources
   */
  destroy(): void {
    if (this.fileCache) {
      this.fileCache.destroy();
    }
    this.nodeCache.clear();
  }
}

function cloneFileResponseWithDepth(file: GetFileResponse, depth: number): GetFileResponse {
  if (depth === undefined || depth === null || typeof depth !== "number") {
    return file;
  }

  // Ensure document exists and has children
  if (!file.document) {
    return file;
  }

  return {
    ...file,
    document: cloneNode(file.document, depth) as DocumentNode,
  };
}

function cloneNode<T extends FigmaNode>(node: T, depth?: number): T {
  const clone = { ...node } as T & { children?: FigmaNode[] };

  if (!nodeHasChildren(node)) {
    delete clone.children;
    return clone;
  }

  // Additional defensive check: ensure children is an array
  if (!Array.isArray(node.children) || node.children.length === 0) {
    delete clone.children;
    return clone;
  }

  // Filter out any undefined or null children before processing
  const validChildren = node.children.filter(
    (child): child is FigmaNode => child !== undefined && child !== null,
  );

  if (validChildren.length === 0) {
    delete clone.children;
    return clone;
  }

  if (depth === undefined || depth === null) {
    clone.children = validChildren.map((child) => cloneNode(child));
    return clone;
  }

  if (depth <= 0) {
    delete clone.children;
    return clone;
  }

  clone.children = validChildren.map((child) => cloneNode(child, depth - 1));

  return clone;
}

function buildNodeResponseFromFile(
  file: GetFileResponse,
  nodeIdParam: string,
  depth?: number | null,
): GetFileNodesResponse {
  const nodeIds = nodeIdParam.split(";").filter((id) => id);
  if (nodeIds.length === 0) {
    throw new Error("No valid node IDs provided");
  }

  const nodesMap = findNodesById(file.document, new Set(nodeIds));
  const nodes: GetFileNodesResponse["nodes"] = {};

  for (const id of nodeIds) {
    const node = nodesMap.get(id);
    if (!node) {
      throw new Error(`Node ${id} not found in cached file`);
    }
    nodes[id] = {
      document: cloneNode(node, depth ?? undefined),
      components: file.components ?? {},
      componentSets: file.componentSets ?? {},
      styles: file.styles,
      schemaVersion: file.schemaVersion,
    };
  }

  return {
    name: file.name,
    lastModified: file.lastModified,
    thumbnailUrl: file.thumbnailUrl ?? "",
    version: file.version ?? "",
    role: file.role ?? "viewer",
    editorType: file.editorType ?? "figma",
    nodes,
  };
}

function findNodesById(root: DocumentNode, targetIds: Set<string>): Map<string, FigmaNode> {
  const result = new Map<string, FigmaNode>();
  const stack: FigmaNode[] = [root];

  while (stack.length > 0 && result.size < targetIds.size) {
    const current = stack.pop();
    if (!current) continue;

    if (targetIds.has(current.id)) {
      result.set(current.id, current);
    }

    if (nodeHasChildren(current)) {
      stack.push(...current.children);
    }
  }

  return result;
}

type NodeWithChildren = FigmaNode & { children: FigmaNode[] };

function nodeHasChildren(node: FigmaNode): node is NodeWithChildren {
  const maybeChildren = (node as Partial<NodeWithChildren>).children;
  return Array.isArray(maybeChildren) && maybeChildren.length > 0;
}
