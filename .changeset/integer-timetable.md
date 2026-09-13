---
"connection-scan-algorithm": major
---

Scan connections held as arrays of numbers, 30 to 90 times faster.

The algorithm and its classes are as they were: `toGtfsData`, `ConnectionScanAlgorithm` asking
`ScanResults` whether each connection is reachable and better, and `JourneyFactory` building legs
from the connection index. What they read changes. Stations are numbered, connections are parallel
typed arrays sorted by arrival rather than an object each, `ScanResults` holds arrays indexed by
station, and a connection or footpath is its index. A scan starts at the first connection arriving
after the departure time rather than at midnight, stops once every destination has been reached,
and whether each trip runs is worked out once per date by a `TripCalendar`.

Over the GB rail feed, planning Tuesday 15 September, across repeated runs: 32 standard queries (the
24 of `npm run perf` and eight more) take 3.1-3.5ms each on average rather than 115-117ms, 268
journeys through couplings 1.7ms rather than 130ms, and 400 random station pairs 4.4-5.3ms rather
than 170-174ms. Building takes 305-360ms rather than 570-630ms, and holds 83MB rather than 195MB. All
1,100 answers are the same journeys 2.0.0 returns, trip for trip.

`DepartAfterQuery`, `loadGtfs` and `toGtfsData` are called as before. What changes:

- `new ConnectionScanAlgorithm(gtfs, new ScanResultsFactory(gtfs))` and `new JourneyFactory(gtfs)`
- `GtfsData` holds `Connections` and `Transfers` as arrays, an `Int32Array` of interchange times, a
  `TripCalendar`, the `trips` and a `stopTable` numbering the stations
- `scan` returns a `ConnectionIndex` of `Int32Array`, and a `Connection` is a number: `TimetableConnection`
  and `TransfersByOrigin` are gone, and `isTransfer` checks a leg while `isTransferConnection` checks
  a connection
