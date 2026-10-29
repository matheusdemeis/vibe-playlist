# VibePlay — Phase 2 reliability checkpoint

Implementation date: 2026-10-28/29. This checkpoint covers reliability and API compatibility. The visual redesign, deeper generation improvements, and final accessibility pass remain separate phases. No production environment variables were edited, no deployment was made, and no commit was created.

## Bugs fixed

| Severity | Fix |
| --- | --- |
| High | Removed the advanced results regeneration loop. Locking, shuffling, and restoring drafts do not trigger generation. |
| High | Added encrypted refreshable sessions, PKCE, expiring OAuth state, safe callback return paths, and explicit logout. |
| High | Fixed ten-item Search pagination and stopped presenting upstream failures as successful empty results. |
| High | Replaced runtime Recommendations/Audio Features calls with bounded catalog Search and individual metadata lookups. |
| High | Preserved playlist IDs after failed insertion, added signed recovery, and stopped blind create/append retries. |
| Medium | Production connection status now includes scopes and validates the token against Spotify. |
| Medium | Mood-only advanced generation works; moods and explicit filtering reach the API. Inexact artist matches are no longer silently accepted. |
| Medium | Invalid/null payloads return controlled errors. HTTP 400/401/403/429/5xx and Retry-After retain useful meaning. |
| Medium | Removed token fragments from diagnostics and silent explicit-track removal after generic 403 responses. |
| Medium | Saved state survives reloads, regeneration clears old confirmation, storage failures are handled, and repeated saves are guarded. |
| Medium | Consent cancellation preserves settings/drafts; connection retries and disconnect have useful feedback. |
| Medium | Missing numeric URL settings use intended defaults. Unknown Spotify visibility remains unknown. |

Dependency patches preserve the stack: Next.js/eslint-config-next 16.4.3, React/React DOM 19.2.7, Vitest 4.1.12, and compatible transitive updates. No runtime library was added. `.nvmrc` and `engines.node` select Node 24; `npm run typecheck` was added. Vitest uses `.mts` configuration for explicit ESM loading.

## UI reliability changes

- Connected/checking/error state, connection retry, and disconnect in the primary generator.
- Review-before-save remains in both flows; failed generation preserves the previous mix.
- Feedback distinguishes rejected saves, interrupted outcomes, existing playlists needing recovery, and confirmed success.
- Pending save receipts persist before requests. Saving stops if browser storage cannot retain the receipt.
- Partial recovery exposes the existing playlist link. Uncertain creation directs users to their Spotify library and prevents automatic resubmission.
- Unsupported energy/valence/tempo inputs are disabled and explained. Catalog matching is not described as audio analysis.

The landing redesign, typography, modal keyboard behavior, contrast, reduced motion, and responsive polish remain Phase 3 work.

## Files and architecture

| Area | Main files |
| --- | --- |
| Authentication | `src/lib/auth/{oauth,sealed-cookie,spotify-session}.ts`, `src/lib/config/app-url.ts`, auth API routes |
| Spotify transport/catalog | `src/lib/spotify/{client,error,catalog}.ts`, generation/search/status API routes |
| Saving | `src/lib/playlist/{save,save-receipt,save-operations}.ts`, save/recovery routes, `src/lib/server/request.ts` |
| Persistent state | `src/components/vibe/{usePlaylistDraft,useSpotifyConnection}.ts`, `src/lib/storage/{playlist-draft,vibe-data}.ts` |
| Existing screens | `/generate`, `/vibe`, `/vibe/results`, `/vibe/history`, results/track components |
| Tests/toolchain | Tests alongside auth/API/playlist/storage helpers, `vitest.config.mts`, package files, `.nvmrc`, PostCSS config |
| Documentation | This report and `docs/spotify-flow-map.md` |

The app remains Next.js App Router, React, strict TypeScript, Tailwind, server API handlers, and browser-local history/presets. The shared catalog module is a compatibility baseline; recording-level deduplication, stronger preference parsing, ranking, and artist diversity remain Phase 4 work.

Session cookies use authenticated encryption with purpose-specific keys derived from the existing server-only Spotify client secret. Browser JavaScript receives no access/refresh token. Rotating that secret invalidates sessions and recovery receipts. Existing access-only cookies require one new login. Sessions have an absolute 30-day lifetime.

