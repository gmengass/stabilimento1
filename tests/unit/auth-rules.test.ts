import { describe, expect, it } from "vitest";
import { passwordSchema, placeholderEmail, usernameSchema } from "@/lib/auth/rules";

describe("usernameSchema", () => {
  it.each([
    ["anna", "anna"],
    ["  Anna  ", "anna"],
    ["MARIO.ROSSI", "mario.rossi"],
    ["bar_2", "bar_2"],
    ["abc", "abc"],
    ["a".repeat(30), "a".repeat(30)],
  ])("accepts %j as %j", (input, expected) => {
    expect(usernameSchema.parse(input)).toBe(expected);
  });

  it.each(["ab", " ab ", "a".repeat(31), "an na", "an-na", "anna!", "", "ànna", 42, null])(
    "rejects %j",
    (input) => {
      expect(usernameSchema.safeParse(input).success).toBe(false);
    },
  );
});

describe("passwordSchema", () => {
  it.each([10, 128])("accepts %i characters", (length) => {
    expect(passwordSchema.safeParse("p".repeat(length)).success).toBe(true);
  });

  it.each([0, 9, 129])("rejects %i characters", (length) => {
    expect(passwordSchema.safeParse("p".repeat(length)).success).toBe(false);
  });

  it("does not trim, so spaces count", () => {
    expect(passwordSchema.parse("  pass  wd ")).toBe("  pass  wd ");
  });
});

describe("placeholderEmail", () => {
  it("uses the reserved .invalid domain", () => {
    expect(placeholderEmail("anna")).toBe("anna@staff.invalid");
  });
});
