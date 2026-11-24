// The session check for pages that must not reload under the user (ADR 0030): asks the auth
// endpoint instead of re-rendering the page, and only leaves for the sign-in page when the
// session is really gone.

export interface SessionProbeDeps {
  fetch: typeof fetch;
  goToLogin: () => void;
}

export async function probeSession({ fetch, goToLogin }: SessionProbeDeps): Promise<void> {
  try {
    const response = await fetch("/api/auth/get-session", { cache: "no-store" });
    if (response.status === 401 || (response.ok && (await response.json()) === null)) goToLogin();
  } catch {
    // Offline or the box is down: the stream's own reconnect keeps trying.
  }
}
