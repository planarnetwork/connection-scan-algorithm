import * as chai from "chai";
import { ScanResults } from "./ScanResults";
import { ScanResultsFactory } from "./ScanResultsFactory";

describe("ScanResultsFactory", () => {

  it("creates a ScanResults object", () => {
    const factory = new ScanResultsFactory({});
    const actual = factory.create({ "A": 900 });

    chai.expect(actual).to.be.instanceOf(ScanResults);
  });

});
