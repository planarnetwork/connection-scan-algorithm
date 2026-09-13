Connection Scan Algorithm
=========================
[![Test](https://github.com/planarnetwork/connection-scan-algorithm/actions/workflows/ci.yml/badge.svg)](https://github.com/planarnetwork/connection-scan-algorithm/actions/workflows/ci.yml) ![npm](https://img.shields.io/npm/v/connection-scan-algorithm.svg?style=flat-square)

Implementation of the [Connection Scan Algorithm](https://arxiv.org/pdf/1703.05997) in TypeScript.

Additional features not in the paper implementation:
 - Various [fixes](https://ljn.io/posts/CSA-workarounds) in order to improve the quality of results.
 - Calendars are checked to ensure services are running on the specified day
 - The origin and destination may be a set of stations
 - Interchange time at each station is applied
 - Pickup / set down marker of stop times are obeyed
 - Multi-criteria journey filtering
 - Footpaths from `transfers.txt` can be used
 - Journeys are planned between stations, and the platforms are retained for display
 - A vehicle that carries on as another service is planned as one trip rather than a change

## Usage

It will work with any well formed GTFS data set.

Node 22 or later is required for all examples.

```
npm install --save connection-scan-algorithm
```

The package ships both CommonJS and ES modules, so `require` and `import` both work. The examples
below use `require`; the equivalent `import` is the same names from the same place.

Reading the feed is [`@gb-transit/gtfs-loader`](https://www.npmjs.com/package/@gb-transit/gtfs-loader)'s
job, and it is the only runtime dependency.

### Depart After Query

Find the first results that depart after a specific time

```javascript
const fs = require("fs");
const {
  loadGtfs, JourneyFactory, ConnectionScanAlgorithm, ScanResultsFactory, MultipleCriteriaFilter, DepartAfterQuery
} = require("connection-scan-algorithm");

const gtfs = await loadGtfs(fs.createReadStream("gtfs.zip"));
// or toGtfsData(feed) if you already have a feed from @gb-transit/gtfs-loader

const csa = new ConnectionScanAlgorithm(gtfs, new ScanResultsFactory(gtfs));
const query = new DepartAfterQuery(csa, new JourneyFactory(gtfs), [new MultipleCriteriaFilter()]);
const results = query.plan(["TBW"], ["NRW"], new Date(), 9 * 3600);
```

### How a scan reads the timetable

The algorithm is the paper's: connections sorted by arrival, read in order, each one taken if it can
be reached and gets somewhere sooner. What makes it quick is what it reads.

`toGtfsData` numbers the stations, and holds the connections as parallel arrays of those numbers and
times rather than as an object each. `ScanResults` keeps its earliest arrivals and the connection
achieving each in arrays indexed by station, and a connection or footpath is its index, so every
question the scan asks is a few array reads. A scan starts at the first connection arriving after the
departure time and stops once every destination has been reached before the connection it is on
arrives, and whether each trip runs is worked out once per date rather than asked of every connection.

### Stations and platforms

A connection runs between stations, because that is where interchange time and footpaths are
defined and the only place a change of train is possible. A stop that gives a `parent_station` is
read as belonging to it, and a station is named by its `stop_code` where it has one, so that is what
queries are made with and journeys are returned in. `gtfs.stations` maps every feed stop id to the
station it belongs to, which is what `JourneyFactory` needs to cut a leg out of its trip, and
`gtfs.stopTable` numbers the stations.

The stop times of a leg are the feed's own, so a leg between two stations still says which platform
it uses at each end. A call the vehicle only passes through is not somewhere a journey can start or
end, and is left out of the leg.

Footpaths and interchange times come from `transfers.txt`: a row from a stop back to itself is the
interchange time at that station, and a row between two stations is a footpath. A station with no
interchange time is one a change takes no time at.

A footpath is charged the interchange time at both ends: at the station it starts from, and again at
the station it reaches before a train can be boarded there.

### Joins and splits

A row of `transfer_type` 4 in `transfers.txt` says a vehicle carries on as another trip. The trip a
passenger stays on across that coupling is planned as one trip alongside the two portions, which
still run alone on the days the other does not. A portion that leaves after midnight is moved onto
the day of the trip it continues, so a through journey on a sleeper is planned on the day it departs.

When the through trip and a portion arrive at the same time, the one the passenger is already on is
kept, so a journey never changes trains at a station where the train they are on carries on to the
same place.

## Contributing

Issues and PRs are very welcome. To get the project set up run:

```
git clone git@github.com:planarnetwork/connection-scan-algorithm
npm install
npm test
```

`npm test` lints with [biome](https://biomejs.dev/), typechecks, and runs the unit tests with
[vitest](https://vitest.dev/). `npm run watch-test` reruns them as you edit.

`npm run int -- gtfs.zip TBW NRW 09:00` plans a journey over a real feed, and `npm run perf -- gtfs.zip`
times a set of queries over the GB rail network.

Any change that should reach a user needs a changeset, see [.changeset/README.md](.changeset/README.md).

If you would like to send a pull request please write your contribution in TypeScript and if possible, add a test.

## License

This software is licensed under [GNU GPLv3](https://www.gnu.org/licenses/gpl-3.0.en.html).
