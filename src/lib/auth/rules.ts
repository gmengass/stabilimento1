import { z } from "zod";

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 30;
export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 128;

export const roles = ["admin", "staff"] as const;
export type Role = (typeof roles)[number];

/** Usernames are stored lowercased: letters, digits, `.` and `_` (DB check in 0003_auth). */
export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(USERNAME_MIN)
  .max(USERNAME_MAX)
  .regex(/^[a-z0-9_.]+$/);

export const passwordSchema = z.string().min(PASSWORD_MIN).max(PASSWORD_MAX);

/** Better Auth needs a unique email; staff have none, so we store a never-shown placeholder. */
export function placeholderEmail(name: string): string {
  return `${name}@staff.invalid`;
}
