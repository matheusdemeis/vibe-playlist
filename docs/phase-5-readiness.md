# Phase 5 — Production readiness review

## Decision

**Ready for code review; live Spotify acceptance and deployment configuration review remain pending.** Passing fixtures and browser tests is not proof that the deployed application can authorize or save for an actual Spotify account. No real account was authorized for this session, no live playlist writes were approved, and no production configuration was changed.

The working tree was clean at the start of Phase 5. Phases 1–4, the origin hotfix, the catalog algorithm, and signed save recovery were preserved. No commit or deployment was performed. Stop here before Phase 6.

## Findings, severity, and disposition

| Severity | Finding | Disposition |
| --- | --- | --- |
| Medium | Both generation screens had no browser request deadline; a stalled fetch could leave loading active indefinitely. | Added a 90-second abort deadline while retaining navigation cancellation and existing retry/error handling. Tested the basic screen's timeout state without an automatic retry. |
| Medium | WebKit pointer clicks did not focus the save launcher; closing the dialog restored focus to the wrong element. | Explicitly focus the launcher before opening either generator's dialog. Regression tests pass in all three engines. |
| Medium / acceptance gate | Real authorization, catalog relevance, private/public writes, and actual dashboard access mode were not verified. | Exact manual checklist below. Do not advertise unrestricted public Spotify access. |
| Low | Preference wording could imply similar-sounding recommendations. | Explain that artist names constrain artists and song text matches the catalog. |
| Low | README was a placeholder and the safe environment template was ignored. | Added setup, architecture, security, limitations, and test instructions; allowlisted only `.env.example`. Actual environment files remain ignored. |
| Low / coverage | No committed reproducible browser suite, callback integration test, or measured scenario matrix. | Added Playwright/axe development dependencies and focused tests. |

No unresolved critical/high issue was identified in the reviewed paths. This is a scoped engineering review, not a penetration-test certification. Existing distributed-save limitations and deployment unknowns remain material below.

## Verification results

All commands ran noninteractively under Node 24, individually with process-group timeouts. No development server was used. Playwright managed a temporary production server on port 5001 with test-only configuration and refused to reuse an existing server.

| Command | Timeout | Final result |
| --- | --- | --- |
| `npm test` | 60 s | 143 tests passed in 21 files |
| `npm run lint` | 60 s | Passed |
| `npm run typecheck` | 60 s | Passed |
| `npm run build` | 120 s | Passed, 21 routes; final application build 2.7 s |
| `npm audit` | 60 s | Zero reported vulnerabilities, including added test dependencies |
| `git diff --check` | — | Passed |
| `npm run test:e2e` | 180 s suite / 210 s outer guard | 30 passed: ten each in Chromium, Firefox, and WebKit; 30.5 s command time |

Initial browser runs exposed the WebKit focus issue, which was fixed. A separate WebKit timeout-test failure was caused by held Playwright protocol interception: the timeout signal fired but the intercepted response completed. A standalone delayed local HTTP response verified native WebKit fetch rejects at the deadline. The final UI timeout test models an abort-aware pending fetch rather than holding a protocol request forever. No application workaround was added for that fixture limitation.

### Browser coverage

- Basic private/public payloads, edited name, displayed partial result, saved link, and reload without resubmission.
- Advanced generation, track locks, shuffle, explicit regeneration, modal focus restoration, and history.
- Unknown save outcome stays blocked after reload. Partial save preserves its payload and recovery receipt across reload and resumes the same draft.
- Connection Retry-After prevents another request during cooldown. Disconnected generation remains disabled.
- Actual unauthenticated HTTP requests to `/api/vibe/save`: configured `127.0.0.1:5001` reaches authentication (401); `localhost:5001` and external origins remain rejected (403), even with forged forwarded headers. These requests cannot create a Spotify playlist.
- Widths 320, 390, 768, and 1440; 720px reflow; short 320×480 viewport. Modal scroll reaches Save; keyboard focus stays inside and returns to its launcher.
- Reduced-motion mode, 200% CSS magnification, no horizontal document overflow, and no browser exceptions in the layout checks.
- Eighteen axe scans (six screens/states per engine) found no violations for WCAG A/AA tags. Native browser-chrome 200% zoom, real screen readers, and physical mobile devices still need manual review. Automated scans are not a full accessibility audit.
- Mobile results and dialog screenshots were inspected. Test screenshots/traces are ignored under `test-results/` and may be replaced on the next run.

## Catalog quality measurements

**Synthetic fixtures only.** These scenarios run the real route/collector/selector against constructed Spotify-shaped responses containing duplicate recordings, explicit tracks, multiple artists, and exhausted searches. They test invariants and strict constraints, not real musical relevance or Spotify availability. Fixture timing excludes network and OAuth latency.

