# VibePlay — Phase 1 audit

Audit date: 2026-10-28. Branch: `improve-vibeplay`.

This phase inspects the existing application and records an implementation plan. Application code, dependencies, production configuration, and Spotify accounts have not been changed. No deployment or commit was made. Source references below describe the code at the start of the audit.

## Existing architecture and flow

The application uses Next.js 16.1.6 App Router, React 19.2.3, strict TypeScript, Tailwind CSS 4, and Vitest. Its runtime dependencies are limited to Next.js, React, and React DOM. There is no application database; presets and history live in browser localStorage. Keep this stack and the useful separation between API handlers, Spotify helpers, and UI components.

| Area | Existing implementation |
| --- | --- |
| Landing | `src/app/page.tsx`; links to `/generate` |
| Primary generator | `src/app/generate/page.tsx` → `POST /api/generate`; Spotify Search |
| Advanced builder | `/vibe` → `/vibe/results` → `POST /api/vibe/generate`; Recommendations and Audio Features |
| Presets/history | `src/lib/storage/vibe-data.ts`, `/vibe/history`; local to the browser |
| Login | `GET /api/auth/login`; UUID state cookie and Spotify Authorization Code flow |
| Callback | `GET /api/auth/callback`; validates state, exchanges code on the server, stores access token and scopes in HttpOnly cookies |
| Session | `src/lib/auth/spotify-session.ts`; reads cookies; no refresh implementation |
| Connection | `GET /api/me`, `GET /api/spotify/status`; checks cookie presence |
| Reconnect | `GET /api/auth/reconnect`; clears cookies and starts login again; no separate logout |
| Catalog helper | `POST /api/spotify/search-tracks` |
| Saving | `POST /api/vibe/save` → `/me` preflight → `src/lib/playlist/save.ts` → `POST /me/playlists` → `POST /playlists/{id}/items` |
| Insertion retry | `POST /api/playlists/[playlistId]/add-tracks` |
| Diagnostics | Three `/api/debug/spotify...` routes; return 404 outside development |

Successful login redirects to `/`, regardless of the initiating page. Both generator experiences display track metadata before saving and support an editable playlist name, description, visibility, and a link to Spotify after success. The advanced experience also has lock, remove, shuffle, presets, and history functionality worth preserving.

## Confirmed findings

Severity reflects user impact and implementation priority. A conditional Spotify restriction or dependency advisory is explicitly distinguished from a reproduced application defect.

