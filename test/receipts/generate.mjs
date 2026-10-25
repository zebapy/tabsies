// Draws the fake receipts, then makes a worse copy of each one for every condition below.
// Usage: node test/receipts/generate.mjs [--per-style 6] [--seed 1]
import { chromium } from "playwright";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { STYLES, makeReceipt, receiptHtml, receiptText } from "./receipts.mjs";
import { CONDITIONS, applies } from "./conditions.mjs";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "out");
const arg = (name, fallback) => {
  const k = process.argv.indexOf(`--${name}`);
  return k > 0 ? Number(process.argv[k + 1]) : fallback;
};
const PER_STYLE = arg("per-style", 6);
const SEED = arg("seed", 1);

function stageHtml(src, w, h, c, seed) {
  const s = w / 800;
  const rad = (Math.abs(c.rotate || 0) + Math.abs(c.tiltY || 0) / 3) * Math.PI / 180;
  const pad = c.bg ? Math.round(w * 0.1) : 0;
  const sw = Math.round(w * Math.cos(rad) + h * Math.sin(rad)) + pad * 2;
  const sh = Math.round(w * Math.sin(rad) + h * Math.cos(rad)) + pad * 2;
  const transform = [
    c.tiltX || c.tiltY ? `perspective(${Math.round(Math.max(w, h) * 1.6)}px)` : "",
    c.tiltX ? `rotateX(${c.tiltX}deg)` : "",
    c.tiltY ? `rotateY(${c.tiltY}deg)` : "",
    c.rotate ? `rotate(${c.rotate}deg)` : "",
  ].join(" ");
  const filter = [c.fade ? "url(#fade)" : "", c.smudge ? "url(#smudge)" : "", c.motion ? "url(#motion)" : "", c.crumple ? "url(#crumple)" : "", c.blur ? `blur(${(c.blur * s).toFixed(2)}px)` : ""].join(" ").trim() || "none";
  const shadowAngle = 30 + (seed % 5) * 25;
  return `<!doctype html><body style="margin:0">
    <svg width="0" height="0" style="position:absolute"><filter id="crumple" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="turbulence" baseFrequency="${(0.006 / s).toFixed(4)}" numOctaves="3" seed="${seed}" result="n"/>
      <feDisplacementMap in="SourceGraphic" in2="n" scale="${Math.round(14 * s)}" xChannelSelector="R" yChannelSelector="G" result="d"/>
      <feDiffuseLighting in="n" surfaceScale="${(4 * s).toFixed(1)}" lighting-color="#fff" result="light"><feDistantLight azimuth="235" elevation="50"/></feDiffuseLighting>
      <feComposite in="light" in2="d" operator="arithmetic" k1="0.6" k2="0" k3="0.55" k4="0" result="lit"/>
      <feComposite in="lit" in2="d" operator="in"/>
    </filter>
    <filter id="fade" x="0" y="0" width="100%" height="100%">
      <feComponentTransfer in="SourceGraphic" result="faded"><feFuncR type="linear" slope="0.45" intercept="0.55"/><feFuncG type="linear" slope="0.45" intercept="0.55"/><feFuncB type="linear" slope="0.42" intercept="0.56"/></feComponentTransfer>
      <feComponentTransfer in="SourceGraphic" result="gone"><feFuncR type="linear" slope="0.25" intercept="0.75"/><feFuncG type="linear" slope="0.25" intercept="0.75"/><feFuncB type="linear" slope="0.25" intercept="0.75"/></feComponentTransfer>
      <feTurbulence type="fractalNoise" baseFrequency="${(0.003 / s).toFixed(4)}" numOctaves="2" seed="${seed + 7}" result="t"/>
      <feColorMatrix in="t" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  7 0 0 0 -3.6" result="mask"/>
      <feComposite in="gone" in2="mask" operator="in" result="patches"/>
      <feMerge><feMergeNode in="faded"/><feMergeNode in="patches"/></feMerge>
    </filter>
    <filter id="smudge" x="0" y="0" width="100%" height="100%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="${(7 * s).toFixed(1)} ${(1.5 * s).toFixed(1)}" result="smear"/>
      <feColorMatrix in="smear" type="matrix" values="0.85 0 0 0 0  0 0.85 0 0 0  0 0 0.87 0 0  0 0 0 1 0" result="dirty"/>
      <feTurbulence type="fractalNoise" baseFrequency="${(0.004 / s).toFixed(4)}" numOctaves="2" seed="${seed + 3}" result="t"/>
      <feColorMatrix in="t" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  6 0 0 0 -3.3" result="mask"/>
      <feComposite in="dirty" in2="mask" operator="in" result="patches"/>
      <feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="patches"/></feMerge>
    </filter>
    <filter id="motion" x="0" y="0" width="100%" height="100%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="${((c.motion || 0) * s).toFixed(1)} ${(0.3 * s).toFixed(1)}"/>
    </filter></svg>
    <div id="stage" style="position:relative;overflow:hidden;width:${sw}px;height:${sh}px;background:${c.bg ? "radial-gradient(circle at 30% 20%, #8a7560, #4d3f31)" : "#fff"}">
      <img src="${src}" style="position:absolute;left:${(sw - w) / 2}px;top:${(sh - h) / 2}px;width:${w}px;height:${h}px;transform:${transform || "none"};filter:${filter};box-shadow:${c.bg ? "0 6px 18px rgba(0,0,0,.45)" : "none"}">
      ${c.shadow ? `<div style="position:absolute;inset:0;mix-blend-mode:multiply;background:linear-gradient(${shadowAngle}deg, rgba(255,255,255,1) 0%, rgba(255,255,255,1) 48%, rgba(70,70,80,1) 62%, rgba(90,90,100,1) 100%)"></div>` : ""}
    </div>`;
}

