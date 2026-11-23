import { connection } from "next/server";
import { readCurrentUser } from "@/lib/auth/session";
import { getEnv } from "@/lib/env";
import { startListener, subscribe } from "@/lib/live/listener";
import { createLiveStream } from "@/lib/live/sse";

/**
 * Open streams one user may hold: a few tablets, phones and tabs, not a runaway client. A
 * communal account is shared by every tablet, so its limit is per tablet session (ADR 0027).
 */
export const MAX_STREAMS_PER_USER = 10;
const RETRY_AFTER_SECONDS = 30;

const globalKey = Symbol.for("stabilimento.liveStreamsByUser");
const store = globalThis as typeof globalThis & { [globalKey]?: Map<string, number> };
const openStreams = (store[globalKey] ??= new Map<string, number>());

function release(key: string): void {
  const left = (openStreams.get(key) ?? 1) - 1;
  if (left > 0) openStreams.set(key, left);
  else openStreams.delete(key);
}

function streamKey(user: { id: string; communal: boolean; sessionId: string }): string {
  return user.communal ? `session:${user.sessionId}` : `user:${user.id}`;
}

// The live map's event stream (ADR 0019): signals only, for signed-in users.
export async function GET(request: Request): Promise<Response> {
  await connection();
  const user = await readCurrentUser();
  if (!user) return new Response(null, { status: 401 });

  const key = streamKey(user);
  if ((openStreams.get(key) ?? 0) >= MAX_STREAMS_PER_USER) {
    return new Response(null, {
      status: 429,
      headers: { "Retry-After": String(RETRY_AFTER_SECONDS) },
    });
  }
  openStreams.set(key, (openStreams.get(key) ?? 0) + 1);

  // Everything after the increment is guarded, so no failure can keep a slot forever.
  try {
    // A failed LISTEN retries in the background and sends `resync` once it is back.
    await startListener(getEnv().DATABASE_URL).catch(() => undefined);
    return new Response(
      createLiveStream({ subscribe, signal: request.signal, onClose: () => release(key) }),
      {
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-store, no-transform",
          "X-Accel-Buffering": "no",
        },
      },
    );
  } catch (error) {
    release(key);
    throw error;
  }
}
