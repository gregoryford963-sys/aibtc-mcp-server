import { describe, it, expect, beforeEach } from "vitest";
import {
  resetPendingNonce,
  forceResyncNonce,
  advancePendingNonce,
  MAX_NONCE_ENTRIES,
  _testingNonceMaps,
} from "../../src/transactions/builder.js";

const { pendingNonces, pendingNonceTimestamps } = _testingNonceMaps;

// Helper: clear both maps before each test so tests are isolated
beforeEach(function clearNonceMaps() {
  pendingNonces.clear();
  pendingNonceTimestamps.clear();
});

describe("advancePendingNonce", () => {
  it("should set the next nonce to nonce + 1 for a new address", function () {
    advancePendingNonce("SP1", 0n);
    expect(pendingNonces.get("SP1")).toBe(1n);
  });

  it("should record a timestamp when advancing", function () {
    const before = Date.now();
    advancePendingNonce("SP1", 5n);
    const after = Date.now();
    const ts = pendingNonceTimestamps.get("SP1");
    expect(ts).toBeDefined();
    expect(ts!).toBeGreaterThanOrEqual(before);
    expect(ts!).toBeLessThanOrEqual(after);
  });

  it("should advance to a higher value when called sequentially", function () {
    advancePendingNonce("SP1", 0n);
    expect(pendingNonces.get("SP1")).toBe(1n);
    advancePendingNonce("SP1", 1n);
    expect(pendingNonces.get("SP1")).toBe(2n);
    advancePendingNonce("SP1", 2n);
    expect(pendingNonces.get("SP1")).toBe(3n);
  });

  it("should not regress to a lower nonce (out-of-order advance ignored)", function () {
    advancePendingNonce("SP1", 10n);
    expect(pendingNonces.get("SP1")).toBe(11n);
    // Simulate an out-of-order call with an older nonce
    advancePendingNonce("SP1", 5n);
    expect(pendingNonces.get("SP1")).toBe(11n);
  });

  it("should track multiple addresses independently", function () {
    advancePendingNonce("SP1", 3n);
    advancePendingNonce("SP2", 7n);
    expect(pendingNonces.get("SP1")).toBe(4n);
    expect(pendingNonces.get("SP2")).toBe(8n);
  });
});

describe("resetPendingNonce", () => {
  it("should remove the address from both maps", function () {
    advancePendingNonce("SP1", 5n);
    expect(pendingNonces.has("SP1")).toBe(true);
    expect(pendingNonceTimestamps.has("SP1")).toBe(true);

    resetPendingNonce("SP1");
    expect(pendingNonces.has("SP1")).toBe(false);
    expect(pendingNonceTimestamps.has("SP1")).toBe(false);
  });

  it("should be safe to call on an address with no tracked nonce", function () {
    expect(() => resetPendingNonce("SP_UNKNOWN")).not.toThrow();
  });

  it("should not affect other addresses", function () {
    advancePendingNonce("SP1", 3n);
    advancePendingNonce("SP2", 9n);
    resetPendingNonce("SP1");
    expect(pendingNonces.has("SP1")).toBe(false);
    expect(pendingNonces.get("SP2")).toBe(10n);
  });
});

describe("forceResyncNonce", () => {
  it("should behave identically to resetPendingNonce", function () {
    advancePendingNonce("SP1", 2n);
    expect(pendingNonces.has("SP1")).toBe(true);

    forceResyncNonce("SP1");
    expect(pendingNonces.has("SP1")).toBe(false);
    expect(pendingNonceTimestamps.has("SP1")).toBe(false);
  });
});

describe("stale nonce timeout", () => {
  it("should expose STALE_NONCE_MS as 10 minutes", function () {
    expect(_testingNonceMaps.STALE_NONCE_MS).toBe(10 * 60 * 1000);
  });

  it("should detect an entry older than STALE_NONCE_MS as stale", function () {
    // Simulate an entry that was last advanced beyond the stale window
    pendingNonces.set("SP_STALE", 42n);
    pendingNonceTimestamps.set(
      "SP_STALE",
      Date.now() - _testingNonceMaps.STALE_NONCE_MS - 1
    );

    // Verify the timestamp math correctly identifies the entry as stale.
    // Note: actual cleanup happens in getNextNonce (requires network),
    // so this test only validates the staleness computation.
    const ts = pendingNonceTimestamps.get("SP_STALE")!;
    const isStale = Date.now() - ts > _testingNonceMaps.STALE_NONCE_MS;
    expect(isStale).toBe(true);
  });

  it("should treat a freshly-advanced entry as not stale", function () {
    advancePendingNonce("SP_FRESH", 1n);
    const ts = pendingNonceTimestamps.get("SP_FRESH")!;
    const isStale = Date.now() - ts > _testingNonceMaps.STALE_NONCE_MS;
    expect(isStale).toBe(false);
  });
});

