# Phase 6 — Release readiness

## Executive summary and release decision

**BLOCKED — LIVE SPOTIFY ACCEPTANCE**  
**BLOCKED — CONFIGURATION** (remote settings require confirmation, not a proven misconfiguration)  
**BLOCKED — TECHNICAL ISSUE** (unresolved moderate development-dependency audit findings)

The application builds and its automated regression suites pass after a clean Node 24 installation. This does not establish live Spotify authorization, successful writes, or correctness of remote deployment settings. Every live acceptance gate is still PENDING in the [sign-off checklist](live-spotify-acceptance.md).

The final standalone `npm audit` also changed the dependency assessment: 16 moderate findings in the development-tool chain are reported through one minimatch advisory. Runtime-only audit reports zero. Do not classify the candidate as ready for approved deployment until live/configuration gates and the dependency disposition are signed off.

Phase 6 preserves application code, the Phase 3 design, Phase 4 selection, and Phase 5 safeguards. It fixes documentation packaging, refreshes the architecture and portfolio README, adds real unauthenticated screenshots, and supplies deployment/rollback instructions. No commit, push, merge, deployment, secret change, Spotify write, or permission revocation was performed.

## Confirmed issues and changes

1. **Missing reports in fresh clones:** `.gitignore` excluded phase reports, including the Phase 5 file linked by README. Phase 1, 4, and 5 reports were present locally but absent from `git ls-files`. Removed the report ignore rules; those files now need inclusion in the documentation commit. Historical reports are indexed and distinguished from current findings.
2. **Stale architecture description:** the flow map described Phase 2 only. Updated it for balanced catalog collection, recording deduplication, canonical-origin checks, and browser generation deadlines.
3. **Portfolio/release clarity:** README now includes a professional description, actual desktop/mobile landing captures, a prominent pending-release statement, production requirements, and current acceptance links.
4. **New audit blocker:** investigated and documented the minimatch advisory instead of applying npm's incompatible forced ESLint downgrade. No dependency override or suppression was introduced.

No new release-blocking application defect was reproduced in this phase. Existing unresolved limitations are listed below rather than being presented as newly fixed.

## Automated verification

Commands ran individually, noninteractively, using Node 24 and explicit process-group timeouts. Build preceded browser testing because Playwright starts the production build. No development server was started, and the test server was automatically stopped.

| Check | Timeout | Result |
| --- | --- | --- |
| `npm ci` | 120 s | Passed in 6.1 s; lockfile unchanged |
| `npm test` | 60 s | 143 tests passed across 21 files; 2.2 s |
| `npm run lint` | 60 s | Passed; 3.7 s |
| `npm run typecheck` | 60 s | Passed; 1.3 s |
| `npm run build` | 120 s | Passed, 21 routes; 4.1 s |
| `npm run test:e2e` | 180 s suite / 210 s outer limit | 30 passed: ten each in Chromium, Firefox, WebKit; 33.4 s |
| `npm audit` | 60 s | Exit 1: 16 moderate findings in development dependencies; completed in 30.9 s, not a hang |
| `npm audit --omit=dev` | 60 s | Passed, zero reported runtime vulnerabilities; 0.8 s |
| `git diff --check` | — | Passed |

`npm ci` emitted warnings for unapproved install scripts in `fsevents` and `unrs-resolver`; no scripts were newly approved, and tests/lint/build worked with the installed platform packages. Its initial audit reported zero; the later explicit audit result above is the release assessment and supersedes that earlier result.

Playwright still uses test-only credentials and fresh browser contexts. Catalog and successful save responses are mocked. The real server origin checks are unauthenticated and cannot write to Spotify. Regression coverage includes PKCE callback/session persistence, refresh behavior, canonical loopback origin handling, selection constraints, duplicates, scoped saving, ordered insertion, signed recovery, uncertain-write blocking, reload persistence, and browser focus/deadlines. See [Phase 5](phase-5-readiness.md) for the detailed matrix and fixture limitations.

