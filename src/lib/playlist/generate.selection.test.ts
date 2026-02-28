import { describe, expect, it } from "vitest";
import { dedupeTracksById, limitTracksPerArtist, type SpotifyTrack } from "./generate";

function track(id: string, artistId: string): SpotifyTrack {
  return {
    id,
    artists: [{ id: artistId, name: artistId }],
  };
}

describe("dedupeTracksById", () => {
  it("removes duplicate track ids while preserving order", () => {
    const input = [track("t1", "a1"), track("t2", "a2"), track("t1", "a3"), track("t3", "a1")];

    expect(dedupeTracksById(input).map((item) => item.id)).toEqual(["t1", "t2", "t3"]);
  });
});

describe("limitTracksPerArtist", () => {
  it("limits repeats by primary artist", () => {
    const input = [
      track("t1", "a1"),
      track("t2", "a1"),
      track("t3", "a1"),
      track("t4", "a2"),
      track("t5", "a2"),
      track("t6", "a3"),
    ];

    const output = limitTracksPerArtist(input, 2, 6);

    expect(output.map((item) => item.id)).toEqual(["t1", "t2", "t4", "t5", "t6", "t3"]);
  });

  it("fills from overflow when strict cap would return too few tracks", () => {
    const input = [track("t1", "a1"), track("t2", "a1"), track("t3", "a1"), track("t4", "a1")];

    const output = limitTracksPerArtist(input, 2, 4);

    expect(output.map((item) => item.id)).toEqual(["t1", "t2", "t3", "t4"]);
  });
});