| Scenario | Requested / returned | Unique primary artists | Largest artist share | Search calls | Track lookups | Fixture latency |
| --- | --- | --- | --- | --- | --- | --- |
| Chill | 25 / 25 | 10 | 12% | 9 | 0 | 4.88 ms |
| Night Drive + Drake | 25 / 25 | 1 | 100% | 10 | 0 | 1.41 ms |
| Gym | 50 / 50 | 12 | 12% | 12 | 0 | 1.30 ms |
| Party + Hip-Hop text (basic input) | 25 / 25 | 10 | 12% | 10 | 0 | 1.07 ms |
| Beach | 25 / 25 | 10 | 12% | 9 | 0 | 1.04 ms |
| Advanced: multiple moods/genres and two reference artists | 30 / 30 | 2 | 50% | 10 | 2 | 1.92 ms |
| Conflicting text/mood | 25 / 0 | 0 | — | 4 | 0 | 0.95 ms |

Every returned fixture track had a unique Spotify ID and recording identifier; duplicate title/artist combinations and explicit tracks were zero. Empty results included an explanation. Existing tests also cover partial results, restricted/unplayable tracks, response errors, and the twenty-page search ceiling. Browser fixtures explicitly display a two-track partial result.

Search counts include basic artist resolution where applicable. The intentionally strict Drake constraint correctly yields one artist; diversity cannot override it. The basic Hip-Hop text input is a phrase constraint, not a genre selector; the advanced genre control is the appropriate way to request a hip-hop genre filter. The advanced explanation still states that energy/tempo/valence are not applied. No strict constraint was broadened, and no algorithm rewrite was made.

Reproduce the matrix with the command in README. For live measurements, use the same scenarios and record returned count, IDs, available recording identifiers, title/artist pairs, primary-artist histogram, explicit flags, request count, and elapsed time. Count upstream requests using temporary aggregate server instrumentation only; browser Network shows one generation request, not all server-to-Spotify calls. Do not log tokens, cookies, or OAuth state. Live latency and musical quality are pending.

## Production-mode performance and efficiency

One unthrottled local run per engine at a 390×844 viewport:

| Engine | LCP | CLS | DOM content loaded | Load event | Loaded JS encoded / decoded |
| --- | --- | --- | --- | --- | --- |
| Chromium | 52 ms | 0 | 43.1 ms | 67.6 ms | 160,920 / 527,638 bytes |
| Firefox | 38 ms | 0 | 19 ms | 49 ms | 160,920 / 527,638 bytes |
| WebKit | 34 ms | 0 | 16 ms | 55 ms | 161,135 / 527,638 bytes |

Eight script resources loaded on the landing page (~157 KiB encoded, ~515 KiB decoded). These are browser resource measurements for that route, not the entire build's bundle sum. They are local lab samples, not real mobile/network performance or field Core Web Vitals. INP was not measured. Build artifacts include bundled fonts; no production field telemetry was added.

Connection checks occur on mount and explicit retry, with no interval polling. Tests observed one status call per mounted screen and one additional call after reload, not refresh/navigation loops. Locking/shuffling did not generate; explicit regeneration made one request. The React compiler remains enabled; no speculative rerender rewrite was made, and no React profiler render-count claim is made.

Album artwork keeps fixed dimensions, native lazy loading, and an error fallback. Real Spotify artwork/network performance was not measured because browser fixtures contain no remote artwork. History and presets are capped at 10 and 20. Draft writes are synchronous and bounded by playlist size per draft; advanced drafts use distinct keys and have no overall retention cap. No storage benchmark or evidence of a current storage bottleneck was obtained; future cleanup must preserve uncertain-save receipts.

Search collection remains sequential and bounded (twenty search pages, plus resolution/lookups), avoiding parallel quota bursts. API calls have individual timeouts; the new browser deadline does not guarantee cancellation of server-side work already running. Review the deployed function duration and consider a shared server-side generation deadline if live latency measurements show a problem. No unbounded retries or background Spotify polling were introduced.

## Security and compatibility review