Recovery receipts expire after seven days and bind owner, playlist, name, description, visibility, and ordered tracks. Recovery reads the existing playlist and stops on external changes instead of overwriting them.

**Limits:** browser locks and the process-local journal reduce accidental duplicates, but there is no shared durable idempotency store across Vercel instances/devices. Concurrent recovery on separate instances and external playlist edits can still race. Spotify creation is not exactly-once; uncertain creation deliberately blocks automatic resubmission. Stronger guarantees require a durable operation store. Refresh coalescing is also local to a server process. Local drafts/history do not synchronize between devices.

## Verification

Run with Node 24 (`nvm use`):

```sh
npm ci
npm test
npm run lint
npm run typecheck
npm run build
npm audit
```

| Check | Result |
| --- | --- |
| Unit/regression tests | 89 passing tests across 15 files |
| ESLint | Pass, zero warnings/errors |
| TypeScript | Pass, including the production build's check |
| Production build | Pass, Next.js 16.4.3; all 21 routes compiled/generated |
| Dependency audit | Zero reported vulnerabilities at this checkpoint |
| Chrome with mocked APIs | Both generators, no automatic generation loop, lock/shuffle without fetching, explicit regeneration, saving, and reload persistence passed |
| Browser failure scenarios | Retry-After cooldown, mix preserved on 429, uncertain saves blocked across reload, and partial recovery with the original payload/receipt passed; no browser exceptions |
| Layout smoke check | No horizontal page overflow in the primary generator at 390×844, 768×1024, and 1440×900 |

Browser automation used temporary Playwright and local Chrome, without adding an app dependency. Mocked responses do not prove real Spotify access. Turbopack stalled inside the local filesystem sandbox; the build passed outside it. Node 24 ran from a temporary toolchain; the machine's global Node was not changed.

Not verified: authenticated live Spotify calls, Dashboard access mode/creation date, production environment values, full accessibility/assistive-technology behavior, cross-instance concurrency, or account-specific catalog availability.

## Configuration before a manual release

1. Use Node 24 locally and select the matching Vercel runtime when releasing.
2. Keep `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET` server-only, without a `NEXT_PUBLIC_` prefix.
3. Set `APP_BASE_URL` to the browser's exact origin. For the current live domain: `https://vibe-play-livid.vercel.app`. `APP_URL` remains a fallback. OAuth on preview deployments requires a matching registered origin/callback.
4. `SPOTIFY_REDIRECT_URI`, if supplied, must equal that origin plus `/api/auth/callback`; register it exactly in Spotify Dashboard. Local development defaults to `http://127.0.0.1:5000/api/auth/callback`. Use the explicit loopback IP, not `localhost`.
5. Reconnect once to grant the added `playlist-read-private` scope. The full set is `playlist-modify-private`, `playlist-modify-public`, `playlist-read-private`, and `user-read-private`. No new secret is required.
6. Confirm the Dashboard access mode and permitted users. Public Vercel hosting does not grant arbitrary Spotify accounts API access. See official references in the Phase 1 audit; Dashboard settings were not changed by this work.

## Manual Spotify acceptance tests

1. Connect an allowed account from each generator. Check successful return to the same settings, useful consent-cancellation feedback, and connected status after reload without false missing-permission warnings.
2. Generate mood-only and artist/track preference mixes. Review metadata, actual playable tracks, advanced explicit filtering, and feedback for short/empty results.
3. Save a uniquely named private playlist. Verify ordered tracks and visibility in Spotify. Reload VibePlay and verify the saved draft cannot submit again. Repeat deliberately with a new public playlist.
4. After access-token expiry, verify transparent refresh. Disconnect and reload; confirm the session is gone. Reconnect, revoke the application grant from Spotify separately, and verify reauthorization when access fails.
5. Simulate insertion failure in development. Recover the same playlist without duplicating tracks. Edit it externally before another recovery and verify VibePlay refuses to overwrite the changed sequence.
6. If available, test an unallowlisted Development Mode account and verify the access explanation. Simulate 429/Retry-After and service failures locally; do not deliberately exhaust production quota.

Stop here for review and a separate Phase 2 commit. Phase 3 begins when the user continues.
