// effects.js — arena background + hit-impact particle system

const Effects = (() => {
  // ─── particle pool ───
  const particles = [];
  const MAX_PARTICLES = 400;

  // ─── super move overlays ───
  const superMoves = [];

  // ─── screen shake ───
  let shakeIntensity = 0;
  let shakeDuration = 0;
  let shakeTimer = 0;
  let shakeOffsetX = 0;
  let shakeOffsetY = 0;

  // ─── torch particles (replace embers) ───
  const torchParticles = [];
  const TORCH_COUNT = 50;
  for (let i = 0; i < TORCH_COUNT; i++) {
    torchParticles.push({
      x: Math.random() * STAGE_W,
      y: GROUND_Y * 0.3 + Math.random() * GROUND_Y * 0.6,
      vx: (Math.random() - 0.5) * 0.012,
      vy: -(0.008 + Math.random() * 0.018),
      size: 0.8 + Math.random() * 2,
      alpha: 0.1 + Math.random() * 0.45,
      hue: 28 + Math.random() * 22,  // amber-orange range
      flicker: Math.random() * Math.PI * 2,
    });
  }

  // ─── temple columns (foreground + background) ───
  const templeColumns = [
    // far background columns
    { x: 55,  w: 34, h: 260, depth: 0.55, crumble: 0.7 },
    { x: 160, w: 28, h: 210, depth: 0.45, crumble: 0.5 },
    { x: 370, w: 20, h: 180, depth: 0.38, crumble: 0.4 },
    { x: 570, w: 20, h: 195, depth: 0.38, crumble: 0.6 },
    { x: 760, w: 28, h: 220, depth: 0.45, crumble: 0.3 },
    { x: 880, w: 34, h: 250, depth: 0.55, crumble: 0.8 },
  ];

  // ─── distant jungle silhouette points ───
  const junglePoints = [
    [0, 0.52], [55, 0.38], [110, 0.44], [165, 0.32], [210, 0.40],
    [260, 0.28], [310, 0.34], [360, 0.30], [415, 0.26], [460, 0.33],
    [510, 0.24], [555, 0.31], [600, 0.27], [645, 0.22], [690, 0.30],
    [735, 0.26], [790, 0.34], [840, 0.28], [890, 0.36], [940, 0.30],
    [STAGE_W, 0.44],
  ];

  // ─── torch positions on columns ───
  const torches = [
    { x: 70,  y: GROUND_Y - 200 },
    { x: 175, y: GROUND_Y - 162 },
    { x: 780, y: GROUND_Y - 172 },
    { x: 895, y: GROUND_Y - 202 },
  ];


  // ─────────────────────────────────────────────
  //  DRAW BACKGROUND — Ancient Temple Ruins
  // ─────────────────────────────────────────────
  function drawBackground(ctx, now) {
    ctx.save();

    // ── dusky sky gradient (sunset-into-night, warm amber-purple) ──
    const skyGrad = ctx.createLinearGradient(0, 0, 0, STAGE_H);
    skyGrad.addColorStop(0,    "#0e0608");
    skyGrad.addColorStop(0.18, "#1c0c10");
    skyGrad.addColorStop(0.40, "#2b1208");
    skyGrad.addColorStop(0.62, "#3a1c06");
    skyGrad.addColorStop(0.80, "#251008");
    skyGrad.addColorStop(1,    "#130806");
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, STAGE_W, STAGE_H);

    // ── stars (dim, few — it's barely dark) ──
    ctx.save();
    for (let i = 0; i < 30; i++) {
      // stable positions via deterministic seeding trick
      const sx = ((i * 137.5) % 960);
      const sy = ((i * 83.7) % (STAGE_H * 0.35));
      const twinkle = 0.3 + 0.4 * Math.sin(now * 0.0009 + i * 1.3);
      ctx.globalAlpha = twinkle * 0.5;
      ctx.fillStyle = "#ffe8c8";
      ctx.beginPath();
      ctx.arc(sx, sy, 0.7 + (i % 3) * 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    // ── distant rising full moon behind temple ──
    const moonX = 480, moonY = 95, moonR = 52;
    ctx.save();
    // outer glow halo
    const moonHalo = ctx.createRadialGradient(moonX, moonY, moonR, moonX, moonY, moonR * 3.5);
    moonHalo.addColorStop(0,   "rgba(255, 220, 140, 0.14)");
    moonHalo.addColorStop(0.5, "rgba(220, 160, 80,  0.06)");
    moonHalo.addColorStop(1,   "transparent");
    ctx.fillStyle = moonHalo;
    ctx.fillRect(moonX - moonR * 4, moonY - moonR * 4, moonR * 8, moonR * 8);
    // moon disc
    const moonGrad = ctx.createRadialGradient(moonX - 10, moonY - 10, 4, moonX, moonY, moonR);
    moonGrad.addColorStop(0,   "#ffe8b0");
    moonGrad.addColorStop(0.6, "#f0c870");
    moonGrad.addColorStop(1,   "#c89040");
    ctx.fillStyle = moonGrad;
    ctx.shadowColor = "rgba(255, 210, 120, 0.5)";
    ctx.shadowBlur = 30;
    ctx.beginPath();
    ctx.arc(moonX, moonY, moonR, 0, Math.PI * 2);
    ctx.fill();
    // subtle crater marks
    ctx.fillStyle = "rgba(140, 90, 30, 0.18)";
    [[moonX-14, moonY-10, 9], [moonX+16, moonY+12, 7], [moonX+5, moonY-18, 5], [moonX-8, moonY+18, 6]]
      .forEach(([cx, cy, cr]) => { ctx.beginPath(); ctx.arc(cx, cy, cr, 0, Math.PI*2); ctx.fill(); });
    ctx.shadowBlur = 0;
    ctx.restore();

    // ── distant jungle treeline silhouette ──
    ctx.save();
    ctx.fillStyle = "#0c0806";
    ctx.beginPath();
    ctx.moveTo(0, STAGE_H);
    junglePoints.forEach(([px, py]) => ctx.lineTo(px, STAGE_H * py));
    ctx.lineTo(STAGE_W, STAGE_H);
    ctx.closePath();
    ctx.fill();
    // second, slightly lighter layer for depth
    ctx.fillStyle = "#130a06";
    ctx.beginPath();
    ctx.moveTo(0, STAGE_H);
    junglePoints.forEach(([px, py]) => ctx.lineTo(px, STAGE_H * (py + 0.07)));
    ctx.lineTo(STAGE_W, STAGE_H);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // ── background broken temple arch (centre) ──
    ctx.save();
    ctx.globalAlpha = 0.40;
    const archCX = 480, archBaseY = GROUND_Y + 4;
    // left leg
    const legGrad = ctx.createLinearGradient(archCX - 80, 0, archCX - 50, 0);
    legGrad.addColorStop(0, "#2a1a0e"); legGrad.addColorStop(1, "#1a0e06");
    ctx.fillStyle = legGrad;
    ctx.fillRect(archCX - 82, archBaseY - 210, 32, 210);
    // right leg
    ctx.fillRect(archCX + 50, archBaseY - 210, 32, 210);
    // arch top beam (cracked slab)
    ctx.fillStyle = "#2e1c0a";
    ctx.fillRect(archCX - 90, archBaseY - 218, 180, 24);
    // crack on arch
    ctx.strokeStyle = "rgba(0,0,0,0.5)";
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(archCX - 20, archBaseY - 218); ctx.lineTo(archCX, archBaseY - 200); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(archCX + 30, archBaseY - 218); ctx.lineTo(archCX + 12, archBaseY - 198); ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.restore();

    // ── temple columns ──
    for (const col of templeColumns) {
      const baseY = GROUND_Y + 4;
      ctx.save();
      ctx.globalAlpha = col.depth * 0.75;

      // column body with stone gradient
      const colGrad = ctx.createLinearGradient(col.x, 0, col.x + col.w, 0);
      colGrad.addColorStop(0,   "#2e1c0e");
      colGrad.addColorStop(0.35,"#3c2412");
      colGrad.addColorStop(0.65,"#2a180a");
      colGrad.addColorStop(1,   "#1e1008");
      ctx.fillStyle = colGrad;

      // crumbled top — cut off randomly
      const topY = baseY - col.h * col.crumble;
      ctx.fillRect(col.x, topY, col.w, col.h * col.crumble);

      // column cap (if not too crumbled)
      if (col.crumble > 0.45) {
        ctx.fillStyle = "#4a2e14";
        ctx.fillRect(col.x - 5, topY - 10, col.w + 10, 12);
      }

      // horizontal ring grooves on column
      ctx.strokeStyle = "rgba(0,0,0,0.25)";
      ctx.lineWidth = 1;
      for (let gy = topY + 20; gy < baseY; gy += 30) {
        ctx.beginPath();
        ctx.moveTo(col.x, gy);
        ctx.lineTo(col.x + col.w, gy);
        ctx.stroke();
      }

      // edge highlight
      ctx.fillStyle = "rgba(255, 180, 80, 0.07)";
      ctx.fillRect(col.x, topY, 3, col.h * col.crumble);

      // ivy streaks
      ctx.globalAlpha = col.depth * 0.3;
      ctx.strokeStyle = "#1a3a10";
      ctx.lineWidth = 2;
      for (let iv = 0; iv < 3; iv++) {
        const ivX = col.x + 5 + iv * (col.w / 3.5);
        ctx.beginPath();
        ctx.moveTo(ivX, topY + 10);
        ctx.bezierCurveTo(ivX + 6, topY + 40, ivX - 5, topY + 70, ivX + 4, topY + 100);
        ctx.stroke();
      }

      ctx.restore();
    }

    // ── fog / ground mist layers ──
    const fogPhase = now * 0.00006;
    for (let i = 0; i < 4; i++) {
      const fogY   = GROUND_Y - 30 + i * 18;
      const drift  = Math.sin(fogPhase + i * 1.8) * 70;
      const alpha  = 0.05 + i * 0.02;
      const fogGrad = ctx.createLinearGradient(drift, fogY, STAGE_W + drift, fogY + 50);
      fogGrad.addColorStop(0,   "transparent");
      fogGrad.addColorStop(0.25, `rgba(60, 30, 14, ${alpha})`);
      fogGrad.addColorStop(0.75, `rgba(60, 30, 14, ${alpha})`);
      fogGrad.addColorStop(1,   "transparent");
      ctx.fillStyle = fogGrad;
      ctx.fillRect(-100, fogY, STAGE_W + 200, 50);
    }

    // ── stone floor ──
    const groundGrad = ctx.createLinearGradient(0, GROUND_Y, 0, STAGE_H);
    groundGrad.addColorStop(0,   "#2a1a0c");
    groundGrad.addColorStop(0.08,"#1e1208");
    groundGrad.addColorStop(1,   "#0e0804");
    ctx.fillStyle = groundGrad;
    ctx.fillRect(0, GROUND_Y + 4, STAGE_W, STAGE_H - GROUND_Y);

    // stone tile cracks on floor
    ctx.save();
    ctx.strokeStyle = "rgba(0, 0, 0, 0.45)";
    ctx.lineWidth = 1;
    for (let gx = 100; gx < STAGE_W; gx += 140) {
      // vertical crack
      ctx.beginPath();
      ctx.moveTo(gx, GROUND_Y + 4);
      ctx.lineTo(gx + (gx % 280 === 100 ? -8 : 8), STAGE_H);
      ctx.stroke();
      // horizontal hairline
      if (gx % 280 === 100) {
        ctx.beginPath();
        ctx.moveTo(gx - 40, GROUND_Y + 40);
        ctx.lineTo(gx + 60, GROUND_Y + 38);
        ctx.stroke();
      }
    }
    // moss patches (dark green blobs on floor)
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = "#1a3a0c";
    [[140, GROUND_Y + 20, 22, 7], [380, GROUND_Y + 30, 18, 6],
     [590, GROUND_Y + 22, 25, 8], [800, GROUND_Y + 28, 20, 7]]
      .forEach(([mx, my, rw, rh]) => {
        ctx.beginPath();
        ctx.ellipse(mx, my, rw, rh, 0, 0, Math.PI * 2);
        ctx.fill();
      });
    ctx.globalAlpha = 1;
    ctx.restore();

    // glowing floor edge line
    const lineGrad = ctx.createLinearGradient(0, 0, STAGE_W, 0);
    lineGrad.addColorStop(0,   "rgba(180, 80, 20, 0.04)");
    lineGrad.addColorStop(0.25,"rgba(210, 120, 40, 0.40)");
    lineGrad.addColorStop(0.5, "rgba(255, 160, 50, 0.55)");
    lineGrad.addColorStop(0.75,"rgba(210, 120, 40, 0.40)");
    lineGrad.addColorStop(1,   "rgba(180, 80, 20, 0.04)");
    ctx.strokeStyle = lineGrad;
    ctx.lineWidth = 2;
    ctx.shadowColor = "rgba(255, 130, 40, 0.45)";
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.moveTo(0, GROUND_Y + 5); ctx.lineTo(STAGE_W, GROUND_Y + 5);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // ── wall-mounted torches ──
    for (const t of torches) {
      ctx.save();
      // bracket
      ctx.fillStyle = "#3a2010";
      ctx.fillRect(t.x - 4, t.y, 8, 16);
      // bowl glow
      const torchR = ctx.createRadialGradient(t.x, t.y, 2, t.x, t.y, 40);
      const flick = 0.7 + 0.3 * Math.sin(now * 0.008 + t.x);
      torchR.addColorStop(0,   `rgba(255, 200, 80, ${0.55 * flick})`);
      torchR.addColorStop(0.4, `rgba(255, 100, 20, ${0.20 * flick})`);
      torchR.addColorStop(1,   "transparent");
      ctx.fillStyle = torchR;
      ctx.fillRect(t.x - 40, t.y - 40, 80, 80);
      // flame core
      ctx.fillStyle = `rgba(255, 220, 100, ${0.9 * flick})`;
      ctx.shadowColor = "rgba(255, 140, 30, 0.9)";
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.ellipse(t.x, t.y - 5, 5, 9 * flick, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.restore();
    }

    // ── floating dust / spark motes ──
    for (const e of torchParticles) {
      const flicker = 0.5 + 0.5 * Math.sin(now * 0.003 + e.flicker);
      ctx.globalAlpha = e.alpha * flicker;
      ctx.fillStyle = `hsl(${e.hue}, 90%, ${50 + flicker * 25}%)`;
      ctx.shadowColor = `hsl(${e.hue}, 100%, 60%)`;
      ctx.shadowBlur = 5;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.size * (0.5 + flicker * 0.5), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;

    ctx.restore();
  }

  // ─── slow-mo state ───
  let slowMoTimer = 0;
  let slowMoFactor = 1.0;

  function triggerSlowMo(durationMs = 900, factor = 0.25) {
    slowMoTimer = durationMs;
    slowMoFactor = factor;
  }

  function resetSlowMo() {
    slowMoTimer = 0;
    slowMoFactor = 1.0;
  }

  function getSlowMoFactor() {
    if (slowMoTimer > 0) return slowMoFactor;
    return 1.0;
  }

  // ─────────────────────────────────────────────
  //  UPDATE EMBERS
  // ─────────────────────────────────────────────
  function updateEmbers(dt) {
    for (const e of torchParticles) {
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      e.flicker += dt * 0.003;
      if (e.y < -10) { e.y = STAGE_H * 0.8 + Math.random() * 50; e.x = Math.random() * STAGE_W; }
      if (e.x < -10) e.x = STAGE_W + 10;
      if (e.x > STAGE_W + 10) e.x = -10;
    }
  }

  // ─────────────────────────────────────────────
  //  HIT EFFECTS
  // ─────────────────────────────────────────────
  function spawnHitEffect(x, y, type) {
    if (window.Sound) Sound.playHit(type);
    const count = type === "special" ? 30 : type === "kick" ? 20 : type === "grab" ? 18 : 14;
    const baseHue = type === "special" ? 35 : type === "grab" ? 280 : 15; // gold, purple, orange
    const speed = type === "special" ? 0.65 : 0.4;

    // impact sparks
    for (let i = 0; i < count; i++) {
      if (particles.length >= MAX_PARTICLES) particles.shift();
      const angle = Math.random() * Math.PI * 2;
      const v = (0.15 + Math.random() * speed);
      particles.push({
        type: "spark",
        x, y,
        vx: Math.cos(angle) * v,
        vy: Math.sin(angle) * v - 0.15,
        life: 1,
        decay: 0.002 + Math.random() * 0.003,
        size: 1.5 + Math.random() * 3,
        hue: baseHue + Math.random() * 25,
        sat: 90 + Math.random() * 10,
        light: 55 + Math.random() * 30,
      });
    }

    // impact flash ring
    if (particles.length >= MAX_PARTICLES) particles.shift();
    particles.push({
      type: "flash",
      x, y,
      life: 1,
      decay: 0.008,
      radius: type === "special" ? 10 : 6,
      maxRadius: type === "special" ? 60 : 40,
      hue: baseHue,
    });

    // impact text
    const texts = {
      punch: ["POW", "BAM", "HIT"],
      kick: ["WHAM", "CRACK", "THUD"],
      special: ["BOOM", "BLAST", "CRUSH"],
      grab: ["SLAM", "CRUNCH", "GRAB"],
    };
    const textList = texts[type] || texts.punch;
    if (particles.length >= MAX_PARTICLES) particles.shift();
    particles.push({
      type: "text",
      x: x + (Math.random() - 0.5) * 20,
      y: y - 20,
      vy: -0.06,
      life: 1,
      decay: 0.0025,
      text: textList[Math.floor(Math.random() * textList.length)],
      hue: baseHue,
      size: type === "special" ? 28 : 22,
      rotation: (Math.random() - 0.5) * 0.3,
    });

    // screen shake
    const shakeSize = type === "special" ? 8 : type === "kick" ? 5 : 3;
    triggerShake(shakeSize, 200);
  }

  function spawnBlockEffect(x, y) {
    if (window.Sound) Sound.playBlock();
    for (let i = 0; i < 6; i++) {
      if (particles.length >= MAX_PARTICLES) particles.shift();
      const angle = -Math.PI * 0.5 + (Math.random() - 0.5) * 1.2;
      particles.push({
        type: "spark",
        x, y,
        vx: Math.cos(angle) * 0.2,
        vy: Math.sin(angle) * 0.2,
        life: 1,
        decay: 0.005,
        size: 1 + Math.random() * 2,
        hue: 200,
        sat: 60,
        light: 70,
      });
    }
    triggerShake(2, 100);
  }

  // ─────────────────────────────────────────────
  //  SUPER MOVES
  // ─────────────────────────────────────────────

  // P1 Kamehameha — a charged energy beam
  function triggerKamehameha(fromFighter, targetFighter, onHitCallback) {
    superMoves.push({
      type: "kamehameha",
      phase: "charge",   // charge -> beam -> fade
      timer: 0,
      chargeDuration: 700,
      beamDuration: 600,
      fadeDuration: 300,
      x: fromFighter.x,
      y: fromFighter.y - 55,
      dir: fromFighter.facing,
      hitApplied: false,
      onHit: onHitCallback,
      targetFighter,
      fromFighter,
    });
    triggerShake(6, 300);
  }

  // P2 Asteroid Rain — meteors crash from the sky
  function triggerAsteroidRain(targetFighter, onHitCallback) {
    const asteroids = [];
    const count = 6;
    for (let i = 0; i < count; i++) {
      const targetX = targetFighter.x + (Math.random() - 0.5) * 140;
      asteroids.push({
        x: targetX - 100 + Math.random() * 200,
        y: -40 - i * 60,
        vy: 1.5 + Math.random() * 0.8,
        radius: 16 + Math.random() * 14,
        hit: false,
        delay: i * 110,
        elapsed: 0,
        targetX,
      });
    }
    superMoves.push({
      type: "asteroidRain",
      timer: 0,
      totalDuration: 2000,
      asteroids,
      hitApplied: false,
      onHit: onHitCallback,
      targetFighter,
      warningAlpha: 0,
      done: false,
    });
  }

  function updateSuperMoves(dt) {
    for (let i = superMoves.length - 1; i >= 0; i--) {
      const s = superMoves[i];
      s.timer += dt;

      if (s.type === "kamehameha") {
        if (s.phase === "charge" && s.timer >= s.chargeDuration) {
          s.phase = "beam";
          s.timer = 0;
          triggerShake(14, 600);
        } else if (s.phase === "beam" && s.timer >= s.beamDuration) {
          s.phase = "fade";
          s.timer = 0;
        } else if (s.phase === "fade" && s.timer >= s.fadeDuration) {
          superMoves.splice(i, 1);
          continue;
        }
        // apply hit once beam starts
        if (s.phase === "beam" && !s.hitApplied) {
          s.hitApplied = true;
          if (s.onHit) s.onHit();
          // spawn beam impact sparks
          const bx = s.dir === 1 ? STAGE_W - 20 : 20;
          for (let j = 0; j < 60; j++) {
            if (particles.length >= MAX_PARTICLES) particles.shift();
            const angle = Math.random() * Math.PI * 2;
            particles.push({
              type: "spark",
              x: bx, y: s.y + (Math.random() - 0.5) * 60,
              vx: Math.cos(angle) * (0.2 + Math.random() * 0.6),
              vy: Math.sin(angle) * (0.2 + Math.random() * 0.6) - 0.2,
              life: 1, decay: 0.001 + Math.random() * 0.002,
              size: 2 + Math.random() * 5,
              hue: 180 + Math.random() * 40, sat: 100, light: 65,
            });
          }
        }
        // spawn charge particles during charge phase
        if (s.phase === "charge") {
          for (let j = 0; j < 3; j++) {
            if (particles.length >= MAX_PARTICLES) particles.shift();
            const angle = Math.random() * Math.PI * 2;
            const r = 20 + Math.random() * 30;
            particles.push({
              type: "spark",
              x: s.x + Math.cos(angle) * r,
              y: s.y + Math.sin(angle) * r,
              vx: -Math.cos(angle) * 0.1,
              vy: -Math.sin(angle) * 0.1,
              life: 1, decay: 0.004 + Math.random() * 0.003,
              size: 2 + Math.random() * 4,
              hue: 180 + Math.random() * 60, sat: 100, light: 65,
            });
          }
        }
      }

      if (s.type === "asteroidRain") {
        if (s.timer >= s.totalDuration) {
          superMoves.splice(i, 1);
          continue;
        }
        let allLanded = true;
        for (const ast of s.asteroids) {
          ast.elapsed += dt;
          if (ast.elapsed < ast.delay) { allLanded = false; continue; }
          const active = ast.elapsed - ast.delay;
          ast.y += ast.vy * dt;
          if (ast.y < GROUND_Y && !ast.hit) allLanded = false;
          if (ast.y >= GROUND_Y - ast.radius && !ast.hit) {
            ast.hit = true;
            ast.y = GROUND_Y - ast.radius;
            triggerShake(10, 250);
            // explosion sparks
            for (let j = 0; j < 35; j++) {
              if (particles.length >= MAX_PARTICLES) particles.shift();
              const angle = Math.random() * Math.PI * 2;
              particles.push({
                type: "spark",
                x: ast.x, y: GROUND_Y - 10,
                vx: Math.cos(angle) * (0.15 + Math.random() * 0.5),
                vy: Math.sin(angle) * 0.5 - Math.random() * 0.6,
                life: 1, decay: 0.0015 + Math.random() * 0.003,
                size: 3 + Math.random() * 6,
                hue: 25 + Math.random() * 30, sat: 100, light: 60,
              });
            }
          }
        }
        // apply damage once first asteroid lands
        if (!s.hitApplied && s.asteroids.some(a => a.hit)) {
          s.hitApplied = true;
          if (s.onHit) s.onHit();
        }
      }
    }
  }

  function drawSuperMoves(ctx, now) {
    for (const s of superMoves) {
      if (s.type === "kamehameha") {
        ctx.save();
        if (s.phase === "charge") {
          const prog = s.timer / s.chargeDuration;
          // charging aura around P1
          const grd = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, 60 * prog);
          grd.addColorStop(0, `rgba(80, 255, 240, ${0.7 * prog})`);
          grd.addColorStop(0.5, `rgba(0, 200, 255, ${0.4 * prog})`);
          grd.addColorStop(1, `rgba(0, 100, 200, 0)`);
          ctx.fillStyle = grd;
          ctx.beginPath();
          ctx.arc(s.x, s.y, 60 * prog, 0, Math.PI * 2);
          ctx.fill();

          // charge text
          ctx.globalAlpha = Math.min(1, prog * 2);
          ctx.font = `bold ${24 + prog * 14}px "Bebas Neue", sans-serif`;
          ctx.textAlign = "center";
          ctx.fillStyle = `hsl(185, 100%, 75%)`;
          ctx.shadowColor = "#00eeff";
          ctx.shadowBlur = 20;
          ctx.fillText("KAME...", s.x, s.y - 80 - prog * 10);
        } else if (s.phase === "beam") {
          const prog = s.timer / s.beamDuration;
          const beamW = 50 + Math.sin(now * 0.03) * 8;
          const beamX = s.dir === 1 ? s.x : 0;
          const beamLen = s.dir === 1 ? STAGE_W - s.x : s.x;
          const alpha = 1 - prog * 0.3;

          // outer glow
          const beamGrd = ctx.createLinearGradient(beamX, 0, beamX + (s.dir === 1 ? beamLen : -beamLen), 0);
          beamGrd.addColorStop(0, `rgba(0, 240, 255, ${0.6 * alpha})`);
          beamGrd.addColorStop(0.5, `rgba(100, 255, 255, ${0.9 * alpha})`);
          beamGrd.addColorStop(1, `rgba(200, 255, 255, ${0.3 * alpha})`);

          ctx.globalAlpha = alpha;
          ctx.shadowColor = "#00eeff";
          ctx.shadowBlur = 40;
          ctx.fillStyle = beamGrd;
          ctx.fillRect(s.dir === 1 ? s.x : 0, s.y - beamW / 2, beamLen, beamW);

          // core white beam
          ctx.globalAlpha = alpha * 0.9;
          ctx.fillStyle = "rgba(220, 255, 255, 0.9)";
          ctx.fillRect(s.dir === 1 ? s.x : 0, s.y - beamW * 0.25, beamLen, beamW * 0.5);

          // screen white flash at start
          if (prog < 0.15) {
            ctx.globalAlpha = (0.15 - prog) / 0.15 * 0.5;
            ctx.fillStyle = "#fff";
            ctx.fillRect(0, 0, STAGE_W, STAGE_H);
          }

          // HAAAAAA text
          ctx.globalAlpha = alpha;
          ctx.font = `bold ${36 - prog * 10}px "Bebas Neue", sans-serif`;
          ctx.textAlign = "center";
          ctx.fillStyle = "#fff";
          ctx.shadowColor = "#00eeff";
          ctx.shadowBlur = 20;
          ctx.fillText("KAMEHAMEHA!", s.x, s.y - 70);
        } else if (s.phase === "fade") {
          const alpha = 1 - s.timer / s.fadeDuration;
          ctx.globalAlpha = alpha * 0.3;
          ctx.fillStyle = "rgba(0, 200, 255, 0.5)";
          const bLen = s.dir === 1 ? STAGE_W - s.x : s.x;
          ctx.fillRect(s.dir === 1 ? s.x : 0, s.y - 20, bLen, 40);
        }
        ctx.restore();
      }

      if (s.type === "asteroidRain") {
        ctx.save();
        const totalProg = s.timer / s.totalDuration;

        // warning flash at beginning
        if (totalProg < 0.18) {
          ctx.globalAlpha = Math.sin(totalProg / 0.18 * Math.PI * 4) * 0.25;
          ctx.fillStyle = "#ff4400";
          ctx.fillRect(0, 0, STAGE_W, STAGE_H);
        }

        // draw asteroids
        for (const ast of s.asteroids) {
          if (ast.elapsed < ast.delay) continue;
          const active = ast.elapsed - ast.delay;
          const alpha = ast.hit ? Math.max(0, 1 - (active - 400) / 400) : 1;
          ctx.globalAlpha = alpha;

          if (!ast.hit) {
            // draw trail
            const trailLen = 80;
            const trailGrd = ctx.createLinearGradient(ast.x, ast.y - trailLen, ast.x, ast.y);
            trailGrd.addColorStop(0, "rgba(255, 120, 30, 0)");
            trailGrd.addColorStop(1, "rgba(255, 200, 80, 0.7)");
            ctx.fillStyle = trailGrd;
            ctx.fillRect(ast.x - 6, ast.y - trailLen, 12, trailLen);
          }

          // asteroid body
          ctx.shadowColor = "#ff6600";
          ctx.shadowBlur = 20;
          const grad = ctx.createRadialGradient(ast.x - ast.radius * 0.3, ast.y - ast.radius * 0.3, 0, ast.x, ast.y, ast.radius);
          grad.addColorStop(0, "#ffcc55");
          grad.addColorStop(0.4, "#cc4400");
          grad.addColorStop(1, "#330a00");
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(ast.x, ast.y, ast.radius * (ast.hit ? 1 + (ast.elapsed - ast.delay) * 0.0005 : 1), 0, Math.PI * 2);
          ctx.fill();

          // impact crater if hit
          if (ast.hit) {
            ctx.globalAlpha = alpha * 0.5;
            ctx.strokeStyle = "#ff6600";
            ctx.lineWidth = 3;
            ctx.shadowBlur = 20;
            for (let r = 1; r <= 3; r++) {
              ctx.beginPath();
              ctx.arc(ast.x, GROUND_Y, ast.radius * r, 0, Math.PI * 2);
              ctx.stroke();
            }
          }
        }

        // ASTEROID RAIN title
        if (totalProg < 0.4) {
          const textAlpha = Math.sin(totalProg / 0.4 * Math.PI);
          ctx.globalAlpha = textAlpha;
          ctx.font = `bold 48px "Bebas Neue", sans-serif`;
          ctx.textAlign = "center";
          ctx.fillStyle = "#ff6600";
          ctx.shadowColor = "#ff2200";
          ctx.shadowBlur = 30;
          ctx.fillText("ASTEROID RAIN!", STAGE_W / 2, 80);
        }

        ctx.restore();
      }
    }
  }

  function isSuperActive() { return superMoves.length > 0; }

  // ─────────────────────────────────────────────
  //  UPDATE & DRAW PARTICLES
  // ─────────────────────────────────────────────
  function update(dt) {
    updateEmbers(dt);
    updateSuperMoves(dt);

    // screen shake
    if (shakeTimer > 0) {
      shakeTimer -= dt;
      const progress = shakeTimer / shakeDuration;
      const intensity = shakeIntensity * progress;
      shakeOffsetX = (Math.random() - 0.5) * intensity * 2;
      shakeOffsetY = (Math.random() - 0.5) * intensity * 2;
    } else {
      shakeOffsetX = 0;
      shakeOffsetY = 0;
    }

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= p.decay * dt;
      if (p.life <= 0) { particles.splice(i, 1); continue; }

      if (p.type === "spark") {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 0.0008 * dt; // gravity on sparks
        p.vx *= 0.995;
      } else if (p.type === "flash") {
        p.radius += (p.maxRadius - p.radius) * 0.08;
      } else if (p.type === "text") {
        p.y += (p.vy || 0) * dt;
      }
    }
  }

  function draw(ctx) {
    ctx.save();
    for (const p of particles) {
      if (p.type === "spark") {
        ctx.globalAlpha = p.life * 0.9;
        ctx.fillStyle = `hsl(${p.hue}, ${p.sat}%, ${p.light}%)`;
        ctx.shadowColor = `hsl(${p.hue}, 100%, 60%)`;
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.type === "flash") {
        ctx.globalAlpha = p.life * 0.6;
        ctx.strokeStyle = `hsl(${p.hue}, 100%, 80%)`;
        ctx.shadowColor = `hsl(${p.hue}, 100%, 70%)`;
        ctx.shadowBlur = 20;
        ctx.lineWidth = 3 * p.life;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.stroke();

        // inner white flash
        ctx.globalAlpha = p.life * 0.4;
        ctx.fillStyle = `rgba(255, 255, 255, ${p.life * 0.5})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius * 0.3 * p.life, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.type === "text") {
        ctx.globalAlpha = p.life;
        ctx.font = `bold ${p.size}px "Bebas Neue", "Arial Narrow", sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation || 0);

        // black outline
        ctx.strokeStyle = "rgba(0, 0, 0, 0.8)";
        ctx.lineWidth = 4;
        ctx.strokeText(p.text, 0, 0);

        // colored fill
        ctx.fillStyle = `hsl(${p.hue}, 100%, 65%)`;
        ctx.shadowColor = `hsl(${p.hue}, 100%, 55%)`;
        ctx.shadowBlur = 12;
        ctx.fillText(p.text, 0, 0);
        ctx.restore();
      }
    }
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
    ctx.restore();

    // draw super move overlays on top
    drawSuperMoves(ctx, performance.now());
  }

  function triggerShake(intensity, duration) {
    shakeIntensity = Math.max(shakeIntensity, intensity);
    shakeDuration = duration;
    shakeTimer = duration;
  }

  function getShakeOffset() {
    return { x: shakeOffsetX, y: shakeOffsetY };
  }

  return {
    drawBackground,
    spawnHitEffect,
    spawnBlockEffect,
    update,
    draw,
    getShakeOffset,
    triggerSlowMo,
    resetSlowMo,
    getSlowMoFactor,
    triggerKamehameha,
    triggerAsteroidRain,
    isSuperActive,
  };
})();
