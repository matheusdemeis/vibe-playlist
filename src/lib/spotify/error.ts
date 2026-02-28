type SpotifyErrorBody = {
  error?: {
    message?: string;
  };
  message?: string;
};

export function formatSpotifyApiErrorMessage(
  status: number,
  bodyText: string,
  headers?: Headers,
): string {
  const detail = extractDetail(bodyText);
  const requestId = headers ? extractRequestId(headers) : null;

  let message = `Spotify API ${status}: ${detail}`;
  if (requestId) {
    message += ` (Request ID: ${requestId})`;
  }

  return message;
}

function extractDetail(bodyText: string): string {
  const trimmed = bodyText.trim();
  if (!trimmed) {
    return "No response body returned.";
  }

  try {
    const parsed = JSON.parse(trimmed) as SpotifyErrorBody;
    if (parsed.error?.message) {
      return parsed.error.message;
    }
    if (parsed.message) {
      return parsed.message;
    }
  } catch {
    return trimmed;
  }

  return trimmed;
}

function extractRequestId(headers: Headers): string | null {
  return (
    headers.get("spotify-request-id") ??
    headers.get("x-spotify-request-id") ??
    headers.get("x-request-id") ??
    null
  );
}
