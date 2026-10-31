# Spotify integration architecture (Phases 1–6)

## Authentication

1. /api/auth/login and /api/auth/reconnect use src/lib/auth/oauth.ts to generate state and an S256 PKCE challenge. An encrypted HttpOnly cookie holds state, verifier, expiry, and an allowlisted return path. Reconnect requests consent without destroying a working session first.
2. /api/auth/callback consumes and validates state, handles denied consent, and exchanges the code and verifier on the server. Errors redirect to the initiating screen with a safe error code.
3. src/lib/auth/spotify-session.ts stores access token, refresh token, scopes, and expiry in an authenticated encrypted HttpOnly cookie. Purpose-specific keys derive from the existing server-only client secret. Cookies are Secure in production, SameSite=Lax, and have an absolute 30-day session lifetime.
4. Access tokens refresh shortly before expiry. An omitted replacement refresh token/scope retains the old value. invalid_grant clears the session; transient failures preserve it. Refreshes are coalesced within one server process.
5. /api/spotify/status validates the session against GET /me and returns connection/scopes/account metadata without tokens. /api/me shares this implementation. Revoked access clears the local session.
6. Same-origin POST /api/auth/logout clears local authentication cookies. It does not revoke the Spotify application grant.

Requested scopes: playlist-modify-private, playlist-modify-public, playlist-read-private, and user-read-private. Private playlist reading supports safe partial-save recovery.

## Generation

- /generate posts to /api/generate. /vibe/results posts to /api/vibe/generate. /api/spotify/search-tracks supports catalog lookup.
- Both flows use src/lib/spotify/catalog.ts: Search pages of at most ten, bounded request budgets, offset pagination, URI/ID/recording deduplication, and explicit/playability filtering. Source ranks are interleaved before deterministic artist-diversity selection from a bounded candidate pool.
- Primary preferences use exact artist resolution when possible; inexact artist matches are not silently selected. Advanced references use individual track metadata and their artists.
- Mood presets guide genre/metadata queries. These are catalog matches, not measured audio similarity. Recommendations and Audio Features endpoints are no longer called. Energy, valence, and tempo controls are disabled and explained.
- Authentication, access, quota, rate-limit, and service failures retain useful HTTP statuses and Retry-After. Empty/short successful results are distinct from API failures.
- Both generation screens combine navigation cancellation with a 90-second browser deadline. Server requests retain individual timeouts and a bounded search budget; browser cancellation does not guarantee cancellation of server work already running.
- usePlaylistDraft persists reviewable tracks and save state. Advanced results initialize once per settings query; lock/shuffle/edit events do not start generation. Explicit regeneration replaces the draft only after a successful nonempty response.

## Saving and recovery

1. Both UIs use src/components/vibe/usePlaylistDraft.ts. The hook persists a pending save before submitting, guards repeated clicks, and uses browser locks when available to coordinate tabs for that draft.
2. POST /api/vibe/save requires Origin to match APP_BASE_URL (or APP_URL fallback), validates payloads, and checks visibility-specific write scopes plus private playlist reading.
3. src/lib/playlist/save.ts obtains the current user from /me, creates with POST /me/playlists, and inserts with POST /playlists/{id}/items in batches of at most 100.
4. A bounded process-local operation journal coalesces repeat submissions. This supplements browser state; it is not a distributed exactly-once guarantee.
5. Once creation returns an ID, insertion failures include a signed recovery receipt bound to playlist, owner, immutable draft contents, and expiry. There are no automatic append retries or silent explicit-track removals.
6. Explicit recovery checks ownership and reads /playlists/{id}/items. Existing contents must match the draft's prefix; only missing tracks are appended. Completed contents require no writes. External edits stop recovery rather than being overwritten.
7. Ambiguous creation without an ID blocks automatic resubmission and asks users to inspect their library. Confirmed saves stay saved across reloads. Another playlist requires a new generated draft.

The legacy /api/playlists/[playlistId]/add-tracks route requires a signed recovery receipt and the original full payload, delegating to the save handler. Current UI recovery uses /api/vibe/save directly.

## Shared boundaries

- src/lib/spotify/client.ts: server-only transport, bounded timeouts, no-store, safe diagnostics; no automatic write retry.
- src/lib/spotify/error.ts: safe messages and Retry-After parsing, including quota-specific 429 responses.
- src/lib/config/app-url.ts: explicit production origin, matching callback, HTTPS or local loopback, restricted return paths.
- src/lib/storage/playlist-draft.ts and vibe-data.ts: runtime validation and storage-failure handling.

See [Phase 6 release readiness](phase-6-release-readiness.md) for the current release decision and live acceptance gate. Historical audit and implementation reports are indexed in [the documentation overview](README.md).
