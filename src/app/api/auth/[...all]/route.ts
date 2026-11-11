import { getAuth } from "@/lib/auth/auth";

function handle(request: Request): Promise<Response> {
  return getAuth().handler(request);
}

export { handle as GET, handle as POST };
