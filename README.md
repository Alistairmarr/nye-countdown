# NYE — High-precision New Year countdown

A single-page countdown to the next local New Year's midnight
(January 1, 00:00:00.000 in the viewer's timezone), published on GitHub Pages.

**Live:** https://alistairmarr.github.io/nye-countdown/

**Repo:** https://github.com/Alistairmarr/nye-countdown

## Accuracy

- Target is computed with local `Date` constructors (`new Date(year, 0, 1)`), so DST and timezone offsets are handled by the browser's local calendar APIs.
- Display updates on every `requestAnimationFrame` for smooth millisecond digits.
- Wall time is estimated as `sync.wallMs + (performance.now() - sync.perfMs)` — a high-resolution monotonic clock anchored to `Date.now()`.
- The wall-clock anchor is re-synced every 30 seconds (and when the tab becomes visible again) to correct any drift between `performance.now()` and system time.
- Units shown: days, hours, minutes, seconds, and milliseconds.
- After midnight, a short “Happy New Year” celebration plays, then the timer rolls to the following January 1.

## Stack

Vanilla HTML, CSS, and JavaScript. No build step, no backend, no secrets.

## Local preview

Open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8080 --bind 127.0.0.1
```

## GitHub Pages

Deployed from the `main` branch root via GitHub Actions (see `.github/workflows/pages.yml`).