| Severity | Finding and impact | Source evidence |
| --- | --- | --- |
| High | **Advanced results can repeatedly regenerate.** A successful response updates tracks, which always creates a new locked-track cache object. That changes the fetch callback and retriggers its effect. This also repeats history writes and can overwrite user edits. | `src/app/vibe/results/VibeResultsClient.tsx:124`, `:185`, `:187`, `:366` |
| High | **Sessions cannot refresh.** The callback discards the refresh token and expires access cookies with the access token. Users must authorize again after expiry, including while reviewing a draft. | `src/app/api/auth/callback/route.ts:11`, `:86`; `src/lib/auth/spotify-session.ts:17` |
| High | **Search pagination fails after the 10-result fallback.** Search initially requests 25–50 results. A rejected limit is retried as 10, but the pagination loop compares the returned count against the original larger limit and stops. A mocked request for 25 returned only 10, with all requests at offset 0. | `src/app/api/generate/route.ts:430`, `:476` |
| High | **Generation hides Spotify failures as successful empty results.** Failed search calls are discarded and other queries continue. A mocked upstream 429 returned HTTP 200 with an empty list and warning, while another upstream request was attempted. Authentication and permission failures can be hidden by the same path. | `src/app/api/generate/route.ts:395`, `:200`, `:214` |
| High | **A failed save can leave a playlist behind and create another on retry.** Creation happens before insertion, but insertion failures do not return the newly created playlist ID/URL as recovery state. There is no server idempotency mechanism. Existing click guards only prevent immediate concurrent submission. | `src/lib/playlist/save.ts:103`; `src/app/api/vibe/save/route.ts:123` |
| High | **Write retries ignore Spotify's requested delay.** Append requests retry 429/5xx after 300/600 ms. Repeating an append after an ambiguous server failure can duplicate tracks; the current code does not reconcile existing contents. | `src/lib/playlist/save.ts:258` |
| High, access-dependent | **Advanced generation still requires restricted APIs.** Calls to `/recommendations` and `/audio-features` are present and reachable. This is a confirmed compatibility risk; rejection by this particular Client ID has not been tested. | `src/lib/playlist/generate.ts:243`, `:316`; official restrictions below |
| Medium | **Production displays a false missing-permissions warning.** Status only includes scopes in development; the primary UI interprets omitted production scopes as an empty grant. This warning does not itself block the save handler. | `src/app/api/spotify/status/route.ts:14`; `src/app/generate/page.tsx:82`, `:273` |
| Medium | **Advanced mood and explicit controls are disconnected from the request.** Mood-only input passes builder validation but fails API seed validation because `vibes` is omitted. `includeExplicit` is also omitted and unenforced. | `src/lib/vibe-builder.ts:57`, `:87`; `src/app/vibe/results/VibeResultsClient.tsx:138`; `src/app/api/vibe/generate/route.ts:92` |
| Medium | **Track preferences may resolve to an unrelated artist.** When artist search has no exact match, the first result is accepted and every track is subsequently filtered to that artist. A track title or several artists are not handled as distinct preferences. | `src/app/api/generate/route.ts:339`, `:412` |
| Medium | **Mood relevance is weakened without explanation.** The primary generator searches metadata keywords, then relaxes to artist-only catalog results or `popular hits`. It does not analyze audio, and its artist path has no artist-diversity cap. Both generators deduplicate IDs, not alternate releases of the same recording. | `src/app/api/generate/route.ts:497`, `:516`; `src/lib/playlist/generate.ts` |
| Medium | **Save preflight confuses outages/rate limits with expired login.** Every Spotify error except 403 becomes `not_authenticated`; Retry-After is lost. Network failures can escape the later handler catch. | `src/app/api/vibe/save/route.ts:39` |
| Medium | **Generic 403 recovery silently removes explicit tracks.** It fetches individual track details and drops explicit tracks without requiring evidence that the account's explicit filter caused the rejection. This can alter the reviewed playlist and add up to 100 catalog requests per batch. | `src/lib/playlist/save.ts:205`, `:312` |
| Medium | **Invalid input can produce uncontrolled 500s.** JSON parsing and runtime shape checks are incomplete; JSON `null` was reproduced throwing in `/api/generate`. Search also calls `.trim()` on an unvalidated query. Save and insertion routes catch invalid JSON syntax but do not safely handle all JSON shapes. | `src/app/api/generate/route.ts:163`; `src/app/api/spotify/search-tracks/route.ts:32`; save/add-tracks route validators |
| Medium | **Token fragments are unnecessarily logged.** Production HTTP errors and save diagnostics include the last six token characters. Development debug routes expose prefixes. This is not evidence of full-token disclosure. | `src/lib/spotify/client.ts:81`, `:154`; `src/lib/playlist/save.ts:87`, `:377` |
| Medium | **Login failure and disconnect UX is incomplete.** Consent denial is mislabeled as invalid state and shown as raw JSON; success loses the initiating route. Cookie presence can show a revoked token as connected. Reconnect is available, but explicit logout is absent. | `src/app/api/auth/callback/route.ts:19`, `:84`; `src/app/api/me/route.ts:4`; `src/app/api/auth/reconnect/route.ts` |
| Medium | **Connection checking can remain stuck after a network error.** An uncaught Promise.all leaves the primary generator in its disabled checking state. | `src/app/generate/page.tsx:68` |
| Medium | **Draft and saved state can diverge.** Regeneration does not clear the previous saved-playlist confirmation; the same draft can be saved again after success. | `src/app/generate/page.tsx:108`, `:158`; `src/app/vibe/results/VibeResultsClient.tsx` |
| Medium | **Storage failures can interrupt otherwise successful work.** Stored JSON is cast without runtime validation and storage reads/writes can throw. History writes happen inside a React state updater, which must be pure; development replay can duplicate those side effects. | `src/lib/storage/vibe-data.ts:121`; `src/app/vibe/results/VibeResultsClient.tsx:155`, `:289` |
| Medium | **Missing numeric URL values become zero.** Number(null) bypasses intended defaults for energy/valence; missing results trackCount also becomes invalid zero. | `src/app/vibe/page.tsx:24`; `src/app/vibe/results/VibeResultsClient.tsx:48` |
| Medium | **Save visibility reporting can overstate certainty.** Missing/null observed visibility is coerced to false; contradictory later metadata is overridden by the create response. | `src/lib/playlist/save.ts:122`, `:549` |
| Low | **OAuth state cookie hardening is incomplete.** State is validated, but its cookie has no explicit expiry or production Secure flag. | `src/app/api/auth/login/route.ts:23` |

