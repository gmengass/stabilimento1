"use client";

/* Rendered when the root layout itself fails, so messages may be unavailable: both languages inline. */
/* eslint-disable react/jsx-no-literals */
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="it">
      <body className="flex min-h-full flex-col items-center justify-center gap-4 p-8">
        <h1 className="text-2xl font-semibold">
          <span lang="it">Si è verificato un errore</span> /{" "}
          <span lang="en">Something went wrong</span>
        </h1>
        <button type="button" onClick={reset} className="rounded border px-3 py-1">
          <span lang="it">Riprova</span> / <span lang="en">Try again</span>
        </button>
      </body>
    </html>
  );
}
