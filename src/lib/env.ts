import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  APP_URL: z.url().default("http://localhost:3000"),
});

const authEnvSchema = z.object({
  AUTH_SECRET: z.string().min(32, "must be at least 32 characters (openssl rand -hex 32)"),
});

export type Env = z.infer<typeof envSchema>;
export type AuthEnv = z.infer<typeof authEnvSchema>;

type Source = Record<string, string | undefined>;

function parseWith<T>(schema: z.ZodType<T>, source: Source): T {
  const result = schema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
    throw new Error(`Invalid environment variables:\n${issues.join("\n")}`);
  }
  return result.data;
}

export function parseEnv(source: Source): Env {
  return parseWith(envSchema, source);
}

/** Auth settings, parsed apart from `parseEnv` so migrations and /health don't need them. */
export function parseAuthEnv(source: Source): AuthEnv {
  return parseWith(authEnvSchema, source);
}

let cached: Env | undefined;

export function getEnv(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}
