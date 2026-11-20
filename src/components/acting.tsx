"use client";

import { useTranslations } from "next-intl";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { chooseActingAction, clearActingAction } from "@/app/(app)/acting-actions";
import { ACTING_IDLE_MS } from "@/lib/auth/rules";

type NeedsActor = { ok: false; error: "needsActor" };

export interface ActingChoice {
  id: string;
  name: string;
}

interface ActingContext {
  communal: boolean;
  actingName: string | null;
  clear: () => void;
  /**
   * Runs a booking action. When a communal tablet doesn't know who is acting, asks first and
   * retries once. Returns null if nobody was chosen: nothing was done (ADR 0024).
   */
  run: <T>(call: () => Promise<T>) => Promise<Exclude<T, NeedsActor> | null>;
}

function isNeedsActor(result: unknown): result is NeedsActor {
  return (result as { error?: unknown } | null)?.error === "needsActor";
}

// Without a provider (tests, normal pages) an action simply runs.
const Context = createContext<ActingContext>({
  communal: false,
  actingName: null,
  clear: () => undefined,
  run: async (call) => {
    const result = await call();
    return isNeedsActor(result) ? null : (result as never);
  },
});

export function useActing(): ActingContext {
  return useContext(Context);
}

interface ProviderProps {
  communal: boolean;
  choices: ActingChoice[];
  initialName: string | null;
  children: ReactNode;
}

/** Shared-tablet accounts: the "Who is doing this?" pop-up and the "Acting as" label. */
export function ActingProvider({ communal, choices, initialName, children }: ProviderProps) {
  const [actingName, setActingName] = useState(initialName);
  const [asking, setAsking] = useState(false);
  const resolver = useRef<((chosen: boolean) => void) | null>(null);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const startIdleTimer = useCallback(() => {
    clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => setActingName(null), ACTING_IDLE_MS);
  }, []);

  useEffect(() => {
    if (initialName) startIdleTimer();
    return () => clearTimeout(idleTimer.current);
  }, [initialName, startIdleTimer]);

  const ask = useCallback(
    () =>
      new Promise<boolean>((resolve) => {
        resolver.current?.(false);
        resolver.current = resolve;
        setAsking(true);
      }),
    [],
  );

  const finish = useCallback(
    (chosen: ActingChoice | null) => {
      resolver.current?.(chosen !== null);
      resolver.current = null;
      setAsking(false);
      if (chosen) {
        setActingName(chosen.name);
        startIdleTimer();
      }
    },
    [startIdleTimer],
  );

  const run = useCallback(
    async <T,>(call: () => Promise<T>) => {
      let result = await call();
      if (isNeedsActor(result)) {
        if (!(await ask())) return null;
        result = await call();
        if (isNeedsActor(result)) return null;
      }
      if (communal) startIdleTimer();
      return result as Exclude<T, NeedsActor>;
    },
    [ask, communal, startIdleTimer],
  );

  const clear = useCallback(() => {
    setActingName(null);
    void clearActingAction();
  }, []);

  const value = useMemo(
    () => ({ communal, actingName, clear, run }),
    [communal, actingName, clear, run],
  );

  return (
    <Context.Provider value={value}>
      {children}
      {asking && <ChooseDialog choices={choices} onDone={finish} />}
    </Context.Provider>
  );
}

function ChooseDialog({
  choices,
  onDone,
}: {
  choices: ActingChoice[];
  onDone: (chosen: ActingChoice | null) => void;
}) {
  const t = useTranslations("acting");
  const dialog = useRef<HTMLDialogElement>(null);
  const [failed, setFailed] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
  }, []);

  async function choose(choice: ActingChoice) {
    setPending(true);
    setFailed(false);
    try {
      const result = await chooseActingAction({ staffId: choice.id });
      if (result.ok) onDone(choice);
      else setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  }

  return (
    <dialog
      ref={dialog}
      onCancel={() => onDone(null)}
      aria-labelledby="acting-title"
      className="m-auto w-full max-w-md rounded border p-4"
    >
      <h2 id="acting-title" className="mb-3 text-lg font-semibold">
        {t("title")}
      </h2>
      {choices.length === 0 ? (
        <p>{t("empty")}</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {choices.map((choice) => (
            <li key={choice.id}>
              <button
                type="button"
                disabled={pending}
                onClick={() => choose(choice)}
                className="min-h-11 rounded border px-4 py-2 font-medium disabled:opacity-50"
              >
                {choice.name}
              </button>
            </li>
          ))}
        </ul>
      )}
      {failed && (
        <p role="alert" className="mt-3 text-sm text-red-700 dark:text-red-400">
          {t("failed")}
        </p>
      )}
      <button
        type="button"
        onClick={() => onDone(null)}
        className="mt-4 min-h-11 rounded border px-3 py-2"
      >
        {t("cancel")}
      </button>
    </dialog>
  );
}

/** "Acting as Anna · Not me", shown on a communal tablet while someone is chosen. */
export function ActingBadge() {
  const t = useTranslations("acting");
  const { communal, actingName, clear } = useActing();
  if (!communal || !actingName) return null;
  return (
    <span className="flex min-h-11 items-center gap-2" data-testid="acting-as">
      {t("actingAs", { name: actingName })}
      <button type="button" onClick={clear} className="min-h-11 rounded border px-3 py-2">
        {t("notMe")}
      </button>
    </span>
  );
}
