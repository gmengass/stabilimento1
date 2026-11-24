import { describe, expect, it } from "vitest";
import * as classes from "@/components/button-classes";

describe("button classes", () => {
  it.each(Object.entries(classes))(
    "%s only adds sun: classes, so Light never changes",
    (_, value) => {
      for (const name of value.split(/\s+/)) expect(name).toMatch(/^sun:/);
    },
  );
});
