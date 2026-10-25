// Builds fake receipts with known contents (the ground truth) and the HTML that draws each one.
// Everything comes from a seeded random generator, so the same seed always gives the same receipts.

export function rng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.int = (lo, hi) => lo + Math.floor(next() * (hi - lo + 1));
  next.pick = list => list[Math.floor(next() * list.length)];
  next.chance = p => next() < p;
  return next;
}

// Made-up places, so no receipt copies a real business.
const PLACES = [
  { name: "Burger Barn", menu: [["Cheeseburger", 1319], ["Double Bacon Burger", 1649], ["Little Fries", 659], ["Cajun Fries", 729], ["Chocolate Milkshake", 779], ["Hot Dog", 749], ["Veggie Burger", 1199], ["Onion Rings", 599]] },
  { name: "Pho Saigon Kitchen", menu: [["Pho Tai", 1450], ["Spring Rolls (2)", 695], ["Banh Mi Thit Nuong", 1125], ["Bun Cha Gio", 1395], ["Thai Iced Tea", 550], ["Com Tam", 1575], ["Vermicelli Bowl", 1425]] },
  { name: "Luigi's Trattoria", menu: [["Margherita Pizza", 1600], ["Spaghetti Carbonara", 1895], ["Caesar Salad", 1150], ["Garlic Knots", 675], ["Chicken Parm", 2250], ["Tiramisu", 950], ["House Red Wine", 1200], ["Lasagna", 1975]] },
  { name: "Taqueria El Sol", menu: [["Carne Asada Burrito", 1325], ["Al Pastor Tacos (3)", 1199], ["Chips & Guac", 799], ["Horchata", 425], ["Jalapeno Poppers", 750], ["Chicken Quesadilla", 1150], ["Elote", 495], ["Churros", 600]] },
  { name: "Golden Dragon", menu: [["General Tso's Chicken", 1595], ["Pork Fried Rice", 1225], ["Crab Rangoon", 795], ["Beef & Broccoli", 1695], ["Hot & Sour Soup", 595], ["Lo Mein", 1350], ["Egg Rolls (2)", 550]] },
  { name: "Sakura Sushi Bar", menu: [["Spicy Tuna Roll", 925], ["Salmon Nigiri (2pc)", 850], ["Dragon Roll", 1695], ["Miso Soup", 395], ["Edamame", 595], ["Chicken Teriyaki Bento", 1895], ["California Roll", 795], ["Green Tea Ice Cream", 550]] },
  { name: "The Daily Grind Cafe", menu: [["Oat Milk Latte", 625], ["Avocado Toast", 1150], ["Breakfast Burrito", 1295], ["Blueberry Muffin", 450], ["Cold Brew", 525], ["Chai Latte", 595], ["Turkey Club", 1375]] },
  { name: "Bombay Spice House", menu: [["Chicken Tikka Masala", 1795], ["Garlic Naan", 450], ["Saag Paneer", 1595], ["Vegetable Samosas", 795], ["Mango Lassi", 550], ["Lamb Biryani", 2095], ["Basmati Rice", 395]] },
];

const STREETS = ["Main St", "Oak Ave", "Market St", "5th Ave", "Elm St", "Broadway", "Mission Blvd"];
const SERVERS = ["Maria", "Devon", "Ana", "Kevin", "Priya", "Sam", "Luis"];
const MODS = ["No onions", "Extra cheese", "Size: Large", "Spicy: Medium", "Add avocado", "Sauce on side", "Well done"];

// Each style is a kind of receipt people would drop into Tabsies.
export const STYLES = ["delivery-app", "delivery-app-dark", "delivery-boxed-qty", "email", "paper-counter", "paper-sitdown"];

const pct = (cents, rate) => Math.round(cents * rate);

