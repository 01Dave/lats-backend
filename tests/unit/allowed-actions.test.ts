import { allowedActions, AllowedActionsInput } from "../../src/workflow/allowed-actions";
import { actionsFrom } from "../../src/workflow/state-machine";
import { permissionsForRole, RoleName } from "../../src/config/roles";
import { ApplicationStatus } from "../../src/workflow/statuses";

function input(
  role: RoleName,
  status: ApplicationStatus,
  overrides: Partial<AllowedActionsInput> = {},
): AllowedActionsInput {
  return {
    status,
    role,
    permissions: permissionsForRole(role),
    isCreator: false,
    isOwner: false,
    ...overrides,
  };
}

describe("actionsFrom (state machine)", () => {
  it("lists the actions a role can take from a status", () => {
    expect(actionsFrom("HOD_IN_REVIEW", "hod").sort()).toEqual(["hod_approve", "hod_query", "hod_reject"]);
    expect(actionsFrom("PENDING_MD", "md").sort()).toEqual(["md_approve", "md_reject"]);
    expect(actionsFrom("PENDING_DISBURSEMENT", "finance")).toEqual(["finance_disburse"]);
    expect(actionsFrom("DRAFT", "sales")).toEqual(["submit"]);
  });

  it("gives query-resolution to the stage before, not the one that asked", () => {
    expect(actionsFrom("HOD_QUERY", "sales")).toEqual(["hod_resolve"]);
    expect(actionsFrom("CREDIT_QUERY", "hod")).toEqual(["credit_resolve"]);
    expect(actionsFrom("IC_QUERY", "credit_review")).toEqual(["ic_resolve"]);
    expect(actionsFrom("HOD_QUERY", "hod")).toEqual([]);
  });

  it("never includes withdraw, and is empty for closed statuses", () => {
    expect(actionsFrom("HOD_IN_REVIEW", "admin")).toEqual([]);
    expect(actionsFrom("DISBURSED", "finance")).toEqual([]);
    expect(actionsFrom("WITHDRAWN", "sales")).toEqual([]);
  });

  it("gives a role nothing at a stage that isn't theirs", () => {
    expect(actionsFrom("HOD_IN_REVIEW", "credit_review")).toEqual([]);
    expect(actionsFrom("PENDING_MD", "hod")).toEqual([]);
  });
});

describe("allowedActions", () => {
  it("lets the creator submit a draft, and withdraw it", () => {
    expect(allowedActions(input("sales", "DRAFT", { isCreator: true, isOwner: true }))).toEqual(["submit", "withdraw"]);
  });

  it("does not let a Sales user who isn't the creator submit or resolve", () => {
    expect(allowedActions(input("sales", "DRAFT", { isCreator: false })).includes("submit")).toBe(false);
    expect(allowedActions(input("sales", "HOD_QUERY", { isCreator: false })).includes("hod_resolve")).toBe(false);
    expect(allowedActions(input("sales", "HOD_QUERY", { isCreator: true }))).toContain("hod_resolve");
  });

  it("offers an HOD their three decisions, and reassign only to the owner", () => {
    const notOwner = allowedActions(input("hod", "HOD_IN_REVIEW"));
    expect(notOwner.sort()).toEqual(["hod_approve", "hod_query", "hod_reject"]);

    const owner = allowedActions(input("hod", "HOD_IN_REVIEW", { isOwner: true }));
    expect(owner).toContain("reassign");
    expect(owner).toContain("hod_approve");
  });

  it("offers an admin withdraw and reassign but no workflow decisions", () => {
    expect(allowedActions(input("admin", "HOD_IN_REVIEW")).sort()).toEqual(["reassign", "withdraw"]);
  });

  it("offers no reassign where the creator holds the case", () => {
    expect(allowedActions(input("admin", "HOD_QUERY"))).toEqual(["withdraw"]);
    expect(allowedActions(input("sales", "DRAFT", { isCreator: true, isOwner: true }))).not.toContain("reassign");
  });

  it("offers MD only approve and reject, with no withdraw", () => {
    expect(allowedActions(input("md", "PENDING_MD", { isOwner: true })).sort()).toEqual([
      "md_approve",
      "md_reject",
      "reassign",
    ]);
  });

  it("gives Finance only disburse (plus reassign for the owner)", () => {
    expect(allowedActions(input("finance", "PENDING_DISBURSEMENT"))).toEqual(["finance_disburse"]);
  });

  it("returns an empty list for every closed status, whoever asks", () => {
    const closed: ApplicationStatus[] = [
      "HOD_REJECTED",
      "CREDIT_DECLINED",
      "IC_REJECTED",
      "MD_REJECTED",
      "DISBURSED",
      "WITHDRAWN",
    ];
    const roles: RoleName[] = ["sales", "hod", "credit_review", "internal_control", "md", "finance", "admin"];
    for (const status of closed) {
      for (const role of roles) {
        expect(allowedActions(input(role, status, { isCreator: true, isOwner: true }))).toEqual([]);
      }
    }
  });

  it("agrees with the state machine: every offered workflow action is valid for that role and status", () => {
    // Guards against the hint drifting from what applyAction() will accept.
    const statuses: ApplicationStatus[] = [
      "DRAFT",
      "HOD_IN_REVIEW",
      "HOD_QUERY",
      "CREDIT_IN_REVIEW",
      "CREDIT_QUERY",
      "IC_IN_REVIEW",
      "IC_QUERY",
      "PENDING_MD",
      "PENDING_DISBURSEMENT",
    ];
    const roles: RoleName[] = ["sales", "hod", "credit_review", "internal_control", "md", "finance", "admin"];
    for (const status of statuses) {
      for (const role of roles) {
        const offered = allowedActions(input(role, status, { isCreator: true, isOwner: true })).filter(
          (a) => a !== "withdraw" && a !== "reassign",
        );
        expect(offered).toEqual(actionsFrom(status, role));
      }
    }
  });
});
