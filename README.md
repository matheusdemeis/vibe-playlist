# VibePlay

A mood-led Spotify playlist builder: explore catalog matches, review your mix, and save it to your Spotify account.

[Live application](https://vibe-play-livid.vercel.app/) · [Phase 5 validation and acceptance checklist](docs/phase-5-readiness.md)

## Features

- Six moods: Chill, Gym, Beach, Night Drive, Party, and Snowboarding.
- Artist or song-text constraints, configurable length, and a track review before saving.
- An advanced studio with multiple moods/genres, explicit-content filtering, track locks, ordering, and removal.
- Editable playlist name, description, and private/public visibility.
- Browser-local drafts, presets, and recent history.
- Responsive dark UI, keyboard navigation, modal focus management, and reduced-motion support.

## Stack and architecture

Next.js 16 App Router, React 19, TypeScript, and Tailwind CSS 4; Node.js 24. Vitest covers server logic; Playwright and axe cover deterministic browser flows and accessibility.

| Area | Location |
| --- | --- |
| Basic generator | `src/app/generate`, `src/app/api/generate` |
| Advanced studio/results | `src/app/vibe`, `src/app/api/vibe/generate` |
| Spotify catalog/client/errors | `src/lib/spotify` |
| Selection and safe saving | `src/lib/playlist` |
| OAuth and encrypted sessions | `src/lib/auth` |
| Browser draft/history persistence | `src/lib/storage`, `src/components/vibe/usePlaylistDraft.ts` |

Mood presets become genre search filters. Artist preferences constrain results to the identified artist; other text is a catalog phrase search, not audio-similarity matching. The collector searches pages of ten within a twenty-request budget, balances sources, deduplicates tracks/recordings, and prefers artist variety. Reference tracks guide searches through their artists. Narrow preferences can legitimately return a short or empty playlist. Unchanged preferences may produce the same mix.

## Security and saving

Authorization Code with PKCE and a one-use OAuth state bind the callback to the browser's login attempt. Access and refresh tokens remain in an authenticated, encrypted HttpOnly session cookie (Secure in production, SameSite=Lax), not JavaScript-accessible storage. Refresh happens server-side. Disconnect removes the local session; revoking the application's Spotify authorization is a separate Spotify account action.

Mutating save/logout routes validate the browser Origin against the configured public origin. The loopback fix deliberately avoids NextURL's `127.0.0.1` to `localhost` normalization and never trusts forwarded headers as an allowlist.

Saving validates scopes and input, creates the playlist, then adds tracks in order. A persistent browser journal, browser locks, and a bounded process-local operation cache reduce duplicate submissions. Signed recovery receipts bind the account, playlist, and immutable draft; recovery checks ownership and existing track order before appending only missing items. Uncertain creation outcomes are never blindly retried. This is **not a distributed exactly-once guarantee** across server instances or devices.

## Local setup

1. Install Node 24 (`nvm install` and `nvm use` if using nvm).
2. Run `npm ci`.
3. Copy `.env.example` to `.env.local` and enter your own Spotify application credentials. Never commit `.env.local`.
4. In Spotify Developer Dashboard, register `http://127.0.0.1:5000/api/auth/callback` and allowlist your test account where required.
5. Run `npm run dev`, then open **http://127.0.0.1:5000**. Use that exact origin, not `localhost`.

| Variable | Purpose |
| --- | --- |
| `SPOTIFY_CLIENT_ID` | Spotify application ID, server-side |
| `SPOTIFY_CLIENT_SECRET` | Server-only key material for encrypted sessions and signed recovery receipts; keep stable across instances |
| `APP_BASE_URL` | Canonical origin, locally `http://127.0.0.1:5000`; required explicit configuration in production |
| `APP_URL` | Supported fallback when APP_BASE_URL is unset; do not configure conflicting values |
| `SPOTIFY_REDIRECT_URI` | Exact canonical origin plus `/api/auth/callback`; defaults to that URL if omitted |

Production uses HTTPS. Do not prefix credentials with `NEXT_PUBLIC_`. Rotating the secret invalidates existing sessions and recovery receipts. The project pins Node 24 in `.nvmrc` and `package.json`; [Vercel supports Node 24](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions). Confirm the actual project settings before deploying.

## Spotify access limitations

A publicly hosted site does not grant public Spotify API access. [Development Mode](https://developer.spotify.com/documentation/web-api/concepts/quota-modes) currently requires a Premium app owner and allows up to five allowlisted authenticated users. A user can complete login yet receive API 403 responses if not allowed. Quotas can be shared across the developer's applications.

VibePlay uses catalog search and individual catalog lookups, not restricted Recommendations, related-artists, or audio-feature endpoints. Mood mapping is a genre heuristic; energy, happiness, tempo, and musical similarity are not inferred. See Spotify's [2024 endpoint restrictions](https://developer.spotify.com/blog/2024-11-27-changes-to-the-web-api), [2026 API changes](https://developer.spotify.com/documentation/web-api/references/changes/february-2026), and [search filters](https://developer.spotify.com/documentation/web-api/reference/search). Actual access depends on your registered application; verify it with an authorized account.

## Verification

Run checks individually:

```bash
npm test
npm run lint
npm run typecheck
npm run build
npm audit
```

Browser tests require a production build and browser binaries:

```bash
npx playwright install chromium firefox webkit
npm run build
npm run test:e2e
```

Playwright starts and stops a production server on `127.0.0.1:5001`, refuses to reuse an existing server, and sets test-only credentials. Each test has a 30-second timeout and the suite has a three-minute timeout. Saves and catalog responses are mocked; origin-guard HTTP tests use the actual unauthenticated server. No real playlists are created. Run one engine with `npm run test:e2e -- --project=chromium`. On systems with an installed Chrome, `CHROMIUM_EXECUTABLE_PATH` can supply its executable path. Tests and artifacts must never use real session cookies.

To print the synthetic quality measurements:

```bash
npm test -- src/lib/playlist/quality-scenarios.test.ts --disableConsoleIntercept --reporter=verbose
```

Passing automated checks is not live Spotify certification. Follow the [manual acceptance checklist](docs/phase-5-readiness.md) before claiming production readiness or inviting portfolio reviewers to authenticate.
