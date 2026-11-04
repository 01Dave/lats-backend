import {
  dayEndExclusive, dayStart, formatLagosDate, formatLagosDateTime, isValidDateString, monthKey,
} from "../../src/utils/report-dates";

describe("monthKey (Lagos time, UTC+1)", () => {
  it("counts 23:30 UTC on the last day of a month as the next month", () => {
    expect(monthKey(new Date("2026-10-31T23:30:00Z"))).toBe("2026-11");
  });
  it("keeps 22:59 UTC on the last day in that month", () => {
    expect(monthKey(new Date("2026-10-31T22:59:00Z"))).toBe("2026-10");
  });
  it("rolls over the year", () => {
    expect(monthKey(new Date("2026-12-31T23:00:00Z"))).toBe("2027-01");
  });
});

describe("isValidDateString", () => {
  it("accepts real dates, rejects impossible or badly written ones", () => {
    expect(isValidDateString("2026-11-04")).toBe(true);
    expect(isValidDateString("2028-02-29")).toBe(true);
    expect(isValidDateString("2026-02-29")).toBe(false);
    expect(isValidDateString("2026-02-31")).toBe(false);
    expect(isValidDateString("2026-13-01")).toBe(false);
    expect(isValidDateString("04/11/2026")).toBe(false);
    expect(isValidDateString("2026-1-4")).toBe(false);
  });
});

describe("day boundaries", () => {
  it("a Lagos day starts at 23:00 UTC the evening before", () => {
    expect(dayStart("2026-11-04").toISOString()).toBe("2026-11-03T23:00:00.000Z");
  });
  it("the inclusive end of a day is the start of the next", () => {
    expect(dayEndExclusive("2026-11-04").toISOString()).toBe("2026-11-04T23:00:00.000Z");
    expect(dayEndExclusive("2026-10-31").toISOString()).toBe("2026-10-31T23:00:00.000Z");
  });
});

describe("formatting", () => {
  it("shows Lagos clock time", () => {
    expect(formatLagosDateTime(new Date("2026-11-04T08:12:00Z"))).toContain("09:12");
    expect(formatLagosDate(new Date("2026-11-04T23:30:00Z"))).toContain("05");
  });
});
