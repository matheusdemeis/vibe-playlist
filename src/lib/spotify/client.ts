import { assertServerOnly } from "../server/assert-server-only";

const SPOTIFY_API_BASE_URL = "https://api.spotify.com/v1";
type QueryParams = Record<string, string | number | boolean | undefined>;
type SpotifyJsonOptions = {
  method?: string;
  path: string;
  accessToken: string;
  json?: unknown;
  query?: QueryParams;
  headers?: HeadersInit;
  fetcher?: typeof fetch;
  signal?: AbortSignal;
  timeoutMs?: number;
};

export class SpotifyClientError extends Error {
  status: number;
  path: string;
  url: string;
  bodyText: string;
  responseHeaders: Headers;

  constructor(input: {
    message: string;
    status: number;
    path: string;
    url: string;
    bodyText: string;
    responseHeaders: Headers;
  }) {
    super(input.message);
    this.name = "SpotifyClientError";
    this.status = input.status;
    this.path = input.path;
    this.url = input.url;
    this.bodyText = input.bodyText;
    this.responseHeaders = input.responseHeaders;
  }
}

// Never retry writes here: Spotify may have committed them before a connection fails.
export async function spotifyJson<T>(options: SpotifyJsonOptions): Promise<T> {
  assertServerOnly("spotifyJson");
  const method = (options.method ?? "GET").toUpperCase();
  const path = options.path.startsWith("/") ? options.path : `/${options.path}`;
  if (path.startsWith("//") || path.includes("..")) throw new Error("Invalid Spotify path.");
  const url = new URL(`${SPOTIFY_API_BASE_URL}${path}`);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  const headers = new Headers(options.headers);
  headers.set("Authorization", `Bearer ${options.accessToken}`);
  headers.set("Accept", "application/json");
  if (options.json !== undefined) headers.set("Content-Type", "application/json");
  const timeout = AbortSignal.timeout(options.timeoutMs ?? 10_000);
  const signal = options.signal ? AbortSignal.any([timeout, options.signal]) : timeout;
  let response: Response;
  let bodyText: string;
  try {
    response = await (options.fetcher ?? fetch)(url.toString(), {
      method, headers, signal, cache: "no-store",
      body: options.json === undefined ? undefined : JSON.stringify(options.json),
    });
    bodyText = await response.text();
  } catch {
    throw new SpotifyClientError({
      message: timeout.aborted ? "Spotify request timed out." : "Could not reach Spotify.",
      status: timeout.aborted ? 504 : 502,
      path, url: url.toString(), bodyText: "", responseHeaders: new Headers(),
    });
  }
  if (!response.ok) {
    // Only safe request metadata: no token fragments, user queries, or upstream bodies.
    if (process.env.SPOTIFY_DEBUG === "1") {
      console.error("[spotify] request failed", { method, status: response.status });
    }
    throw new SpotifyClientError({
      message: `Spotify request failed (${response.status}).`, status: response.status,
      path, url: url.toString(), bodyText, responseHeaders: response.headers,
    });
  }
  if (!bodyText.trim()) return {} as T;
  try {
    return JSON.parse(bodyText) as T;
  } catch {
    throw new SpotifyClientError({
      message: "Spotify returned an invalid response.", status: 502,
      path, url: url.toString(), bodyText: "", responseHeaders: response.headers,
    });
  }
}

export const spotifyRequest = spotifyJson;
