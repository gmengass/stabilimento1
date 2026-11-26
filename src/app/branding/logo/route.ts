import { connection, type NextRequest } from "next/server";
import { isLogoVariant, readLogo } from "@/lib/branding";

/** Public: the sign-in page shows the logo before anyone signs in. `?variant=dark` for dark backgrounds. */
export async function GET(request: NextRequest): Promise<Response> {
  await connection();
  const requested = request.nextUrl.searchParams.get("variant");
  const logo = await readLogo(isLogoVariant(requested) ? requested : "light");
  if (!logo) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(logo), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
