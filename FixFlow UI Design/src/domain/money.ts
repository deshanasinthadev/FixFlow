import type { Cents } from "./types";

/**
 * All money in FixFlow is an integer number of cents. Adding and subtracting
 * integers is exact, which removes the floating-point drift you get from
 * storing rupees as `number` (0.1 + 0.2 !== 0.3).
 */

export const cents = (rupees: number): Cents => Math.round(rupees * 100);

export const rupees = (value: Cents): number => value / 100;

/** Safe integer sum of a list of cent amounts. */
export function sumCents(values: Cents[]): Cents {
  return values.reduce((total, value) => total + Math.round(value), 0);
}

/** Line total for a quantity x unit price pair, in cents. */
export function lineTotal(unitPriceCents: Cents, quantity: number): Cents {
  return Math.round(unitPriceCents) * quantity;
}

/**
 * Percentage rounding. Tax and discounts round half-up to the nearest cent so
 * repeated calculations always produce the same result.
 */
export function applyPercent(amountCents: Cents, percent: number): Cents {
  return Math.round((Math.round(amountCents) * percent) / 100);
}

export function clampNonNegative(value: Cents): Cents {
  return Math.max(0, Math.round(value));
}

export function formatCents(value: Cents, options: { symbol?: string; decimals?: 0 | 2 } = {}): string {
  const symbol = options.symbol ?? "Rs.";
  const decimals = options.decimals ?? 2;
  const negative = value < 0;
  const absolute = Math.abs(Math.round(value)) / 100;
  const formatted = absolute.toLocaleString("en-LK", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return `${negative ? "-" : ""}${symbol} ${formatted}`;
}

/** Parses user input like "18,500" or "18500.50" into cents. Returns null if invalid. */
export function parseCurrencyInput(input: string): Cents | null {
  const cleaned = input.replace(/[^0-9.]/g, "");
  if (cleaned === "" || cleaned === ".") return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}
