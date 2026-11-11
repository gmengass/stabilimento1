"use client";

import { useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";

type LoginError = "invalid" | "rateLimited" | "generic";

const TOO_MANY_REQUESTS = 429;

// The API answers 401 for an unknown user, a wrong password and a disabled account alike.
function errorFor(status: number): LoginError {
  if (status === TOO_MANY_REQUESTS) return "rateLimited";
  return status === 401 ? "invalid" : "generic";
}

async function signIn(username: string, password: string): Promise<LoginError | null> {
  try {
    const response = await fetch("/api/auth/sign-in/username", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    return response.ok ? null : errorFor(response.status);
  } catch {
    return "generic";
  }
}

export function LoginForm() {
  const t = useTranslations("login");
  const [error, setError] = useState<LoginError | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    const result = await signIn(String(form.get("username")), String(form.get("password")));
    if (result === null) {
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
          name="username"
          autoComplete="username"
          autoCapitalize="none"
          required
          className="rounded border px-2 py-1"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {t("password")}
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="rounded border px-2 py-1"
        />
      </label>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {t(`errors.${error}`)}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-black px-3 py-2 text-white disabled:opacity-50"
      >
        {pending ? t("submitting") : t("submit")}
      </button>
    </form>
  );
}
