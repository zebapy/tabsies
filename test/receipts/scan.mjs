// Reads real receipt photos with the app and shows what it found, scored against a .json of the same name if there is one.
// Usage: node test/receipts/scan.mjs [--root other/checkout] test/receipts/real/*.jpg
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { openApp } from "./app.mjs";
import { score } from "./score.mjs";

const args = process.argv.slice(2);
const k = args.indexOf("--root");
const root = k >= 0 ? resolve(args.splice(k, 2)[1]) : undefined;
const money = c => (c < 0 ? "-" : "") + "$" + (Math.abs(c) / 100).toFixed(2);

const app = await openApp(root);
const read = await app.reader();
for (const file of args) {
  const got = await read(file);
  const sum = [...got.items, ...got.extras].reduce((s, x) => s + x.cents, 0);
  console.log(`\n=== ${file}\n--- text the reader saw\n${got.text.trim()}\n--- what the app found`);
  got.items.forEach(i => console.log(`  item  ${i.name.padEnd(30)} ${money(i.cents)}`));
  got.extras.forEach(x => console.log(`  fee   ${x.name.padEnd(30)} ${money(x.cents)}`));
  console.log(`  adds up to ${money(sum)}, receipt total ${got.total === null ? "not found" : money(got.total)}`);
  const truthFile = file.replace(/\.\w+$/, ".json");
  if (existsSync(truthFile)) {
    const s = score(JSON.parse(readFileSync(truthFile, "utf8")), got);
    console.log(`--- score: items ${s.itemsPriced}/${s.items} priced right, fees ${s.feesRight}/${s.fees}, ${s.addsUp ? "adds up" : "does NOT add up"} to the real total`);
    for (const key of ["missing", "wrongPrice", "junkItems", "missingFees", "junkFees"]) if (s[key].length) console.log(`  ${key}: ${s[key].join("; ")}`);
  }
}
await app.close();
