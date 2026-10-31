# Live Spotify acceptance gate

**Status: PENDING — production release blocked.** No authenticated live acceptance has been documented for this release. Only an explicitly authorized tester may perform these steps. Approve private/public test-playlist creation before steps 4–7; do not revoke permissions or delete playlists without separate approval from the account owner.

Candidate commit: PENDING · Test URL: PENDING · Tester: PENDING · Date: PENDING

Intended production origin: `https://vibe-play-livid.vercel.app`  
Expected callback: `https://vibe-play-livid.vercel.app/api/auth/callback`

For local acceptance, use `http://127.0.0.1:5000` and its matching `/api/auth/callback`. Do not switch to `localhost`. Verify owner eligibility, tester allowlisting, canonical URL, and callback registration first. Never attach tokens, cookies, authorization codes, OAuth state, secrets, or an unsanitized HAR.

| Gate | Action and expected evidence | Status / tester / date |
| --- | --- | --- |
| 1. Authorization | Connect Spotify and consent. Confirm displayed account identity is the authorized tester; status returns connected with required scopes and no tokens. | PENDING |
| 2. Persistence | Reload and navigate between generators; connection persists without repeated redirects/status polling. | PENDING |
| 3. Real catalog | Generate Chill 25, Gym 50, Beach, Night Drive + Drake, and advanced Party + hip-hop genre. Record requested/returned counts and latency. Verify strict artist constraints, duplicate recordings, explicit filtering, and short/empty explanations. | PENDING |
| 4. Private save | After explicit write approval, save `VibePlay private YYYYMMDD-HHMM` with reviewed name/description and Private selected. Confirm returned Spotify link, owner, visibility, and presence in the correct library. | PENDING |
| 5. Public save | Approve a new write, create a new draft named `VibePlay public YYYYMMDD-HHMM`, choose Public, and verify actual visibility and owner in Spotify. | PENDING |
| 6. Insertion | For both playlists, compare the count and exact track order against the reviewed draft; verify unavailable tracks are explained, not silently discarded. | PENDING |
| 7. Repeat protection | Reload each saved draft. It must remain saved and must not create another playlist. Check the library before any manual retry. | PENDING |
| 8. Disconnect/reconnect | Disconnect, reload, verify disconnected/disabled state, then reconnect to the expected account. | PENDING |
| 9. Recovery | First review deterministic interrupted-save tests. Any live interruption requires specific write approval. An uncertain creation stays blocked pending library inspection; a signed partial recovery must finish the same playlist, preserving order without duplicates. Do not force a real failure merely to tick this box. | PENDING |

Also verify access-token refresh after natural expiry. Revocation testing is optional until explicitly approved: revoke in Spotify account settings, then confirm the next rejected call/refresh requests reconnect rather than looping. Existing tokens may not be rejected immediately. Document a safe alternative or waiver for live recovery testing rather than treating a mocked result as live evidence.

Record only non-sensitive outcome evidence (counts, public/private choice, elapsed time, sanitized error codes, and an owner-approved playlist link). Account identity can be confirmed privately; do not publish personal identifiers in this public repository.

Final acceptance: **PENDING**  
Approved candidate and environment: **PENDING**  
Reviewer/date: **PENDING**

A signed local run validates application behavior, not Vercel configuration. Production configuration must also be confirmed before an approved deployment, followed by a production smoke test. Record the candidate commit so sign-off cannot silently apply to a different implementation.
