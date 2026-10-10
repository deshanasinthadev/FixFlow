import { formatCents } from "../domain/money";
import type { Cents } from "../domain/types";

export const TIMEZONE = "Asia/Colombo";

function toDate(value: string | Date | undefined | null): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Calendar dates and times are always rendered in the business timezone. */
export function formatDate(value: string | Date | undefined | null): string {
  const date = toDate(value);
  if (!date) return "—";
  return date.toLocaleDateString("en-LK", { day: "2-digit", month: "short", year: "numeric", timeZone: TIMEZONE });
}

export function formatShortDate(value: string | Date | undefined | null): string {
  const date = toDate(value);
  if (!date) return "—";
  return date.toLocaleDateString("en-LK", { day: "2-digit", month: "short", timeZone: TIMEZONE });
}

export function formatDateTime(value: string | Date | undefined | null): string {
  const date = toDate(value);
  if (!date) return "—";
  return date.toLocaleString("en-LK", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: TIMEZONE,
  });
}

export function formatTime(value: string | Date | undefined | null): string {
  const date = toDate(value);
  if (!date) return "—";
  return date.toLocaleTimeString("en-LK", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: TIMEZONE });
}

/** Human-friendly relative time, e.g. "3 days ago". */
export function relativeTime(value: string | Date | undefined | null, now = new Date()): string {
  const date = toDate(value);
  if (!date) return "—";
  const diffMs = now.getTime() - date.getTime();
  const future = diffMs < 0;
  const minutes = Math.round(Math.abs(diffMs) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return future ? `in ${minutes} min` : `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return future ? `in ${hours} hr` : `${hours} hr ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return future ? `in ${days} day${days === 1 ? "" : "s"}` : `${days} day${days === 1 ? "" : "s"} ago`;
  const months = Math.round(days / 30);
  return future ? `in ${months} month${months === 1 ? "" : "s"}` : `${months} month${months === 1 ? "" : "s"} ago`;
}

export function formatMoney(value: Cents, symbol = "Rs.", decimals: 0 | 2 = 2): string {
  return formatCents(value, { symbol, decimals });
}

export function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function titleCase(value: string): string {
  return value
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/** Escapes a value for a CSV cell. */
export function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Triggers a browser download of a CSV string. */
export function downloadCsv(filename: string, header: string[], rows: unknown[][]): void {
  const csv = [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
