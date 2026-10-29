# Phase 3 hotfix: Spotify save origin validation

## Root cause and evidence

The failure occurred before authentication or any Spotify request. `rejectCrossOrigin` compared the browser's `Origin` directly with `request.nextUrl.origin`. In the installed Next.js 16.4.3 implementation (`node_modules/next/dist/server/web/next-url.js`, `parseURL`), loopback IP hostnames are rewritten to `localhost`.

For a local request, the browser origin and Host are `http://127.0.0.1:5000` and `127.0.0.1:5000`, but `nextUrl.origin` is `http://localhost:5000`. A regression test reproduces that mismatch using a real `NextRequest`. This is NextURL behavior, not a Spotify rejection or a Turbopack compilation failure. The old guard never read APP_URL or APP_BASE_URL, so changing them could not repair the comparison. `allowedDevOrigins` governs Next's development endpoints/assets; it does not configure this application's mutation guard.

## Fix and security boundary

`src/lib/server/request.ts` now compares Origin exactly with `getAppBaseUrl()`: APP_BASE_URL takes precedence, then APP_URL, then the existing explicit loopback default outside production. Existing URL validation remains in force. Production requires explicit configuration. Invalid configuration returns a generic, non-cacheable 500 with `invalid_app_origin` and `retrySafe: true`, before mutation.

Host, X-Forwarded-Host, X-Forwarded-Proto, Forwarded, and NextURL are deliberately not origin authorities. Conflicting transport headers cannot authorize an external origin; an exact configured Origin remains acceptable behind an internal proxy. This avoids a proxy-header allowlist and does not equate localhost with 127.0.0.1. Missing/null/malformed origins, alternate schemes/ports/hosts, credentials, paths, and multiple origins fail exact matching. Explicit cross-site Fetch Metadata remains rejected. No wildcards, credential logging, new dependencies, or OAuth changes were introduced.

The shared fix also covers logout, the development insertion endpoint, and the signed compatibility recovery path. The browser already sends a relative same-origin save request; no frontend change is necessary. Save receipts, ordered insertion, deduplication, pending-save journals, scope validation, and uncertain-outcome handling are unchanged.

## Files

- `src/lib/server/request.ts`: configured-origin guard and non-cacheable errors.
- `src/lib/server/request.test.ts`: local/IPv6/production origins, configuration precedence, failure cases, Fetch Metadata, and forged/conflicting transport headers.
- `src/lib/server/protected-routes.test.ts`: logout, debug insertion, and compatibility recovery protection.
- `src/app/api/vibe/save/route.test.ts`: explicit test configuration plus local route-to-service save tests for both visibility choices, ordered deduplicated tracks, correct payloads/URLs, and repeated-save protection.
- This report. Previously staged redesign/configuration changes were preserved.

## Verification

- `npm test`: 123 passing tests across 17 files.
- `npm run lint`: passed.
- `npm run typecheck`: passed after fixing a test-fixture typing error.
- `npm run build`: passed on the final run (the initial run caught the same test-fixture typing error).
- Actual Next dev/Turbopack HTTP request at `127.0.0.1:5000`, without session cookies: legitimate Origin reaches authentication and returns 401 `not_authenticated`; external Origin with forged forwarded headers returns 403 `invalid_origin`. No Spotify write was attempted.
- Handler integration tests retain the real guard, payload validation, save service, receipt creation, and operation deduplication. Authentication and Spotify HTTP responses are mocked. Private/public creation payloads and subsequent ordered item insertion are asserted, including returned playlist URL and no repeated creation/insertion.
- Existing partial-recovery, uncertain-creation, ownership, external-edit, and rate-limit tests still pass.

## Remaining authenticated acceptance checks

Actual Spotify acceptance and appearance in the account's library are **not verified**. Automated successful upstream responses are fixtures, not evidence of a live playlist.

1. Restart the local server, open `http://127.0.0.1:5000`, connect Spotify, generate a short draft, and save privately with a distinct name.
2. Confirm `/api/vibe/save` returns 200; open the returned Spotify link and verify ownership, name, description, private visibility, count, and track order in the library.
3. Repeat with a new draft and explicit public visibility. Reconnect if playlist scopes need renewal.
4. Double-click save/reload the successful draft and verify no second playlist appears. For a real partial failure, use the existing recovery action rather than creating a new draft or blindly retrying.
5. Confirm disconnect works, then repeat the save check on production after your normal review/deployment workflow.

No Spotify Dashboard changes are required for this origin fix. Keep the local callback registered as `http://127.0.0.1:5000/api/auth/callback`; production uses its exact HTTPS origin plus that path. APP_URL alone remains supported. If APP_BASE_URL is set, ensure it agrees with the intended browser origin because it wins over APP_URL. Production should use `https://vibe-play-livid.vercel.app` (or the configured canonical custom domain); unconfigured preview domains are intentionally rejected. No environment files, production settings, commits, or deployments were changed by this hotfix.

## Follow-up: process inspection and bounded verification

On the follow-up inspection, no Next.js server/build, npm, test runner, Git, or curl process was active; no `.git/index.lock`, `.next/lock`, or `.next/dev/lock` existed. The earlier temporary development server was a deliberately long-running process and had been stopped. Prior logs show completed test/build commands, including an initial TypeScript failure that was corrected. Those records do not establish the cause of the reported 14-minute delay; no current blocking process was found.

The existing hotfix was reviewed and retained without restarting implementation. All previously staged Phase 3 changes were preserved. Verification ran individually with Node 24, CI mode, closed stdin, and a process-group timeout that terminates child processes on expiry. No development server was started during this follow-up.

| Command | Timeout | Result | Elapsed |
| --- | --- | --- | --- |
| `npm test` | 60 seconds | 123 tests passed, 17 files | 1.1 seconds |
| `npm run lint` | 60 seconds | Passed | 2.1 seconds |
| `npm run typecheck` | 60 seconds | Passed | 0.8 seconds |
| `npm run build` | 120 seconds | Passed, 21 routes | 2.2 seconds |

The build ran outside the sandbox because earlier Turbopack sandbox execution was problematic. No command hit its timeout. Live authenticated Spotify acceptance remains a manual check; the successful local origin validation and mocked upstream tests do not establish that a playlist appeared in a real Spotify library.
