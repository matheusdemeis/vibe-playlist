import { NextRequest, NextResponse } from "next/server";

const ACCESS_TOKEN_COOKIE_NAME = "spotify_access_token";
const SPOTIFY_API_BASE_URL = "https://api.spotify.com/v1";
const DEFAULT_RECOMMENDATION_LIMIT = 20;

type GenerateRequestBody = {
  artistName?: string;
};

type SpotifyArtistSearchResponse = {
  artists: {
    items: Array<{ id: string; name: string }>;
  };
};

type SpotifyRecommendationsResponse = {
  tracks: Array<{ uri: string }>;
};

type SpotifyCreatePlaylistResponse = {
  id: string;
  external_urls: {
    spotify: string;
  };
};

async function spotifyRequest<T>(
  path: string,
  accessToken: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`${SPOTIFY_API_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Spotify API request failed (${response.status}): ${errorText}`);
  }

  return (await response.json()) as T;
}

export async function POST(request: NextRequest) {
  const accessToken = request.cookies.get(ACCESS_TOKEN_COOKIE_NAME)?.value;
  if (!accessToken) {
    return NextResponse.json(
      { error: "You are not connected to Spotify. Please log in first." },
      { status: 401 },
    );
  }

  const body = (await request.json()) as GenerateRequestBody;
  const artistName = body.artistName?.trim();
  if (!artistName) {
    return NextResponse.json({ error: "Artist name is required." }, { status: 400 });
  }

  try {
    const searchParams = new URLSearchParams({
      q: artistName,
      type: "artist",
      limit: "1",
    });
    const searchData = await spotifyRequest<SpotifyArtistSearchResponse>(
      `/search?${searchParams.toString()}`,
      accessToken,
    );

    const artist = searchData.artists.items[0];
    if (!artist) {
      return NextResponse.json({ error: `Artist "${artistName}" was not found.` }, { status: 404 });
    }

    const recommendationParams = new URLSearchParams({
      seed_artists: artist.id,
      limit: `${DEFAULT_RECOMMENDATION_LIMIT}`,
    });
    const recommendations = await spotifyRequest<SpotifyRecommendationsResponse>(
      `/recommendations?${recommendationParams.toString()}`,
      accessToken,
    );

    const trackUris = recommendations.tracks.map((track) => track.uri);
    if (trackUris.length === 0) {
      return NextResponse.json(
        { error: "No recommendation tracks were returned for this artist." },
        { status: 404 },
      );
    }

    const createdPlaylist = await spotifyRequest<SpotifyCreatePlaylistResponse>(
      "/me/playlists",
      accessToken,
      {
        method: "POST",
        body: JSON.stringify({
          name: `Vibe Playlist - ${artist.name}`,
          description: `Auto-generated from artist seed: ${artist.name}`,
          public: false,
        }),
      },
    );

    await spotifyRequest<{ snapshot_id: string }>(
      `/playlists/${createdPlaylist.id}/tracks`,
      accessToken,
      {
        method: "POST",
        body: JSON.stringify({ uris: trackUris }),
      },
    );

    return NextResponse.json({
      playlistUrl: createdPlaylist.external_urls.spotify,
      playlistId: createdPlaylist.id,
      trackCount: trackUris.length,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not generate playlist right now. Please try again.";
    console.error("Playlist generation failed", message);
    return NextResponse.json(
      { error: message },
      { status: 502 },
    );
  }
}
