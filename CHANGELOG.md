# connection-scan-algorithm

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
