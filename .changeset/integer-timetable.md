---
"connection-scan-algorithm": major
---

Scan an integer timetable, 30 to 100 times faster.

The timetable numbers its stations as it is built, and a scan reads parallel typed arrays sorted by
arrival rather than an object per connection: its state is an array per station and per trip, a
scan starts at the first connection arriving after the departure time and stops once every
destination has been reached, and whether each trip runs is worked out once per date. Station codes,
trips and stop times are only looked up again for the journeys returned.

Over the GB rail feed, planning Tuesday 15 September, across repeated runs: 32 standard queries (the 24 of
`npm run perf` and eight more) take 2.8-3.5ms each on average rather than 115-117ms, 268 journeys through couplings
1.3-1.7ms rather than 130ms, and 400 random station pairs 3.8-4.0ms rather than 170-174ms, or 5.2ms
rather than 177ms when every query is for a different date. Building the timetable takes 390-470ms
rather than 570-630ms, and it holds 129MB rather than 195MB. All 1,100 answers are the same journeys 2.0.0
returns, trip for trip.

The API changes with it:

- `loadGtfs` and `toGtfsData` become `loadTimetable` and `createTimetable`, returning a `Timetable`
- `DepartAfterQuery` takes the timetable and the filters: `new DepartAfterQuery(timetable, filters)`
- `ConnectionScanAlgorithm` and `JourneyFactory` take the timetable, a scan is given station numbers
  and returns a `ScanResults` of typed arrays, and `ScanResultsFactory` is gone
- `TimetableConnection`, `Connection`, `isChangeRequired`, `TransfersByOrigin` and `GtfsData` are
  gone with the objects they described; `isTransfer` is exported from the journey types
