/** Exact money arithmetic for reports: sums are done in whole cents, never floats. Pure. */

export function toCents(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === "") {
    return 0;
  }
  const text = String(value).trim();
  const match = /^(-?)(\d+)(?:\.(\d{1,}))?$/.exec(text);
  if (!match) {
    return 0;
  }
  const frac = ((match[3] ?? "") + "00").slice(0, 2);
  const cents = Number(match[2]) * 100 + Number(frac);
  return match[1] === "-" ? -cents : cents;
}

export function fromCents(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}
