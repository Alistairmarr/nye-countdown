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
      duration: 22_000,
      bannerMs: 22_000,
      bodyClass: "fx-hour fx-pulse",
    },
    half: {
      label: "Thirty minutes to go",
      style: "ribbons",
      duration: 26_000,
      bannerMs: 26_000,
      bodyClass: "fx-half fx-pulse",
    },
    ten: {
      label: "Ten minutes — nearly there",
      style: "fireworks",
      duration: 30_000,
      bannerMs: 30_000,
      bodyClass: "fx-ten fx-pulse",
    },
    five: {
      label: "Five minutes to midnight",
      style: "meteors",
      duration: 36_000,
      bannerMs: 36_000,
      bodyClass: "fx-five fx-urgent",
    },
    bells: {
      label: "Happy New Year — the bells!",
      style: "finale",
      duration: CELEBRATE_MS,
      bannerMs: 40_000,
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

  const PHASE_CLASSES = [
    "phase-day",
    "phase-hour",
    "phase-half",
    "phase-ten",
    "phase-five",
    "phase-bells",
  ];

  let currentPhase = "day";
  /** When set, keep a preview atmosphere (test menu) instead of real time-to-midnight. */
  let phaseLockUntil = 0;

  /** @type {AudioContext | null} */
  let audioCtx = null;
  let audioUnlocked = false;
  let soundMuted = false;

  /** Festive palette — gold + jewel tones (no purple). */
  const PALETTE = {
    gold: [197, 160, 89],
    champagne: [232, 213, 163],
    copper: [196, 120, 59],
    ruby: [179, 58, 74],
    emerald: [47, 122, 91],
    rose: [212, 137, 122],
    cream: [255, 248, 231],
    ink: [26, 26, 26],
  };

  const PALETTE_LIST = Object.values(PALETTE);

  function rgba(rgb, a) {
    return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${a})`;
  }

  function pick(list) {
    return list[Math.floor(Math.random() * list.length)];
  }

  function mixTone(base, amount = 0.2) {
    return base.map((c) =>
      Math.max(0, Math.min(255, Math.round(c + (Math.random() - 0.5) * 40 * amount * 5)))
    );
  }

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
    return `${targetYear} · ${zone} (UTC${sign}${hh}:${mm})`;
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

  function ensureAudio() {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      audioCtx = new AC();
    }
    if (audioCtx.state === "suspended") {
      audioCtx.resume().catch(() => {});
    }
    audioUnlocked = true;
    return audioCtx;
  }

  function unlockAudioFromGesture() {
    ensureAudio();
  }

  function playTone(freq, start, dur, type, gainVal, slideTo) {
    const ctx = audioCtx;
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    if (slideTo) {
      osc.frequency.exponentialRampToValueAtTime(
        Math.max(slideTo, 20),
        start + dur
      );
    }
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(gainVal, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + dur + 0.02);
  }

  function playNoiseBurst(start, dur, gainVal) {
    const ctx = audioCtx;
    if (!ctx) return;
    const frames = Math.floor(ctx.sampleRate * dur);
    const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i += 1) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
    }
    const src = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    src.buffer = buffer;
    filter.type = "bandpass";
    filter.frequency.value = 1800;
    filter.Q.value = 0.8;
    gain.gain.setValueAtTime(gainVal, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    src.start(start);
    src.stop(start + dur + 0.02);
  }

  /**
   * Distinct escalating warning sounds (synthesized — no media files).
   * hour: soft warm chime · half: brighter double chime · ten: fanfare
   * five: urgent peal · bells: celebratory bell cascade
   */
  function playWarningSound(id) {
    if (soundMuted) return;
    const ctx = ensureAudio();
    if (!ctx) return;
    const t0 = ctx.currentTime + 0.02;

    switch (id) {
      case "hour":
        playTone(392, t0, 1.4, "sine", 0.12);
        playTone(493.88, t0 + 0.15, 1.5, "triangle", 0.08);
        break;
      case "half":
        playTone(440, t0, 0.7, "sine", 0.14);
        playTone(554.37, t0 + 0.12, 0.8, "triangle", 0.1);
        playTone(659.25, t0 + 0.55, 1.2, "sine", 0.13);
        playTone(880, t0 + 0.7, 1.0, "triangle", 0.07);
        break;
      case "ten":
        playTone(523.25, t0, 0.35, "square", 0.06);
        playTone(659.25, t0 + 0.18, 0.35, "square", 0.06);
        playTone(783.99, t0 + 0.36, 0.45, "square", 0.07);
        playTone(1046.5, t0 + 0.55, 1.1, "triangle", 0.11);
        playNoiseBurst(t0 + 0.55, 0.25, 0.04);
        break;
      case "five":
        playTone(311.13, t0, 0.28, "sawtooth", 0.07);
        playTone(369.99, t0 + 0.22, 0.28, "sawtooth", 0.07);
        playTone(466.16, t0 + 0.44, 0.35, "sawtooth", 0.08);
        playTone(622.25, t0 + 0.7, 1.4, "triangle", 0.14);
        playTone(933.88, t0 + 0.85, 1.2, "sine", 0.08);
        playNoiseBurst(t0 + 0.7, 0.35, 0.055);
        break;
      case "bells":
        // Deep peal + bright cascade
        [196, 246.94, 293.66, 392, 493.88, 587.33, 784].forEach((f, i) => {
          playTone(f, t0 + i * 0.18, 2.2 - i * 0.12, "sine", 0.1 - i * 0.008);
          playTone(f * 2, t0 + i * 0.18 + 0.04, 1.6, "triangle", 0.04);
        });
        playNoiseBurst(t0 + 0.2, 0.5, 0.045);
        playNoiseBurst(t0 + 1.2, 0.4, 0.035);
        // Final resolve
        playTone(523.25, t0 + 1.6, 2.4, "sine", 0.12);
        playTone(659.25, t0 + 1.75, 2.5, "triangle", 0.09);
        playTone(783.99, t0 + 1.9, 2.6, "sine", 0.08);
        break;
      default:
        break;
    }
  }

  function phaseFromRemaining(remaining) {
    if (celebrating || remaining <= 0) return "bells";
    if (remaining <= 300_000) return "five";
    if (remaining <= 600_000) return "ten";
    if (remaining <= 1_800_000) return "half";
    if (remaining <= 3_600_000) return "hour";
    return "day";
  }

  function warmthForPhase(phase, remaining) {
    if (phase === "bells") return 1;
    if (phase === "five") return 0.92;
    if (phase === "ten") return 0.78;
    if (phase === "half") return 0.55;
    if (phase === "hour") return 0.32;
    if (remaining <= 3_600_000) {
      return Math.pow(1 - Math.max(0, remaining) / 3_600_000, 0.85);
    }
    return 0;
  }

  function applyPhase(phase, warmth) {
    if (phase !== currentPhase) {
      document.body.classList.remove(...PHASE_CLASSES);
      document.body.classList.add(`phase-${phase}`);
      currentPhase = phase;
    }
    document.documentElement.style.setProperty(
      "--phase-warmth",
      Number(warmth).toFixed(3)
    );
  }

  function lockPhase(phase, ms) {
    applyPhase(phase, warmthForPhase(phase, 0));
    phaseLockUntil = nowWallMs() + ms;
  }

  /** Continuous ambient excitement that builds with the current phase. */
  function ambientExcitement(phase, warmth) {
    if (reduceMotion || phase === "day") return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    // Ramp spawn chance hard so a big TV clearly “wakes up”
    const tick = 0.04 + warmth * 0.22;
    if (Math.random() > tick) return;

    switch (phase) {
      case "hour":
        spawnEmbers(4 + Math.floor(warmth * 6));
        spawnGlitter(2);
        break;
      case "half":
        if (Math.random() < 0.55) spawnRibbonWave(4 + Math.floor(Math.random() * 4));
        spawnGlitter(3);
        spawnEmbers(2);
        break;
      case "ten":
        if (Math.random() < 0.45) {
          const o = burstOrigin();
          spawnBurst(o.x, o.y, 0.85 + Math.random() * 0.4);
        }
        spawnStars(2);
        spawnGlitter(3);
        break;
      case "five":
        spawnMeteors(2 + Math.floor(Math.random() * 3));
        if (Math.random() < 0.35) {
          const o = burstOrigin();
          spawnBurst(o.x, o.y, 1.0 + Math.random() * 0.35);
        }
        spawnStars(3);
        break;
      case "bells":
        {
          const o = burstOrigin();
          spawnBurst(o.x, o.y, 1.3 + Math.random() * 0.6);
          if (Math.random() < 0.5) spawnRing(o.x, o.y, 1.1);
          spawnConfetti(6);
          spawnStars(4);
        }
        break;
      default:
        break;
    }
  }

  /** Page atmosphere shifts as midnight nears (independent of one-shot FX). */
  function updatePhase(remaining) {
    const now = nowWallMs();
    if (phaseLockUntil && now < phaseLockUntil) {
      ambientExcitement(currentPhase, warmthForPhase(currentPhase, 0));
      return;
    }
    if (phaseLockUntil && now >= phaseLockUntil) {
      phaseLockUntil = 0;
    }

    const phase = phaseFromRemaining(remaining);
    const warmth = warmthForPhase(phase, remaining);
    applyPhase(phase, warmth);
    ambientExcitement(phase, warmth);
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
    const colors = [PALETTE.gold, PALETTE.champagne, PALETTE.copper, PALETTE.ruby];
    for (let i = 0; i < count; i += 1) {
      particles.push({
        kind: "star",
        x: Math.random() * w,
        y: -20 - Math.random() * h * 0.35 * spread,
        vx: (Math.random() - 0.5) * 1.1,
        vy: 0.85 + Math.random() * 2.0,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.12,
        size: 8 + Math.random() * 14,
        life: 1,
        decay: 0.00055 + Math.random() * 0.0009,
        color: mixTone(pick(colors)),
      });
    }
  }

  function spawnGlitter(count) {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const colors = [PALETTE.champagne, PALETTE.gold, PALETTE.cream, PALETTE.rose];
    for (let i = 0; i < count; i += 1) {
      particles.push({
        kind: "glitter",
        x: Math.random() * w,
        y: Math.random() * h * 0.5,
        vx: (Math.random() - 0.5) * 0.7,
        vy: 0.3 + Math.random() * 1.0,
        size: 2.4 + Math.random() * 5,
        life: 1,
        decay: 0.0007 + Math.random() * 0.0012,
        color: mixTone(pick(colors)),
      });
    }
  }

  /** Soft rising embers — 1 hour warning */
  function spawnEmbers(count) {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const colors = [PALETTE.copper, PALETTE.gold, PALETTE.rose, PALETTE.champagne];
    for (let i = 0; i < count; i += 1) {
      particles.push({
        kind: "ember",
        x: Math.random() * w,
        y: h + 10 + Math.random() * 100,
        vx: (Math.random() - 0.5) * 0.45,
        vy: -(0.85 + Math.random() * 1.8),
        size: 3.5 + Math.random() * 7,
        life: 1,
        decay: 0.0006 + Math.random() * 0.001,
        wobble: Math.random() * Math.PI * 2,
        color: mixTone(pick(colors)),
      });
    }
  }

  /** Horizontal ribbon streaks — 30 minute warning */
  function spawnRibbonWave(count) {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const fromLeft = Math.random() > 0.5;
    const colors = [PALETTE.gold, PALETTE.ruby, PALETTE.emerald, PALETTE.copper, PALETTE.rose];
    for (let i = 0; i < count; i += 1) {
      const y = h * (0.12 + Math.random() * 0.76);
      particles.push({
        kind: "ribbon",
        x: fromLeft ? -60 - Math.random() * 100 : w + 60 + Math.random() * 100,
        y,
        vx: (fromLeft ? 1 : -1) * (5.5 + Math.random() * 7),
        vy: Math.sin(i) * 0.45,
        length: 70 + Math.random() * 110,
        width: 3.5 + Math.random() * 5.5,
        life: 1,
        decay: 0.0009 + Math.random() * 0.0009,
        curl: (Math.random() - 0.5) * 0.1,
        color: mixTone(pick(colors)),
      });
    }
  }

  /** Keep bursts in a readable band — not flying off the far edges. */
  function burstOrigin() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    return {
      x: w * (0.18 + Math.random() * 0.64),
      y: h * (0.12 + Math.random() * 0.38),
    };
  }

  function spawnBurst(x, y, strength = 1) {
    const burstColors = [PALETTE.gold, PALETTE.ruby, PALETTE.emerald, PALETTE.copper, PALETTE.champagne];
    const color = pick(burstColors);
    // Cap travel so fireworks bloom nearby instead of racing across the whole screen
    const maxR = Math.min(
      70 + strength * 55,
      Math.min(window.innerWidth, window.innerHeight) * 0.28
    );
    bursts.push({
      x,
      y,
      r: 0,
      max: maxR,
      life: 1,
      decay: 0.008 / Math.max(strength, 0.5),
      rays: 16 + Math.floor(strength * 10),
      kind: "rays",
      color,
    });
    const n = Math.floor(36 * strength);
    for (let i = 0; i < n; i += 1) {
      const a = (Math.PI * 2 * i) / n + Math.random() * 0.2;
      const speed = (1.4 + Math.random() * 2.2) * Math.min(strength, 2.2);
      particles.push({
        kind: "spark",
        x,
        y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        size: 2.8 + Math.random() * 4.5,
        life: 1,
        decay: 0.006 + Math.random() * 0.008,
        color: mixTone(i % 3 === 0 ? pick(burstColors) : color),
        drag: 0.96,
      });
    }
  }

  /** Expanding coloured rings — finale */
  function spawnRing(x, y, strength = 1) {
    bursts.push({
      kind: "ring",
      x,
      y,
      r: 6,
      max: Math.min(90 + strength * 70, Math.min(window.innerWidth, window.innerHeight) * 0.32),
      life: 1,
      decay: 0.009 / Math.max(strength, 0.5),
      line: 3.5 + strength * 2,
      color: pick([PALETTE.gold, PALETTE.ruby, PALETTE.emerald, PALETTE.champagne]),
    });
  }

  /** Fast diagonal meteors — 5 minute warning */
  function spawnMeteors(count) {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const colors = [PALETTE.ruby, PALETTE.gold, PALETTE.champagne, PALETTE.copper, PALETTE.emerald];
    for (let i = 0; i < count; i += 1) {
      const speed = 5.5 + Math.random() * 6;
      particles.push({
        kind: "meteor",
        x: w * (0.05 + Math.random() * 0.7),
        y: -20 - Math.random() * h * 0.2,
        vx: 2 + Math.random() * 2.5,
        vy: speed,
        length: 28 + Math.random() * 36,
        width: 2.5 + Math.random() * 3,
        life: 1,
        decay: 0.0025 + Math.random() * 0.003,
        color: mixTone(pick(colors)),
      });
    }
  }

  /** Falling confetti — finale accent */
  function spawnConfetti(count) {
    const w = window.innerWidth;
    for (let i = 0; i < count; i += 1) {
      particles.push({
        kind: "confetti",
        x: Math.random() * w,
        y: -20 - Math.random() * 140,
        vx: (Math.random() - 0.5) * 2.8,
        vy: 1.6 + Math.random() * 3.2,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.25,
        w: 8 + Math.random() * 12,
        h: 5 + Math.random() * 8,
        life: 1,
        decay: 0.00045 + Math.random() * 0.0007,
        color: mixTone(pick(PALETTE_LIST.filter((c) => c !== PALETTE.ink))),
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
        if (Math.random() < 0.28) spawnEmbers(8);
        if (Math.random() < 0.1) spawnGlitter(4);
        break;
      case "half":
        if (Math.random() < 0.14) spawnRibbonWave(10 + Math.floor(Math.random() * 6));
        if (Math.random() < 0.1) spawnGlitter(8);
        if (Math.random() < 0.08) spawnEmbers(4);
        break;
      case "ten":
        if (Math.random() < 0.16) {
          const o = burstOrigin();
          spawnBurst(o.x, o.y, 1.25 + Math.random() * 0.5);
        }
        if (Math.random() < 0.08) spawnStars(3);
        break;
      case "five":
        if (Math.random() < 0.24) spawnMeteors(3 + Math.floor(Math.random() * 4));
        if (Math.random() < 0.1) spawnStars(4);
        if (Math.random() < 0.08) {
          const o = burstOrigin();
          spawnBurst(o.x, o.y, 1.15);
        }
        break;
      case "bells":
        if (Math.random() < 0.3) {
          const o = burstOrigin();
          spawnBurst(o.x, o.y, 1.65 + Math.random() * 0.75);
          if (Math.random() < 0.6) spawnRing(o.x, o.y, 1.2 + Math.random() * 0.5);
        }
        if (Math.random() < 0.18) spawnConfetti(14);
        if (Math.random() < 0.14) spawnStars(8);
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
      const bc = b.color || PALETTE.gold;
      if (b.kind === "ring") {
        ctx.strokeStyle = rgba(bc, alpha * 0.9);
        ctx.lineWidth = b.line || 4;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.strokeStyle = rgba(bc, alpha * 0.92);
        ctx.lineWidth = 3.2;
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

      const c = p.color || PALETTE.gold;
      if (p.kind === "ember") {
        p.wobble += 0.08;
        p.x += p.vx + Math.sin(p.wobble) * 0.35;
        p.y += p.vy;
        ctx.fillStyle = rgba(c, a);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = rgba(PALETTE.cream, a * 0.55);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 0.4, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.kind === "ribbon") {
        p.x += p.vx;
        p.y += p.vy + Math.sin(p.x * 0.02) * p.curl * 20;
        ctx.strokeStyle = rgba(c, a * 0.95);
        ctx.lineWidth = p.width;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.quadraticCurveTo(
          p.x - p.vx * 3,
          p.y + 12,
          p.x - Math.sign(p.vx) * p.length,
          p.y + Math.sin(p.x * 0.03) * 20
        );
        ctx.stroke();
      } else if (p.kind === "meteor") {
        p.x += p.vx;
        p.y += p.vy;
        const ang = Math.atan2(p.vy, p.vx);
        const grad = ctx.createLinearGradient(
          p.x,
          p.y,
          p.x - Math.cos(ang) * p.length,
          p.y - Math.sin(ang) * p.length
        );
        grad.addColorStop(0, rgba(PALETTE.cream, a));
        grad.addColorStop(0.35, rgba(c, a));
        grad.addColorStop(1, rgba(c, 0));
        ctx.strokeStyle = grad;
        ctx.lineWidth = p.width;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - Math.cos(ang) * p.length, p.y - Math.sin(ang) * p.length);
        ctx.stroke();
        ctx.fillStyle = rgba(PALETTE.cream, a);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.width * 1.2, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.kind === "confetti") {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.02;
        p.rot += p.vr;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = rgba(c, a);
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      } else if (p.kind === "star") {
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        p.vy += 0.01;
        ctx.fillStyle = rgba(c, a);
        drawStar(p.x, p.y, p.size, p.rot);
      } else if (p.kind === "glitter") {
        p.x += p.vx;
        p.y += p.vy;
        ctx.fillStyle = rgba(c, a);
        ctx.fillRect(p.x, p.y, p.size, p.size);
      } else {
        if (p.drag) {
          p.vx *= p.drag;
          p.vy *= p.drag;
        }
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.015;
        ctx.fillStyle = rgba(c, a);
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

    playWarningSound(id);

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

    // Distinct opening volley — punchy for a big TV, still contained
    switch (cfg.style) {
      case "embers":
        spawnEmbers(200);
        spawnGlitter(70);
        spawnStars(20);
        break;
      case "ribbons":
        spawnRibbonWave(55);
        spawnGlitter(80);
        spawnEmbers(30);
        setTimeout(() => spawnRibbonWave(45), 300);
        setTimeout(() => spawnRibbonWave(40), 700);
        setTimeout(() => spawnRibbonWave(35), 1200);
        break;
      case "fireworks":
        spawnBurst(w * 0.28, h * 0.22, 1.55);
        spawnBurst(w * 0.5, h * 0.16, 1.75);
        spawnBurst(w * 0.72, h * 0.24, 1.55);
        spawnBurst(w * 0.38, h * 0.3, 1.35);
        spawnBurst(w * 0.62, h * 0.28, 1.35);
        spawnStars(80);
        spawnGlitter(40);
        break;
      case "meteors":
        spawnMeteors(40);
        spawnStars(60);
        spawnGlitter(40);
        setTimeout(() => spawnMeteors(32), 280);
        setTimeout(() => spawnMeteors(28), 600);
        setTimeout(() => spawnMeteors(24), 1000);
        break;
      case "finale":
        spawnConfetti(220);
        spawnStars(140);
        spawnGlitter(100);
        spawnEmbers(40);
        for (let i = 0; i < 16; i += 1) {
          const o = burstOrigin();
          spawnBurst(o.x, o.y, 1.75 + Math.random() * 0.7);
          if (i % 2 === 0) spawnRing(o.x, o.y, 1.25 + Math.random() * 0.4);
        }
        break;
      default:
        break;
    }
  }

  function showCountdownCopy() {
    els.headline.textContent = `Countdown to ${targetYear}`;
    els.support.textContent = "Ancrum Fete New Year’s Eve party";
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
      updatePhase(0);
      if (wall >= celebrateUntil) {
        celebrating = false;
        clearEffects();
        showCountdownCopy();
        updatePhase(targetMs - nowWallMs());
      }
    } else {
      render(remaining);
      checkMilestones(remaining);
      updatePhase(remaining);
    }

    if (bannerUntil && wall >= bannerUntil && fxMode !== "bells") {
      hideBanner();
    }

    updateFx();
    rafId = requestAnimationFrame(frame);
  }

  function bindTestMenu() {
    els.testToggle.addEventListener("click", () => {
      unlockAudioFromGesture();
      const open = els.testBody.hidden;
      els.testBody.hidden = !open;
      els.testToggle.setAttribute("aria-expanded", open ? "true" : "false");
    });

    const muteBtn = document.getElementById("mute-toggle");
    if (muteBtn) {
      muteBtn.addEventListener("click", () => {
        unlockAudioFromGesture();
        soundMuted = !soundMuted;
        muteBtn.textContent = soundMuted ? "Sound: off" : "Sound: on";
        muteBtn.setAttribute("aria-pressed", soundMuted ? "true" : "false");
      });
    }

    els.testBody.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-test]");
      if (!btn) return;
      unlockAudioFromGesture();
      const id = btn.getAttribute("data-test");
      if (id === "bells") {
        els.celebrate.hidden = false;
        els.celebrateYear.textContent = String(targetYear);
        document.body.classList.add("is-celebrate");
      } else if (id !== "clear") {
        els.celebrate.hidden = true;
        document.body.classList.remove("is-celebrate");
      }

      if (id === "clear") {
        phaseLockUntil = 0;
        playEffect(id, { testing: true });
        updatePhase(Math.max(0, targetMs - nowWallMs()));
        return;
      }

      const phase = id === "bells" ? "bells" : id;
      const cfg = FX_LADDER[id];
      // Lock atmosphere so the rAF loop doesn't snap back to "day" (~weeks out)
      lockPhase(phase, (cfg && cfg.duration) || 20_000);
      playEffect(id, { testing: true });
    });
  }

  function start() {
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);
    // Browsers need a gesture before sound; unlock on first interaction
    const unlockOnce = () => {
      unlockAudioFromGesture();
      window.removeEventListener("pointerdown", unlockOnce);
      window.removeEventListener("keydown", unlockOnce);
    };
    window.addEventListener("pointerdown", unlockOnce);
    window.addEventListener("keydown", unlockOnce);
    const wall = resyncWallClock();
    retarget(wall);

    // Mark milestones already passed so a late open doesn't fire old warnings
    const remaining = targetMs - wall;
    for (const m of MILESTONES) {
      if (remaining <= m.atMs) firedMilestones.add(m.id);
    }
    updatePhase(remaining);

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
