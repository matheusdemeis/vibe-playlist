# Vibe Playlist

## Local Dev

- Run the app on `http://127.0.0.1:5000` (do not use `localhost`).
- Set `APP_BASE_URL=http://127.0.0.1:5000` in local env.
- Spotify redirect URI must be `http://127.0.0.1:5000/api/auth/callback`.

## Spotify Scopes & Troubleshooting 403

Required scopes (requested automatically at login):
- `playlist-modify-public`
- `playlist-modify-private`
- `user-read-private`

If you get a 403 when saving playlists:
1. Click **Reconnect Spotify** (clears old tokens and forces re-auth with correct scopes).
2. Set `SPOTIFY_DEBUG=1` in `.env.local` to enable verbose Spotify API logging.
3. Check the server console for `[spotify-http] error` entries with the response body.

## Do Not Break Spotify Flow

- Keep Spotify API calls server-side only (`src/app/api/**` and `src/lib/spotify/**`).
- Do not log full/raw access tokens or other sensitive values. Normal logs should stick to booleans, HTTP status codes, and endpoint names; debug logs may include safe metadata such as token tails, selected non-sensitive headers, and small redacted body excerpts for troubleshooting.
- UI components should remain presentational; they must not call Spotify directly.

Manual checklist after changes:
1. Connect / Login to Spotify
2. Generate tracks (Results loads)
3. Create playlist on Spotify
4. Add tracks to that playlist
5. Confirm playlist exists in Spotify with tracks
