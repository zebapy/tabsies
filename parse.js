// Turns OCR text from a receipt screenshot into items and extras (tax, fees, tip).
// Works for DoorDash-style receipts ("1x Item" then "$price"), paper slips ("2 Fries 13.18") and plain "Item ... 12.99" lines.
(function (root) {
  // "$13.19", "13.19", "13,19", "$13. 19", "$13 19" when OCR turns the decimal point into a space, or "$1319" when it drops it.
  const PRICE = /(-?)(?:\$?\s?(\d{1,4})[.,]\s?(\d{2})|\$\s?(\d{1,4})\s(\d{2})|\$(\d{1,3})(\d{2}))(?![\d.,])/g;
  // "2x Fries", "2 × Fries", or "Ix Fries" when OCR reads the 1 as a letter.
  const QTY_LINE = /(\d{1,2}|^[Il])\s*[x×]\s+([A-Za-z].*)$/;
  // "2 Fries 13.18" on a paper slip, or a quantity read from a box: "[2] Fries", "2| Fries".
  const BARE_QTY = /^[[(|]?\s*([1-9])\s*[\])|]?\s+([A-Za-z].*)$/;
  const SUBTOTAL = /\bsub[\s-]?total\b/i;
  const TOTAL = /^\W*\w{0,2}\W*(grand\s+)?tota[l1I|)]|\b(amount|balance)\s+due\b/i;
  const EXTRA = /\b(tax|taxes|tip|gratuity|fee|fees|surcharge|service|delivery|bag)\b/i;
  const DISCOUNT = /\b(discount|promo|promotion|savings|credit|coupon)\b/i;
  // Payment lines only come after the total, so they end the receipt when the total itself was unreadable.
  const PAYMENT = /\b(visa|mastercard|amex|paid with|charged to)\b/i;

  function lastPrice(line) {
    const found = [...line.matchAll(PRICE)];
    if (!found.length) return null;
    const [, neg, d1, c1, d2, c2, d3, c3] = found[found.length - 1];
    return (parseInt(d1 || d2 || d3, 10) * 100 + parseInt(c1 || c2 || c3, 10)) * (neg ? -1 : 1);
  }

  function cleanName(text) {
    return text
      .replace(PRICE, "")
      .replace(/[^A-Za-z0-9&'()\-/ ]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/^(\W|\b[a-z]{1,2}\b\s)+/, "")
      .replace(/[\s-]+$/, "")
      .trim();
  }

  // Split a line total for "2x Fries $13.18" into 2 items whose cents add back up.
  function expand(name, qty, cents) {
    const each = Math.floor(cents / qty);
    return Array.from({ length: qty }, (_, k) => ({ name, cents: each + (k < cents - each * qty ? 1 : 0) }));
  }

  // The quantity at the start of a line, when the receipt marks quantities that way.
  function quantity(line, bareQty) {
    const q = line.match(QTY_LINE);
    if (q) return { qty: /\d/.test(q[1]) ? parseInt(q[1], 10) : 1, name: q[2] };
    const b = bareQty && line.match(BARE_QTY);
    return b ? { qty: parseInt(b[1], 10), name: b[2] } : null;
  }

  // A line that is only a price, give or take a stray mark the reader picked up next to it.
  const priceOnly = line => lastPrice(line) !== null && line.replace(PRICE, "").replace(/[^A-Za-z]/g, "").length <= 1;

  function readLines(text) {
    const lines = text.split(/\r?\n/)
      .map(l => l.trim().replace(/(^|\s)S(?=\d)/g, "$1$$"))
      .filter(Boolean);
    // A photo taken at an angle can split "Tax $4.27" into "Tax" and "$4.27"; put them back together.
    const out = [];
    lines.forEach((line, k) => {
      const prev = out[out.length - 1];
      if (k && prev !== undefined && lastPrice(prev) === null && /[A-Za-z]{2}/.test(prev) && !QTY_LINE.test(prev) && priceOnly(line)) out[out.length - 1] = `${prev} ${line}`;
      else out.push(line);
    });
    return out;
  }

  function parseReceipt(text) {
    const lines = readLines(text);
    const items = [];
    const extras = [];
    let subtotal = null;
    let total = null;
    let pending = null;
    const hasQtyLines = lines.some(l => QTY_LINE.test(l));
    // Only trust "2 Fries 13.18" as a quantity when most priced lines start that way, so "12 pc Wings" stays one item.
    const end = lines.findIndex(l => TOTAL.test(l) || PAYMENT.test(l));
    const priced = lines.slice(0, end < 0 ? lines.length : end).filter(l => lastPrice(l) !== null && !EXTRA.test(l) && !SUBTOTAL.test(l) && !TOTAL.test(l));
    const bareQty = !hasQtyLines && priced.filter(l => BARE_QTY.test(l)).length * 2 >= priced.length && priced.length > 1;

    for (const line of lines) {
      const price = lastPrice(line);
      if (SUBTOTAL.test(line)) { subtotal = price; continue; }
      if (TOTAL.test(line)) { total = price; break; }
      if (PAYMENT.test(line)) break;
      if (pending && (EXTRA.test(line) || DISCOUNT.test(line))) { items.push(...expand(pending.name, pending.qty, 0)); pending = null; }
      if (price !== null && (EXTRA.test(line) || DISCOUNT.test(line))) {
        const cents = DISCOUNT.test(line) ? -Math.abs(price) : price;
        if (cents !== 0) extras.push({ name: cleanName(line.split("$")[0]) || "Fee", cents });
        continue;
      }
      const q = hasQtyLines ? quantity(line, false) : bareQty && price !== null ? quantity(line, true) : null;
      if (q) {
        // An item whose price line was unreadable stays in the list at $0 so it can be fixed by hand.
        if (pending) items.push(...expand(pending.name, pending.qty, 0));
        pending = { qty: q.qty, name: cleanName(q.name) };
        if (price !== null) { items.push(...expand(pending.name, pending.qty, price)); pending = null; }
        continue;
      }
      if (price === null) continue;
      if (pending) {
        items.push(...expand(pending.name, pending.qty, price));
        pending = null;
      } else if (!hasQtyLines) {
        const name = cleanName(line);
        if (name.length > 1) items.push({ name, cents: price });
      }
    }
    return { items, extras, subtotal, total };
  }

  root.parseReceipt = parseReceipt;
  if (typeof module !== "undefined") module.exports = { parseReceipt };
})(typeof window !== "undefined" ? window : globalThis);
