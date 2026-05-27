import { mkdtemp, rm, writeFile, readdir } from "fs/promises";
import os from "os";
import path from "path";
import { FigmaFileCache } from "./figma-file-cache.js";
import type { GetFileResponse } from "@figma/rest-api-spec";

const SAMPLE_FILE: GetFileResponse = {
  name: "Test File",
  lastModified: new Date().toISOString(),
  thumbnailUrl: "",
  version: "1",
  role: "viewer",
  editorType: "figma",
  document: {
    id: "0:0",
    name: "Document",
    type: "DOCUMENT",
    children: [],
  },
  schemaVersion: 0,
  components: {},
  componentSets: {},
  styles: {},
} as unknown as GetFileResponse;

async function createTempDir(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "figma-file-cache-test-"));
}

async function cleanupDir(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true });
}

describe("FigmaFileCache", () => {
  it("stores and retrieves cached entries", async () => {
    const dir = await createTempDir();
    try {
      const cache = new FigmaFileCache({ cacheDir: dir, ttlMs: 60_000 });

      await cache.set("ABC", SAMPLE_FILE);
      const loaded = await cache.get("ABC");

      expect(loaded?.data.name).toBe("Test File");
    } finally {
      await cleanupDir(dir);
    }
  });

  it("expires entries when ttl is exceeded", async () => {
    const dir = await createTempDir();
    const cache = new FigmaFileCache({ cacheDir: dir, ttlMs: 10 });
    const dateSpy = jest.spyOn(Date, "now");
    try {
      dateSpy.mockReturnValue(1000);
      await cache.set("ABC", SAMPLE_FILE);

      dateSpy.mockReturnValue(1000 + 11);
      const loaded = await cache.get("ABC");

      expect(loaded).toBeNull();
    } finally {
      dateSpy.mockRestore();
      await cleanupDir(dir);
    }
  });

  it("handles corrupted cache files gracefully", async () => {
    const dir = await createTempDir();
    try {
      const filePath = path.join(dir, "ABC.json");
      await writeFile(filePath, "not-json");

      const cache = new FigmaFileCache({ cacheDir: dir, ttlMs: 60_000 });
      const loaded = await cache.get("ABC");

      expect(loaded).toBeNull();
    } finally {
      await cleanupDir(dir);
    }
  });

  it("reports cache existence correctly", async () => {
    const dir = await createTempDir();
    try {
      const cache = new FigmaFileCache({ cacheDir: dir, ttlMs: 60_000 });

      expect(await cache.has("ABC")).toBe(false);

      await cache.set("ABC", SAMPLE_FILE);
      expect(await cache.has("ABC")).toBe(true);
    } finally {
      await cleanupDir(dir);
    }
  });

  it("cleans up expired cache files", async () => {
    const dir = await createTempDir();
    const dateSpy = jest.spyOn(Date, "now");
    try {
      const cache = new FigmaFileCache({ cacheDir: dir, ttlMs: 1000 });

      // Set initial time
      dateSpy.mockReturnValue(1000);

      // Create multiple cache entries
      await cache.set("FILE1", SAMPLE_FILE);
      await cache.set("FILE2", SAMPLE_FILE);
      await cache.set("FILE3", SAMPLE_FILE);

      // Move time forward past TTL
      dateSpy.mockReturnValue(1000 + 1001);

      // Cleanup should remove all expired files
      const deletedCount = await cache.cleanupExpired();
      expect(deletedCount).toBeGreaterThanOrEqual(3);

      // Verify files are gone
      expect(await cache.has("FILE1")).toBe(false);
      expect(await cache.has("FILE2")).toBe(false);
      expect(await cache.has("FILE3")).toBe(false);
    } finally {
      dateSpy.mockRestore();
      await cleanupDir(dir);
    }
  });

  it("returns correct cache stats", async () => {
    const dir = await createTempDir();
    try {
      const cache = new FigmaFileCache({ cacheDir: dir, ttlMs: 60_000 });

      await cache.set("FILE1", SAMPLE_FILE);
      await cache.set("FILE2", SAMPLE_FILE);

      const stats = await cache.getStats();

      expect(stats.fileCount).toBe(2);
      expect(stats.totalSizeBytes).toBeGreaterThan(0);
      expect(stats.cacheDir).toBe(dir);
      expect(stats.ttlMs).toBe(60_000);
    } finally {
      await cleanupDir(dir);
    }
  });

  it("destroys cache instance properly", async () => {
    const dir = await createTempDir();
    try {
      const cache = new FigmaFileCache({
        cacheDir: dir,
        ttlMs: 60_000,
        autoCleanup: true,
      });

      await cache.set("ABC", SAMPLE_FILE);

      // Destroy should not throw
      cache.destroy();

      // After destroy, memory cache should be cleared
      // But disk cache should still exist
      const files = await readdir(dir);
      expect(files.length).toBeGreaterThan(0);
    } finally {
      await cleanupDir(dir);
    }
  });

  it("handles legacy JSON format migration", async () => {
    const dir = await createTempDir();
    try {
      // Write legacy format (.json instead of .json.gz)
      const legacyPayload = {
        fetchedAt: Date.now(),
        data: SAMPLE_FILE,
      };
      await writeFile(
        path.join(dir, "LEGACY.json"),
        JSON.stringify(legacyPayload),
      );

      const cache = new FigmaFileCache({ cacheDir: dir, ttlMs: 60_000 });
      const loaded = await cache.get("LEGACY");

      expect(loaded).not.toBeNull();
      expect(loaded?.data.name).toBe("Test File");
    } finally {
      await cleanupDir(dir);
    }
  });

  it("disables auto cleanup when configured", async () => {
    const dir = await createTempDir();
    try {
      const cache = new FigmaFileCache({
        cacheDir: dir,
        ttlMs: 60_000,
        autoCleanup: false,
      });

      // Should not throw
      await cache.set("ABC", SAMPLE_FILE);
      expect(await cache.has("ABC")).toBe(true);
    } finally {
      await cleanupDir(dir);
    }
  });
});
