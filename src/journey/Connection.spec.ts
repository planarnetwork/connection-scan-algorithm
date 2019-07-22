import * as chai from "chai";
import { c, t } from "../csa/ScanResults.spec";
import {isChangeRequired, isTransfer} from "./Connection";

describe("Connection", () => {

  it("knows if it's a transfer", () => {
    const transfer = t("A", "B", 10);

    chai.expect(isTransfer(transfer)).to.equal(true);
  });

  it("knows if it's not a transfer", () => {
    const timetableConnection = c("A", "B", 1000, 1030);

    chai.expect(isTransfer(timetableConnection)).to.equal(false);
  });

  it("knows if a change is required", () => {
    const timetableConnection1 = c("A", "B", 1000, 1030);
    const timetableConnection2 = c("A", "B", 1000, 1030, "LN1112");

    chai.expect(isChangeRequired(timetableConnection1, timetableConnection2)).to.equal(true);
  });

  it("knows if a change is not required", () => {
    const timetableConnection1 = c("A", "B", 1000, 1030, "LN1112");
    const timetableConnection2 = c("A", "B", 1000, 1030, "LN1112");

    chai.expect(isChangeRequired(timetableConnection1, timetableConnection2)).to.equal(false);
  });

  it("knows if a change is required between a transfer", () => {
    const timetableConnection = c("A", "B", 1000, 1030, "LN1112");
    const transfer = t("A", "B", 1000);

    chai.expect(isChangeRequired(timetableConnection, transfer)).to.equal(true);
    chai.expect(isChangeRequired(transfer, timetableConnection)).to.equal(true);
  });

});