// Runs in the browser: shrink, add sensor noise, and save as JPEG, all on a canvas.
async function finish({ png, downscale, noise, jpeg, seed }) {
  const img = new Image();
  img.src = "data:image/png;base64," + png;
  await img.decode();
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * (downscale || 1));
  canvas.height = Math.round(img.height * (downscale || 1));
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  if (noise) {
    let a = seed >>> 0;
    const rand = () => { a = (a * 1664525 + 1013904223) >>> 0; return (a + 1) / 4294967297; };
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    for (let k = 0; k < data.data.length; k += 4) {
      const g = Math.sqrt(-2 * Math.log(rand())) * Math.cos(2 * Math.PI * rand()) * noise;
      for (let ch = 0; ch < 3; ch++) data.data[k + ch] += g + (rand() - 0.5) * noise * 0.4;
    }
    ctx.putImageData(data, 0, 0);
  }
  return canvas.toDataURL(jpeg ? "image/jpeg" : "image/png", jpeg || undefined).split(",")[1];
}

async function main() {
  rmSync(OUT, { recursive: true, force: true });
  for (const dir of ["truth", ...Object.keys(CONDITIONS)]) mkdirSync(join(OUT, dir), { recursive: true });
  const browser = await chromium.launch();
  const manifest = [];
  const receipts = STYLES.flatMap((style, k) => Array.from({ length: PER_STYLE }, (_, n) => makeReceipt(SEED * 1000 + k * 100 + n, style)));

  for (const rc of receipts) {
    const paper = rc.style.startsWith("paper");
    const page = await browser.newPage({ viewport: { width: paper ? 400 : 390, height: 800 }, deviceScaleFactor: paper ? 2 : 3 });
    await page.setContent(receiptHtml(rc));
    const clean = await page.locator("#receipt").screenshot();
    await page.close();
    writeFileSync(join(OUT, "truth", `${rc.id}.json`), JSON.stringify({ ...rc, text: receiptText(rc) }, null, 2));

    const size = await (async () => {
      const p = await browser.newPage();
      const out = await p.evaluate(async b64 => { const i = new Image(); i.src = "data:image/png;base64," + b64; await i.decode(); return [i.width, i.height]; }, clean.toString("base64"));
      await p.close();
      return out;
    })();

    for (const [name, c] of Object.entries(CONDITIONS)) {
      if (!applies(name, rc.style)) continue;
      const page = await browser.newPage({ viewport: { width: 400, height: 400 } });
      await page.setContent(stageHtml("data:image/png;base64," + clean.toString("base64"), size[0], size[1], c, rc.seed));
      await page.waitForFunction(() => document.querySelector("#stage img").complete);
      const staged = await page.locator("#stage").screenshot();
      const b64 = await page.evaluate(finish, { png: staged.toString("base64"), downscale: c.downscale, noise: c.noise, jpeg: c.jpeg, seed: rc.seed });
      await page.close();
      const file = join(name, `${rc.id}.${c.jpeg ? "jpg" : "png"}`);
      writeFileSync(join(OUT, file), Buffer.from(b64, "base64"));
      manifest.push({ id: rc.id, style: rc.style, condition: name, file });
    }
    console.log(`drew ${rc.id}`);
  }
  writeFileSync(join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2));
  await browser.close();
  console.log(`${receipts.length} receipts x ${Object.keys(CONDITIONS).length} conditions = ${manifest.length} images in ${OUT}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
