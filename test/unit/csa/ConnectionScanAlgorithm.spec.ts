import { Service } from "@gb-transit/gtfs-loader";
import { describe, expect, it } from "vitest";
import { ConnectionScanAlgorithm } from "../../../src/csa/ConnectionScanAlgorithm.js";
import { NOT_REACHED } from "../../../src/csa/ScanResults.js";
import { ScanResultsFactory } from "../../../src/csa/ScanResultsFactory.js";
import { NO_CONNECTION } from "../../../src/journey/Connection.js";
import { JourneyFactory } from "../../../src/journey/JourneyFactory.js";
import { DepartAfterQuery } from "../../../src/query/DepartAfterQuery.js";
import { allDays, byOrigin, connection, gtfsOf, labelOf, legsOf, pickUpOnly, plan, st, TUESDAY, trip, walk } from "../util.js";

describe("ConnectionScanAlgorithm", () => {

  it("plan a basic journey", () => {
    const [journey] = plan({
      trips: [trip("1", [st("A", 1000), st("B", 1015), st("C", 1045), st("D", 1115)])]
    }, ["A"], ["D"], 900);

    expect(journey.origin).toBe("A");
    expect(journey.destination).toBe("D");
    expect(legsOf(journey)).toEqual(["1:A-D"]);
    expect(journey.departureTime).toBe(1000);
    expect(journey.arrivalTime).toBe(1115);
  });

  it("returns no results when there is no connection", () => {
    expect(plan({
      trips: [trip("1", [st("A", 1000), st("B", 1015)]), trip("2", [st("C", 1100), st("D", 1115)])]
    }, ["A"], ["D"], 900)).toEqual([]);
  });

  it("returns no results when there is a missed connection", () => {
    expect(plan({
      trips: [trip("1", [st("A", 1000), st("B", 1015)]), trip("2", [st("B", 1000), st("D", 1030)])]
    }, ["A"], ["D"], 900)).toEqual([]);
  });

  it("returns no results for an origin or destination the feed does not have", () => {
    const trips = [trip("1", [st("A", 1000), st("B", 1015)])];

    expect(plan({ trips }, ["Z"], ["B"], 900)).toEqual([]);
    expect(plan({ trips }, ["A"], ["Y"], 900)).toEqual([]);
  });

  it("does not board a trip that does not run on the date", () => {
    const septemberOnly = new Service(20260901, 20260907, allDays, {});

    expect(plan({ trips: [trip("1", [st("A", 1000), st("B", 1015)], septemberOnly)] }, ["A"], ["B"], 900)).toEqual([]);
  });

  it("plan a journey that starts with a transfer", () => {
    const [journey] = plan({
      trips: [trip("1", [st("B", 1020), st("C", 1045), st("D", 1115)])],
      transfers: byOrigin(walk("A", "B", 10))
    }, ["A"], ["D"], 900);

    expect(legsOf(journey)).toEqual(["walk:A-B", "1:B-D"]);
    expect(journey.departureTime).toBe(1010);
    expect(journey.arrivalTime).toBe(1115);
  });

  it("plan a journey that ends with a transfer", () => {
    const [journey] = plan({
      trips: [trip("1", [st("A", 1000), st("B", 1015), st("C", 1045)])],
      transfers: byOrigin(walk("C", "D", 10))
    }, ["A"], ["D"], 900);

    expect(legsOf(journey)).toEqual(["1:A-C", "walk:C-D"]);
    expect(journey.departureTime).toBe(1000);
    expect(journey.arrivalTime).toBe(1055);
  });

  it("walks on from a station reached on foot again once a train reaches it sooner", () => {
    const [journey] = plan({
      trips: [trip("1", [st("A", 1000), st("B", 1100)]), trip("2", [st("C", 1200), st("D", 1300)])],
      transfers: byOrigin(walk("A", "B", 1000), walk("B", "C", 60))
    }, ["A"], ["D"], 900);

    expect(legsOf(journey)).toEqual(["1:A-B", "walk:B-C", "2:C-D"]);
    expect(journey.arrivalTime).toBe(1300);
  });

  /**
   * Two trips run in parallel. Trip 1 arrives earliest at B and C and trip 2 earliest at D. Trip 2
   * cannot be changed onto at C in the interchange time, but it can be boarded at A, so the whole
   * journey is made on it.
   */
  it("checks for connections missed because of interchange time", () => {
    const [journey] = plan({
      trips: [
        trip("1", [st("A", 1000), st("B", 1010), st("C", 1020), st("D", 1040)]),
        trip("2", [st("A", 1005), st("B", 1015), st("C", 1025), st("D", 1035)])
      ],
      interchange: { A: 10, B: 10, C: 10, D: 10 }
    }, ["A"], ["D"], 900);

    expect(legsOf(journey)).toEqual(["2:A-D"]);
    expect(journey.departureTime).toBe(1005);
    expect(journey.arrivalTime).toBe(1035);
  });

  /**
   * Trips 1 and 2 run the same calls, both only picking up at A and B. Trip 3 reaches B before they
   * leave it, but not in time to change. Being aboard trip 2 from A does not make its connection from
   * B one the passenger can take, since trip 2 never carried them to B, only through it.
   */
  it("does not count a passenger aboard at a call the trip only picks up at", () => {
    const calls = [pickUpOnly("A", 1000), pickUpOnly("B", 1060), st("C", 2000)];
    const [journey] = plan({
      trips: [trip("1", calls), trip("2", calls), trip("3", [st("A", 1005), st("B", 1050)])],
      interchange: { B: 300 }
    }, ["A"], ["C"], 900);

    expect(legsOf(journey)).toEqual(["1:A-C"]);
  });

  /**
   * Trip 1 carries the passenger to C and on to D. Trip 2 leaves C for D at the same time, and is
   * scanned first, so it reaches D first. Trip 3 hops between two other stations in no time at the
   * moment both arrive, between the two in the scan, and must not end it before trip 1 is preferred.
   */
  it("keeps scanning for a trip to stay aboard past a connection that takes no time", () => {
    const [journey] = plan({
      trips: [
        trip("2", [st("C", 1000), st("D", 1060)]),
        trip("3", [st("E", 1060), st("F", 1060)]),
        trip("1", [st("A", 900), st("C", 1000), st("D", 1060)])
      ]
    }, ["A"], ["D"], 800);

    expect(legsOf(journey)).toEqual(["1:A-D"]);
  });

  /**
   * Trip 2 reaches D before trip 3 does, but too late to change onto trip 3 there. The passenger
   * boards trip 3 at B instead, and the journey has to say so rather than change at D.
   */
  it("boards a trip where the scan boarded it rather than where another trip arrived first", () => {
    const [journey] = plan({
      trips: [
        trip("1", [st("A", 1000), st("B", 1100)]),
        trip("2", [st("A", 1050), st("D", 1125)]),
        trip("3", [st("B", 1110), st("D", 1130), st("E", 1150)])
      ],
      interchange: { D: 600 }
    }, ["A"], ["E"], 0);

    expect(legsOf(journey)).toEqual(["1:A-B", "3:B-E"]);
    expect(journey.arrivalTime).toBe(1150);
  });

  /**
   * Trip 1 passes Q on its way to P, where trip 2 starts back through Q. Trip 2 could be boarded at
   * either, but boarding it at P would ride from Q to P and straight back.
   */
  it("boards a trip at its latest call reached in as few legs rather than doubling back", () => {
    const [journey] = plan({
      trips: [
        trip("1", [st("X", 1000), st("Q", 1010), st("P", 1020)]),
        trip("2", [st("P", 1030), st("Q", 1040), st("R", 1100)])
      ]
    }, ["X"], ["R"], 900);

    expect(legsOf(journey)).toEqual(["1:X-Q", "2:Q-R"]);
    expect(journey.arrivalTime).toBe(1100);
  });

  /**
   * Trip 2 overtakes trip 1 and could be changed from at B, but that is a change trip 1 does not need.
   */
  it("does not board a trip later if reaching the later call takes more legs", () => {
    const [journey] = plan({
      trips: [
        trip("1", [st("A", 1000), st("B", 1100), st("C", 1200)]),
        trip("2", [st("A", 1010), st("B", 1050)])
      ]
    }, ["A"], ["C"], 900);

    expect(legsOf(journey)).toEqual(["1:A-C"]);
  });

  /**
   * S is reached at the same time in three legs, then in one on trip c, and W is walked to from S.
   * Trip d can be boarded at F, reached in three legs, or at W, which is only in two once the walk
   * from S is taken again after trip c.
   */
  it("walks on again from a station reached at the same time in fewer legs", () => {
    const [journey] = plan({
      trips: [
        trip("a", [st("O", 1000), st("M", 1010)]),
        trip("a2", [st("M", 1020), st("N", 1030)]),
        trip("b", [st("N", 1040), st("S", 1100)]),
        trip("e", [st("N", 1040), st("F", 1100)]),
        trip("c", [st("O", 1000), st("S", 1100)]),
        trip("d", [st("F", 1150), st("W", 1200), st("T", 1300)])
      ],
      transfers: byOrigin(walk("S", "W", 60))
    }, ["O"], ["T"], 900);

    expect(legsOf(journey)).toEqual(["c:O-S", "walk:S-W", "d:W-T"]);
    expect(journey.arrivalTime).toBe(1300);
  });

  /**
   * X is reached earliest in two legs, but trip A passes it later in one on the way to Y, where trip
   * B is boarded back through X. The passenger changes at X rather than riding to Y and back.
   */
  it("changes where the previous trip passed the next rather than riding on and back", () => {
    const [journey] = plan({
      trips: [
        trip("P", [st("O", 1000), st("Q", 1005)]),
        trip("R", [st("Q", 1006), st("X", 1010)]),
        trip("A", [st("O", 1000), st("X", 1020), st("Y", 1030)]),
        trip("B", [st("Y", 1040), st("X", 1050), st("Z", 1100)])
      ]
    }, ["O"], ["Z"], 900);

    expect(legsOf(journey)).toEqual(["A:O-X", "B:X-Z"]);
    expect(journey.arrivalTime).toBe(1100);
  });

  it("starts each scan with nothing reached", () => {
    const gtfs = gtfsOf({ trips: [trip("1", [st("A", 1000), st("B", 1100), st("C", 1200)])] });
    const csa = new ConnectionScanAlgorithm(gtfs, new ScanResultsFactory(gtfs));

    csa.scan({ A: 900 }, ["C"], 20260908, 2);

    const fromB = csa.scan({ B: 900 }, ["C"], 20260908, 2);

    expect(labelOf(fromB, gtfs, "A", 8)).toBe(NO_CONNECTION);
    expect(fromB.boardingTimes[gtfs.stopTable.indexOf("A") * fromB.levels + 8]).toBe(NOT_REACHED);
    expect(labelOf(fromB, gtfs, "C", 1)).toBe(connection(gtfs, "1", "B", "C"));
  });

  /**
   * Y is reached soonest in three legs, changing onto trip 3 at H, but trip 2 reaches it four minutes
   * later in two, still in time for trip 4. S is reached at the same time either way.
   */
  it("changes where a later arrival in fewer legs still makes the next trip", () => {
    const [journey] = plan({
      trips: [
        trip("1", [st("A", 1000), st("M", 1050)]),
        trip("2", [st("M", 1100), st("H", 1141), st("Y", 1241)]),
        trip("3", [st("H", 1146), st("Y", 1237), st("E", 1322)]),
        trip("4", [st("Y", 1252), st("E", 1334), st("S", 1410)])
      ],
      interchange: { M: 5, H: 5, Y: 5, E: 5, S: 5 }
    }, ["A"], ["S"], 900);

    expect(legsOf(journey)).toEqual(["1:A-M", "2:M-Y", "4:Y-S"]);
    expect(journey.arrivalTime).toBe(1410);
  });

  /**
   * S is reached soonest in two legs and a minute later in one, and both are in time to walk to W for
   * trip d.
   */
  it("walks on from a station in each number of legs it is reached in", () => {
    const [journey] = plan({
      trips: [
        trip("a", [st("O", 900), st("M", 950)]),
        trip("b", [st("M", 955), st("S", 1000)]),
        trip("c", [st("O", 900), st("S", 1010)]),
        trip("d", [st("W", 1030), st("T", 1100)])
      ],
      transfers: byOrigin(walk("S", "W", 10))
    }, ["O"], ["T"], 800);

    expect(legsOf(journey)).toEqual(["c:O-S", "walk:S-W", "d:W-T"]);
  });

  /**
   * Trip 2 reaches C first, scanned before trip 3 reaches it at the same time directly.
   */
  it("keeps scanning for a journey arriving as soon in fewer legs once a destination is reached", () => {
    const [journey] = plan({
      trips: [
        trip("1", [st("A", 1000), st("B", 1010)]),
        trip("2", [st("B", 1020), st("C", 1100)]),
        trip("3", [st("A", 1000), st("C", 1100)])
      ]
    }, ["A"], ["C"], 900);

    expect(legsOf(journey)).toEqual(["3:A-C"]);
  });

  it("finds a journey of more legs than it labels", () => {
    const gtfs = gtfsOf({
      trips: [
        trip("1", [st("A", 1000), st("B", 1010)]),
        trip("2", [st("B", 1020), st("C", 1030)]),
        trip("3", [st("C", 1040), st("D", 1050)])
      ]
    });
    const query = new DepartAfterQuery(new ConnectionScanAlgorithm(gtfs, new ScanResultsFactory(gtfs, 1)), new JourneyFactory(gtfs));
    const [journey] = query.plan(["A"], ["D"], TUESDAY, 900);

    expect(legsOf(journey)).toEqual(["1:A-B", "2:B-C", "3:C-D"]);
    expect(journey.arrivalTime).toBe(1050);
  });

});
