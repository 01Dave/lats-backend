/**
 * Minimal CSV writer for report downloads. Pure, unit-tested.
 *
 * Two protections matter because staff open these files in Excel and the
 * cells hold text people typed (customer names, reasons):
 * - a cell that would start with = + - @ is prefixed with an apostrophe so
 *   Excel shows it as text instead of running it as a formula;
 * - the file starts with a UTF-8 byte-order mark so Excel reads accents
 *   correctly.
 */

const FORMULA_START = /^[=+\-@\t\r]/;
const NEEDS_QUOTING = /[",\r\n]/;
const PHONE_LIKE = /^\+?[0-9][0-9 ()-]*$/;

/** Marks a value that must stay text (a phone number's leading 0 must survive Excel). */
export class TextCell {
  constructor(public readonly value: string) {}
}

/** Wraps phone-number-like strings so Excel keeps them as text; leaves anything else alone. */
export function forceText(value: string | null | undefined): string | TextCell {
  if (value && PHONE_LIKE.test(value)) {
    return new TextCell(value);
  }
  return value ?? "";
}

function quote(value: string): string {
  return NEEDS_QUOTING.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function csvCell(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (value instanceof TextCell) {
    // ="0800..." is Excel's text-literal form; safe because the value is digits/+/spaces only.
    return quote(`="${value.value}"`);
  }
  if (typeof value === "number") {
    return String(value);
  }
  const text = value instanceof Date ? value.toISOString() : String(value);
  return quote(FORMULA_START.test(text) ? `'${text}` : text);
}

const BOM = "﻿";

export function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(csvCell).join(","), ...rows.map((row) => row.map(csvCell).join(","))];
  return BOM + lines.join("\r\n") + "\r\n";
}
