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
