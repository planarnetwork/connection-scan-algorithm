
Connection Scan Algorithm
=========================
[![Travis](https://img.shields.io/travis/planarnetwork/connection-scan-algorithm.svg?style=flat-square)](https://travis-ci.org/planarnetwork/connection-scan-algorithm) ![npm](https://img.shields.io/npm/v/connection-scan-algorithm.svg?style=flat-square) ![David](https://img.shields.io/david/planarnetwork/connection-scan-algorithm.svg?style=flat-square)

Implementation of the [Connection Scan Algorithm](https://arxiv.org/pdf/1703.05997) in TypeScript.

Additional features not in the paper implementation:
 - Various [fixes](https://ljn.io/posts/CSA-workarounds) in order to improve the quality of results.
 - Calendars are checked to ensure services are running on the specified day
 - The origin and destination may be a set of stops
 - Interchange time at each station is applied
 - Pickup / set down marker of stop times are obeyed
 - Multi-criteria journey filtering
 - Transfers (footpaths) can be used
 
## Usage

It will work with any well formed GTFS data set.
 
Node +11 is required for all examples.

```
npm install --save connection-scan-algorithm
``` 

### Depart After Query

Find the first results that depart after a specific time

```javascript
const {GtfsLoader, JourneyFactory, ConnectionScanAlgorithm, ScanResultsFactory, TimeParser, MultipleCriteriaFilter, DepartAfterQuery} = require("connection-scan-algorithm");

const gtfsLoader = new GtfsLoader(new TimeParser());
const gtfs = await gtfsLoader.load(fs.createReadStream("gtfs.zip"));
const csa = new ConnectionScanAlgorithm(gtfs.connections, gtfs.transfers, new ScanResultsFactory(gtfs.interchange));
const query = new DepartAfterQuery(csa, new JourneyFactory(), [new MultipleCriteriaFilter()]);
const results = query.plan(["TBW"], ["NRW"], new Date(), 9 * 3600);
```

## TODO

- Short circuit connection scan once all destinations found
- Fake trip ID for transfers to (removes branch)
- Only scan transfers for stops once (avoid re-scan when time is improved)

## Contributing

Issues and PRs are very welcome. To get the project set up run:

```
git clone git@github.com:planarnetwork/connection-scan-algorithm
npm install --dev
npm test
```

If you would like to send a pull request please write your contribution in TypeScript and if possible, add a test.

## License

This software is licensed under [GNU GPLv3](https://www.gnu.org/licenses/gpl-3.0.en.html).

