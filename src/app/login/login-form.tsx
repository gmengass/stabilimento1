"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, type FormEvent } from "react";

type LoginError = "invalid" | "rateLimited" | "locked" | "generic";

const TOO_MANY_REQUESTS = 429;

// The API answers 401 for an unknown user, a wrong password and a disabled account alike.
async function errorFor(response: Response): Promise<LoginError> {
  if (response.status === TOO_MANY_REQUESTS) {
    const body: unknown = await response.json().catch(() => null);
    return (body as { code?: unknown } | null)?.code === "ACCOUNT_LOCKED"
      ? "locked"
      : "rateLimited";
  }
  return response.status === 401 ? "invalid" : "generic";
}

async function signIn(username: string, password: string): Promise<LoginError | null> {
  try {
    const response = await fetch("/api/auth/sign-in/username", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    return response.ok ? null : await errorFor(response);
  } catch {
    return "generic";
  }
}

// The last username that signed in on this device, so a tablet only asks for the password.
// Storage can be missing or throw (private mode, a full quota): then nothing is remembered.
const LAST_USERNAME_KEY = "lastUsername";

function readLastUsername(): string | null {
  try {
    return window.localStorage.getItem(LAST_USERNAME_KEY);
  } catch {
    return null;
  }
}

function rememberUsername(username: string): void {
  try {
    window.localStorage.setItem(LAST_USERNAME_KEY, username);
  } catch {
    // Not remembered; the next sign-in asks for the username again.
  }
}

export function LoginForm() {
  const t = useTranslations("login");
  const [error, setError] = useState<LoginError | null>(null);
  const [pending, setPending] = useState(false);
  const usernameRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const username = usernameRef.current;
    const lastUsername = readLastUsername();
    if (!username || username.value || !lastUsername) return;
    username.value = lastUsername;
    passwordRef.current?.focus();
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const username = String(form.get("username"));
    setPending(true);
    const result = await signIn(username, String(form.get("password")));
    if (result === null) {
      rememberUsername(username);
      // Full navigation: the server re-renders with the new session and the user's language.
      window.location.replace("/");
      return;
    }
    setError(result);
    setPending(false);
  }

  return (
    <form onSubmit={onSubmit} className="flex w-full max-w-xs flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm">
        {t("username")}
        <input
          ref={usernameRef}
          name="username"
          autoComplete="username"
          autoCapitalize="none"
          required
          className="min-h-11 rounded border px-2 py-1"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {t("password")}
        <input
          ref={passwordRef}
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="min-h-11 rounded border px-2 py-1"
        />
      </label>
      {error && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {t(`errors.${error}`)}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="min-h-11 rounded bg-black px-3 py-2 text-white disabled:opacity-50 dark:bg-white dark:text-black"
      >
        {pending ? t("submitting") : t("submit")}
      </button>
    </form>
  );
}
