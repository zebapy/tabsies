// Compares what the app read from a receipt with what is really on it.

const norm = s => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

function similarity(a, b) {
  a = norm(a);
  b = norm(b);
  if (!a.length || !b.length) return 0;
  const row = Array.from({ length: b.length + 1 }, (_, k) => k);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const keep = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = keep;
    }
  }
  return 1 - row[b.length] / Math.max(a.length, b.length);
}

// The app splits "2x Fries $13.18" into two Fries rows; fold runs of the same name back into one line.
function group(items) {
  const out = [];
  for (const it of items) {
    const last = out[out.length - 1];
    if (last && last.name === it.name) { last.qty++; last.cents += it.cents; } else out.push({ name: it.name, qty: 1, cents: it.cents });
  }
  return out;
}

export function score(truth, read) {
  const lines = group(read.items);
  const used = new Set();
  const items = truth.lines.map(want => {
    let best = -1;
    let bestSim = 0;
    lines.forEach((got, k) => {
      if (used.has(k)) return;
      const sim = similarity(want.name, got.name) + (got.cents === want.cents ? 0.05 : 0);
      if (sim > bestSim) { best = k; bestSim = sim; }
    });
    if (best < 0 || bestSim < 0.6) return { want, got: null };
    used.add(best);
    return { want, got: lines[best], sim: Math.min(1, bestSim) };
  });
  const extraItems = lines.filter((_, k) => !used.has(k));

  const feesUsed = new Set();
  const fees = truth.expectedFees.map(want => {
    const k = read.extras.findIndex((got, n) => !feesUsed.has(n) && got.cents === want.cents);
    if (k >= 0) feesUsed.add(k);
    return { want, got: k >= 0 ? read.extras[k] : null };
  });
  const extraFees = read.extras.filter((_, n) => !feesUsed.has(n));

  const sum = [...read.items, ...read.extras].reduce((s, x) => s + x.cents, 0);
  const found = items.filter(i => i.got);
  const priced = found.filter(i => i.got.cents === i.want.cents);
  return {
    items: truth.lines.length,
    itemsFound: found.length,
    itemsPriced: priced.length,
    namesClean: found.filter(i => i.sim >= 0.9).length,
    qtyRight: priced.filter(i => i.got.qty === i.want.qty).length,
    extraItems: extraItems.length,
    fees: truth.expectedFees.length,
    feesRight: fees.filter(f => f.got).length,
    extraFees: extraFees.length,
    totalRead: read.total === truth.total,
    addsUp: sum === truth.total,
    perfect: priced.length === truth.lines.length && fees.every(f => f.got) && !extraItems.length && !extraFees.length,
    missing: items.filter(i => !i.got).map(i => i.want.name),
    wrongPrice: found.filter(i => i.got.cents !== i.want.cents).map(i => `${i.want.name}: ${i.got.cents} not ${i.want.cents}`),
    junkItems: extraItems.map(i => `${i.name} (${i.cents})`),
    missingFees: fees.filter(f => !f.got).map(f => `${f.want.label} ${f.want.cents}`),
    junkFees: extraFees.map(f => `${f.name} (${f.cents})`),
  };
}
