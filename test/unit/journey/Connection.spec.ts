import { describe, expect, it } from "vitest";
import { isChangeRequired, isTransfer } from "../../../src/journey/Connection.js";
import { c, t } from "../util.js";

describe("Connection", () => {

  it("knows if it's a transfer", () => {
    expect(isTransfer(t("A", "B", 10))).toBe(true);
  });

  it("knows if it's not a transfer", () => {
    expect(isTransfer(c("A", "B", 1000, 1030))).toBe(false);
  });

  it("knows if a change is required", () => {
    const timetableConnection1 = c("A", "B", 1000, 1030);
    const timetableConnection2 = c("A", "B", 1000, 1030, "LN1112");

    expect(isChangeRequired(timetableConnection1, timetableConnection2)).toBe(true);
  });

  it("knows if a change is not required", () => {
    const timetableConnection1 = c("A", "B", 1000, 1030, "LN1112");
    const timetableConnection2 = c("A", "B", 1000, 1030, "LN1112");

    expect(isChangeRequired(timetableConnection1, timetableConnection2)).toBe(false);
  });

  it("knows if a change is required between a transfer", () => {
    const timetableConnection = c("A", "B", 1000, 1030, "LN1112");
    const transfer = t("A", "B", 1000);

    expect(isChangeRequired(timetableConnection, transfer)).toBe(true);
    expect(isChangeRequired(transfer, timetableConnection)).toBe(true);
  });

});
