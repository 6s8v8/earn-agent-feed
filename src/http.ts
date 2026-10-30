export interface FetchInit {
  method?: string;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

export interface FetchResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}

export type FetchLike = (
  input: string | URL,
  init?: FetchInit,
) => Promise<FetchResponse>;

export class HttpError extends Error {
  readonly status: number;
  readonly url: string;

  constructor(url: string, status: number) {
    super(`GET ${url} failed with HTTP ${status}`);
    this.name = "HttpError";
    this.status = status;
    this.url = url;
  }
}

export function redactSecret(message: string, secret: string | undefined): string {
  if (!secret) {
    return message;
  }
  return message.split(secret).join("[redacted]");
}

export async function getJson(
  fetchImpl: FetchLike,
  url: URL,
  headers: Record<string, string>,
): Promise<unknown> {
  const response = await fetchImpl(url, {
    method: "GET",
    headers,
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new HttpError(url.toString(), response.status);
  }
  return response.json();
}

export function defaultFetch(): FetchLike {
  return (input, init) => fetch(input, init);
}