export function makeReceipt(seed, style) {
  const r = rng(seed);
  const place = r.pick(PLACES);
  const menu = [...place.menu].sort(() => r() - 0.5);
  const count = r.int(2, Math.min(7, menu.length));
  const lines = menu.slice(0, count).map(([name, unit]) => {
    const qty = r.chance(0.25) ? r.int(2, 3) : 1;
    return { name, qty, cents: unit * qty, mods: r.chance(0.3) ? [r.pick(MODS)] : [] };
  });
  const subtotal = lines.reduce((s, l) => s + l.cents, 0);
  const taxRate = r.pick([0.0625, 0.0725, 0.08, 0.08875, 0.095]);
  const fees = [];
  let discount = null;

  if (style.startsWith("delivery") || style === "email") {
    if (r.chance(0.3)) discount = { label: r.pick(["Promotion", "Discount", "Promo: SAVE5"]), cents: -r.pick([300, 500, 750]) };
    fees.push({ label: r.pick(["Delivery Fee", "Delivery fee"]), cents: r.pick([0, 199, 299, 399, 499]) });
    fees.push({ label: "Service Fee", cents: pct(subtotal, 0.15) });
    if (subtotal < 1500) fees.push({ label: "Small Order Fee", cents: 200 });
    fees.push({ label: style === "delivery-boxed-qty" ? "Taxes" : r.pick(["Estimated Tax", "Tax", "Sales Tax"]), cents: pct(subtotal, taxRate) });
    fees.push({ label: r.pick(["Dasher Tip", "Driver Tip", "Tip", "Courier tip"]), cents: pct(subtotal, r.pick([0.1, 0.15, 0.18, 0.2])) });
  } else {
    fees.push({ label: style === "paper-counter" ? `TAX ${(taxRate * 100).toFixed(3).replace(/0+$/, "")}%` : r.pick(["Tax", "Sales Tax", "TAX"]), cents: pct(subtotal, taxRate) });
    if (style === "paper-sitdown" && r.chance(0.5)) fees.push({ label: r.pick(["Gratuity 18%", "Service Charge 20%", "Tip"]), cents: pct(subtotal, 0.18) });
  }
  // A $0 delivery fee is printed but the app drops $0 fees, so it isn't part of the expected result.
  const shownFees = fees;
  const expectedFees = fees.filter(f => f.cents !== 0);
  if (discount) expectedFees.push(discount);
  const total = subtotal + expectedFees.reduce((s, f) => s + f.cents, 0);

  const meta = {
    place: place.name,
    address: `${r.int(10, 9999)} ${r.pick(STREETS)}`,
    phone: `(${r.int(200, 989)}) ${r.int(200, 999)}-${String(r.int(0, 9999)).padStart(4, "0")}`,
    order: `${r.int(10000, 99999)}`,
    date: `10/${String(r.int(1, 28)).padStart(2, "0")}/2026`,
    time: `${r.pick([12, 5, 6, 7, 8, 9])}:${String(r.int(0, 59)).padStart(2, "0")} PM`,
    server: r.pick(SERVERS),
    table: r.int(1, 40),
    guests: r.int(2, 6),
    card: String(r.int(1000, 9999)),
    subtotalLabel: style.startsWith("paper") ? r.pick(["SUBTOTAL", "Subtotal", "Sub Total", "Sub-Total"]) : "Subtotal",
    totalLabel: style.startsWith("paper") ? r.pick(["TOTAL", "Total", "TOTAL", "Amount Due", "Balance Due"]) : "Total",
    font: r.pick(["DejaVu Sans Mono", "Liberation Mono", "FreeMono", "JetBrains Mono"]),
    tipTable: r.chance(0.5),
  };

  return { id: `${style}-${seed}`, seed, style, lines, subtotal, fees: shownFees, discount, expectedFees, total, meta };
}

const money = c => (c < 0 ? "-" : "") + "$" + (Math.abs(c) / 100).toFixed(2);
const bare = c => (c < 0 ? "-" : "") + (Math.abs(c) / 100).toFixed(2);
const esc = s => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

