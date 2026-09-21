import { applyAction, InvalidTransitionError } from "../../src/workflow/state-machine";

describe("applyAction", () => {
  it("chains DRAFT -> SUBMITTED straight through to HOD_IN_REVIEW (system chain)", () => {
    const result = applyAction({ currentStatus: "DRAFT", action: "submit", actorRole: "sales" });
    expect(result.status).toBe("HOD_IN_REVIEW");
  });

  it("chains hod_approve straight through to CREDIT_IN_REVIEW", () => {
    const result = applyAction({ currentStatus: "HOD_IN_REVIEW", action: "hod_approve", actorRole: "hod" });
    expect(result.status).toBe("CREDIT_IN_REVIEW");
  });

  it("chains all the way from IC approval to PENDING_DISBURSEMENT only after MD approves separately", () => {
    // IC_IN_REVIEW -> IC_APPROVED chains only to PENDING_MD, not further —
    // MD approval is a separate human action, not auto-chained past it.
    const icResult = applyAction({ currentStatus: "IC_IN_REVIEW", action: "ic_approve", actorRole: "internal_control" });
    expect(icResult.status).toBe("PENDING_MD");

    const mdResult = applyAction({ currentStatus: "PENDING_MD", action: "md_approve", actorRole: "md" });
    expect(mdResult.status).toBe("PENDING_DISBURSEMENT");
  });

  it("requires a comment on hod_query", () => {
    expect(() => applyAction({ currentStatus: "HOD_IN_REVIEW", action: "hod_query", actorRole: "hod" })).toThrow(
      InvalidTransitionError,
    );
  });

  it("accepts hod_query with a comment", () => {
    const result = applyAction({
      currentStatus: "HOD_IN_REVIEW",
      action: "hod_query",
      actorRole: "hod",
      comment: "ID document unclear, please re-upload",
    });
    expect(result.status).toBe("HOD_QUERY");
  });

  it("rejects the wrong actor role", () => {
    expect(() =>
      applyAction({ currentStatus: "HOD_IN_REVIEW", action: "hod_approve", actorRole: "credit_review" }),
    ).toThrow(InvalidTransitionError);
  });

  it("rejects an action from the wrong starting status", () => {
    expect(() => applyAction({ currentStatus: "DRAFT", action: "hod_approve", actorRole: "hod" })).toThrow(
      InvalidTransitionError,
    );
  });

  it("rejects any transition out of a closed status", () => {
    expect(() =>
      applyAction({ currentStatus: "CREDIT_DECLINED", action: "credit_approve", actorRole: "credit_review" }),
    ).toThrow(InvalidTransitionError);
  });

  it("allows withdraw from a non-closed status with a comment", () => {
    const result = applyAction({
      currentStatus: "CREDIT_IN_REVIEW",
      action: "withdraw",
      actorRole: "sales",
      comment: "Customer no longer wants the loan",
    });
    expect(result.status).toBe("WITHDRAWN");
  });

  it("requires a comment to withdraw", () => {
    expect(() => applyAction({ currentStatus: "DRAFT", action: "withdraw", actorRole: "sales" })).toThrow(
      InvalidTransitionError,
    );
  });
});
