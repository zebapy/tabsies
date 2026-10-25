# Receipt reading results, 2026-10-25

Baseline before any parser changes: 48 receipts (8 each of 6 styles) under 12 conditions, 576 scans through
the real app. Rerun with `npm run receipts:generate -- --per-style 8 && npm run receipts:run` to compare.

## What goes wrong

1. **Shadows wipe out text.** A soft shadow across a paper receipt drops whole columns of prices (0% of paper
   item prices survive). The reader picks one black/white cutoff for the whole image, so the shaded half
   goes black. Fix: even out lighting before reading (divide by a heavily blurred copy, or adaptive threshold)
   on a canvas in `enlarge()`.
2. **Tilt over a few degrees breaks lines.** At 10° the reader reads "1x" as "Ix", "Total" as "Tota)" and
   "$12.95" as "$12. 95", so the total is never found (47 of 48) and items lose their prices.
   Perspective splits right-hand prices onto their own lines ("Total $" / "69."). Fix: straighten the image
   first (the reader's own `detect` gives the angle; or find the receipt edges), and loosen the patterns below.
3. **Labels the parser doesn't know**, which happen even with perfect text:
   - "Taxes" isn't a fee (`\btax\b` doesn't match it), so it becomes an item. Every boxed-quantity receipt.
   - "Sub-Total", "Amount Due", "Balance Due" become items, so the app counts the bill twice.
   - Quantities without an x ("2 Fries 13.18", boxed "2") stay one item at the full price with "2" in the name.
     31 of 31 such lines missed the quantity.
4. **Blur and noise lose decimal points.** "$6 95" and "$60 90" aren't read as prices. "$1425" already works.
5. **Small digits on thermal paper** misread under noise ("Sales Tax SA"), so the fee is missing.

## Suggested parser fixes (not made yet)

- Fees: `tax(es)?`, and an allowlist of total labels: `total`, `amount due`, `balance due`, `grand total`;
  treat `sub[\s-]?total` as subtotal.
- Quantity: accept `^\d{1,2}\s+(?=[A-Za-z])` as a quantity when the receipt has no "x" lines, and `[Il1]x`.
- Prices: accept `\$?\d{1,4}[ .,]\s?\d{2}` when the line has a $ or sits in a price column, and stray spaces after the dot.
- If the total is missing, stop at the first line after the fees that looks like card/tip-table text.
- Check: when items + fees don't add up to the total, tell the person which way it's off instead of
  "Found N items. Check them below."

## Numbers

### By condition

| Condition | Receipts | Items found | Item prices right | Names clean | Fees right | Junk items / receipt | Total read | Adds up to total | Perfect |
|---|---|---|---|---|---|---|---|---|---|
| perfect-text | 48 | 100% | 100% | 83% | 95% | 0.4 | 90% | 83% | 67% |
| clean | 48 | 100% | 100% | 83% | 95% | 0.5 | 90% | 83% | 67% |
| blur-heavy | 48 | 81% | 77% | 59% | 75% | 0.6 | 90% | 10% | 6% |
| low-res | 48 | 99% | 98% | 81% | 94% | 0.5 | 88% | 77% | 60% |
| blur-light | 48 | 100% | 100% | 83% | 94% | 0.5 | 90% | 81% | 65% |
| jpeg | 48 | 97% | 96% | 81% | 93% | 0.5 | 88% | 75% | 58% |
| rotate-3 | 48 | 98% | 98% | 79% | 95% | 0.5 | 90% | 73% | 56% |
| rotate-10 | 48 | 66% | 52% | 25% | 66% | 1.4 | 0% | 4% | 4% |
| noise | 48 | 90% | 90% | 75% | 91% | 0.4 | 90% | 69% | 52% |
| perspective | 48 | 97% | 97% | 81% | 51% | 0.4 | 25% | 17% | 15% |
| shadow | 48 | 44% | 32% | 40% | 44% | 0.2 | 42% | 21% | 17% |
| crumple | 48 | 93% | 91% | 75% | 90% | 0.5 | 83% | 58% | 42% |
| phone-photo | 48 | 35% | 17% | 17% | 20% | 0.2 | 17% | 0% | 0% |

### Item prices right, by receipt style

| Condition | delivery-app | delivery-app-dark | delivery-boxed-qty | email | paper-counter | paper-sitdown |
|---|---|---|---|---|---|---|
| perfect-text | 100% | 100% | 100% | 100% | 100% | 100% |
| clean | 100% | 100% | 100% | 100% | 100% | 100% |
| blur-heavy | 68% | 61% | 89% | 85% | 88% | 69% |
| low-res | 100% | 100% | 100% | 100% | 90% | 100% |
| blur-light | 100% | 100% | 100% | 100% | 100% | 100% |
| jpeg | 100% | 100% | 100% | 100% | 93% | 84% |
| rotate-3 | 96% | 98% | 100% | 96% | 98% | 97% |
| rotate-10 | 14% | 22% | 75% | 85% | 50% | 66% |
| noise | 100% | 100% | 100% | 100% | 70% | 69% |
| perspective | 96% | 95% | 100% | 100% | 90% | 100% |
| shadow | 86% | 100% | 7% | 0% | 0% | 0% |
| crumple | 93% | 93% | 100% | 100% | 93% | 69% |
| phone-photo | 43% | 44% | 7% | 4% | 5% | 0% |

### Perfect receipts, by receipt style

| Condition | delivery-app | delivery-app-dark | delivery-boxed-qty | email | paper-counter | paper-sitdown |
|---|---|---|---|---|---|---|
| perfect-text | 100% | 100% | 0% | 100% | 63% | 38% |
| clean | 100% | 100% | 0% | 100% | 63% | 38% |
| blur-heavy | 13% | 0% | 0% | 0% | 25% | 0% |
| low-res | 100% | 100% | 0% | 100% | 38% | 25% |
| blur-light | 88% | 100% | 0% | 100% | 63% | 38% |
| jpeg | 100% | 100% | 0% | 100% | 38% | 13% |
| rotate-3 | 88% | 88% | 0% | 88% | 50% | 25% |
| rotate-10 | 0% | 0% | 0% | 25% | 0% | 0% |
| noise | 100% | 100% | 0% | 100% | 13% | 0% |
| perspective | 25% | 0% | 0% | 0% | 50% | 13% |
| shadow | 0% | 100% | 0% | 0% | 0% | 0% |
| crumple | 63% | 50% | 0% | 100% | 38% | 0% |
| phone-photo | 0% | 0% | 0% | 0% | 0% | 0% |
