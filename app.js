(() => {
  "use strict";

  const RESYNC_MS = 30_000;
  const CELEBRATE_MS = 60_000;
  const BANNER_MS = 18_000;

  const MILESTONES = [
    { id: "hour", atMs: 3_600_000, label: "One hour to the bells" },
    { id: "half", atMs: 1_800_000, label: "Thirty minutes to go" },
    { id: "ten", atMs: 600_000, label: "Ten minutes — nearly there" },
    { id: "five", atMs: 300_000, label: "Five minutes to midnight" },
  ];

  /**
   * Each milestone has a distinct visual language, and intensity rises toward midnight.
   * hour  = rising gold embers (gentle notice)
   * half  = sweeping ribbon waves across the screen
   * ten   = classic firework bursts
   * five  = diagonal meteor shower (urgent)
   * bells = everything at once — fireworks + confetti + ring pulses
   */
  const FX_LADDER = {
    hour: {
      label: "One hour to the bells",
      style: "embers",
      duration: 16_000,
      bannerMs: 16_000,
      bodyClass: "fx-hour fx-pulse",
    },
    half: {
      label: "Thirty minutes to go",
      style: "ribbons",
      duration: 20_000,
      bannerMs: 20_000,
      bodyClass: "fx-half fx-pulse",
    },
    ten: {
      label: "Ten minutes — nearly there",
      style: "fireworks",
      duration: 24_000,
      bannerMs: 24_000,
      bodyClass: "fx-ten fx-pulse",
    },
    five: {
      label: "Five minutes to midnight",
      style: "meteors",
      duration: 30_000,
      bannerMs: 30_000,
      bodyClass: "fx-five fx-urgent",
    },
    bells: {
      label: "Happy New Year — the bells!",
      style: "finale",
      duration: CELEBRATE_MS,
      bannerMs: 36_000,
      bodyClass: "fx-bells is-celebrate fx-urgent",
    },
  };

  const FX_BODY_CLASSES = [
    "fx-hour",
    "fx-half",
    "fx-ten",
    "fx-five",
    "fx-bells",
    "fx-pulse",
    "fx-urgent",
    "is-celebrate",
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
    document.body.classList.remove(...FX_BODY_CLASSES);
  }

  function clearEffects({ keepCelebrate = false } = {}) {
    particles = [];
    bursts = [];
    fxMode = "idle";
    fxUntil = 0;
    hideBanner();
    clearFxClasses();
    if (keepCelebrate) document.body.classList.add("is-celebrate");
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
  }

  function spawnStars(count, spread = 1) {
    const w = window.innerWidth;
    const h = window.innerHeight;
    for (let i = 0; i < count; i += 1) {
      particles.push({
        kind: "star",
        x: Math.random() * w,
        y: -20 - Math.random() * h * 0.35 * spread,
        vx: (Math.random() - 0.5) * 0.85,
        vy: 0.7 + Math.random() * 1.6,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.1,
        size: 5 + Math.random() * 9,
        life: 1,
        decay: 0.0007 + Math.random() * 0.001,
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
        y: Math.random() * h * 0.45,
        vx: (Math.random() - 0.5) * 0.55,
        vy: 0.25 + Math.random() * 0.85,
        size: 1.6 + Math.random() * 3.4,
        life: 1,
        decay: 0.0009 + Math.random() * 0.0014,
      });
    }
  }

  /** Soft rising gold embers — 1 hour warning */
  function spawnEmbers(count) {
    const w = window.innerWidth;
    const h = window.innerHeight;
    for (let i = 0; i < count; i += 1) {
      particles.push({
        kind: "ember",
        x: Math.random() * w,
        y: h + 10 + Math.random() * 80,
        vx: (Math.random() - 0.5) * 0.35,
        vy: -(0.6 + Math.random() * 1.4),
        size: 2 + Math.random() * 4,
        life: 1,
        decay: 0.0008 + Math.random() * 0.0012,
        wobble: Math.random() * Math.PI * 2,
      });
    }
  }

  /** Horizontal ribbon streaks — 30 minute warning */
  function spawnRibbonWave(count) {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const fromLeft = Math.random() > 0.5;
    for (let i = 0; i < count; i += 1) {
      const y = h * (0.15 + Math.random() * 0.7);
      particles.push({
        kind: "ribbon",
        x: fromLeft ? -40 - Math.random() * 80 : w + 40 + Math.random() * 80,
        y,
        vx: (fromLeft ? 1 : -1) * (4.5 + Math.random() * 5.5),
        vy: Math.sin(i) * 0.35,
        length: 40 + Math.random() * 70,
        width: 2 + Math.random() * 3.5,
        life: 1,
        decay: 0.0012 + Math.random() * 0.001,
        curl: (Math.random() - 0.5) * 0.08,
      });
    }
  }

  function spawnBurst(x, y, strength = 1) {
    bursts.push({
      x,
      y,
      r: 0,
      max: 90 + strength * 140,
      life: 1,
      decay: 0.006 / Math.max(strength, 0.5),
      rays: 14 + Math.floor(strength * 12),
      kind: "rays",
    });
    const n = Math.floor(36 * strength);
    for (let i = 0; i < n; i += 1) {
      const a = (Math.PI * 2 * i) / n + Math.random() * 0.2;
      const speed = (2.4 + Math.random() * 4.2) * strength;
      particles.push({
        kind: "spark",
        x,
        y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        size: 2.2 + Math.random() * 3.8,
        life: 1,
        decay: 0.0045 + Math.random() * 0.006,
      });
    }
  }

  /** Expanding gold rings — used in finale */
  function spawnRing(x, y, strength = 1) {
    bursts.push({
      kind: "ring",
      x,
      y,
      r: 4,
      max: 120 + strength * 180,
      life: 1,
      decay: 0.008 / Math.max(strength, 0.5),
      line: 3 + strength * 2,
    });
  }

  /** Fast diagonal meteors — 5 minute warning */
  function spawnMeteors(count) {
    const w = window.innerWidth;
    const h = window.innerHeight;
    for (let i = 0; i < count; i += 1) {
      const speed = 7 + Math.random() * 9;
      particles.push({
        kind: "meteor",
        x: Math.random() * w * 1.2 - w * 0.1,
        y: -30 - Math.random() * h * 0.4,
        vx: 3 + Math.random() * 4,
        vy: speed,
        length: 28 + Math.random() * 48,
        width: 2 + Math.random() * 2.5,
        life: 1,
        decay: 0.002 + Math.random() * 0.0025,
      });
    }
  }

  /** Falling confetti rectangles — finale accent */
  function spawnConfetti(count) {
    const w = window.innerWidth;
    for (let i = 0; i < count; i += 1) {
      particles.push({
        kind: "confetti",
        x: Math.random() * w,
        y: -20 - Math.random() * 120,
        vx: (Math.random() - 0.5) * 2.2,
        vy: 1.4 + Math.random() * 2.6,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.2,
        w: 5 + Math.random() * 8,
        h: 3 + Math.random() * 5,
        life: 1,
        decay: 0.0006 + Math.random() * 0.0009,
        tone: Math.random(),
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

  function ongoingFx(w, h) {
    const t = nowWallMs();
    switch (fxMode) {
      case "hour":
        if (Math.random() < 0.12) spawnEmbers(3);
        break;
      case "half":
        if (Math.random() < 0.06) spawnRibbonWave(5 + Math.floor(Math.random() * 4));
        if (Math.random() < 0.04) spawnGlitter(4);
        break;
      case "ten":
        if (Math.random() < 0.085) {
          spawnBurst(
            Math.random() * w,
            h * (0.12 + Math.random() * 0.4),
            1.1 + Math.random() * 0.5
          );
        }
        break;
      case "five":
        if (Math.random() < 0.16) spawnMeteors(2 + Math.floor(Math.random() * 3));
        if (Math.random() < 0.05) spawnStars(2);
        break;
      case "bells":
        if (Math.random() < 0.2) {
          const x = Math.random() * w;
          const y = Math.random() * h * 0.55;
          spawnBurst(x, y, 1.8 + Math.random() * 1.4);
          if (Math.random() < 0.5) spawnRing(x, y, 1.2 + Math.random());
        }
        if (Math.random() < 0.12) spawnConfetti(8);
        if (Math.random() < 0.1) spawnStars(6);
        break;
      default:
        break;
    }
    // keep bells alive until celebrate ends via celebrateUntil, not fxUntil alone
    if (fxUntil && t > fxUntil && fxMode !== "bells") {
      fxMode = "idle";
      clearFxClasses();
    }
  }

  function updateFx() {
    if (reduceMotion) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    ctx.clearRect(0, 0, w, h);

    ongoingFx(w, h);

    for (let i = bursts.length - 1; i >= 0; i -= 1) {
      const b = bursts[i];
      b.r += (b.max - b.r) * 0.08;
      b.life -= b.decay;
      const alpha = Math.max(b.life, 0);
      if (b.kind === "ring") {
        ctx.strokeStyle = `rgba(224, 192, 120, ${alpha * 0.85})`;
        ctx.lineWidth = b.line || 3;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.strokeStyle = `rgba(197, 160, 89, ${alpha * 0.9})`;
        ctx.lineWidth = 2.4;
        for (let r = 0; r < b.rays; r += 1) {
          const a = (Math.PI * 2 * r) / b.rays;
          ctx.beginPath();
          ctx.moveTo(b.x, b.y);
          ctx.lineTo(b.x + Math.cos(a) * b.r, b.y + Math.sin(a) * b.r);
          ctx.stroke();
        }
      }
      if (b.life <= 0) bursts.splice(i, 1);
    }

    for (let i = particles.length - 1; i >= 0; i -= 1) {
      const p = particles[i];
      p.life -= p.decay;
      const a = Math.max(p.life, 0);

      if (p.kind === "ember") {
        p.wobble += 0.08;
        p.x += p.vx + Math.sin(p.wobble) * 0.35;
        p.y += p.vy;
        ctx.fillStyle = `rgba(224, 192, 120, ${a})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = `rgba(255, 244, 210, ${a * 0.5})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 0.45, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.kind === "ribbon") {
        p.x += p.vx;
        p.y += p.vy + Math.sin(p.x * 0.02) * p.curl * 20;
        ctx.strokeStyle = `rgba(197, 160, 89, ${a * 0.9})`;
        ctx.lineWidth = p.width;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.quadraticCurveTo(
          p.x - p.vx * 3,
          p.y + 10,
          p.x - Math.sign(p.vx) * p.length,
          p.y + Math.sin(p.x * 0.03) * 16
        );
        ctx.stroke();
      } else if (p.kind === "meteor") {
        p.x += p.vx;
        p.y += p.vy;
        const ang = Math.atan2(p.vy, p.vx);
        ctx.strokeStyle = `rgba(232, 213, 163, ${a})`;
        ctx.lineWidth = p.width;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - Math.cos(ang) * p.length, p.y - Math.sin(ang) * p.length);
        ctx.stroke();
        ctx.fillStyle = `rgba(255, 248, 220, ${a})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.width * 1.1, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.kind === "confetti") {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.02;
        p.rot += p.vr;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle =
          p.tone > 0.5
            ? `rgba(197, 160, 89, ${a})`
            : `rgba(20, 20, 20, ${a * 0.75})`;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      } else if (p.kind === "star") {
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        p.vy += 0.01;
        ctx.fillStyle = `rgba(197, 160, 89, ${a})`;
        drawStar(p.x, p.y, p.size, p.rot);
      } else if (p.kind === "glitter") {
        p.x += p.vx;
        p.y += p.vy;
        ctx.fillStyle = `rgba(224, 192, 120, ${a})`;
        ctx.fillRect(p.x, p.y, p.size, p.size);
      } else {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.02;
        ctx.fillStyle = `rgba(232, 213, 163, ${a})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }

      if (
        p.life <= 0 ||
        p.y > h + 80 ||
        p.y < -120 ||
        p.x < -160 ||
        p.x > w + 160
      ) {
        particles.splice(i, 1);
      }
    }
  }

  function playEffect(id, { testing = false } = {}) {
    if (id === "clear") {
      clearEffects();
      return;
    }

    const cfg = FX_LADDER[id];
    if (!cfg) return;

    if (reduceMotion && !testing) {
      showBanner(cfg.label, cfg.bannerMs || BANNER_MS);
      return;
    }

    clearFxClasses();
    if (id !== "bells") {
      celebrating = false;
      els.celebrate.hidden = true;
    }

    const w = window.innerWidth;
    const h = window.innerHeight;

    fxMode = id;
    fxUntil = nowWallMs() + cfg.duration;
    for (const cls of cfg.bodyClass.split(/\s+/)) {
      if (cls) document.body.classList.add(cls);
    }
    showBanner(cfg.label, cfg.bannerMs || cfg.duration);

    // Distinct opening volley per style
    switch (cfg.style) {
      case "embers":
        spawnEmbers(90);
        spawnGlitter(24);
        break;
      case "ribbons":
        spawnRibbonWave(28);
        spawnGlitter(40);
        setTimeout(() => spawnRibbonWave(22), 400);
        setTimeout(() => spawnRibbonWave(18), 900);
        break;
      case "fireworks":
        spawnBurst(w * 0.2, h * 0.22, 1.4);
        spawnBurst(w * 0.5, h * 0.16, 1.65);
        spawnBurst(w * 0.8, h * 0.24, 1.4);
        spawnStars(40);
        break;
      case "meteors":
        spawnMeteors(28);
        spawnStars(30);
        setTimeout(() => spawnMeteors(22), 350);
        setTimeout(() => spawnMeteors(18), 750);
        break;
      case "finale":
        spawnConfetti(120);
        spawnStars(100);
        spawnGlitter(80);
        for (let i = 0; i < 14; i += 1) {
          const x = Math.random() * w;
          const y = Math.random() * h * 0.55;
          spawnBurst(x, y, 2.0 + Math.random() * 1.3);
          if (i % 2 === 0) spawnRing(x, y, 1.4 + Math.random());
        }
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
