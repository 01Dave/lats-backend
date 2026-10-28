import { ownerTargetForStatus, isReassignable, pickAssignee, assigneeProblem } from "../../src/utils/assignment";
import { ApplicationStatus } from "../../src/workflow/statuses";

describe("ownerTargetForStatus", () => {
  it("maps each resting stage to the role that handles it", () => {
    expect(ownerTargetForStatus("HOD_IN_REVIEW")).toBe("hod");
    expect(ownerTargetForStatus("CREDIT_IN_REVIEW")).toBe("credit_review");
    expect(ownerTargetForStatus("IC_IN_REVIEW")).toBe("internal_control");
    expect(ownerTargetForStatus("PENDING_MD")).toBe("md");
    expect(ownerTargetForStatus("PENDING_DISBURSEMENT")).toBe("finance");
  });

  it("hands a query back to whoever must answer it", () => {
    expect(ownerTargetForStatus("HOD_QUERY")).toBe("creator");
    expect(ownerTargetForStatus("CREDIT_QUERY")).toBe("hod");
    expect(ownerTargetForStatus("IC_QUERY")).toBe("credit_review");
  });

  it("gives drafts to their creator", () => {
    expect(ownerTargetForStatus("DRAFT")).toBe("creator");
  });

  it("has no owner for closed or transient statuses", () => {
    const none: ApplicationStatus[] = [
      "SUBMITTED",
      "HOD_APPROVED",
      "HOD_REJECTED",
      "CREDIT_APPROVED",
      "CREDIT_DECLINED",
      "IC_APPROVED",
      "IC_REJECTED",
      "MD_APPROVED",
      "MD_REJECTED",
      "DISBURSED",
      "WITHDRAWN",
    ];
    for (const status of none) {
      expect(ownerTargetForStatus(status)).toBeNull();
    }
  });
});

describe("isReassignable", () => {
  it("is true only where a person (not the creator) owns the stage", () => {
    expect(isReassignable("HOD_IN_REVIEW")).toBe(true);
    expect(isReassignable("PENDING_DISBURSEMENT")).toBe(true);
    expect(isReassignable("DRAFT")).toBe(false);
    expect(isReassignable("HOD_QUERY")).toBe(false);
    expect(isReassignable("DISBURSED")).toBe(false);
  });
});

describe("pickAssignee", () => {
  const d = (s: string) => new Date(s);

  it("returns null when nobody is eligible", () => {
    expect(pickAssignee([])).toBeNull();
  });

  it("picks the least-loaded candidate", () => {
    expect(
      pickAssignee([
        { id: "a", openCases: 3, lastAssignedAt: null },
        { id: "b", openCases: 1, lastAssignedAt: null },
        { id: "c", openCases: 2, lastAssignedAt: null },
      ]),
    ).toBe("b");
  });

  it("breaks load ties by who was assigned longest ago, never-assigned first", () => {
    expect(
      pickAssignee([
        { id: "a", openCases: 1, lastAssignedAt: d("2026-10-02T10:00:00Z") },
        { id: "b", openCases: 1, lastAssignedAt: d("2026-10-01T10:00:00Z") },
        { id: "c", openCases: 1, lastAssignedAt: d("2026-10-03T10:00:00Z") },
      ]),
    ).toBe("b");
    expect(
      pickAssignee([
        { id: "a", openCases: 0, lastAssignedAt: d("2026-10-01T10:00:00Z") },
        { id: "b", openCases: 0, lastAssignedAt: null },
      ]),
    ).toBe("b");
  });

  it("is deterministic on a full tie (lowest id)", () => {
    expect(
      pickAssignee([
        { id: "b", openCases: 0, lastAssignedAt: null },
        { id: "a", openCases: 0, lastAssignedAt: null },
      ]),
    ).toBe("a");
  });

  it("does not mutate its input", () => {
    const input = [
      { id: "b", openCases: 2, lastAssignedAt: null },
      { id: "a", openCases: 1, lastAssignedAt: null },
    ];
    pickAssignee(input);
    expect(input.map((c) => c.id)).toEqual(["b", "a"]);
  });
});

describe("assigneeProblem", () => {
  const ok = { role: "hod" as const, active: true };

  it("accepts an active user in the right role", () => {
    expect(assigneeProblem({ status: "HOD_IN_REVIEW", assignee: ok })).toBeNull();
  });

  it("rejects the wrong role for the stage", () => {
    const msg = assigneeProblem({
      status: "HOD_IN_REVIEW",
      assignee: { ...ok, role: "credit_review" },
    });
    expect(msg).toContain("'hod'");
  });

  it("rejects a deactivated user", () => {
    expect(assigneeProblem({ status: "HOD_IN_REVIEW", assignee: { ...ok, active: false } })).toContain("deactivated");
  });

  it("refuses statuses whose owner can't be reassigned", () => {
    expect(assigneeProblem({ status: "DRAFT", assignee: ok })).toContain("can't be reassigned");
    expect(assigneeProblem({ status: "DISBURSED", assignee: ok })).toContain("can't be reassigned");
  });
});
