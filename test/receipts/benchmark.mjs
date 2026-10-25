// The scan benchmark: a fixed set of fake receipts under every condition, plus the real photos in real/,
// read by the real app and compared with benchmark.json. Exits with an error when accuracy drops.
// Usage: node test/receipts/benchmark.mjs [--reuse] [--update] [--jobs 3]
//   --reuse   skip drawing the images again when out-bench/ already has them
//   --update  save these results as the new baseline (do this when a change makes scanning better)
import { readFileSync, writeFileSync, existsSync, readdirSync, appendFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { generate } from "./generate.mjs";
import { openApp } from "./app.mjs";
import { score, summarize } from "./score.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "out-bench");
const BASELINE = join(HERE, "benchmark.json");
const REAL = join(HERE, "real");
const argv = process.argv;
const JOBS = Number(argv[argv.indexOf("--jobs") + 1]) || 3;

// How far a number may drop before the run fails, in percentage points. Per condition there are only
// 12 receipts, so one receipt flipping moves "adds up" by about 8 points; the totals over all scans are steadier.
const ALLOWED_DROP = {
  condition: { prices: 5, fees: 8, addsUp: 17, perfect: 17 },
  all: { prices: 2, fees: 3, addsUp: 5, perfect: 5 },
};

if (!argv.includes("--reuse") || !existsSync(join(OUT, "manifest.json"))) await generate({ out: OUT, perStyle: 2, jobs: JOBS });
const manifest = JSON.parse(readFileSync(join(OUT, "manifest.json"), "utf8"));
const realPhotos = readdirSync(REAL).filter(f => /\.(jpe?g|png)$/i.test(f) && existsSync(join(REAL, f.replace(/\.\w+$/, ".json"))));
const jobsList = [
  ...manifest.map(m => ({ key: m.condition, file: join(OUT, m.file), truth: join(OUT, "truth", `${m.id}.json`) })),
  ...realPhotos.map(f => ({ key: `real/${f}`, file: join(REAL, f), truth: join(REAL, f.replace(/\.\w+$/, ".json")) })),
];

const app = await openApp();
const scored = [];
let next = 0;
const started = Date.now();
await Promise.all(Array.from({ length: JOBS }, async () => {
  const read = await app.reader();
  while (next < jobsList.length) {
    const job = jobsList[next++];
    const got = await read(job.file);
    scored.push({ ...job, score: score(JSON.parse(readFileSync(job.truth, "utf8")), got), text: got.text });
    if (scored.length % 20 === 0) console.log(`read ${scored.length}/${jobsList.length}`);
  }
}));
await app.close();

const keys = [...new Set(jobsList.map(j => j.key))];
const results = {};
for (const key of keys) results[key] = summarize(scored.filter(s => s.key === key).map(s => s.score));
results.all = summarize(scored.filter(s => !s.key.startsWith("real/")).map(s => s.score));
writeFileSync(join(OUT, "results.json"), JSON.stringify({ results, scans: scored }, null, 2));

const baseline = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, "utf8")).results : {};
const failures = [];
const cell = (key, metric) => {
  const now = results[key][metric];
  const was = baseline[key]?.[metric];
  if (now === null) return "–";
  if (was === undefined || was === null) return `${now}% (new)`;
  const diff = Math.round((now - was) * 10) / 10;
  // Real photos have to stay exactly as good; generated sets get some slack for noise.
  const allowed = key.startsWith("real/") ? 0 : ALLOWED_DROP[key === "all" ? "all" : "condition"][metric];
  if (-diff > allowed) failures.push(`${key} ${metric}: ${was}% → ${now}%`);
  return diff === 0 ? `${now}%` : `${now}% (${diff > 0 ? "+" : ""}${diff})`;
};
const rows = [...keys, "all"].map(k => `| ${k} | ${results[k].scans} | ${cell(k, "prices")} | ${cell(k, "fees")} | ${cell(k, "addsUp")} | ${cell(k, "perfect")} |`);
const table = [
  `## Scan benchmark`,
  ``,
  `${scored.length} scans in ${Math.round((Date.now() - started) / 1000)}s. Changes are against \`test/receipts/benchmark.json\`.`,
  ``,
  `| Set | Scans | Item prices right | Fees right | Adds up to total | Perfect |`,
  `|---|---|---|---|---|---|`,
  ...rows,
  ``,
  failures.length ? `**Worse than the baseline:**\n${failures.map(f => `- ${f}`).join("\n")}` : `No drops beyond the allowed noise.`,
].join("\n");
console.log(`\n${table}`);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${table}\n`);

if (argv.includes("--update")) {
  writeFileSync(BASELINE, JSON.stringify({ updated: new Date().toISOString().slice(0, 10), results }, null, 2) + "\n");
  console.log(`\nSaved as the new baseline in ${BASELINE}`);
} else if (failures.length) {
  console.log(`\nScanning got worse. If that's expected, rerun with --update to accept the new numbers.`);
  process.exit(1);
}
