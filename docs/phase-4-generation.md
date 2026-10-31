# Phase 4 — Catalog playlist generation

## Confirmed problems addressed

- Short playlists could fill from the first genre page before other sources were searched.
- Artist diversity was applied after collecting only the requested track count, so there were no extra candidates to replace repeated artists. The basic generator had no artist diversity selection.
- Reference queries were ordered artist-first, so the ten-query cutoff could omit later reference artists entirely.
- Mood genres could crowd explicit genre choices out of the bounded query list.
- Deduplication only considered Spotify IDs and URIs, allowing the same recording on different releases to repeat.

## Implementation

Both generators collect a candidate pool of up to twice the requested length (100 candidates for the basic generator; 200 for the advanced generator). Collection finishes each round of active sources and interleaves their results by source rank. The existing ten-query, twenty-search-request ceiling and ten-result page size remain. This can require more requests than the old early-exit behavior, but never raises the search-request ceiling. Reference lookups (up to five) and basic artist resolution remain additional requests.

The shared `selectCatalogTracks` helper prefers at most two appearances per artist, including collaborators, before filling from overflow when needed. It separates consecutive artist appearances where remaining selected candidates permit. This is a soft diversity preference, not a guarantee: a deliberately narrow single-artist request can still fill its requested length. Identical catalog responses and inputs produce identical selections; regeneration does not promise novel tracks.

Catalog collection deduplicates IDs, URIs, optional ISRC recording identifiers, and normalized exact titles with the same artist identities. Version labels are preserved, so explicitly named live/remix versions remain distinct unless they share a recording ID. Title-based deduplication is a heuristic: different recordings with identical titles and artists can be collapsed. No audio analysis or fuzzy musical-similarity claim is made.

Advanced generation interleaves explicit genres with mood presets, rotates the retained reference artists within each genre, and verifies returned artist identities. Up to five reference tracks and five distinct artists remain supported internally; a ten-query budget cannot cover every artist/genre combination. Metadata lists the genres actually included in the query plan. The existing legacy parameter metadata is retained for compatibility; energy, valence, and tempo remain unapplied, as the response warning explains.

Basic generation keeps exact artist resolution and identity filtering. Other preference text is quoted as a literal catalog phrase. A song title remains a text search constraint, not a claim of audio-similar recommendations. Mood/artist or mood/text intersections are not silently broadened when empty. Existing empty/partial-result warnings remain.

## Spotify API basis

- [Search reference](https://developer.spotify.com/documentation/web-api/reference/search): documents artist, genre, and track filtering. Searches use the authenticated user's market context.
- [November 2024 restrictions](https://developer.spotify.com/blog/2024-11-27-changes-to-the-web-api): excludes Recommendations, related artists, and audio features from affected development integrations. No such endpoints were introduced.
- [February 2026 changelog](https://developer.spotify.com/documentation/web-api/references/changes/february-2026): documents the reduced search page size and retains individual catalog track lookup.
- [July 2026 quota update](https://developer.spotify.com/blog/2026-07-23-web-api-quota-updates): developer-account quotas are shared across Development Mode apps. The existing error layer already distinguishes `QUOTA_EXCEEDED` and preserves Retry-After; search failures still stop collection immediately.

The dashboard access tier was not inspected. These changes use the existing search and individual catalog lookup endpoints rather than assuming extended quota access. No scraping, unsupported recommendation fallback, random ranking, or new dependency was added.

## Changed files

- `src/lib/spotify/catalog.ts`: balanced collection, recording/title deduplication, per-query artist identity filtering.
- `src/lib/playlist/catalog-selection.ts`: shared deterministic artist diversity and ordering.
- `src/lib/playlist/generate.ts`: advanced candidate selection and query planning.
- `src/app/api/generate/route.ts`: basic candidate selection and literal text preference.
- `src/lib/spotify/catalog.test.ts`: source balance, deduplication, availability, pagination, budgets, and artist selection.
- `src/lib/playlist/generate.catalog.test.ts`: reference identity, query coverage, explicit genre inclusion, and full request-budget regression coverage.
- `src/app/api/generate/route.test.ts`: updated literal-query expectation.

## Verification

Commands ran individually, with closed stdin and CI mode under Node 24. No development server was started.

| Check | Timeout | Result |
| --- | --- | --- |
| `npm test` | 60 seconds | 133 tests passed across 19 files |
| `npm run lint` | 60 seconds | Passed |
| `npm run typecheck` | 60 seconds | Passed |
| `npm run build` | 120 seconds | Passed; 21 routes |
| `git diff --check` | — | Passed |

The API tests use fixture responses. Live musical relevance, market-dependent result counts, and subjective listening quality remain unverified. No UI, OAuth, origin protection, playlist-saving, or recovery code changed in this phase. No environment or dashboard changes are required. No commits or deployments were performed.

## Manual review before Phase 5

1. Generate a short mood-only mix and check artist variety, then compare a different mood.
2. Add an exact artist preference and confirm every result includes that artist. A narrow mood/artist intersection may legitimately be short or empty.
3. Try a song-title preference; confirm it behaves as a catalog phrase search rather than promising similar-sounding music.
4. In the advanced generator, combine explicit genres with moods and test the explicit-content setting.
5. Review results for repeated recordings. Regenerating unchanged preferences can return the same mix.
6. Save a reviewed mix and verify track order in Spotify as part of the remaining live acceptance checks.

Stop here for a separate Phase 4 review/commit; Phase 5 remains a separate task.
