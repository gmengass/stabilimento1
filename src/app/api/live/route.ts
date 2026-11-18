import { connection } from "next/server";
import { readCurrentUser } from "@/lib/auth/session";
import { getEnv } from "@/lib/env";
import { startListener, subscribe } from "@/lib/live/listener";
import { createLiveStream } from "@/lib/live/sse";

// The live map's event stream (ADR 0019): signals only, for signed-in users.
export async function GET(request: Request): Promise<Response> {
  await connection();
  const user = await readCurrentUser();
  if (!user) return new Response(null, { status: 401 });

  // A failed LISTEN retries in the background and sends `resync` once it is back.
  await startListener(getEnv().DATABASE_URL).catch(() => undefined);

  return new Response(createLiveStream({ subscribe, signal: request.signal }), {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
