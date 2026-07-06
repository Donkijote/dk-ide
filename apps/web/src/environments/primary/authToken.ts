let primaryBearerAccessToken: string | null = null;

export function setPrimaryBearerAccessToken(token: string): void {
  primaryBearerAccessToken = token;
}

export function clearPrimaryBearerAccessToken(): void {
  primaryBearerAccessToken = null;
}

export function readPrimaryBearerAccessToken(): string | null {
  return primaryBearerAccessToken;
}

export function currentPrimaryAuthHeaders(): { readonly authorization?: string } {
  return primaryBearerAccessToken ? { authorization: `Bearer ${primaryBearerAccessToken}` } : {};
}

export function withPrimaryAuthHeaders(init: RequestInit | undefined): RequestInit | undefined {
  if (!primaryBearerAccessToken) {
    return init;
  }

  const headers = new Headers(init?.headers);
  if (!headers.has("authorization")) {
    headers.set("authorization", `Bearer ${primaryBearerAccessToken}`);
  }

  return {
    ...init,
    headers,
  };
}
