import { describe, expect, it } from "vitest";
import { validateSavePayload } from "./route";

describe("validateSavePayload", () => {
  it("fails when playlist name is missing", () => {
    const result = validateSavePayload({
      name: " ",
      description: "desc",
      isPublic: false,
      trackUris: ["spotify:track:1"],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("Playlist name is required");
    }
  });

  it("fails when trackUris length exceeds 100", () => {
    const result = validateSavePayload({
      name: "My Playlist",
      description: "desc",
      isPublic: false,
      trackUris: Array.from({ length: 101 }, (_, index) => `spotify:track:${index + 1}`),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("between 1 and 100");
    }
  });
});