- OAuth state is encrypted, expiring, consumed once, and compared safely. The callback integration now checks the original PKCE challenge/verifier, exact callback URI, encrypted session persistence, replay rejection, and denied consent.
- Existing session tests cover refresh coalescing, rotation, absolute expiry, corrupted cookies, invalid_grant, and preserving sessions on transient failures. Browser JavaScript does not receive Spotify access/refresh tokens.
- Origin protection still uses the configured canonical origin; transport/forwarded headers cannot authorize an external origin. Save/logout/debug mutation and compatibility-recovery regression coverage remains.
- Save scope/input checks, signed owner-bound recovery, existing-order checks, ordered batches, uncertain-outcome blocking, and Retry-After behavior are unchanged. No blind retry was added.
- Reviewed logging prints only method/status when explicitly enabled; public errors use safe messages. Development diagnostics are unavailable in production. Credentials were neither printed nor modified.
- Generation uses existing search and individual catalog lookups. There is no Recommendations, related-artists, audio-features, scraping, or inferred similarity fallback. Optional recording IDs are used only if supplied.
- [Spotify Development Mode](https://developer.spotify.com/documentation/web-api/concepts/quota-modes) requires an eligible Premium owner and allowlisted users; API 403 can occur even after login. [Redirect rules](https://developer.spotify.com/documentation/web-api/concepts/redirect_uri) require exact URLs and explicit loopback IPs locally. [Vercel supports Node 24](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions), matching the repository pin.

## Live acceptance — not completed

No live OAuth, account identity, catalog generation, playlist creation, library/order validation, token refresh, disconnect/reconnect, or revocation was certified in this session. All successful saves in automation were fixtures. The following steps must be performed by an explicitly authorized tester who approves creating the named test playlists.

1. **Configuration:** confirm the intended Spotify app and allowlisted tester in Dashboard. Verify local `APP_BASE_URL` (or APP_URL fallback) is `http://127.0.0.1:5000` and callback is exactly that origin plus `/api/auth/callback`. Never mix `localhost` and `127.0.0.1`.
2. **Login:** start locally, connect, consent, and confirm the displayed account matches the tester. `/api/spotify/status` should show the expected account and playlist scopes, with no tokens. Reload and navigate between generators; the session should persist without a redirect/request loop. Do not copy cookie values into screenshots or reports.
3. **Catalog:** run all scenarios in the matrix with real catalog responses. For Party + Hip-Hop genre, use advanced controls. Check titles/artists, availability, clean-only filtering, duplicates, and honest short/empty results. Do not equate genre matching with audio similarity.
4. **Approved private write:** use a distinct name such as `VibePlay acceptance private YYYYMMDD-HHMM`. Review the tracks and order, edit description, retain Private, then save once. Confirm a 200 result and open the returned Spotify link. Verify owner, name, description, privacy, count, and exact track sequence in the tester's library.
5. **Approved public write:** generate a new draft, use a distinct public test name, choose Public, and repeat the same checks. If scopes are missing, reconnect rather than repeatedly submitting the write.
6. **Persistence/repeat protection:** reload the saved draft and verify it remains saved and no second playlist appears. Check both generators.
7. **Refresh:** leave a session through its access-token expiry and check connection/generate again. Confirm account continuity and no browser-visible token. Do not edit or expose encrypted session cookies to force expiry.
8. **Disconnect/reconnect:** disconnect, confirm generation is disabled, reload to confirm disconnected status, then reconnect. In Spotify's account app-access settings, revoke authorization; the next refresh/protected call should require reconnect. Revocation may not invalidate an already-issued token instantly.
9. **Failure safety:** prefer deterministic tests for interrupted writes. Only with explicit write approval, interrupt a uniquely named test save and check the library before any further action. A creation outcome marked uncertain must not be resubmitted; a signed partial-recovery action must target the same playlist and verify existing order. Confirm no extra playlist appears. Do not delete test playlists without the account owner's approval.
10. **Accessibility/device:** test actual browser 200% zoom, keyboard-only flow, VoiceOver/NVDA, physical mobile, long real artist/title text, and loaded/broken artwork. CSS zoom and axe results alone do not cover these.

## Deployment checklist and remaining risks

- [ ] Live acceptance above signed off by the authorized tester, including private and public saves.
- [ ] Confirm actual Spotify Dashboard access mode, owner eligibility, allowlist, scopes, and exact production HTTPS callback. Public Vercel hosting does not change Spotify access rules.
- [ ] Review Vercel Node 24, install/build commands, function duration, canonical domain, and production environment values. Repository configuration was reviewed; the remote dashboard was not inspected or changed.
- [ ] Set canonical production origin to the intended HTTPS domain and callback to `/api/auth/callback`; APP_BASE_URL overrides APP_URL. Preview domains need intentional configuration/registration and are not implicitly trusted.
- [ ] Ensure every instance uses the same server-only secret. Rotation invalidates sessions and recovery receipts. No NEXT_PUBLIC credential variables.
- [ ] Review failed/slow requests and quota behavior with safe aggregate logs after an approved deployment. A hosting timeout during creation must remain an uncertain outcome, not trigger automatic retry.
- [ ] Run an approved deployment smoke test and real-device/field-performance checks. No deployment occurred in Phase 5.

The save cache is process-local and browser locks are browser-local; exactly-once creation across Vercel instances/devices is not guaranteed. Do not clear storage or start a new draft to bypass an uncertain-save state. A durable shared idempotency journal is a future improvement before broader scale. Other future work: server-wide generation deadlines/cancellation, bounded draft retention preserving receipts, field performance telemetry, and catalog-quality evaluation with authorized live accounts. None requires replacing the current application architecture.

## Files changed

- `README.md`, `.gitignore`, `.env.example`: reproducible setup, architecture/limitations, safe template inclusion, and ignored browser artifacts.
- `package.json`, `package-lock.json`: development-only Playwright/axe dependencies and `test:e2e` command; no new runtime dependencies.
- `playwright.config.ts`, `e2e/application.spec.ts`, `vitest.config.mts`: production-mode browser tests, three engines, timeout limits, fixture isolation, and separate unit/browser discovery.
- `src/app/api/auth/callback/route.test.ts`: integrated callback/PKCE/session tests.
- `src/lib/playlist/quality-scenarios.test.ts`: measured synthetic scenario matrix.
- `src/app/generate/page.tsx`: request deadline, accurate preference hint, and focus restoration support.
- `src/app/vibe/results/VibeResultsClient.tsx`: request deadline.
- `src/components/vibe/ResultsActionBar.tsx`: advanced save launcher focus.
- This report.
