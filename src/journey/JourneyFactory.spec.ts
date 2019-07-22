import * as chai from "chai";
import { c, t } from "../csa/ScanResults.spec";
import { JourneyFactory, ScanResults } from "..";
import { setStopTimes } from "../csa/ConnectionScanAlgorithm.spec";

describe("JourneyFactory", () => {
  const factory = new JourneyFactory();

  it("creates a journey from a connection index", () => {
    const results = new ScanResults({ A: 1000 }, {});
    const connections = [
      c("A", "B", 1000, 1030)
    ];

    setStopTimes(connections);

    for (const connection of connections) {
      results.setConnection(connection);
    }

    const [journey] = factory.getJourneys(results.getConnectionIndex(), ["B"]);

    chai.expect(journey.origin).to.equal("A");
    chai.expect(journey.destination).to.equal("B");
    chai.expect(journey.departureTime).to.equal(1000);
    chai.expect(journey.arrivalTime).to.equal(1030);
  });

  it("calculates the departure time", () => {
    const results = new ScanResults({ A: 1000 }, {});
    const transfers = [
      t("A", "B", 60),
    ];
    const connections = [
      c("B", "C", 1100, 1130)
    ];

    setStopTimes(connections);

    for (const transfer of transfers ) {
      results.setTransfer(transfer);
    }

    for (const connection of connections) {
      results.setConnection(connection);
    }

    const [journey] = factory.getJourneys(results.getConnectionIndex(), ["C"]);

    chai.expect(journey.origin).to.equal("A");
    chai.expect(journey.destination).to.equal("C");
    chai.expect(journey.departureTime).to.equal(1040);
    chai.expect(journey.arrivalTime).to.equal(1130);
  });

  it("calculates the arrival time", () => {
    const results = new ScanResults({ A: 1000 }, {});
    const transfers = [
      t("A", "B", 60),
      t("C", "D", 60),
    ];
    const connections = [
      c("B", "C", 1100, 1130)
    ];

    setStopTimes(connections);

    for (const transfer of transfers ) {
      results.setTransfer(transfer);
    }

    for (const connection of connections) {
      results.setConnection(connection);
    }

    const [journey] = factory.getJourneys(results.getConnectionIndex(), ["D"]);

    chai.expect(journey.origin).to.equal("A");
    chai.expect(journey.destination).to.equal("D");
    chai.expect(journey.departureTime).to.equal(1040);
    chai.expect(journey.arrivalTime).to.equal(1190);
  });

  it("removes pointless legs", () => {
    const results = new ScanResults({ A: 1000 }, {});
    const connections = [
      c("A", "B", 1000, 1010, "LN1111"),
      c("B", "C", 1010, 1020, "LN1112"),
      c("C", "D", 1020, 1030, "LN1113"),
      c("D", "E", 1030, 1040, "LN1114")
    ];
    const stopTimes = [
      { stop: "A", dropOff: true, pickUp: true, arrivalTime: 1000, departureTime: 1000 },
      { stop: "B", dropOff: true, pickUp: true, arrivalTime: 1010, departureTime: 1010 },
      { stop: "C", dropOff: true, pickUp: true, arrivalTime: 1020, departureTime: 1020 },
      { stop: "D", dropOff: true, pickUp: true, arrivalTime: 1030, departureTime: 1030 },
      { stop: "E", dropOff: true, pickUp: true, arrivalTime: 1040, departureTime: 1040 },
    ];

    for (const connection of connections) {
      connection.trip.stopTimes = stopTimes;
      results.setConnection(connection);
    }

    const [journey] = factory.getJourneys(results.getConnectionIndex(), ["E"]);

    chai.expect(journey.origin).to.equal("A");
    chai.expect(journey.destination).to.equal("E");
    chai.expect(journey.departureTime).to.equal(1000);
    chai.expect(journey.arrivalTime).to.equal(1040);
    chai.expect(journey.legs.length).to.equal(1);
  });

});
