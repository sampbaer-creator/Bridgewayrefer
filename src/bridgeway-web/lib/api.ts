export class ApiError extends Error { constructor(message: string, public status: number) { super(message); } }
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, { ...options, cache: "no-store", credentials: "same-origin", headers: { "Content-Type": "application/json", ...options.headers } });
  if (response.status === 401 || response.redirected) throw new ApiError("Your staff session has ended. Please sign in again.", 401);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(body.error || `Could not complete the request (HTTP ${response.status}).`, response.status);
  return body as T;
}
export type PublicConfig = { officeName: string; welcomeText: string; accepting: boolean; demo: boolean };
