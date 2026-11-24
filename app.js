(() => {
  "use strict";

  const RESYNC_MS = 30_000;
  const CELEBRATE_MS = 28_000;
  const BANNER_MS = 9_000;

  const MILESTONES = [
    { id: "hour", atMs: 3_600_000, label: "One hour to the bells" },
    { id: "half", atMs: 1_800_000, label: "Thirty minutes to go" },
    { id: "ten", atMs: 600_000, label: "Ten minutes — nearly there" },
    { id: "five", atMs: 300_000, label: "Five minutes to midnight" },
  ];

  const els = {
    headline: document.getElementById("headline"),
    support: document.getElementById("support"),
    countdown: document.getElementById("countdown"),
    timezone: document.getElementById("timezone"),
    celebrate: document.getElementById("celebrate"),
    celebrateYear: document.getElementById("celebrate-year"),
    banner: document.getElementById("milestone-banner"),
    bannerText: document.getElementById("milestone-text"),
    days: document.querySelector('[data-unit="days"]'),
    hours: document.querySelector('[data-unit="hours"]'),
    minutes: document.querySelector('[data-unit="minutes"]'),
    seconds: document.querySelector('[data-unit="seconds"]'),
    ms: document.querySelector('[data-unit="ms"]'),
    canvas: document.getElementById("fx-canvas"),
    testToggle: document.getElementById("test-toggle"),
    testBody: document.getElementById("test-body"),
  };

  const ctx = els.canvas.getContext("2d");
  const reduceMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;

  /** @type {{ wallMs: number, perfMs: number }} */
  let sync = { wallMs: 0, perfMs: 0 };
  let targetMs = 0;
  let targetYear = 0;
  let celebrating = false;
  let celebrateUntil = 0;
  let lastSecond = -1;
  let rafId = 0;
  /** @type {Set<string>} */
  let firedMilestones = new Set();
  let bannerUntil = 0;
  /** @type {Array<any>} */
  let particles = [];
  /** @type {Array<any>} */
  let bursts = [];
  let fxMode = "idle";
  let fxUntil = 0;

  function pad(n, width) {
    return String(n).padStart(width, "0");
  }

  function nextNewYearMs(fromWallMs) {
    const local = new Date(fromWallMs);
    const year = local.getFullYear();
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
      zone = Intl.DateTimeFormat().resolvedOptions().timeZone || zone;
    } catch {
      /* keep fallback */
    }
    const offsetMin = -new Date().getTimezoneOffset();
    const sign = offsetMin >= 0 ? "+" : "-";
    const abs = Math.abs(offsetMin);
    const hh = pad(Math.floor(abs / 60), 2);
    const mm = pad(abs % 60, 2);
    return `Local midnight ${targetYear} · ${zone} (UTC${sign}${hh}:${mm})`;
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
    void el.offsetWidth;
    el.classList.add("is-ticking");
  }

  function resizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    els.canvas.width = Math.floor(window.innerWidth * dpr);
    els.canvas.height = Math.floor(window.innerHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function showBanner(text, ms = BANNER_MS) {
    els.bannerText.textContent = text;
    els.banner.hidden = false;
    bannerUntil = nowWallMs() + ms;
  }

  function hideBanner() {
    els.banner.hidden = true;
    bannerUntil = 0;
  }

  function clearFxClasses() {
    document.body.classList.remove("fx-pulse", "fx-urgent", "is-celebrate");
  }

  function clearEffects({ keepCelebrate = false } = {}) {
    particles = [];
    bursts = [];
    fxMode = "idle";
    fxUntil = 0;
    hideBanner();
    document.body.classList.remove("fx-pulse", "fx-urgent");
    if (!keepCelebrate) {
      document.body.classList.remove("is-celebrate");
    }
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
  }

  function spawnStars(count, spread = 1) {
    const w = window.innerWidth;
    const h = window.innerHeight;
    for (let i = 0; i < count; i += 1) {
      particles.push({
        kind: "star",
        x: Math.random() * w,
        y: -20 - Math.random() * h * 0.25 * spread,
        vx: (Math.random() - 0.5) * 0.6,
        vy: 0.9 + Math.random() * 1.8,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.08,
        size: 3 + Math.random() * 5,
        life: 1,
        decay: 0.0015 + Math.random() * 0.002,
      });
    }
  }

  function spawnGlitter(count) {
    const w = window.innerWidth;
    const h = window.innerHeight;
    for (let i = 0; i < count; i += 1) {
      particles.push({
        kind: "glitter",
        x: Math.random() * w,
        y: Math.random() * h * 0.35,
        vx: (Math.random() - 0.5) * 0.4,
        vy: 0.3 + Math.random() * 0.9,
        size: 1 + Math.random() * 2.2,
        life: 1,
        decay: 0.002 + Math.random() * 0.003,
      });
    }
  }

  function spawnBurst(x, y, strength = 1) {
    bursts.push({
      x,
      y,
      r: 0,
      max: 40 + strength * 70,
      life: 1,
      decay: 0.012 / strength,
      rays: 10 + Math.floor(strength * 8),
    });
    const n = Math.floor(18 * strength);
    for (let i = 0; i < n; i += 1) {
      const a = (Math.PI * 2 * i) / n + Math.random() * 0.2;
      const speed = (1.6 + Math.random() * 2.8) * strength;
      particles.push({
        kind: "spark",
        x,
        y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        size: 1.5 + Math.random() * 2.5,
        life: 1,
        decay: 0.01 + Math.random() * 0.012,
      });
    }
  }

  function drawStar(x, y, r, rot) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.beginPath();
    for (let i = 0; i < 5; i += 1) {
      const a = (i * 4 * Math.PI) / 5 - Math.PI / 2;
      const px = Math.cos(a) * r;
      const py = Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function updateFx() {
    if (reduceMotion) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    ctx.clearRect(0, 0, w, h);

    if (fxMode === "bells" && Math.random() < 0.08) {
      spawnBurst(Math.random() * w, Math.random() * h * 0.55, 1.2 + Math.random());
      spawnStars(4);
    } else if (fxMode === "five" && Math.random() < 0.04) {
      spawnBurst(Math.random() * w, h * (0.15 + Math.random() * 0.35), 0.85);
    } else if (fxMode === "ten" && Math.random() < 0.025) {
      spawnBurst(Math.random() * w, h * (0.2 + Math.random() * 0.3), 0.65);
    }

    for (let i = bursts.length - 1; i >= 0; i -= 1) {
      const b = bursts[i];
      b.r += (b.max - b.r) * 0.08;
      b.life -= b.decay;
      ctx.strokeStyle = `rgba(197, 160, 89, ${Math.max(b.life, 0) * 0.75})`;
      ctx.lineWidth = 1.2;
      for (let r = 0; r < b.rays; r += 1) {
        const a = (Math.PI * 2 * r) / b.rays;
        ctx.beginPath();
        ctx.moveTo(b.x, b.y);
        ctx.lineTo(b.x + Math.cos(a) * b.r, b.y + Math.sin(a) * b.r);
        ctx.stroke();
      }
      if (b.life <= 0) bursts.splice(i, 1);
    }

    for (let i = particles.length - 1; i >= 0; i -= 1) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.life -= p.decay;
      if (p.kind === "star") {
        p.rot += p.vr;
        p.vy += 0.01;
        ctx.fillStyle = `rgba(197, 160, 89, ${Math.max(p.life, 0)})`;
        drawStar(p.x, p.y, p.size, p.rot);
      } else if (p.kind === "glitter") {
        ctx.fillStyle = `rgba(224, 192, 120, ${Math.max(p.life, 0)})`;
        ctx.fillRect(p.x, p.y, p.size, p.size);
      } else {
        p.vy += 0.02;
        ctx.fillStyle = `rgba(232, 213, 163, ${Math.max(p.life, 0)})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      if (p.life <= 0 || p.y > h + 40) particles.splice(i, 1);
    }

    if (fxUntil && nowWallMs() > fxUntil && fxMode !== "bells") {
      fxMode = "idle";
      document.body.classList.remove("fx-pulse", "fx-urgent");
    }
  }

  function playEffect(id, { testing = false } = {}) {
    if (reduceMotion && !testing) {
      const labels = {
        hour: "One hour to the bells",
        half: "Thirty minutes to go",
        ten: "Ten minutes — nearly there",
        five: "Five minutes to midnight",
        bells: "Happy New Year — the bells!",
      };
      if (labels[id]) showBanner(labels[id], BANNER_MS);
      return;
    }

    clearFxClasses();
    if (id !== "bells") {
      celebrating = false;
      els.celebrate.hidden = true;
    }

    const w = window.innerWidth;
    const h = window.innerHeight;

    switch (id) {
      case "hour":
        fxMode = "hour";
        fxUntil = nowWallMs() + 8_000;
        document.body.classList.add("fx-pulse");
        showBanner("One hour to the bells");
        spawnGlitter(40);
        spawnStars(18);
        break;
      case "half":
        fxMode = "half";
        fxUntil = nowWallMs() + 9_000;
        document.body.classList.add("fx-pulse");
        showBanner("Thirty minutes to go");
        spawnGlitter(70);
        spawnStars(36);
        spawnBurst(w * 0.5, h * 0.28, 0.7);
        break;
      case "ten":
        fxMode = "ten";
        fxUntil = nowWallMs() + 10_000;
        document.body.classList.add("fx-pulse");
        showBanner("Ten minutes — nearly there");
        spawnStars(50);
        spawnBurst(w * 0.25, h * 0.25, 0.9);
        spawnBurst(w * 0.75, h * 0.22, 0.9);
        break;
      case "five":
        fxMode = "five";
        fxUntil = nowWallMs() + 12_000;
        document.body.classList.add("fx-urgent");
        showBanner("Five minutes to midnight");
        spawnStars(70);
        spawnGlitter(50);
        spawnBurst(w * 0.2, h * 0.2, 1);
        spawnBurst(w * 0.5, h * 0.18, 1.1);
        spawnBurst(w * 0.8, h * 0.22, 1);
        break;
      case "bells":
        fxMode = "bells";
        fxUntil = nowWallMs() + CELEBRATE_MS;
        document.body.classList.add("is-celebrate", "fx-urgent");
        showBanner("Happy New Year — the bells!", 14_000);
        spawnStars(120);
        spawnGlitter(90);
        for (let i = 0; i < 8; i += 1) {
          spawnBurst(Math.random() * w, Math.random() * h * 0.5, 1.1 + Math.random());
        }
        break;
      case "clear":
        clearEffects();
        break;
      default:
        break;
    }
  }

  function showCountdownCopy() {
    els.headline.textContent = `Countdown to ${targetYear}`;
    els.support.textContent =
      "Ancrum Fete New Year’s Eve — local midnight, high precision.";
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
    els.support.textContent = "Happy New Year from Ancrum Bowling Club.";
    playEffect("bells");
  }

  function retarget(fromWallMs) {
    targetMs = nextNewYearMs(fromWallMs);
    targetYear = yearOfTarget(targetMs);
    firedMilestones = new Set();
    showCountdownCopy();
  }

  function checkMilestones(remaining) {
    if (celebrating || remaining <= 0) return;
    for (const m of MILESTONES) {
      if (remaining <= m.atMs && !firedMilestones.has(m.id)) {
        // Only fire when we've crossed into the window (not on late page load deep inside it
        // unless remaining is still above the next tighter milestone by a small margin)
        firedMilestones.add(m.id);
        // Skip if page loaded already past this mark by more than 2s into the window
        // (avoid surprise barrage). Still allow if within 2s of the threshold.
        const overdue = m.atMs - remaining;
        if (overdue < 2_000) {
          playEffect(m.id);
        }
      }
    }
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
      targetMs = nextNewYearMs(wall + 1);
      targetYear = yearOfTarget(targetMs);
      firedMilestones = new Set();
    }

    if (celebrating) {
      render(0);
      if (wall >= celebrateUntil) {
        celebrating = false;
        clearEffects();
        showCountdownCopy();
      }
    } else {
      render(remaining);
      checkMilestones(remaining);
    }

    if (bannerUntil && wall >= bannerUntil && fxMode !== "bells") {
      hideBanner();
    }

    updateFx();
    rafId = requestAnimationFrame(frame);
  }

  function bindTestMenu() {
    els.testToggle.addEventListener("click", () => {
      const open = els.testBody.hidden;
      els.testBody.hidden = !open;
      els.testToggle.setAttribute("aria-expanded", open ? "true" : "false");
    });

    els.testBody.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-test]");
      if (!btn) return;
      const id = btn.getAttribute("data-test");
      if (id === "bells") {
        els.celebrate.hidden = false;
        els.celebrateYear.textContent = String(targetYear);
        document.body.classList.add("is-celebrate");
      } else if (id !== "clear") {
        els.celebrate.hidden = true;
        document.body.classList.remove("is-celebrate");
      }
      playEffect(id, { testing: true });
    });
  }

  function start() {
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);
    const wall = resyncWallClock();
    retarget(wall);

    // Mark milestones already passed so a late open doesn't fire old warnings
    const remaining = targetMs - wall;
    for (const m of MILESTONES) {
      if (remaining <= m.atMs) firedMilestones.add(m.id);
    }

    setInterval(resyncWallClock, RESYNC_MS);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        const w = resyncWallClock();
        if (!celebrating) {
          const next = nextNewYearMs(w);
          if (next !== targetMs) {
            retarget(w);
          } else {
            els.timezone.textContent = timezoneLabel();
          }
        }
      }
    });
    bindTestMenu();
    rafId = requestAnimationFrame(frame);
  }

  start();

  window.__nye = {
    resyncWallClock,
    nowWallMs,
    nextNewYearMs,
    playEffect,
    get targetMs() {
      return targetMs;
    },
    get sync() {
      return { ...sync };
    },
  };
})();
