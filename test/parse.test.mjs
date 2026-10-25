// Fast checks for parse.js, no browser needed. Run with `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { STYLES, makeReceipt, receiptText } from "./receipts/receipts.mjs";
import { score } from "./receipts/score.mjs";

const { parseReceipt } = createRequire(import.meta.url)("../parse.js");
const cents = items => items.map(i => [i.name, i.cents]);

test("every fake receipt style parses perfectly from its exact text", () => {
  for (const [k, style] of STYLES.entries()) {
    for (let n = 0; n < 8; n++) {
      const rc = makeReceipt(1000 + k * 100 + n, style);
      const s = score(rc, parseReceipt(receiptText(rc)));
      assert.ok(s.perfect, `${rc.id}: ${JSON.stringify({ missing: s.missing, wrongPrice: s.wrongPrice, junk: s.junkItems, missingFees: s.missingFees, junkFees: s.junkFees })}`);
    }
  }
});

test("real receipts parse perfectly from the text the reader saw", () => {
  const names = readdirSync(new URL("./receipts/real/", import.meta.url)).filter(f => f.endsWith(".txt")).map(f => f.slice(0, -4));
  assert.ok(names.length > 0);
  for (const name of names) {
    const truth = JSON.parse(readFileSync(new URL(`./receipts/real/${name}.json`, import.meta.url), "utf8"));
    const s = score(truth, parseReceipt(readFileSync(new URL(`./receipts/real/${name}.txt`, import.meta.url), "utf8")));
    assert.ok(s.perfect, `${name}: ${JSON.stringify(s)}`);
  }
});

test("delivery app items with the price on the next line", () => {
  const r = parseReceipt("1x Cold Brew\nExtra cheese\n$5.25\n2x Fries\n$13.18\nService Fee $2.00\nTotal $20.43");
  assert.deepEqual(cents(r.items), [["Cold Brew", 525], ["Fries", 659], ["Fries", 659]]);
  assert.deepEqual(cents(r.extras), [["Service Fee", 200]]);
  assert.equal(r.total, 2043);
});

test("quantities on paper slips, but not inside item names", () => {
  assert.deepEqual(cents(parseReceipt("1 Lo Mein 13.50\n2 Fries 13.18\nTOTAL 26.68").items), [["Lo Mein", 1350], ["Fries", 659], ["Fries", 659]]);
  assert.deepEqual(cents(parseReceipt("12 pc Wings 14.99\nGarlic Knots 6.75\nTOTAL 21.74").items), [["12 pc Wings", 1499], ["Garlic Knots", 675]]);
});

test("labels for subtotal, total and taxes", () => {
  const r = parseReceipt("Burger 10.00\nSub-Total 10.00\nTaxes 0.80\nBalance Due 10.80\nSuggested tip 18% = 1.80");
  assert.deepEqual(cents(r.items), [["Burger", 1000]]);
  assert.deepEqual(cents(r.extras), [["Taxes", 80]]);
  assert.equal(r.subtotal, 1000);
  assert.equal(r.total, 1080);
});

test("Total Tax is a tax summary, not the receipt total", () => {
  const split = parseReceipt("Salad 10.00\nSales Tax 0.60\nMeals Tax 0.30\nTOTAL TAX 0.90\nBALANCE DUE 10.90");
  assert.deepEqual(cents(split.extras), [["Sales Tax", 60], ["Meals Tax", 30]]);
  assert.equal(split.total, 1090);
  const alone = parseReceipt("Salad 10.00\nTOTAL TAX 0.90\nBALANCE DUE 10.90");
  assert.deepEqual(cents(alone.extras), [["Tax", 90]]);
});

test("reading slips: lost decimal points, $ read as S, 1 read as I", () => {
  assert.deepEqual(cents(parseReceipt("Ix Pho Tai\nS14.50\n1x Spring Rolls\n$6 95\nTotal $21.45").items), [["Pho Tai", 1450], ["Spring Rolls", 695]]);
  assert.deepEqual(cents(parseReceipt("buccaneer sndch 8 49 A x\nGreek Salad 10.20 B *\nTOTAL 18.69").items), [["buccaneer sndch", 849], ["Greek Salad", 1020]]);
  assert.equal(parseReceipt("10/05/2026 8 18 PM\nSalad 10.20\nTOTAL 10.20").items.length, 1);
});

test("a fee split from its price onto the next line is joined back", () => {
  const r = parseReceipt("Burger $10.00\nTax\n$0.80\nTotal\n$10.80");
  assert.deepEqual(cents(r.extras), [["Tax", 80]]);
  assert.equal(r.total, 1080);
});

test("a card payment line ends the receipt when the total is unreadable", () => {
  assert.deepEqual(cents(parseReceipt("Burger 10.00\nT0tl 10.80\nVISA ****1234 10.80").items), [["Burger", 1000], ["T0tl", 1080]]);
  assert.equal(parseReceipt("Burger 10.00\nVISA ****1234 10.80\nChange 0.00").items.length, 1);
});

test("one unreadable price is filled in from the total", () => {
  const r = parseReceipt("Salad 10.20 B *\nDEEPRVR KTL SW MAUI 509 x\nTax 0.50\nBALANCE DUE 15.99");
  assert.deepEqual(r.items, [{ name: "Salad", cents: 1020 }, { name: "DEEPRVR KTL SW MAUI", cents: 529, guessed: true }]);
});

test("discounts count against the bill", () => {
  assert.deepEqual(cents(parseReceipt("1x Burger\n$10.00\nPromotion -$3.00\nTotal $7.00").extras), [["Promotion", -300]]);
});
