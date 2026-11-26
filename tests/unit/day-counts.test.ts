// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { DayCounts } from "@/app/(app)/day-counts";
import type { StockDay } from "@/lib/booking/stock";

vi.mock("next-intl/server", () => ({
  getTranslations:
    async () =>
    (key: string, values: Record<string, number> = {}) =>
      key === "countValue"
        ? `${values.free} / ${values.total}`
        : `${key} ${Object.values(values).join(" ")}`,
}));

const COUNTS = { umbrellas: { free: 11, total: 12 }, sunbeds: { free: 20, total: 24 } };
const NO_STOCK: StockDay = { sunbeds: null, deckchairs: null };

async function show(stock: StockDay = NO_STOCK) {
  return render(await DayCounts({ counts: COUNTS, stock }));
}

afterEach(cleanup);

describe("DayCounts", () => {
  it("shows an icon and free / total instead of the sentence", async () => {
    await show();
    const umbrellas = screen.getByTestId("count-umbrellas");
    const shown = umbrellas.querySelector("span[aria-hidden='true']");
    expect(shown?.querySelector("svg")).not.toBeNull();
    expect(shown?.textContent).toBe("11 / 12");
    expect(screen.getByTestId("count-sunbeds").textContent).toContain("20 / 24");
  });

  it("keeps the full sentence for screen readers and as the tooltip", async () => {
    await show();
    const sunbeds = screen.getByTestId("count-sunbeds");
    expect(sunbeds.querySelector(".sr-only")?.textContent).toBe("countSunbeds 20 24");
    expect(sunbeds.querySelector("span[aria-hidden='true']")?.getAttribute("title")).toBe(
      "countSunbeds 20 24",
    );
    expect(sunbeds.querySelectorAll("[title]")).toHaveLength(1);
  });

  it("hides stock counts that are not tracked", async () => {
    await show();
    expect(screen.queryByTestId("stock-sunbeds")).toBeNull();
    expect(screen.queryByTestId("stock-deckchairs")).toBeNull();
  });

  it("shows stock over its limit as 0 / total with the overrun, in amber", async () => {
    await show({ sunbeds: { free: -2, total: 10 }, deckchairs: { free: 3, total: 5 } });
    const sunbeds = screen.getByTestId("stock-sunbeds");
    expect(sunbeds.textContent).toContain("0 / 10");
    expect(sunbeds.textContent).toContain("countOver 2");
    expect(sunbeds.className).toContain("text-amber-800");
    expect(sunbeds.querySelector(".sr-only")?.textContent).toBe("countSunbedStock 0 10");
    expect(sunbeds.querySelector("[title]")?.getAttribute("title")).toBe(
      "countSunbedStock 0 10 countOver 2",
    );
    expect(screen.getByTestId("stock-deckchairs").className).not.toContain("amber");
  });

  it("marks every count for the e2e reader", async () => {
    const { container } = await show({
      sunbeds: { free: 1, total: 2 },
      deckchairs: { free: 1, total: 2 },
    });
    expect(container.querySelectorAll("[data-count]")).toHaveLength(4);
  });
});
