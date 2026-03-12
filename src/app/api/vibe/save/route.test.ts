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

  it("fails when trackUris length exceeds 300", () => {
    const result = validateSavePayload({
      name: "My Playlist",
      description: "desc",
      isPublic: false,
      trackUris: Array.from({ length: 301 }, (_, index) => `spotify:track:${index + 1}`),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("between 1 and 300");
    }
  });

  it("treats string isPublic values as false", () => {
    const result = validateSavePayload({
      name: "My Playlist",
      description: "desc",
      isPublic: "false",
      trackUris: ["spotify:track:1"],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.isPublic).toBe(false);
    }
  });

  it("defaults to private when isPublic is missing", () => {
    const result = validateSavePayload({
      name: "My Playlist",
      description: "desc",
      trackUris: ["spotify:track:1"],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.isPublic).toBe(false);
    }
  });

  it("parses boolean isPublic=true", () => {
    const result = validateSavePayload({
      name: "My Playlist",
      description: "desc",
      isPublic: true,
      trackUris: ["spotify:track:1"],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.isPublic).toBe(true);
    }
  });

  it("treats non-boolean isPublic as false", () => {
    const result = validateSavePayload({
      name: "My Playlist",
      description: "desc",
      isPublic: "true",
      trackUris: ["spotify:track:1"],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.isPublic).toBe(false);
    }
  });
});