// Plain text the way a perfect reader would see the receipt, to tell parser misses apart from OCR misses.
export function receiptText(rc) {
  const m = rc.meta;
  const feeRows = [...rc.fees, ...(rc.discount ? [rc.discount] : [])];
  if (rc.style.startsWith("paper")) {
    const out = [m.place, m.address, m.phone, `${m.date} ${m.time}`];
    if (rc.style === "paper-sitdown") out.push(`Server: ${m.server} Table ${m.table} Guests: ${m.guests}`);
    else out.push(`Order #${m.order}`);
    rc.lines.forEach(l => {
      out.push(rc.style === "paper-counter" ? `${l.qty} ${l.name} ${bare(l.cents)}` : `${l.qty > 1 ? l.qty + " " : ""}${l.name} ${bare(l.cents)}`);
      l.mods.forEach(x => out.push(`  ${x}`));
    });
    out.push(`${m.subtotalLabel} ${bare(rc.subtotal)}`);
    rc.fees.forEach(f => out.push(`${f.label} ${bare(f.cents)}`));
    out.push(`${m.totalLabel} ${bare(rc.total)}`);
    return out.join("\n");
  }
  const out = [m.place, `Order #${m.order}`];
  rc.lines.forEach(l => {
    if (rc.style === "delivery-boxed-qty") out.push(`${l.qty} ${l.name} ${money(l.cents)}`);
    else if (rc.style === "email") out.push(`${l.qty} × ${l.name} ${money(l.cents)}`);
    else out.push(`${l.qty}x ${l.name}`, money(l.cents));
    l.mods.forEach(x => out.push(x));
  });
  out.push(`Subtotal ${money(rc.subtotal)}`);
  feeRows.forEach(f => out.push(`${f.label} ${money(f.cents)}`));
  out.push(`Total ${money(rc.total)}`);
  return out.join("\n");
}