describe("FIFO size bound (MAX_NONCE_ENTRIES)", () => {
  it("should expose MAX_NONCE_ENTRIES as 100", function () {
    expect(MAX_NONCE_ENTRIES).toBe(100);
  });

  it("should not exceed MAX_NONCE_ENTRIES after filling past the limit", function () {
    // Fill the map to MAX_NONCE_ENTRIES
    for (let i = 0; i < MAX_NONCE_ENTRIES; i++) {
      advancePendingNonce(`SP_ADDR_${i}`, 0n);
    }
    expect(pendingNonces.size).toBe(MAX_NONCE_ENTRIES);

    // Add one more — should evict the oldest, keeping size at MAX
    advancePendingNonce(`SP_ADDR_${MAX_NONCE_ENTRIES}`, 0n);
    expect(pendingNonces.size).toBe(MAX_NONCE_ENTRIES);
  });

  it("should evict the oldest entry (insertion-order FIFO) on overflow", function () {
    // Fill to capacity
    for (let i = 0; i < MAX_NONCE_ENTRIES; i++) {
      advancePendingNonce(`SP_ADDR_${i}`, 0n);
    }
    expect(pendingNonces.has("SP_ADDR_0")).toBe(true);

    // Overflow: SP_ADDR_0 should be evicted as the oldest
    advancePendingNonce(`SP_ADDR_${MAX_NONCE_ENTRIES}`, 0n);
    expect(pendingNonces.has("SP_ADDR_0")).toBe(false);
    expect(pendingNonces.has(`SP_ADDR_${MAX_NONCE_ENTRIES}`)).toBe(true);
  });

  it("should evict from pendingNonceTimestamps in sync with pendingNonces", function () {
    for (let i = 0; i < MAX_NONCE_ENTRIES; i++) {
      advancePendingNonce(`SP_ADDR_${i}`, 0n);
    }
    advancePendingNonce(`SP_ADDR_${MAX_NONCE_ENTRIES}`, 0n);

    // Both maps should no longer contain the oldest address
    expect(pendingNonces.has("SP_ADDR_0")).toBe(false);
    expect(pendingNonceTimestamps.has("SP_ADDR_0")).toBe(false);
  });

  it("should not evict when updating an existing address (no size change)", function () {
    // Fill to exactly MAX_NONCE_ENTRIES
    for (let i = 0; i < MAX_NONCE_ENTRIES; i++) {
      advancePendingNonce(`SP_ADDR_${i}`, 0n);
    }
    expect(pendingNonces.size).toBe(MAX_NONCE_ENTRIES);

    // Update SP_ADDR_0 with a higher nonce — size should stay the same, no eviction
    advancePendingNonce("SP_ADDR_0", 99n);
    expect(pendingNonces.size).toBe(MAX_NONCE_ENTRIES);
    expect(pendingNonces.get("SP_ADDR_0")).toBe(100n);
  });

  it("should maintain correct nonce values after eviction", function () {
    // Fill to capacity with known nonces
    for (let i = 0; i < MAX_NONCE_ENTRIES; i++) {
      advancePendingNonce(`SP_ADDR_${i}`, BigInt(i));
    }

    // Overflow: trigger eviction
    advancePendingNonce("SP_NEW", 0n);

    // SP_ADDR_1 through SP_ADDR_99 should still have correct values
    for (let i = 1; i < MAX_NONCE_ENTRIES; i++) {
      expect(pendingNonces.get(`SP_ADDR_${i}`)).toBe(BigInt(i + 1));
    }
    expect(pendingNonces.get("SP_NEW")).toBe(1n);
  });
});
