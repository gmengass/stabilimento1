export interface TileExtras {
  /** The mark on the tile, e.g. "+L", "-L +S", "+2S". */
  text: string;
  /** Sunbeds more (positive) or fewer (negative) than the umbrella includes. */
  sunbedDelta: number;
  /** Deckchairs of the booking, shown on its first umbrella only. */
  deckchairs: number;
}

interface Input {
  sunbeds: number;
  includedSunbeds: number;
  deckchairs: number;
  /** True on the booking's first umbrella: deckchairs belong to the booking, not an umbrella. */
  showDeckchairs: boolean;
}

function mark(count: number, letter: string): string {
  const sign = count > 0 ? "+" : "-";
  const size = Math.abs(count);
  return `${sign}${size === 1 ? "" : size}${letter}`;
}

/**
 * What a booked tile says beyond the default (ADR 0023): L = lettino (sunbed), S = sdraio
 * (deckchair). The default is the umbrella's included sunbeds and no deckchair, and shows nothing.
 */
export function tileExtras(input: Input): TileExtras | undefined {
  const sunbedDelta = input.sunbeds - input.includedSunbeds;
  const deckchairs = input.showDeckchairs ? input.deckchairs : 0;
  const parts = [
    ...(sunbedDelta !== 0 ? [mark(sunbedDelta, "L")] : []),
    ...(deckchairs > 0 ? [mark(deckchairs, "S")] : []),
  ];
  return parts.length > 0 ? { text: parts.join(" "), sunbedDelta, deckchairs } : undefined;
}
