# Local performance

Measured on this workspace with Node v22.23.4, Linux x64, isolated temp JSON files, and MongoDB disabled. No production store and no network call. Figures are from `tests/results/benchmark.json` produced by `tests/performance.test.js` at 2026-11-07T06:44:56.943Z.

| Records | Full-file save | Search page of 25 | Dashboard scan | One-party ledger | File | RSS after save |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 10,000 | 26.78 ms | 3.06 ms | 4.51 ms | 5.69 ms | 3.71 MB | 102 MB |
| 100,000 | 165.88 ms | 21.43 ms | 7.28 ms | 13.83 ms | 37.26 MB | 170 MB |
| 500,000 | 1,061.18 ms | 79.63 ms | 20.99 ms | 71.91 ms | 187.14 MB | 340 MB |

Save heap growth was 6.10 MB, 38.57 MB, and 202.40 MB because the whole document is still serialized. `waitedForNetwork` was false on every flush.

After the 500,000-row store already existed, further domain inserts and one full rewrite:

| Batch | Insert time | Following full-file flush | 2026 full-year dashboard | Peak RSS |
| --- | ---: | ---: | ---: | ---: |
| 100 arrivals | 0.96 ms | 772.84 ms | 54.94 ms | 516 MB |
| 1,000 arrivals | 4.00 ms | 769.11 ms | 84.41 ms | 357 MB |

Five hundred single-style inserts took 2.54 ms in memory; flushing that 500,000-row file took 913.24 ms. The flush time is the JSON rewrite, not the insert loop. It does not get cheaper per row once the file is large.

The first save of a calendar day also writes one backup copy. Later saves the same day do not.

## What changed

Arrival and dispatch screens request one page plus a summary instead of shipping every row to the table. Search still scans the in-memory array; at 100,000 rows a paged search returned 25 of 5,883 matches in 21.43 ms. Disk format is still one JSON file, so a save rewrites the whole file and does not wait on MongoDB. A page of 25 does not shrink the summary: tests check page totals against the full filtered set.

## Limit

Up to about 100,000 rows, a local save stays under 200 ms on this machine. Around 500,000 rows the rewrite is about 1.1 seconds and the process holds a few hundred megabytes. That is the measured budget. A journal-plus-compact migration is sketched by `scripts/storage-migration-dry-run.js`. It only copies a temp file and prints a plan. It refuses `data/commodity_store.json`. It was not applied to any live store.

These timings are not a claim about the Accounts machine or about a store that also contains the real history.
