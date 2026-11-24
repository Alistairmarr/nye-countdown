# Hogmanay Bash — Countdown to the bells

High-precision New Year countdown for **Ancrum Bowling Club / Ancrum Fete**, styled after the Hogmanay Bash poster.

**Live:** https://alistairmarr.github.io/nye-countdown/

**Repo:** https://github.com/Alistairmarr/nye-countdown

## Features

- Countdown to next local midnight 1 January (days → milliseconds)
- High-res clock: `performance.now()` anchored to `Date.now()`, re-synced every 30s
- Smooth `requestAnimationFrame` updates
- Milestone effects: 1 hour, 30 minutes, 10 minutes, 5 minutes
- Big “bells” celebration at midnight
- Temporary **Test effects** panel (bottom-right) — remove nearer the night

## Stack

Vanilla HTML, CSS, and JavaScript. No build step. GitHub Pages via Actions.