// The page that draws a receipt. Delivery apps are drawn as phone screenshots, paper as a printed slip.
export function receiptHtml(rc) {
  const m = rc.meta;
  const feeRows = [...rc.fees, ...(rc.discount ? [rc.discount] : [])];
  if (rc.style.startsWith("paper")) {
    const row = (l, rgt, cls = "") => `<div class="row ${cls}"><span>${esc(l)}</span><span>${esc(rgt)}</span></div>`;
    const items = rc.lines.map(l => {
      const left = rc.style === "paper-counter" ? `${l.qty} ${l.name}` : `${l.qty > 1 ? l.qty + " " : ""}${l.name}`;
      return row(left, bare(l.cents)) + l.mods.map(x => `<div class="mod">${esc(x)}</div>`).join("");
    }).join("");
    const tips = m.tipTable ? `<div class="center small">Suggested tip</div>${[0.18, 0.2, 0.22].map(p => row(`${Math.round(p * 100)}% = ${bare(pct(rc.subtotal, p))}`, `Total ${bare(rc.total + pct(rc.subtotal, p))}`, "small")).join("")}` : "";
    const head = rc.style === "paper-sitdown"
      ? `<div>Server: ${m.server}&nbsp;&nbsp;Table ${m.table}</div><div>Guests: ${m.guests}</div>`
      : `<div>Order #${m.order}</div><div>Cashier: ${m.server}</div>`;
    return `<!doctype html><meta charset="utf-8"><style>
      body { margin: 0; background: #fff; }
      .slip { width: 330px; padding: 22px 20px 34px; background: #fbfaf5; color: #1c1c1c; font: 15px/1.45 "${m.font}", monospace; letter-spacing: .2px; }
      .center { text-align: center; } .big { font-size: 20px; font-weight: bold; letter-spacing: 1px; }
      .row { display: flex; justify-content: space-between; gap: 12px; } .mod { padding-left: 2ch; }
      .rule { border-top: 1px dashed #333; margin: 8px 0; } .bold { font-weight: bold; } .small { font-size: 13px; }
    </style><div class="slip" id="receipt">
      <div class="center big">${esc(m.place.toUpperCase())}</div>
      <div class="center">${m.address}</div><div class="center">${m.phone}</div>
      <div class="rule"></div><div class="row"><span>${m.date}</span><span>${m.time}</span></div>${head}<div class="rule"></div>
      ${items}<div class="rule"></div>
      ${row(m.subtotalLabel, bare(rc.subtotal))}
      ${rc.fees.map(f => row(f.label, bare(f.cents))).join("")}
      ${row(m.totalLabel, bare(rc.total), "bold big")}
      <div class="rule"></div>
      ${row(`VISA ****${m.card}`, bare(rc.total))}
      ${tips}
      <div class="center" style="margin-top:12px">Thank you! Come again</div>
    </div>`;
  }

  const dark = rc.style === "delivery-app-dark";
  const lineHtml = rc.lines.map(l => {
    const mods = l.mods.map(x => `<div class="sub">${esc(x)}</div>`).join("");
    if (rc.style === "delivery-boxed-qty") {
      return `<div class="line"><span class="box">${l.qty}</span><div class="grow"><div>${esc(l.name)}</div>${mods}</div><span>${money(l.cents)}</span></div>`;
    }
    if (rc.style === "email") {
      return `<tr><td>${l.qty} ×</td><td>${esc(l.name)}${mods}</td><td class="r">${money(l.cents)}</td></tr>`;
    }
    return `<div class="line col"><div class="qn"><span class="qty">${l.qty}x</span> <b>${esc(l.name)}</b></div>${mods}<div class="price">${money(l.cents)}</div></div>`;
  }).join("");
  const feeHtml = [["Subtotal", rc.subtotal], ...feeRows.map(f => [f.label, f.cents])]
    .map(([label, cents]) => rc.style === "email"
      ? `<tr class="efee"><td></td><td>${esc(label)}</td><td class="r">${money(cents)}</td></tr>`
      : `<div class="fee"><span>${esc(label)}</span><span>${money(cents)}</span></div>`).join("");
  const totalHtml = rc.style === "email"
    ? `<tr class="tot"><td></td><td>Total</td><td class="r">${money(rc.total)}</td></tr>`
    : `<div class="fee tot"><span>Total</span><span>${money(rc.total)}</span></div>`;
  const body = rc.style === "email"
    ? `<div class="mail"><div class="brand">Your order from ${esc(m.place)}</div><div class="sub">Order #${m.order} · ${m.date}</div>
       <table>${lineHtml}${feeHtml}${totalHtml}</table><div class="sub">Charged to Visa ending in ${m.card}</div></div>`
    : `<div class="bar"><span>9:41</span><span>▮▮▮ 100%</span></div><div class="nav">‹ Order details</div>
       <div class="pad"><h1>${esc(m.place)}</h1><div class="sub">Delivered ${m.date} at ${m.time}</div><div class="sub">Order #${m.order}</div>
       <h2>Your items</h2>${lineHtml}<div class="hr"></div>${feeHtml}${totalHtml}
       <div class="sub">Paid with Visa •••• ${m.card}</div><div class="btn">Get help with order</div></div>`;
  return `<!doctype html><meta charset="utf-8"><style>
    body { margin: 0; width: 390px; background: ${dark ? "#111" : "#fff"}; color: ${dark ? "#f2f2f2" : "#191919"}; font: 16px/1.35 "Liberation Sans", "DejaVu Sans", sans-serif; }
    #receipt { background: inherit; padding-bottom: 24px; }
    .bar { display: flex; justify-content: space-between; padding: 12px 24px 6px; font-weight: bold; font-size: 15px; }
    .nav { padding: 8px 16px; font-weight: bold; border-bottom: 1px solid ${dark ? "#333" : "#e7e7e7"}; }
    .pad { padding: 4px 16px; } h1 { font-size: 24px; margin: 14px 0 4px; } h2 { font-size: 18px; margin: 22px 0 8px; }
    .sub { color: ${dark ? "#a9a9a9" : "#767676"}; font-size: 14px; }
    .line { display: flex; gap: 10px; padding: 10px 0; border-bottom: 1px solid ${dark ? "#2a2a2a" : "#f0f0f0"}; }
    .line.col { flex-direction: column; gap: 2px; } .qty { color: ${dark ? "#bbb" : "#555"}; } .price { color: ${dark ? "#ddd" : "#333"}; }
    .box { border: 1px solid #bbb; border-radius: 4px; min-width: 22px; height: 22px; text-align: center; font-size: 14px; line-height: 22px; }
    .grow { flex: 1; } .hr { height: 8px; background: ${dark ? "#1d1d1d" : "#f5f5f5"}; margin: 12px -16px; }
    .fee { display: flex; justify-content: space-between; padding: 5px 0; color: ${dark ? "#cfcfcf" : "#444"}; }
    .tot { font-weight: bold; font-size: 18px; color: inherit; padding-top: 10px; }
    .btn { margin: 20px 0; padding: 12px; text-align: center; border-radius: 22px; background: ${dark ? "#262626" : "#eee"}; font-weight: bold; }
    .mail { padding: 20px; } .brand { font-size: 22px; font-weight: bold; margin-bottom: 4px; }
    table { width: 100%; border-collapse: collapse; margin: 16px 0; } td { padding: 7px 4px; border-bottom: 1px solid #eee; vertical-align: top; }
    td.r { text-align: right; white-space: nowrap; } tr.efee td { border: 0; padding: 3px 4px; color: #555; } tr.tot td { font-weight: bold; border-top: 2px solid #333; }
  </style><div id="receipt">${body}</div>`;
}
