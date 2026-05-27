/**
 * A simple LRU (Least Recently Used) cache implementation with TTL support.
 * Automatically evicts the least recently used items when the cache reaches its maximum size.
 */
export class LRUCache<K, V> {
  private cache = new Map<K, { value: V; timestamp: number }>();

  constructor(
    private readonly maxSize: number,
    private readonly ttlMs: number = Infinity,
  ) {
    if (maxSize <= 0) {
      throw new Error("LRUCache maxSize must be greater than 0");
    }
  }

  /**
   * Get a value from the cache. Returns undefined if the key doesn't exist or has expired.
   * Accessing an item refreshes its position in the LRU order.
   */
  get(key: K): V | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    // Check TTL expiration
    if (this.ttlMs !== Infinity && Date.now() - entry.timestamp > this.ttlMs) {
      this.cache.delete(key);
      return undefined;
    }

    // Refresh position in LRU order by deleting and re-inserting
    this.cache.delete(key);
    this.cache.set(key, { ...entry, timestamp: Date.now() });

    return entry.value;
  }

  /**
   * Set a value in the cache. If the cache is full, the least recently used item will be evicted.
   */
  set(key: K, value: V): void {
    // If key already exists, delete it first to update position
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }

    // Evict oldest entry if at capacity
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(key, { value, timestamp: Date.now() });
  }

  /**
   * Check if a key exists in the cache and is not expired.
   */
  has(key: K): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    // Check TTL expiration
    if (this.ttlMs !== Infinity && Date.now() - entry.timestamp > this.ttlMs) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Delete a specific key from the cache.
   */
  delete(key: K): boolean {
    return this.cache.delete(key);
  }

  /**
   * Clear all entries from the cache.
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get the current number of items in the cache.
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * Get all keys in the cache (in LRU order, least recently used first).
   */
  keys(): IterableIterator<K> {
    return this.cache.keys();
  }

  /**
   * Get all values in the cache (in LRU order, least recently used first).
   */
  values(): V[] {
    const result: V[] = [];
    for (const entry of this.cache.values()) {
      result.push(entry.value);
    }
    return result;
  }

  /**
   * Remove all expired entries from the cache.
   * @returns The number of entries removed.
   */
  cleanupExpired(): number {
    if (this.ttlMs === Infinity) return 0;

    let removedCount = 0;
    const now = Date.now();

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.ttlMs) {
        this.cache.delete(key);
        removedCount++;
      }
    }

    return removedCount;
  }
}
