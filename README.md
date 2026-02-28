# Vibe Playlist

## Local Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy env template:
   ```bash
   cp .env.local.example .env.local
   ```
3. Fill in `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET` in `.env.local`.
4. In Spotify app settings, set Redirect URI to:
   `http://localhost:5000/api/auth/callback`
5. Run the app:
   ```bash
   npm run dev
   ```
6. Open:
   `http://localhost:5000`
