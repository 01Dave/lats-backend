import { buildPipeline, daysBetween, PIPELINE_STATUSES, PipelineRow, stageEnteredAt } from "../../src/utils/report-pipeline";

const NOW = new Date("2026-11-10T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

const row = (id: string, status: string, days: number): PipelineRow => ({
  id,
  appNumber: `LATS-${id}`,
  status,
  customerName: "C " + id,
  productName: "Personal/Payday Loan",
  requestedAmount: "1000",
  ownerName: "Owner",
  stageEnteredAt: daysAgo(days),
});

describe("daysBetween", () => {
  it("rounds to one decimal and never goes negative", () => {
    expect(daysBetween(daysAgo(2.25), NOW)).toBe(2.3);
    expect(daysBetween(daysAgo(-1), NOW)).toBe(0);
  });
});

describe("stageEnteredAt", () => {
  const created = new Date("2026-11-01T00:00:00Z");
  const approval = new Date("2026-11-03T00:00:00Z");
  const assigned = new Date("2026-11-03T00:00:01Z");
  it("uses the latest of decision and automatic assignment", () => {
    expect(stageEnteredAt(created, approval, assigned)).toEqual(assigned);
  });
  it("falls back to the created date when nothing else exists", () => {
    expect(stageEnteredAt(created, null, null)).toEqual(created);
  });
  it("uses the approval when there is no automatic assignment", () => {
    expect(stageEnteredAt(created, approval, null)).toEqual(approval);
  });
});

describe("buildPipeline", () => {
  it("always lists every resting status, in workflow order, even when empty", () => {
    const stages = buildPipeline([], NOW);
    expect(stages.map((s) => s.status)).toEqual([...PIPELINE_STATUSES]);
    expect(stages.every((s) => s.count === 0 && s.averageDays === 0 && s.oldest.length === 0)).toBe(true);
  });

  it("counts, averages and ranks oldest first", () => {
    const stages = buildPipeline([row("a", "HOD_IN_REVIEW", 1), row("b", "HOD_IN_REVIEW", 5), row("c", "PENDING_MD", 2)], NOW);
    const hod = stages.find((s) => s.status === "HOD_IN_REVIEW")!;
    expect(hod.count).toBe(2);
    expect(hod.averageDays).toBe(3);
    expect(hod.oldest.map((o) => o.appNumber)).toEqual(["LATS-b", "LATS-a"]);
    expect(hod.oldest[0].daysInStage).toBe(5);
    expect(stages.find((s) => s.status === "PENDING_MD")!.count).toBe(1);
  });

  it("lists at most five oldest cases per stage", () => {
    const rows = Array.from({ length: 8 }, (_, i) => row(String(i), "CREDIT_IN_REVIEW", i));
    const credit = buildPipeline(rows, NOW).find((s) => s.status === "CREDIT_IN_REVIEW")!;
    expect(credit.count).toBe(8);
    expect(credit.oldest).toHaveLength(5);
    expect(credit.oldest[0].daysInStage).toBe(7);
  });

  it("ignores statuses that are not resting stages", () => {
    const stages = buildPipeline([row("x", "DISBURSED", 3)], NOW);
    expect(stages.reduce((n, s) => n + s.count, 0)).toBe(0);
  });
});
