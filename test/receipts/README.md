# Receipt reading tests

Makes fake receipts with known contents, roughs them up, runs them through the real app and scores the result.
Nothing here is deployed: the Vercel build only copies the files listed in `vercel.json`.

```sh
npm install
npm run receipts:generate -- --per-style 8   # draws receipts into test/receipts/out
npm run receipts:run -- --jobs 3             # reads them with index.html + parse.js, writes out/REPORT.md
```

- `receipts.mjs` makes each receipt (items, fees, total) from a seed and draws it as a delivery app screenshot,
  an email or a paper slip. The same seed always gives the same receipt.
- `generate.mjs` saves a clean image plus one per condition: low resolution, blur, noise, JPEG, rotation,
  perspective, shadow, crumpled paper, faded ink, smudges, motion blur and a mix that looks like a phone photo.
- `conditions.mjs` lists those conditions.
- `run.mjs` serves the repo, opens `index.html` in headless Chromium and calls the app's own `readImage`,
  so images go through the same enlarging, text reader and `parse.js` a real upload does.
  The text reader is served from `node_modules` instead of the CDN.
- `scan.mjs` reads real photos (`real/*.jpg`) and prints what the app found, scored against `real/*.json`.
  `--root other/checkout` compares another version of the app.
- `score.mjs` matches the items and fees the app found against the real ones.

`--only clean,blur-heavy` and `--per-style 2` on `receipts:run` run a smaller set, and `--name try1` saves
the results next to earlier runs instead of replacing them. `out/results.json` keeps the raw text
the reader saw for every image, which is the place to look when a receipt comes back wrong.
