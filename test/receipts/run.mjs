// Feeds every generated receipt image through the real app (index.html in a headless browser,
// same text reader and parse.js) and scores what comes back.
// Usage: node test/receipts/run.mjs [--jobs 3] [--only clean,blur-heavy] [--per-style 2] [--name try1]
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { score } from "./score.mjs";
import { applies } from "./conditions.mjs";
import { openApp } from "./app.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "out");
const { parseReceipt } = createRequire(import.meta.url)("../../parse.js");

const argv = process.argv;
const opt = name => { const k = argv.indexOf(`--${name}`); return k > 0 ? argv[k + 1] : null; };
const JOBS = Number(opt("jobs") || 3);
const ONLY = opt("only") ? opt("only").split(",") : null;
const PER_STYLE = opt("per-style") ? Number(opt("per-style")) : Infinity;
const NAME = opt("name") ? `-${opt("name")}` : "";

async function main() {
  const manifest = JSON.parse(readFileSync(join(OUT, "manifest.json"), "utf8")).filter(m => (!ONLY || ONLY.includes(m.condition)) && Number(m.id.slice(-2)) < PER_STYLE && applies(m.condition, m.style));
  const truths = {};
  for (const m of manifest) truths[m.id] ||= JSON.parse(readFileSync(join(OUT, "truth", `${m.id}.json`), "utf8"));

  const app = await openApp();

  const results = [];
  let next = 0;
  const started = Date.now();
  async function worker() {
    const read = await app.reader();
    while (next < manifest.length) {
      const m = manifest[next++];
      const t0 = Date.now();
      const got = await read(join(OUT, m.file));
      const s = score(truths[m.id], got);
      results.push({ ...m, ms: Date.now() - t0, score: s, read: got });
      console.log(`${String(results.length).padStart(4)}/${manifest.length} ${m.condition.padEnd(12)} ${m.id.padEnd(26)} items ${s.itemsPriced}/${s.items} fees ${s.feesRight}/${s.fees}${s.addsUp ? " adds up" : ""}`);
    }
  }
  await Promise.all(Array.from({ length: JOBS }, worker));
  await app.close();

  // What parse.js does with a perfect reading, to separate parser misses from reader misses.
  const oracle = Object.values(truths).map(t => ({ id: t.id, style: t.style, condition: "perfect-text", score: score(t, parseReceipt(t.text)) }));
  writeFileSync(join(OUT, `results${NAME}.json`), JSON.stringify({ results, oracle }, null, 2));
  writeFileSync(join(OUT, `REPORT${NAME}.md`), report(results, oracle));
  console.log(`done in ${Math.round((Date.now() - started) / 1000)}s, see ${join(OUT, `REPORT${NAME}.md`)}`);
}

const pct = (n, d) => (d ? `${Math.round((n * 100) / d)}%` : "–");
function summary(rows) {
  const sum = key => rows.reduce((s, r) => s + Number(r.score[key]), 0);
  return {
    receipts: rows.length,
    itemsFound: pct(sum("itemsFound"), sum("items")),
    itemsPriced: pct(sum("itemsPriced"), sum("items")),
    namesClean: pct(sum("namesClean"), sum("items")),
    feesRight: pct(sum("feesRight"), sum("fees")),
    junk: (sum("extraItems") / rows.length).toFixed(1),
    totalRead: pct(sum("totalRead"), rows.length),
    addsUp: pct(sum("addsUp"), rows.length),
    perfect: pct(sum("perfect"), rows.length),
  };
}

function report(results, oracle) {
  const conditions = ["perfect-text", ...new Set(results.map(r => r.condition))];
  const styles = [...new Set(oracle.map(r => r.style))];
  const rowsFor = c => (c === "perfect-text" ? oracle : results.filter(r => r.condition === c));
  const head = "| Condition | Receipts | Items found | Item prices right | Names clean | Fees right | Junk items / receipt | Total read | Adds up to total | Perfect |\n|---|---|---|---|---|---|---|---|---|---|";
  const body = conditions.map(c => {
    const s = summary(rowsFor(c));
    return `| ${c} | ${s.receipts} | ${s.itemsFound} | ${s.itemsPriced} | ${s.namesClean} | ${s.feesRight} | ${s.junk} | ${s.totalRead} | ${s.addsUp} | ${s.perfect} |`;
  }).join("\n");
  const matrix = [
    `| Condition | ${styles.join(" | ")} |`,
    `|---|${styles.map(() => "---").join("|")}|`,
    ...conditions.map(c => `| ${c} | ${styles.map(st => summary(rowsFor(c).filter(r => r.style === st)).itemsPriced).join(" | ")} |`),
  ].join("\n");
  const perfectMatrix = [
    `| Condition | ${styles.join(" | ")} |`,
    `|---|${styles.map(() => "---").join("|")}|`,
    ...conditions.map(c => `| ${c} | ${styles.map(st => summary(rowsFor(c).filter(r => r.style === st)).perfect).join(" | ")} |`),
  ].join("\n");
  const secs = results.length ? (results.reduce((s, r) => s + r.ms, 0) / results.length / 1000).toFixed(1) : "–";
  return `# Receipt reading accuracy\n\nGenerated ${new Date().toISOString()}. ${results.length} scans, ${secs}s each on average.\n` +
    `"perfect-text" runs parse.js on the exact receipt text, so it shows parser limits with no reading errors.\n\n` +
    `- **Items found**: item lines matched by name. **Item prices right**: matched with the exact line price.\n` +
    `- **Fees right**: tax, fees, tip and discounts read with the exact amount.\n` +
    `- **Adds up to total**: every item and fee the app kept sums to the receipt total, so a split would be right.\n` +
    `- **Perfect**: every item and fee right with nothing extra, so nothing to fix by hand.\n\n` +
    `## By condition\n\n${head}\n${body}\n\n## Item prices right, by receipt style\n\n${matrix}\n\n## Perfect receipts, by receipt style\n\n${perfectMatrix}\n`;
}

main();
