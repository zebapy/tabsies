// Runs the real app (index.html, its text reader and parse.js) in headless Chromium, to read receipt images with it.
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".png": "image/png", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml" };

function serve(root) {
  const server = createServer((req, res) => {
    const path = new URL(req.url, "http://x").pathname;
    const file = join(root, path === "/" || path === "/check" ? "index.html" : path);
    if (!file.startsWith(root) || !existsSync(file)) { res.writeHead(404).end(); return; }
    res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream" }).end(readFileSync(file));
  });
  return new Promise(resolve => server.listen(0, () => resolve(server)));
}

// The app loads the text reader from a CDN; answer those requests from node_modules so runs are offline and repeatable.
function localCdn(url) {
  const modules = join(DEFAULT_ROOT, "node_modules");
  const name = url.split("/").pop();
  if (url.includes("/tesseract.js@")) return join(modules, "tesseract.js", "dist", name);
  if (url.includes("/tesseract.js-core@")) return join(modules, "tesseract.js-core", name);
  if (url.includes("eng.traineddata")) return join(modules, "@tesseract.js-data", "eng", "4.0.0_best_int", "eng.traineddata.gz");
  return null;
}

// root is the folder whose index.html and parse.js are tested, so another checkout can be compared.
export async function openApp(root = DEFAULT_ROOT) {
  const server = await serve(root);
  const browser = await chromium.launch();
  const context = await browser.newContext({ serviceWorkers: "block" });
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => {
    const file = localCdn(route.request().url());
    if (!file) return route.abort();
    return route.fulfill({ body: readFileSync(file), contentType: file.endsWith(".wasm") ? "application/wasm" : "application/javascript" });
  });

  // Each reader is one tab; give each parallel job its own.
  async function reader() {
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    // Keep the raw text the reader produced, so misses can be traced to reading or to parsing.
    await page.evaluate(() => {
      const parse = window.parseReceipt;
      window.parseReceipt = text => { window.lastText = text; return parse(text); };
    });
    return file => page.evaluate(async ({ bytes, type }) => {
      const blob = new Blob([Uint8Array.from(atob(bytes), c => c.charCodeAt(0))], { type });
      await readImage(blob);
      return { items: draft.items, extras: draft.extras, total: draft.receiptTotal, text: window.lastText };
    }, { bytes: readFileSync(file).toString("base64"), type: /\.jpe?g$/i.test(file) ? "image/jpeg" : "image/png" });
  }

  async function close() {
    await browser.close();
    server.close();
  }
  return { reader, close };
}
