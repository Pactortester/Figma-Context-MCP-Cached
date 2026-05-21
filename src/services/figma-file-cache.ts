import { access, constants, mkdir, readFile, rename, unlink, writeFile } from "fs/promises";
import path from "path";
import type { GetFileResponse } from "@figma/rest-api-spec";
import { Logger } from "~/utils/logger.js";
import { gzip, gunzip } from "zlib";
import { promisify } from "util";

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

export type FigmaCachingOptions = {
  cacheDir: string;
  ttlMs: number;
};

type StoredFilePayload = {
  fetchedAt: number;
  data: GetFileResponse;
};

export class FigmaFileCache {
  private initPromise: Promise<void>;
  private migrationsInProgress = new Set<string>(); // 记录正在进行后台迁移的 key
  private readCacheMemory = new Map<string, { payload: StoredFilePayload; readAt: number }>(); // 短期内存读取缓存，防御连续 has()+get() 带来的解包开销
  private readonly MEMORY_CACHE_TTL = 1000; // 短效 TTL 为 1 秒，足够覆盖瞬时连招

  constructor(private readonly options: FigmaCachingOptions) {
    this.initPromise = this.initialize();
  }

  private async initialize(): Promise<void> {
    try {
      // Create cache directory if it doesn't exist (like mkdir -p)
      await mkdir(this.options.cacheDir, { recursive: true });

      // Validate write permissions
      await access(this.options.cacheDir, constants.W_OK);

      Logger.log(`[FigmaFileCache] Initialized cache directory: ${this.options.cacheDir}`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Failed to initialize Figma cache: Cannot write to directory "${this.options.cacheDir}". ${message}`,
      );
    }
  }

  async waitForInit(): Promise<void> {
    await this.initPromise;
  }

  private getCompressedCachePath(fileKey: string): string {
    return path.join(this.options.cacheDir, `${fileKey}.json.gz`);
  }

  private getLegacyCachePath(fileKey: string): string {
    return path.join(this.options.cacheDir, `${fileKey}.json`);
  }

  private isExpired(fetchedAt: number): boolean {
    return Date.now() - fetchedAt > this.options.ttlMs;
  }

  /**
   * 内部读取缓存文件，处理 gzip 解压与向下兼容
   */
  private async readCacheFile(fileKey: string): Promise<StoredFilePayload | null> {
    // 0. 优先命中瞬时内存读取缓存，防 has()+get() 重复解压磁盘大文件
    const now = Date.now();
    const memCache = this.readCacheMemory.get(fileKey);
    if (memCache && now - memCache.readAt < this.MEMORY_CACHE_TTL) {
      if (!this.isExpired(memCache.payload.fetchedAt)) {
        return memCache.payload;
      }
      this.readCacheMemory.delete(fileKey);
    }

    const compressedPath = this.getCompressedCachePath(fileKey);
    const legacyPath = this.getLegacyCachePath(fileKey);

    // 1. 优先尝试读取新的压缩文件 (.json.gz)
    try {
      const buffer = await readFile(compressedPath);
      const decompressed = await gunzipAsync(buffer);
      const payload = JSON.parse(decompressed.toString("utf-8")) as StoredFilePayload;

      // 验证 payload 结构 (修复 Bug 6: 补上 !payload.data 校验)
      if (!payload || typeof payload.fetchedAt !== "number" || !payload.data) {
        Logger.log(`[FigmaFileCache] Compressed cache file corrupted for ${fileKey}, removing`);
        this.readCacheMemory.delete(fileKey);
        await this.safeDelete(compressedPath);
        return null;
      }

      // 验证是否过期
      if (this.isExpired(payload.fetchedAt)) {
        Logger.log(`[FigmaFileCache] Compressed cache expired for ${fileKey}`);
        this.readCacheMemory.delete(fileKey);
        await this.safeDelete(compressedPath);
        return null;
      }

      // 写入短效内存缓存
      this.readCacheMemory.set(fileKey, { payload, readAt: Date.now() });
      return payload;
    } catch (error: unknown) {
      const err = error as { code?: string; message?: string };
      if (err?.code !== "ENOENT") {
        const message = err?.message ?? String(error);
        Logger.log(`[FigmaFileCache] Error reading compressed cache for ${fileKey}: ${message}`);
        this.readCacheMemory.delete(fileKey);
        await this.safeDelete(compressedPath);
      }
    }

    // 2. 如果新压缩文件不存在，尝试读取旧的明文大 JSON 文件 (.json)
    try {
      const fileContents = await readFile(legacyPath, "utf-8");
      const payload = JSON.parse(fileContents) as StoredFilePayload;

      // 验证 payload 结构 (修复 Bug 6: 补上 !payload.data 校验)
      if (!payload || typeof payload.fetchedAt !== "number" || !payload.data) {
        Logger.log(`[FigmaFileCache] Legacy cache file corrupted for ${fileKey}, removing`);
        this.readCacheMemory.delete(fileKey);
        await this.safeDelete(legacyPath);
        return null;
      }

      // 验证是否过期
      if (this.isExpired(payload.fetchedAt)) {
        Logger.log(`[FigmaFileCache] Legacy cache expired for ${fileKey}`);
        this.readCacheMemory.delete(fileKey);
        await this.safeDelete(legacyPath);
        return null;
      }

      // 如果未过期，触发静默后台升级，转换为 gzip 并删除旧文件 (修复 Bug 7: 调整为 .catch().finally() 顺序)
      if (!this.migrationsInProgress.has(fileKey)) {
        this.migrationsInProgress.add(fileKey);
        this.migrateToCompressed(fileKey, payload)
          .catch((migrateError) => {
            Logger.log(`[FigmaFileCache] Background migration failed for ${fileKey}: ${String(migrateError)}`);
          })
          .finally(() => {
            this.migrationsInProgress.delete(fileKey);
          });
      }

      // 写入短效内存缓存
      this.readCacheMemory.set(fileKey, { payload, readAt: Date.now() });
      return payload;
    } catch (error: unknown) {
      const err = error as { code?: string; message?: string };
      if (err?.code !== "ENOENT") {
        const message = err?.message ?? String(error);
        Logger.log(`[FigmaFileCache] Error reading legacy cache for ${fileKey}: ${message}`);
        this.readCacheMemory.delete(fileKey);
        await this.safeDelete(legacyPath);
      }
    }

    return null;
  }

  /**
   * 后台静默升级：将旧明文缓存压缩并覆盖写入为新格式，再安全地删除旧明文文件
   */
  private async migrateToCompressed(fileKey: string, payload: StoredFilePayload): Promise<void> {
    const compressedPath = this.getCompressedCachePath(fileKey);
    const tempPath = `${compressedPath}.tmp`;
    const legacyPath = this.getLegacyCachePath(fileKey);

    try {
      const jsonString = JSON.stringify(payload);
      const compressedBuffer = await gzipAsync(Buffer.from(jsonString, "utf-8"));

      // 写入临时压缩文件，然后原子重命名
      await writeFile(tempPath, compressedBuffer);
      await rename(tempPath, compressedPath);

      // 写入成功后删除旧的 .json 文件
      await this.safeDelete(legacyPath);
      Logger.log(`[FigmaFileCache] Successfully migrated legacy cache for ${fileKey} to compressed format`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      Logger.log(`[FigmaFileCache] Migration to compressed failed for ${fileKey}: ${message}`);
      await this.safeDelete(tempPath);
    }
  }

  /**
   * Check if a cached file exists and is not expired.
   *
   * @param fileKey - The Figma file key
   * @returns true if cache exists and is valid, false otherwise
   */
  async has(fileKey: string): Promise<boolean> {
    await this.waitForInit();

    const payload = await this.readCacheFile(fileKey);
    if (!payload) {
      return false;
    }

    Logger.log(`[FigmaFileCache] Cache exists for ${fileKey}`);
    return true;
  }

  async get(
    fileKey: string,
  ): Promise<{ data: GetFileResponse; cachedAt: number; ttlMs: number } | null> {
    await this.waitForInit();

    const payload = await this.readCacheFile(fileKey);
    if (!payload) {
      return null;
    }

    Logger.log(`[FigmaFileCache] Cache hit for ${fileKey}`);
    return {
      data: payload.data,
      cachedAt: payload.fetchedAt,
      ttlMs: this.options.ttlMs,
    };
  }

  async set(fileKey: string, data: GetFileResponse): Promise<void> {
    await this.waitForInit();

    const compressedPath = this.getCompressedCachePath(fileKey);
    const tempPath = `${compressedPath}.tmp`;
    const legacyPath = this.getLegacyCachePath(fileKey);
    const payload: StoredFilePayload = {
      fetchedAt: Date.now(),
      data,
    };

    try {
      const jsonString = JSON.stringify(payload);
      const compressedBuffer = await gzipAsync(Buffer.from(jsonString, "utf-8"));

      // 写入临时压缩文件，然后原子重命名
      await writeFile(tempPath, compressedBuffer);
      await rename(tempPath, compressedPath);

      // 成功写入后删除可能残留的旧明文缓存
      await this.safeDelete(legacyPath);
      
      // 同步缓存到短效内存中以防后续 get() 重复磁盘 I/O 和解压
      this.readCacheMemory.set(fileKey, { payload, readAt: Date.now() });
      Logger.log(`[FigmaFileCache] Cached and compressed file ${fileKey}`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      Logger.log(`[FigmaFileCache] Failed to write cache for ${fileKey}: ${message}`);
      this.readCacheMemory.delete(fileKey);
      // Clean up temp file on error
      await this.safeDelete(tempPath);
      throw new Error(`Figma cache write failed: ${message}`);
    }
  }

  private async safeDelete(cachePath: string): Promise<void> {
    try {
      await unlink(cachePath);
    } catch (error: unknown) {
      const err = error as { code?: string; message?: string };
      if (err?.code !== "ENOENT") {
        const message = err?.message ?? String(error);
        Logger.log(`[FigmaFileCache] Error deleting cache file: ${message}`);
      }
    }
  }
}
