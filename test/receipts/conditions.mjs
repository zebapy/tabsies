// The ways a receipt image gets worse, from a clean screenshot to a bad phone photo.
// Sizes are in pixels for an 800px wide image and scale with the real width.
// bg puts the receipt on a table, the way a phone photo of it would look.
export const CONDITIONS = {
  "clean": {},
  "low-res": { downscale: 0.35 },
  "blur-light": { blur: 1.2 },
  "blur-heavy": { blur: 2.6 },
  "noise": { noise: 30 },
  "jpeg": { jpeg: 0.1 },
  "rotate-3": { bg: true, rotate: 3 },
  "rotate-10": { bg: true, rotate: 10 },
  "perspective": { bg: true, tiltX: 22, tiltY: -14, rotate: 2 },
  "shadow": { bg: true, shadow: true },
  "crumple": { bg: true, crumple: true },
  "faint": { bg: true, fade: true, printed: true },
  "faint-blurry": { bg: true, fade: true, blur: 1.4, noise: 10, printed: true },
  "smudge": { bg: true, smudge: true },
  "motion-blur": { motion: 3 },
  "phone-photo": { bg: true, rotate: -4, tiltX: 14, tiltY: 6, shadow: true, crumple: true, blur: 0.8, noise: 14, jpeg: 0.55, downscale: 0.7 },
};

// Faded ink only happens on paper, so those conditions skip the phone screenshots.
export const applies = (name, style) => !CONDITIONS[name].printed || style.startsWith("paper") || style === "email";
