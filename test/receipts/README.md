# Receipt reading tests

Makes fake receipts with known contents, roughs them up, runs them through the real app and scores the result.
Nothing here is deployed: the Vercel build only copies the files listed in `vercel.json`.

## Automatic checks

`npm test` runs the fast parser tests in `test/parse.test.mjs` (under a second, no browser).

`npm run benchmark` draws 12 fake receipts under every condition, reads them and the photos in `real/` with the
real app (about 4 minutes), and compares with `benchmark.json`. It fails when accuracy drops by more than a
little noise, or when any real photo gets worse at all. When a change makes scanning better, run
`npm run benchmark -- --reuse --update` and commit the new `benchmark.json` so later changes are held to it.

Both run on GitHub for every push or pull request that touches `parse.js`, `index.html` or `test/`
(`.github/workflows/scan-tests.yml`); the benchmark table shows on the run's summary page.

To add a real receipt: put the photo in `real/` with a `.json` of what's on it (same shape as
`market-deli.json`), and the text the reader saw (from `npm run receipts:scan`) as a `.txt` for the parser test.

## Exploring

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
