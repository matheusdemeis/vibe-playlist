import { describe, expect, it } from "vitest";
import { canSaveAttempt, readDraft, retryDelayMs, writeDraft, type SaveAttempt } from "./playlist-draft";
const uri = `spotify:track:${"1".repeat(22)}`;
const id = "00000000-0000-4000-8000-000000000001";
const payload = { name: "Test", description: "", isPublic: false, trackUris: [uri], draftId: id };
const draft = { id, tracks: [{ id: "1".repeat(22), uri, name: "Test", artists: ["Artist"] }], attempt: { status: "pending", payload } };
describe("persistent draft safety", () => {
  it("restores an interrupted save as uncertain and blocks resubmission", () => {
    const restored = readDraft({ getItem: () => JSON.stringify(draft), setItem: () => {} }, "key");
    expect(restored?.attempt?.status).toBe("uncertain");
    expect(canSaveAttempt(restored?.attempt)).toBe(false);
  });
  it.each(["pending", "uncertain", "saved"])("blocks %s attempts", (status) => expect(canSaveAttempt({ status, payload } as SaveAttempt)).toBe(false));
  it("preserves recovery after an interrupted update without creating a new playlist", () => {
    const playlistId = "p".repeat(22);
    const recovery = { playlistId, playlistUrl: `https://open.spotify.com/playlist/${playlistId}`, recoveryToken: "signed-receipt" };
    const restored = readDraft({ getItem: () => JSON.stringify({ ...draft, attempt: { ...draft.attempt, recovery } }), setItem: () => {} }, "key");
    expect(restored?.attempt?.status).toBe("recovery");
    expect(restored?.attempt?.recovery).toEqual(recovery);
    expect(canSaveAttempt(restored?.attempt)).toBe(true);
  });
  it("allows explicit partial recovery and safe rejected requests", () => {
    expect(canSaveAttempt({ status: "recovery", payload })).toBe(true);
    expect(canSaveAttempt({ status: "failed", payload })).toBe(true);
  });
  it("handles invalid data and disabled storage without throwing", () => {
    const storage = { getItem: () => '{"id":"bad","tracks":[null]}', setItem: () => { throw new Error("quota"); } };
    expect(readDraft(storage, "key")).toBeNull();
    expect(writeDraft(storage, "key", { id, tracks: [] })).toBe(false);
  });
  it("uses Retry-After headers and structured error metadata", () => {
    expect(retryDelayMs({}, new Headers({ "Retry-After": "20" }))).toBe(20_000);
    expect(retryDelayMs({ error: { retryAfterSeconds: 30 } }, new Headers())).toBe(30_000);
  });
});