No new UI implementation was needed. Existing browser checks covered navigation to the application screens, partial/disconnected/error states, modal focus, 320/390/768/1440 widths, short viewports, reduced motion, CSS magnification, and accessibility scans. Actual screen-reader, physical-device, and browser-chrome zoom review remains manual.

A credential-free request to the public landing URL returned **HTTP 200**. This confirms reachability only; the deployed commit and live authenticated behavior were not verified. The web reader could not access that URL, so a single time-limited direct HTTP request supplied this status.

## Dependency finding and disposition

[GHSA-g3hv-75wg-m249 / CVE-2026-118764](https://github.com/advisories/GHSA-g3hv-75wg-m249), reviewed/updated October 30, 2026, reports a moderate denial-of-service risk from attacker-controlled glob preprocessing. The published affected range is `<11.0.1`; the stated patched version is `11.0.1`.

The lockfile contains minimatch 3.1.5 and 10.2.4 through ESLint and TypeScript-ESLint tooling. The 16 audit entries include transitive parent packages, not sixteen independently reproduced application vulnerabilities. Production-only audit has zero findings, but development/CI tooling is not thereby cleared.

npm suggests `audit fix --force`, which would install ESLint 4.0.0 and break the current toolchain contract. Existing consumers require minimatch 3.x or 10.x and several use its older callable CommonJS API; globally forcing 11.x is not an established compatible fix. No exploit against VibePlay was run, and applicability of every older minimatch path was not proved or dismissed.

**Required before release:** obtain compatible upstream tooling/backport updates and rerun clean install/lint/tests/build/full audit, or obtain an explicit, documented owner-approved risk disposition for this development-only exposure. Do not suppress the audit, run a forced downgrade, or upgrade dependency majors merely to make the count disappear. This report leaves the gate blocked pending that decision; it is not an implicit risk acceptance.

## Spotify integration and live acceptance

| Area | Verified evidence | Live status |
| --- | --- | --- |
| Authorization/PKCE/state | Callback integration, expiry/tampering/replay tests; no live consent | PENDING |
| Session persistence/refresh | Encrypted cookie and refresh tests, browser connection fixtures | PENDING |
| Catalog generation | Both real selection paths against synthetic catalog responses | PENDING |
| Private/public creation | Route/service fixtures and browser payload checks | PENDING |
| Ownership/count/order | Service fixtures and signed recovery checks | PENDING |
| Reload/duplicate prevention | Browser journal and operation-cache regression tests | PENDING |
| Disconnect/reconnect | Local-session logic/tests and browser states; no live account lifecycle | PENDING |
| Interrupted-operation recovery | Deterministic safe tests; no real interrupted write | PENDING |

Complete the [concise manual checklist](live-spotify-acceptance.md), recording candidate commit, environment, tester, and date. Approve live writes explicitly before creating either test playlist. Safe recovery validation may use an explicitly reviewed alternative/waiver; never mislabel mocked evidence as a live interruption test. Critical live sign-off must precede production release.

## Production configuration checklist

These are intended values and requirements, **not assertions about the current dashboards**. Do not copy secret values into documentation or logs.

| Setting | Expected value or requirement | Confirmation |
| --- | --- | --- |
| Canonical origin / APP_BASE_URL | `https://vibe-play-livid.vercel.app` | PENDING: Vercel |
| APP_URL | Optional fallback; if present, match the canonical origin. APP_BASE_URL wins. | PENDING: Vercel |
| SPOTIFY_REDIRECT_URI | `https://vibe-play-livid.vercel.app/api/auth/callback` | PENDING: both dashboards |
| SPOTIFY_CLIENT_ID | Intended Spotify app identifier, server-side variable | PENDING: owner |
| SPOTIFY_CLIENT_SECRET | Stable server-only secret shared across instances; never NEXT_PUBLIC | PENDING: owner |
| Node runtime | 24.x; `.nvmrc` and `package.json` agree | Repository verified; remote PENDING |
| Framework/install/build | Next.js preset, `npm ci`, `npm run build`; standard Next output | Repository verified; remote PENDING |
| Cookie policy | HttpOnly, Secure in production, SameSite=Lax, authenticated encryption | Source/tests verified |
| Scopes | `playlist-modify-private`, `playlist-modify-public`, `playlist-read-private`, `user-read-private` | Source verified; actual grant PENDING |
| Spotify access mode | Confirm actual app mode, owner eligibility and permitted accounts | PENDING: Spotify Dashboard |
| Function duration | Confirm effective plan/Fluid Compute settings and test worst relevant paths | PENDING: Vercel |
| Logging | No tokens, cookie values, codes, state, or raw upstream bodies. SPOTIFY_DEBUG emits only method/status. | Source reviewed; remote logs PENDING |

There is no repository `vercel.json` or route-level `maxDuration` override. [Vercel duration limits](https://vercel.com/docs/functions/configuring-functions/duration) depend on platform settings and plan; do not infer the existing project's effective limit from defaults. Generation can make twenty sequential search calls plus lookups, each with its own timeout. Browser generation/save deadlines are 90 seconds, OAuth requests 15 seconds, and the Spotify transport defaults to 10 seconds per call. Aggregate server execution is not bounded by the browser deadline. Validate hosting behavior; any creation timeout must remain uncertain and must never be automatically retried.

[Spotify Development Mode](https://developer.spotify.com/documentation/web-api/concepts/quota-modes) currently requires a Premium app owner and limits authenticated access to five allowlisted users. A completed login does not prove API authorization. Register exact HTTPS callbacks and deliberately configured local loopback callbacks; arbitrary preview hosts are not automatically trusted or registered. Public hosting does not remove these restrictions.

## Portfolio documentation and screenshots

README describes catalog filtering honestly, without AI/audio-similarity or learning claims. The current flow map explains the route/service boundaries and safe-save process. Historical phase reports are linked from [the documentation index](README.md).

Portfolio summary:

> VibePlay turns a mood and catalog preferences into a reviewable Spotify playlist. Built with Next.js, React, and TypeScript, it combines accessible responsive UI with server-side PKCE authentication, encrypted sessions, quota-aware catalog selection, and cautious playlist recovery. The engineering focus is preserving user intent and handling uncertain external API outcomes without blindly duplicating playlists.

`docs/screenshots/landing-desktop.png` (1440×900) and `landing-mobile.png` (390×844) were captured from this local production build during the browser suite and visually inspected. They show the actual unauthenticated application, without account data or fabricated playlists. The test now captures these artifacts; copying future reviewed captures into documentation remains an intentional release action. Screenshots total approximately 288 KiB. All other browser traces/screenshots remain ignored.

## Git inventory and suggested commit boundaries

Phase 6 began from clean HEAD `e84e107` (`phase-5-readiness`). Earlier implementation checkpoints include `dcc480e` (Phase 4), `3fdba51` (Phase 3/origin fix), and `2de187e` (Phase 2). Their application implementations and tests remain intact. Phase 1 is a historical audit document, not a separate new implementation.

Uncommitted Phase 6 changes:

- `.gitignore`: make historical phase reports eligible for tracking.
- `README.md`: portfolio preview/description, release gate, current documentation and deployment links.
- `docs/spotify-flow-map.md`: current architecture description.
- `e2e/application.spec.ts`: capture actual landing screenshots during the existing lab test.
- Newly included historical files: `docs/phase-1-audit.md`, `docs/phase-4-generation.md`, `docs/phase-5-readiness.md` (previously ignored; historical content preserved).
- New release files: `docs/README.md`, `docs/live-spotify-acceptance.md`, this report, and `docs/screenshots/landing-{desktop,mobile}.png`.

A narrow working-tree scan of selected text files found no private-key markers, suspicious credential assignments, accidentally selected environment files, or generated build/browser artifacts. This is not a full Git-history secret audit. `.env.example` contains blank credential fields; `.env.local` remains ignored and was not copied. Dependencies, production configuration, and application source are unchanged in Phase 6.

Recommended commits, **not executed**:

1. `docs: preserve phase reports and document release acceptance` — ignore-rule correction, historical reports, index, current flow map, and release/live-checklist documents.
2. `docs: prepare portfolio overview and application screenshots` — README, two reviewed PNGs, and the small test capture addition.

Resolve/document the dependency gate in a separate focused change if needed. Review file lists rather than blindly staging the entire workspace. No commits, pushes, merges, resets, or deployments were executed.

## Approved deployment and production verification

1. Keep release blocked until live acceptance, configuration confirmation, and dependency disposition are recorded. Obtain explicit approval for the exact candidate commit and deployment action.
2. Before an approved deployment, record the current production deployment ID and a rollback target known to retain the required security/recovery protections. Confirm eligibility and configuration compatibility. Do not assume an older pre-fix version is safe merely because it is the previous deployment.
3. With separate authorization for any configuration edits, confirm the settings above. Build from the reviewed lockfile. Preview smoke testing can cover unauthenticated/mocked flows; live OAuth on a preview requires its own intentional URL/callback configuration.
4. Deploy only through the owner's approved Vercel workflow. This phase does not run it.
5. Verify the deployment ID/commit and canonical domain, then open `/`, `/generate`, `/vibe`, and `/vibe/history`. Check navigation, metadata, responsive layouts, and disconnected/error states.
6. Confirm unauthenticated `/api/spotify/status` returns disconnected without tokens, production debug routes return 404, legitimate same-origin save reaches authentication (401), and external-origin save is rejected (403). These checks must not attach a real session or create a playlist.
7. With authorized account access and explicit write approval, repeat production OAuth, generation, private/public saves, order/owner checks, persistence, and disconnect smoke tests. Inspect safe error/status metrics for 403/429/5xx and hosting timeouts. Record outcomes without secrets.
8. Announce the portfolio launch only after production smoke sign-off. Explain access restrictions to reviewers; do not advertise unrestricted authentication.

## Rollback procedure — approval required

If an approved deployment breaks authentication, ordering, saving safety, or core navigation:

1. Stop test submissions; inspect Spotify before retrying uncertain writes. Preserve local save receipts and existing playlists. Do not clear storage, rotate secrets, or delete account data as a generic repair.
2. Obtain approval to restore the recorded, compatible known-good production deployment. In Vercel, use the production deployment's **Instant Rollback**, choose the eligible target, review domains/configuration, and confirm only after approval. See [Vercel's rollback instructions](https://vercel.com/docs/instant-rollback).
3. Rollback restores a prior build; it does not undo Spotify playlists or adopt newly edited environment values. Verify secret/cookie/receipt compatibility before resuming saves. If no safe rollback target exists, keep release paused and prepare an approved forward fix.
4. Repeat the read-only smoke checks and, only with write approval, the affected account flow. Document the failing and restored deployment IDs plus sanitized symptoms.
5. Vercel may disable automatic production-domain assignment after rollback. Review that state and obtain approval before re-promoting a candidate. No rollback or settings change was performed here.

## Remaining limitations

Catalog matching is a genre/text heuristic, not inferred musical similarity. Strict preferences can yield short/empty lists; unchanged inputs may repeat selections. Development Mode users and quotas are restricted. History/presets/drafts are browser-local, and browser storage can be unavailable. The per-process save cache and browser locks are not distributed exactly-once guarantees across devices or Vercel instances. API timeout/revocation/availability behavior still needs live observation. Real-device, screen-reader, field-performance, and remote-log review remain pending.

**Final recommendation: retain all three BLOCKED classifications above.** Automated verification supports code review, not release approval. No Phase 7 is started; wait for the owner's acceptance and explicit commit/deployment instructions.
