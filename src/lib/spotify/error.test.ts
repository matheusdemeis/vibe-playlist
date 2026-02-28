import { describe, expect, it } from "vitest";
import { formatSpotifyApiErrorMessage } from "./error";

describe("formatSpotifyApiErrorMessage", () => {
  it("uses nested spotify error message when json body is present", () => {
    const body = JSON.stringify({ error: { status: 404, message: "Not found" } });
    const message = formatSpotifyApiErrorMessage(404, body);
    expect(message).toBe("Spotify API 404: Not found");
  });

  it("falls back to raw text when body is not json", () => {
    const message = formatSpotifyApiErrorMessage(500, "Server exploded");
    expect(message).toBe("Spotify API 500: Server exploded");
  });

  it("includes request id when available", () => {
    const headers = new Headers({ "spotify-request-id": "abc-123" });
    const message = formatSpotifyApiErrorMessage(401, '{"error":{"message":"Auth failed"}}', headers);
    expect(message).toBe("Spotify API 401: Auth failed (Request ID: abc-123)");
  });

  it("handles empty body safely", () => {
    const message = formatSpotifyApiErrorMessage(404, "");
    expect(message).toBe("Spotify API 404: No response body returned.");
  });
});
