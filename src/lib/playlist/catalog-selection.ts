import type { CatalogTrack } from "../spotify/catalog";

// Stable catalog order is the relevance signal. Prefer artist variety without
// pretending to infer audio similarity, energy, or popularity.
export function selectCatalogTracks(tracks: CatalogTrack[], count: number, maxPerArtist = 2): CatalogTrack[] {
  const selected: CatalogTrack[] = [];
  const overflow: CatalogTrack[] = [];
  const artists = new Map<string, number>();
  for (const track of tracks) {
    const ids = [...new Set(track.artists.map((artist) => artist.id))];
    if (ids.some((id) => (artists.get(id) ?? 0) >= maxPerArtist)) {
      overflow.push(track);
      continue;
    }
    selected.push(track);
    for (const id of ids) artists.set(id, (artists.get(id) ?? 0) + 1);
  }
  // A soft cap preserves requested length for intentionally narrow artist mixes.
  const pool = [...selected, ...overflow].slice(0, count);
  const ordered: CatalogTrack[] = [];
  while (pool.length) {
    const previous = new Set(ordered.at(-1)?.artists.map((artist) => artist.id));
    const next = pool.findIndex((track) => track.artists.every((artist) => !previous.has(artist.id)));
    ordered.push(pool.splice(next < 0 ? 0 : next, 1)[0]);
  }
  return ordered;
}
