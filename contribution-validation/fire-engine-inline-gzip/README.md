# Fire Engine inline gzip scheduling measurement

Tested Node.js 24.22.3 on Linux x64. `measure.test.ts` uses the real public TLS client entry point and real zlib; remote Fire Engine, specialty processors, native JSON and telemetry boundaries are stubbed exactly as the regression fixture. It does not measure live-network or native content conversion.

Run from the implementation branch with API dependencies installed. Copy `measure.test.ts` to `apps/api/src/scraper/scrapeURL/engines/fire-engine/__tests__/inlineGzipMeasure.test.ts`. Create the adjacent baseline module:

```sh
git show 484be117975ac7b8be085c25f1fbd54d005f17ff:apps/api/src/scraper/scrapeURL/engines/fire-engine/index.ts > apps/api/src/scraper/scrapeURL/engines/fire-engine/indexBaseline.ts
```

From `apps/api`, run:

```sh
GUNZIP_MEASURE_OUTPUT=/absolute/path/to/results.json pnpm exec vitest run src/scraper/scrapeURL/engines/fire-engine/__tests__/inlineGzipMeasure.test.ts --config vitest.config.ts
```

For each 8 MiB and 32 MiB text payload, the script precompresses outside the timed region, warms both variants twice, then runs five measured calls each in alternating order. Each call compares complete decoded content. A pending `setImmediate` reports whether unrelated event-loop work ran before the scrape settled, plus its delay. The JSON contains every observation. Times are local observations, not pass/fail thresholds.

The patch yields before every measured immediate while base settles first. Median scheduling delay (base / patch) is 27.186 / 0.357 ms at 8 MiB and 75.819 / 1.094 ms at 32 MiB. Total call time increased in this fixture (27.144 / 45.938 ms and 72.457 / 146.355 ms respectively). The change improves event-loop responsiveness, not decompression throughput. Base64 conversion, UTF-8 decoding, async worker-pool contention and cancellation behavior are not optimized by this patch.
