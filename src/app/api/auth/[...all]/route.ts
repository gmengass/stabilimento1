import { getAuth } from "@/lib/auth/auth";

const PREFIX = "/api/auth";
const SIGN_IN = "/sign-in/username";

/** The only auth endpoints the app uses. Anything a Better Auth upgrade adds stays closed. */
const ALLOWED = new Set([`POST ${SIGN_IN}`, "POST /sign-out", "GET /get-session"]);

const notFound = () => new Response("Not Found", { status: 404 });

/** A disabled account answers like a wrong password, so the API doesn't confirm the password. */
async function hideDisabledAccount(response: Response): Promise<Response> {
  if (response.status !== 403) return response;
  const body: unknown = await response
    .clone()
    .json()
    .catch(() => null);
  if ((body as { code?: unknown } | null)?.code !== "BANNED_USER") return response;
  return Response.json(
    { code: "INVALID_USERNAME_OR_PASSWORD", message: "Invalid username or password" },
    { status: 401 },
  );
}

async function handle(request: Request): Promise<Response> {
  const path = new URL(request.url).pathname.slice(PREFIX.length).replace(/\/+$/, "");
  if (!ALLOWED.has(`${request.method} ${path}`)) return notFound();
  const response = await getAuth().handler(request);
  return path === SIGN_IN ? hideDisabledAccount(response) : response;
}

export { handle as GET, handle as POST };
