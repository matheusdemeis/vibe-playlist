const SPOTIFY_API_BASE_URL = "https://api.spotify.com/v1";

type QueryParams = Record<string, string | number | boolean | undefined>;

type SpotifyRequestOptions = {
  method?: string;
  path: string;
  accessToken: string;
  json?: unknown;
  query?: QueryParams;
  headers?: HeadersInit;
  fetcher?: typeof fetch;
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

export async function spotifyRequest<T>(options: SpotifyRequestOptions): Promise<T> {
  const method = options.method ?? "GET";
  const path = options.path.startsWith("/") ? options.path : `/${options.path}`;
  const url = buildSpotifyUrl(path, options.query);
  const headers = new Headers(options.headers ?? {});
  headers.set("Authorization", `Bearer ${options.accessToken}`);
  headers.set("Accept", "application/json");

  let body: string | undefined;
  if (options.json !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(options.json);
  }

  traceSpotifyHttp("request", {
    method,
    url,
    headers: redactHeaders(headers),
    bodyType: body === undefined ? "undefined" : "string",
    jsonPreview: body?.slice(0, 200),
  });

  const response = await (options.fetcher ?? fetch)(url, {
    method,
    headers,
    body,
  });

  const responseBodyText = await response.text();
  traceSpotifyHttp("response", {
    method,
    url,
    status: response.status,
    bodyText: responseBodyText,
  });

  if (!response.ok) {
    throw new SpotifyClientError({
      message: `Spotify request failed (${response.status})`,
      status: response.status,
      path,
      url,
      bodyText: responseBodyText,
      responseHeaders: response.headers,
    });
  }

  if (!responseBodyText.trim()) {
    return {} as T;
  }

  return JSON.parse(responseBodyText) as T;
}

function buildSpotifyUrl(path: string, query?: QueryParams): string {
  const baseUrl = `${SPOTIFY_API_BASE_URL}${path}`;
  if (!query) {
    return baseUrl;
  }

  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) {
      continue;
    }
    searchParams.set(key, String(value));
  }

  const queryString = searchParams.toString();
  if (!queryString) {
    return baseUrl;
  }

  return `${baseUrl}?${queryString}`;
}

function redactHeaders(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {};
  headers.forEach((value, key) => {
    if (key.toLowerCase() === "authorization") {
      result[key] = value.startsWith("Bearer ") ? "Bearer [REDACTED]" : "[REDACTED]";
      return;
    }
    result[key] = value;
  });
  return result;
}

function traceSpotifyHttp(event: string, payload: Record<string, unknown>): void {
  if (process.env.NODE_ENV !== "development") {
    return;
  }

  console.log(`[TRACE][spotify-http] ${event}`, payload);
}
