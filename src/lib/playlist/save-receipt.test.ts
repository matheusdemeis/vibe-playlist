import { describe, expect, it } from "vitest";
import { createSaveReceipt, readSaveReceipt } from "./save-receipt";

describe("save recovery authorization", () => {
  it("binds recovery to the owner, playlist and immutable draft", () => {
    const key = Buffer.from("test-only-receipt-key");
    const token = createSaveReceipt({ ownerId: "owner", playlistId: "p".repeat(22), fingerprint: "draft" }, key);
    expect(readSaveReceipt(token, "owner", "draft", key)?.playlistId).toBe("p".repeat(22));
    expect(readSaveReceipt(token, "other", "draft", key)).toBeNull();
    expect(readSaveReceipt(token, "owner", "changed", key)).toBeNull();
    expect(readSaveReceipt(`X${token.slice(1)}`, "owner", "draft", key)).toBeNull();
  });
});
