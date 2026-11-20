import { gzipSync } from "node:zlib";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fake = vi.hoisted(() => ({
  status: {} as Record<string, unknown>,
}));

// Exercise the public engine entry points with real zlib, replacing remote
// services and unrelated content processors at their boundaries.
vi.mock("../scrape", () => ({
  fireEngineURL: "http://fire-engine.test",
  fireEngineStagingURL: "http://fire-engine-staging.test",
  fireEngineScrape: vi.fn(async () => fake.status),
  requestOverrides: () => ({}),
}));
vi.mock("../checkStatus", () => ({
  fireEngineCheckStatus: vi.fn(),
  StillProcessingError: class extends Error {},
}));
vi.mock("../delete", () => ({ fireEngineDelete: vi.fn(async () => {}) }));
vi.mock("../../utils/specialtyHandler", () => ({
  specialtyScrapeCheck: vi.fn(async () => {}),
}));
vi.mock("../../../lib/fetch", () => ({
  redactRequestBodyForLog: (body: unknown) => body,
}));
vi.mock("@mendable/firecrawl-rs", () => ({
  getInnerJson: vi.fn(async (content: string) => content),
}));
vi.mock("../../../postprocessors/youtube", () => ({
  youtubePostprocessor: { shouldRun: () => false },
}));
vi.mock("../../../../../lib/branding/jev", () => ({
  wantsBrandingScreenshot: () => undefined,
}));
vi.mock("../../../../../lib/otel-tracer", () => ({
  withSpan: (_name: string, fn: (span: unknown) => unknown) => fn({}),
  setSpanAttributes: () => {},
}));
vi.mock("../../../../../services/ab-test", () => ({
  abTestFireEngine: () => ({ mode: "off" }),
}));
vi.mock("../../../../../services/ab-test-comparison", () => ({
  scheduleABComparison: vi.fn(),
}));

import { UnsupportedFileError } from "../../../error";
import { MAX_GUNZIPPED_FILE_SIZE } from "../../utils/gunzip";
import {
  scrapeURLWithFireEngineChromeCDP,
  scrapeURLWithFireEngineTLSClient,
} from "../index";

const logger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  child() {
    return this;
  },
} as any;

function meta(formats = [{ type: "markdown" }]) {
  return {
    id: "inline-gzip-scrape",
    url: "https://example.com/document",
    options: { formats, skipTlsVerification: false },
    internalOptions: { teamId: "team-a", zeroDataRetention: true },
    logger,
    abort: {
      scrapeTimeout: () => 30000,
      asSignal: () => undefined,
      throwIfAborted: () => {},
    },
    featureFlags: new Set(),
    mock: null,
  } as any;
}

function serve(bytes: Buffer) {
  fake.status.file = { content: bytes.toString("base64") };
}

beforeEach(() => {
  fake.status = {
    url: "https://example.com/document",
    content: "",
    pageStatusCode: 200,
    responseHeaders: { "content-type": "text/markdown" },
  };
});

import { writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { scrapeURLWithFireEngineTLSClient as scrapeBaseline } from "../indexBaseline";

it("records public engine scheduling measurements", async () => {
  const records = [];
  for (const size of [8, 32]) {
    const original = "a".repeat(size * 1024 * 1024);
    const encoded = gzipSync(original).toString("base64");
    for (let run = 0; run < 7; run++) {
    const order = run % 2 === 0 ? ["base", "patch"] : ["patch", "base"];
    for (const variant of order) {
      fake.status = {
        url: "https://example.com/document", content: "", pageStatusCode: 200,
        responseHeaders: { "content-type": "text/markdown" },
        file: { content: encoded },
      };
      let settled = false;
      const start = performance.now();
      const immediate = new Promise<{ delayMs: number; settled: boolean }>(resolve => {
        setImmediate(() => resolve({ delayMs: performance.now() - start, settled }));
      });
      const result = await (variant === "base" ? scrapeBaseline : scrapeURLWithFireEngineTLSClient)(meta());
      const elapsedMs = performance.now() - start;
      settled = true;
      const observation = await immediate;
      expect(result.html).toBe(original);
      if (run >= 2) records.push({ variant, sizeMiB: size, run: run - 2, elapsedMs, ...observation });
    }
  }
  }
  writeFileSync(process.env.GUNZIP_MEASURE_OUTPUT!, JSON.stringify(records, null, 2));
});
