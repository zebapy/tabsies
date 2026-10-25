# Tabsies

Split a food order on Venmo from a receipt screenshot.

1. Open the site and drop in a receipt screenshot. The text is read in your browser, so nothing is uploaded.
2. Check the items and fees, set your Venmo username, and create a link.
3. Send the link to the group. Each person taps what they ordered and gets a prefilled Venmo payment to you. Tax, fees and tip are split in proportion to food.

The order is stored in the link itself (`#o=…`), so there's no backend or database.

Deployed to Vercel on every push to `main`. `vercel.json` copies an allowlist of site files into `public/`, so a new top-level file or folder has to be added to its `buildCommand`.

## Install as an app

Tabsies is a PWA. On Android, open the site in Chrome and choose "Add to Home screen". Once installed, Tabsies appears in the share sheet, so you can share a receipt screenshot straight into it. On iPhone, use Safari's Share → "Add to Home Screen". Your Venmo username is saved on your device.
