# connection-scan-algorithm

## 3.0.0

### Major Changes

- c03d451: Scan connections held as arrays of numbers, 30 to 90 times faster.
  
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

## 2.0.0

### Major Changes

- 3919aa3: Read feeds with `@gb-transit/gtfs-loader`, and plan over the GB rail feed as it is published now.
  
  `GtfsLoader`, `TimeParser`, `Service` and this package's own GTFS types are replaced by the loader:
  `loadGtfs(source)` reads a zip, stream, `Response` or bytes, and `toGtfsData(feed)` accepts a feed
  already loaded. The loader's types and `loadGTFS`, `loadGTFSFromUrl`, `Service` and `TimeParser`
  are re-exported.
  
  - Connections run between stations rather than platforms, named by `stop_code`. `JourneyFactory`
    now takes `gtfs.stations` so a leg can be cut from its trip, and legs keep the platform stop times.
  - Passing points are no longer somewhere a journey can start or end.
  - A `transfer_type` 4 coupling is planned as one trip, and the scan prefers staying aboard over
    changing onto a trip that arrives at the same time.
  - A station with no interchange time, and an origin with no footpaths, no longer break the scan.
  - Footpaths out of a station are walked again whenever it is reached sooner, not only the first time
    it is reached, so a station first reached on foot no longer holds back everything beyond it.
  - `DepartAfterQuery` reads the date in local time, agreeing with the day of week.
  - The mysql transfer pattern generator is removed; transfer-pattern-planner generates patterns now.
  
  Node 22 or later is required, and the package ships both CommonJS and ES modules.
