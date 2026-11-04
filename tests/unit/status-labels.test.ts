import { APPLICATION_STATUS_VALUES as ALL_STATUSES } from "../../src/validators/application-validator";
import { decisionLabel, stageLabel, statusLabel, STATUS_LABELS } from "../../src/utils/status-labels";

describe("status labels", () => {
  it("has wording for every status the validator accepts", () => {
    for (const status of ALL_STATUSES) {
      expect(STATUS_LABELS[status as keyof typeof STATUS_LABELS]).toBeDefined();
    }
  });
  it("falls back to the raw value for anything unknown", () => {
    expect(statusLabel("SOMETHING_NEW")).toBe("SOMETHING_NEW");
    expect(decisionLabel("NEW")).toBe("NEW");
    expect(stageLabel(null)).toBe("");
  });
  it("names the rejection outcomes", () => {
    expect(statusLabel("CREDIT_DECLINED")).toBe("Declined by Credit Review");
    expect(decisionLabel("RESOLVE")).toBe("Query answered");
  });
});
