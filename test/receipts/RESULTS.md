# Receipt reading results

48 fake receipts (8 each of 6 styles) under 16 conditions, 720 scans through the real app.
Faded-ink conditions only run on paper and email receipts. Numbers are before → after the 2026-10-25 changes
to `parse.js` and the image cleanup in `index.html`. "perfect-text" runs `parse.js` on the exact receipt
text, so it shows parser limits with no reading errors.

Rerun with `npm run receipts:generate -- --per-style 8 && npm run receipts:run -- --jobs 4`.

| Condition | Scans | Item prices right | Fees right | Adds up to total | Perfect |
|---|---|---|---|---|---|
| perfect-text | 48 | 100% → **100%** | 95% → **100%** | 83% → **100%** | 67% → **100%** |
| clean | 48 | 100% → **100%** | 95% → **100%** | 83% → **100%** | 67% → **100%** |
| blur-heavy | 48 | 77% → **94%** | 75% → **92%** | 10% → **69%** | 6% → **67%** |
| low-res | 48 | 98% → **99%** | 94% → **100%** | 77% → **96%** | 60% → **96%** |
| blur-light | 48 | 100% → **100%** | 94% → **100%** | 81% → **100%** | 65% → **100%** |
| jpeg | 48 | 96% → **100%** | 93% → **100%** | 75% → **100%** | 58% → **100%** |
| rotate-3 | 48 | 98% → **100%** | 95% → **100%** | 73% → **100%** | 56% → **100%** |
| rotate-10 | 48 | 52% → **100%** | 66% → **100%** | 4% → **100%** | 4% → **100%** |
| noise | 48 | 90% → **97%** | 91% → **100%** | 69% → **90%** | 52% → **90%** |
| shadow | 48 | 32% → **97%** | 44% → **98%** | 21% → **81%** | 17% → **81%** |
| perspective | 48 | 97% → **99%** | 51% → **77%** | 17% → **52%** | 15% → **38%** |
| crumple | 48 | 91% → **95%** | 90% → **96%** | 58% → **75%** | 42% → **73%** |
| smudge | 48 | 82% → **89%** | 80% → **92%** | 27% → **58%** | 23% → **56%** |
| phone-photo | 48 | 17% → **41%** | 20% → **38%** | 0% → **4%** | 0% → **4%** |
| motion-blur | 48 | 29% → **49%** | 18% → **44%** | 0% → **2%** | 0% → **2%** |
| faint | 24 | 0% → **62%** | 0% → **43%** | 0% → **4%** | 0% → **4%** |
| faint-blurry | 24 | 0% → **5%** | 0% → **0%** | 0% → **4%** | 0% → **0%** |
| **All scans** | 720 | 71% → **86%** | 69% → **85%** | 40% → **69%** | 31% → **67%** |

Average time per scan went from 4.2s to 3.6s: the cleaned-up image is quicker for the text reader.

## What changed

**Parser (`parse.js`)**
- "Taxes" counts as a fee; "Sub-Total" is the subtotal; "Amount Due", "Balance Due" and "Grand Total" end the
  receipt like "Total". Before, these became items and the bill was counted twice.
- Paper slips that start each line with a quantity ("2 Fries 13.18") split into 2 items. Only when most
  priced lines start that way, so "12 pc Wings" stays one item.
- Reading slips the reader makes: "Ix" for "1x", "Tota)" for "Total", "S5.25" for "$5.25",
  "$6 95" or "$12. 95" for a price, and "Tax" / "$4.27" split onto two lines.
- A card payment line ends the receipt, so it isn't read as an item when the total was unreadable.

**Image cleanup before reading (`prepare()` in `index.html`)**
- Evens out lighting by dividing each pixel by the paper brightness around it, which removes shadows.
- Stretches faded ink to black, less so on grainy photos so noise doesn't turn into specks; very grainy
  photos get a light blur first.
- Finds the receipt by growing out from the brightest paper and blanks the table around it.
- Flips dark-mode screenshots so the text is always dark.
- Measures how far the text leans and turns the image level when it's off by more than 0.8°.

## What still goes wrong

1. **Real phone photos (41% of prices).** Several problems at once: perspective, shadow, crumples and grain.
   Perspective is the main one left. Straightening only fixes rotation, so lines still slope differently at the
   top and bottom. Next step: find the receipt's four corners and flatten it.
2. **Motion blur (49%).** Digits smear into each other ("$13.95" → "$1355"). There's no good fix without a
   sharper photo. Worth telling the person to hold still or retake when nothing adds up.
3. **Faint ink (62%, 5% when also blurry).** Faded patches disappear entirely.
4. **Perspective (77% of fees).** Labels and prices at the far end of the receipt get split or merged.
5. Most results that are still wrong don't add up to the receipt total. The app could say so
   ("Items and fees come to $X but the receipt says $Y") instead of "Check them below".
