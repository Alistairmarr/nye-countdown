(() => {
  "use strict";

  const RESYNC_MS = 30_000;
  const CELEBRATE_MS = 12_000;

  const els = {
    headline: document.getElementById("headline"),
    support: document.getElementById("support"),
    countdown: document.getElementById("countdown"),
    timezone: document.getElementById("timezone"),
    celebrate: document.getElementById("celebrate"),
    celebrateYear: document.getElementById("celebrate-year"),
    days: document.querySelector('[data-unit="days"]'),
    hours: document.querySelector('[data-unit="hours"]'),
    minutes: document.querySelector('[data-unit="minutes"]'),
    seconds: document.querySelector('[data-unit="seconds"]'),
    ms: document.querySelector('[data-unit="ms"]'),
  };

  /** @type {{ wallMs: number, perfMs: number }} */
  let sync = { wallMs: 0, perfMs: 0 };
  let targetMs = 0;
  let targetYear = 0;
  let celebrating = false;
  let celebrateUntil = 0;
  let lastSecond = -1;
  let rafId = 0;

  function pad(n, width) {
    return String(n).padStart(width, "0");
  }

  /** Next local Jan 1 00:00:00.000 after (or at) the given wall time. */
  function nextNewYearMs(fromWallMs) {
    const local = new Date(fromWallMs);
    const year = local.getFullYear();
    // Local midnight Jan 1 of this calendar year
    let candidate = new Date(year, 0, 1, 0, 0, 0, 0).getTime();
    if (fromWallMs >= candidate) {
      candidate = new Date(year + 1, 0, 1, 0, 0, 0, 0).getTime();
    }
    return candidate;
  }

  function yearOfTarget(ms) {
    return new Date(ms).getFullYear();
  }

  function timezoneLabel() {
    let zone = "local time";
    try {
      zone =
        Intl.DateTimeFormat().resolvedOptions().timeZone || zone;
    } catch {
      /* keep fallback */
    }
    const offsetMin = -new Date().getTimezoneOffset();
    const sign = offsetMin >= 0 ? "+" : "-";
    const abs = Math.abs(offsetMin);
    const hh = pad(Math.floor(abs / 60), 2);
    const mm = pad(abs % 60, 2);
    return `Targeting ${targetYear} · ${zone} (UTC${sign}${hh}:${mm})`;
  }

  function resyncWallClock() {
    const wallMs = Date.now();
    const perfMs = performance.now();
    sync = { wallMs, perfMs };
    return wallMs;
  }

  function nowWallMs() {
    return sync.wallMs + (performance.now() - sync.perfMs);
  }

  function setUnit(el, text) {
    if (el.textContent !== text) {
      el.textContent = text;
    }
  }

  function tickDigit(el) {
    el.classList.remove("is-ticking");
    // Force reflow so the class retriggers
    void el.offsetWidth;
    el.classList.add("is-ticking");
  }

  function showCountdownCopy() {
    els.headline.textContent = `Countdown to ${targetYear}`;
    els.support.textContent =
      "Precision timer for January 1 midnight in your timezone.";
    els.timezone.textContent = timezoneLabel();
    els.celebrate.hidden = true;
    document.body.classList.remove("is-celebrate");
  }

  function showCelebrate(year) {
    celebrating = true;
    celebrateUntil = nowWallMs() + CELEBRATE_MS;
    els.celebrate.hidden = false;
    els.celebrateYear.textContent = String(year);
    els.headline.textContent = "The year begins";
    els.support.textContent =
      "Happy New Year — rolling to the next countdown shortly.";
    document.body.classList.add("is-celebrate");
  }

  function retarget(fromWallMs) {
    targetMs = nextNewYearMs(fromWallMs);
    targetYear = yearOfTarget(targetMs);
    showCountdownCopy();
  }

  function render(remaining) {
    const totalMs = Math.max(0, remaining);
    const days = Math.floor(totalMs / 86_400_000);
    const hours = Math.floor((totalMs % 86_400_000) / 3_600_000);
    const minutes = Math.floor((totalMs % 3_600_000) / 60_000);
    const seconds = Math.floor((totalMs % 60_000) / 1000);
    const ms = Math.floor(totalMs % 1000);

    setUnit(els.days, pad(days, 2));
    setUnit(els.hours, pad(hours, 2));
    setUnit(els.minutes, pad(minutes, 2));
    setUnit(els.seconds, pad(seconds, 2));
    setUnit(els.ms, pad(ms, 3));

    if (seconds !== lastSecond) {
      tickDigit(els.seconds);
      lastSecond = seconds;
    }

    els.countdown.setAttribute(
      "aria-label",
      `${days} days, ${hours} hours, ${minutes} minutes, ${seconds} seconds, ${ms} milliseconds remaining`
    );
  }

  function frame() {
    const wall = nowWallMs();
    const remaining = targetMs - wall;

    if (!celebrating && remaining <= 0) {
      const arrivedYear = targetYear;
      showCelebrate(arrivedYear);
      // Advance target immediately so we know the next year while celebrating
      targetMs = nextNewYearMs(wall + 1);
      targetYear = yearOfTarget(targetMs);
    }

    if (celebrating) {
      render(0);
      if (wall >= celebrateUntil) {
        celebrating = false;
        showCountdownCopy();
      }
    } else {
      render(remaining);
    }

    rafId = requestAnimationFrame(frame);
  }

  function start() {
    const wall = resyncWallClock();
    retarget(wall);
    setInterval(resyncWallClock, RESYNC_MS);
    // Also resync when the tab becomes visible again (sleep / background)
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        const w = resyncWallClock();
        if (!celebrating) {
          const next = nextNewYearMs(w);
          if (next !== targetMs) {
            targetMs = next;
            targetYear = yearOfTarget(targetMs);
            showCountdownCopy();
          } else {
            els.timezone.textContent = timezoneLabel();
          }
        }
      }
    });
    rafId = requestAnimationFrame(frame);
  }

  start();

  // Expose for debugging / manual tests without polluting production UX
  window.__nye = {
    resyncWallClock,
    nowWallMs,
    nextNewYearMs,
    get targetMs() {
      return targetMs;
    },
    get sync() {
      return { ...sync };
    },
  };
})();
