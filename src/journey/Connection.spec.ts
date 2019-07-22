import * as chai from "chai";
import { c, t } from "../csa/ScanResults.spec";
import { isTransfer } from "./Connection";

describe("Connection", () => {

  it("knows if it's a transfer", () => {
    const transfer = t("A", "B", 10);

    chai.expect(isTransfer(transfer)).to.equal(true);
  });

  it("knows if it's not a transfer", () => {
    const timetableConnection = c("A", "B", 1000, 1030);

    chai.expect(isTransfer(timetableConnection)).to.equal(false);
  });

});
