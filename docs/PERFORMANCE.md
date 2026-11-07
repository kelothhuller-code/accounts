# Local performance

Measured on this workspace with Node v22.23.4, Linux x64, isolated temp JSON files, and MongoDB disabled. No production store and no network call. Figures are from `tests/results/benchmark.json` produced by `tests/performance.test.js` at 2026-11-07T06:35:10.386Z.

| Records | Save (full rewrite) | Search page of 25 | Dashboard scan | One-party ledger | File | RSS |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 10,000 | 27.48 ms | 2.95 ms | 4.55 ms | 5.73 ms | 3.71 MB | 102 MB |
| 100,000 | 176.11 ms | 26.10 ms | 8.01 ms | 14.86 ms | 37.26 MB | 171 MB |
| 500,000 | 1,141.83 ms | 82.10 ms | 23.98 ms | 74.75 ms | 187.14 MB | 336 MB |

Save heap growth was about 6 MB, 39 MB, and 202 MB at those sizes because the whole document is still serialized. `flushLocalNow` reported `waitedForNetwork: false` on every run. Five hundred domain arrival inserts took 2.58 ms in memory; flushing the 500,000-row store afterwards took 937.91 ms.

The first save of a calendar day also writes one backup copy. Later saves the same day do not.

## What changed

Arrival and dispatch screens request one page plus a summary instead of shipping every row to the table. Search still scans the in-memory array; at 100,000 rows a paged search returned 25 of 5,883 matches in 26.10 ms. Disk format is still one JSON file, so a save rewrites the whole file and does not wait on MongoDB.

## Limit

Up to about 100,000 rows, a local save stays under 200 ms on this machine. Around 500,000 rows the rewrite is about 1.1 seconds and the process holds a few hundred megabytes. That is the measured budget. A journal-plus-compact migration is sketched by `scripts/storage-migration-dry-run.js`. It only copies a temp file and prints a plan. It refuses `data/commodity_store.json`. It was not applied to any live store.

These timings are not a claim about the Accounts machine or about a store that also contains the real history.