Existing protections to retain: server-side code exchange; client secret kept in server configuration; HttpOnly access cookies with Secure in production and SameSite=Lax; state validation; production-disabled debug handlers; URI validation/deduplication; insertion batches of at most 100; primary-flow in-flight submission guards.

Configuration risk, not a demonstrated deployment failure: `src/lib/config/app-url.ts` silently defaults to loopback if both app URL variables are absent. Independently configured redirect and application URLs can disagree. Production environment values and Dashboard settings were not inspected.

## Spotify documentation review: 2024–2026

- November 2024 restricted Recommendations, Audio Features, Related Artists, and other discovery features for affected Development Mode/new integrations. Do not assume availability because the app is public on Vercel. [Official announcement](https://developer.spotify.com/blog/2024-11-27-changes-to-the-web-api).
- The 2025 security migration deprecated Implicit Grant and insecure non-loopback redirects. VibePlay already uses a server Authorization Code exchange. Production redirects must use HTTPS; local redirects must use an explicit loopback address such as `127.0.0.1`, not `localhost`, and match registration. [Security migration](https://developer.spotify.com/blog/2025-02-12-increasing-the-security-requirements-for-integrating-with-spotify), [redirect requirements](https://developer.spotify.com/documentation/web-api/concepts/redirect_uri).
- February 2026 introduced a smaller Development Mode API surface, Search pages capped at 10, `/me/playlists` creation, and playlist `/items` paths. VibePlay's save paths already use the newer endpoints. [February changelog](https://developer.spotify.com/documentation/web-api/references/changes/february-2026), [current Search reference](https://developer.spotify.com/documentation/web-api/reference/search).
- The March 9 update postponed endpoint access changes for existing integrations. Therefore Client ID creation date and actual access mode matter; the February announcement alone does not prove an older app lost a particular endpoint. [Updated access announcement](https://developer.spotify.com/blog/2026-02-06-update-on-developer-access-and-platform-security).
- March restored `external_ids`, so available ISRC metadata can support recording deduplication. May added `account_id` as a stable account-linking identifier. [March changelog](https://developer.spotify.com/documentation/web-api/references/changes/march-2026), [May changelog](https://developer.spotify.com/documentation/web-api/references/changes/may-2026).
- June announced six-month refresh-token expiration, enforced for existing apps from July 20. A new refresh implementation must discard an expired token on `invalid_grant` and offer reauthorization, rather than endlessly retrying. [Refresh expiration announcement](https://developer.spotify.com/blog/2026-06-18-refresh-token-expiration).
- July increased the developer Client ID limit to 25 and moved Development Mode quota counting to the developer account. Quota failures can include `reason: QUOTA_EXCEEDED`; distinguish these from short-term rate limiting and honor Retry-After when supplied. [July changelog](https://developer.spotify.com/documentation/web-api/references/changes/july-2026), [rate-limit guidance](https://developer.spotify.com/documentation/web-api/concepts/rate-limits).
- Current quota guidance requires the Development Mode app owner to have Premium and describes up to five allowlisted users. An unallowlisted user may complete login but receive 403 from subsequent APIs. Public hosting does not grant public Spotify access. [Quota modes](https://developer.spotify.com/documentation/web-api/concepts/quota-modes).

The app's actual Dashboard access mode and creation date remain unverified. No authenticated endpoint probe or playlist mutation was performed.

## Dependency review

The lockfile pins Next.js 16.1.6 and sharp 0.34.5. These are within the version ranges covered by the October 2026 image-optimization advisory; the maintainers identify Next.js 16.4.1 / sharp 0.35.5 as patched baselines. This warrants a targeted dependency update before a future release. The advisory concerns image optimization on glibc Linux; production exploitability has not been established here, and no exploit was attempted. [Official advisory](https://github.com/vercel/next.js/security/advisories/GHSA-2464-fhr4-w9xw).

Do not equate every version-range match with a reachable vulnerability: this source contains no Server Actions, `use cache`, `next/og`, or image remotePatterns configuration. The separate Server Action DoS and remote-image SSRF advisories explicitly depend on such features. [Server Action advisory](https://github.com/vercel/next.js/security/advisories/GHSA-p3m5-59mp-jv5r), [remote-image advisory](https://github.com/vercel/next.js/security/advisories/GHSA-cjq9-62q9-8jv4). A full dependency vulnerability scan has not been run.

## UI/UX audit and redesign scope

All six requested moods already exist. Keep preview-before-save, editable names, Spotify links, and reusable track components. Improve the existing routes with a shared VibePlay shell, charcoal surfaces, consistent emerald/lime accents, clearer typography, and responsive track rows.

Confirmed accessibility issues:

- Both save dialogs lack focus placement/trapping, Escape dismissal, restoration, and an inert background. A native dialog can address this without a heavy dependency.
- Selected mood cards place small light text on a bright gradient. Contrast against the gradient endpoints is approximately 1.43:1, 1.83:1, and 3.55:1, below 4.5:1.
- Hidden visibility radios have no visible focus treatment; the preset-name input relies on placeholder text for labeling.
- Primary feedback lacks consistent live-region semantics. Skeleton animation has no reduced-motion override.
- Dialog height/scroll behavior on small viewports and mobile keyboards requires browser testing.

Design issues: dark primary pages and light advanced pages are inconsistent; product naming varies; there is no shared navigation/footer; history/presets are hard to discover; the landing CTA says “Get Started”; metadata description is empty; globals override the loaded Geist font with Arial. The connection panel remains a generic connect link even when connected. “Has Preview” labels do not offer playback and should not imply listening functionality.

The redesign should provide one clear primary generator, visible connection/account state, labeled artist/track preferences, selected mood cards, length control, honest loading feedback, editable results, a deliberate save action, and a persistent Spotify success link. Retain advanced settings only where the supported algorithm can meaningfully honor them.

## Verification baseline

| Check | Result |
| --- | --- |
| `npm test` | Passed: 40 tests across 8 files |
| `npm run lint` | Passed with 2 warnings: anonymous default export in postcss config; unused `excerpt` in save.ts |
| `tsc --noEmit --incremental false` | Passed |
| `npm run build` | Passed outside the sandbox; all routes compiled and static generation completed. The sandboxed attempt stalled and was stopped. Build warns that Browserslist data is outdated. |
| Live landing response | HTTP 200 from Vercel via a read-only HEAD request |
| Additional mocked probes | Confirmed 429-to-200 masking, 10-item pagination failure, and JSON-null crash; no real Spotify requests |

The existing tests cover useful mapping, selection, URI batching, payload validation, and storage basics. They do not establish end-to-end authentication or saving. Some expectations encode outdated behavior: oversized Search pages, ten combined recommendation seeds, and preferring initial visibility over contradictory later metadata.

Not verified: real OAuth consent/denial, token refresh, allowlist rejection, real playlist creation/insertion, production environment values, Dashboard configuration, visual rendering at desktop/tablet/mobile sizes, keyboard walkthroughs, and assistive-technology behavior. No browser automation package is currently installed.

## Implementation sequence and review boundaries

1. **Phase 2 — reliability:** stabilize automatic generation and draft state; implement token refresh and explicit disconnect; harden callback/configuration handling; fix production status; normalize validation and errors; honor rate-limit metadata; preserve partial-save recovery state; prevent avoidable repeat creation and unsafe write retries; remove token fragments from diagnostics; use the supported Search path for baseline generation. Include focused regression tests alongside these fixes. Evaluate dependency patches against current official releases before changing the lockfile. Stop for review and a separate commit.
2. **Phase 3 — UI/UX:** apply the shared visual system and responsive layouts; improve landing, connection, inputs, results, save confirmation, keyboard operation, contrast, and motion behavior. Preserve working features. Stop for review and a separate commit.
3. **Phase 4 — generation quality:** share one catalog-based service across flows; explicitly resolve artists/tracks; build mood-aware genre/catalog queries; paginate conservatively; deduplicate recordings when metadata permits; balance artists; disclose fallback/shortfall. Do not claim measured energy, valence, tempo, or audio similarity without supported data. Stop for review and a separate commit.
4. **Phase 5 — verification and cleanup:** complete meaningful auth/error/save/generation regression coverage, browser responsiveness/accessibility checks, lint, type-check, tests, and build. Update stale flow documentation and setup instructions; make the placeholder environment example trackable. Stop for review and a separate commit.
5. **Phase 6 — final handoff:** summarize completed changes, architecture, verification limits, manual Spotify tests, and required Dashboard/Vercel configuration. Deployment remains manual.

For Phase 2, a process-local Map alone would not guarantee duplicate-save protection across Vercel instances. The implementation must document its actual guarantees, preserve the created playlist ID through partial failure, and reconcile uncertain Spotify writes instead of claiming exactly-once behavior.

The only intended Phase 1 repository change is this report. Review checkpoint: application implementation has not begun.
