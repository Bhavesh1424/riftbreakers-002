// game.js — orchestrates input, physics, AI/Local controllers, rounds, HUD, and audio/visual effects.

(() => {
  const canvas = document.getElementById("stage");
  const ctx = canvas.getContext("2d");

  const p1 = new Fighter("KADE", 300, "#33d6c4", 1);
  const p2 = new Fighter("VEX", 660, "#e0334f", -1);

  // Dynamic player role and controls assignments
  let humanFighter = p1;     // controlled by human in VS AI mode
  let aiFighter = p2;        // controlled by VEX in VS AI mode
  let p1ControlTarget = p1;  // fighter controlled by P1 (WASD) keys
  let p2ControlTarget = p2;  // fighter controlled by P2 (Arrows/Numpad) keys

  const FAR_RANGE = 260;
  const NEAR_RANGE = 95;
  const ROUND_TIME = 60; // seconds
  const REACT_LEAD_MS = 70; // AI can react this many ms before an attack goes active

  let gameMode = "ai"; // "ai" | "local"

  // ---------------- difficulty system ----------------
  const DIFFICULTY = {
    easy:   { aiTickInterval: 800, reflexBase: 0.06, reflexRoundBonus: 0.02, reflexCap: 0.45, confScale: 0.5, aiDamageMult: 0.7, label: "EASY" },
    medium: { aiTickInterval: 550, reflexBase: 0.16, reflexRoundBonus: 0.04, reflexCap: 0.85, confScale: 1.0, aiDamageMult: 1.0, label: "MEDIUM" },
    hard:   { aiTickInterval: 350, reflexBase: 0.30, reflexRoundBonus: 0.06, reflexCap: 0.95, confScale: 1.5, aiDamageMult: 1.3, label: "HARD" },
  };
  let currentDifficulty = "medium";
  function diff() { return DIFFICULTY[currentDifficulty]; }

  let match = { p1Wins: 0, p2Wins: 0, round: 1, best: 2 };
  let timeLeft = ROUND_TIME;
  let phase = "menu"; // menu | difficulty | localSetup | intro | fighting | roundEnd | matchEnd
  let lastTs = 0;

  let aiKnowledge = null; // last summary from the backend
  let aiTickTimer = 0;
  let aiIntent = null;
  let aiIntentHoldUntil = 0;
  let aiThinking = false;

  const keys = new Set();

  // ---------------- input ----------------
  window.addEventListener("keydown", (e) => {
    if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
    if (keys.has(e.code)) return;
    keys.add(e.code);
    handleKeyDown(e.code);
  });
  window.addEventListener("keyup", (e) => { keys.delete(e.code); handleKeyUp(e.code); });

  function handleKeyDown(code) {
    if (phase !== "fighting") return;

    // Player 1 controls (WASD / J/K/L/G/T)
    if (gameMode === "local" || (gameMode === "ai" && humanFighter === p1ControlTarget)) {
      switch (code) {
        case "KeyJ": tryPlayerAttack(p1ControlTarget, "punch"); break;
        case "KeyK": tryPlayerAttack(p1ControlTarget, "kick"); break;
        case "KeyL": tryPlayerAttack(p1ControlTarget, "special"); break;
        case "KeyG": tryPlayerAttack(p1ControlTarget, "grab"); break;
        case "KeyT": tryPlayerSuper(p1ControlTarget, p1ControlTarget === p1 ? p2 : p1); break;
        case "Space": p1ControlTarget.dodge(); if (gameMode === "ai") Network.playerAction("dodge", "n/a", dist()); break;
        case "KeyW": p1ControlTarget.jump(); break;
        case "KeyS": p1ControlTarget.setBlocking(true); break;
      }
    }

    // Player 2 controls (Arrows / Numpad / I/O/P/U/Y)
    if (gameMode === "local" || (gameMode === "ai" && humanFighter === p2ControlTarget)) {
      switch (code) {
        case "Numpad1": case "KeyI": tryPlayerAttack(p2ControlTarget, "punch"); break;
        case "Numpad2": case "KeyO": tryPlayerAttack(p2ControlTarget, "kick"); break;
        case "Numpad3": case "KeyP": tryPlayerAttack(p2ControlTarget, "special"); break;
        case "Numpad4": case "KeyU": tryPlayerAttack(p2ControlTarget, "grab"); break;
        case "Numpad5": case "KeyY": tryPlayerSuper(p2ControlTarget, p2ControlTarget === p1 ? p2 : p1); break;
        case "Numpad0": case "ShiftRight": p2ControlTarget.dodge(); break;
        case "ArrowUp": p2ControlTarget.jump(); break;
        case "ArrowDown": p2ControlTarget.setBlocking(true); break;
      }
    }
  }

  function handleKeyUp(code) {
    if (code === "KeyS") p1ControlTarget.setBlocking(false);
    if (code === "ArrowDown") p2ControlTarget.setBlocking(false);
  }

  function tryPlayerAttack(fighter, type) {
    const started = fighter.attack(type);
    if (started && fighter === humanFighter && gameMode === "ai") {
      Network.playerAction(type, "n/a", dist());
    }
  }

  function tryPlayerSuper(attacker, defender) {
    if (!attacker.superReady || attacker.superUsed) return;
    if (Effects.isSuperActive()) return;
    attacker.superUsed = true;
    attacker.superReady = false;
    attacker.superComboHits = 0; // drain the bar so it must be re-earned
    updateSuperHud();

    // Trigger Super based on Color: Blue is Kamehameha, Red is Asteroid Rain
    if (attacker.color === "#33d6c4") {
      // Kamehameha for Blue
      Effects.triggerKamehameha(attacker, defender, () => {
        const dmg = Math.round(defender.health * 0.25); // 25% of current health
        defender.health = Math.max(1, defender.health - dmg);
        defender.state = "hitstun";
        defender.stateTimer = 0;
        defender.hitstunDuration = 1500; // 1.5-second super stun
        Effects.spawnHitEffect((attacker.x + defender.x) / 2, defender.y - 50, "special");
      });
    } else {
      // Asteroid Rain for Red
      Effects.triggerAsteroidRain(defender, () => {
        const dmg = Math.round(defender.health * 0.25); // 25% of current health
        defender.health = Math.max(1, defender.health - dmg);
        defender.state = "hitstun";
        defender.stateTimer = 0;
        defender.hitstunDuration = 1500; // 1.5-second super stun
        Effects.spawnHitEffect(defender.x, defender.y - 50, "special");
      });
    }
  }

  function updateMovement() {
    // Player 1 controls (WASD) movement
    if (p1ControlTarget.canAct()) {
      if (gameMode === "local" || (gameMode === "ai" && humanFighter === p1ControlTarget)) {
        const left = keys.has("KeyA");
        const right = keys.has("KeyD");
        if (left && !right) p1ControlTarget.setWalk(-1);
        else if (right && !left) p1ControlTarget.setWalk(1);
        else p1ControlTarget.stopWalk();
      }
    }

    // Player 2 controls (Arrows) movement
    if (p2ControlTarget.canAct()) {
      if (gameMode === "local" || (gameMode === "ai" && humanFighter === p2ControlTarget)) {
        const left = keys.has("ArrowLeft");
        const right = keys.has("ArrowRight");
        if (left && !right) p2ControlTarget.setWalk(-1);
        else if (right && !left) p2ControlTarget.setWalk(1);
        else p2ControlTarget.stopWalk();
      }
    }
  }

  // ---------------- helpers ----------------
  function dist() { return Math.abs(p1.x - p2.x); }

  function readText(summary) {
    if (gameMode === "local") return "Local 1v1 Battle";
    if (!summary || summary.totalActions < 6) return "observing…";
    const moveLabel = { punch: "puncher", kick: "kicker", special: "special-happy", grab: "grab-happy" }[summary.preferredMove] || "balanced";
    if (summary.blockRate > 0.4) return `turtles a lot — expect grabs`;
    if (summary.whiffPunishRate > 0.5) return `punishes whiffs — Vex plays safer`;
    return `reads you as a ${moveLabel}`;
  }

  // ---------------- AI controller ----------------
  function aiDecideFallback(gameState) {
    const k = aiKnowledge;
    const d = diff();
    const weights = { advance: 1, retreat: 0.4, punch: 2, kick: 1.6, special: gameState.aiSpecialReady ? 1 : 0, grab: gameState.distance <= NEAR_RANGE ? 0.6 : 0, block: 1, dodge: 1 };
    if (gameState.distance > FAR_RANGE) { weights.advance += 3; weights.punch = 0; weights.kick = 0; weights.grab = 0; }
    if (k) {
      const conf = Math.min(1, (k.totalActions || 0) / 8) * d.confScale;
      weights.grab += conf * (k.blockRate || 0) * 5;
      weights.block += conf * (k.whiffPunishRate || 0) * 1.5;
      if (k.preferredMove === "kick") weights.dodge += conf * 2;
      if (k.preferredMove === "punch") weights.block += conf * 1.8;
    }
    const entries = Object.entries(weights).filter(([, w]) => w > 0);
    const total = entries.reduce((s, [, w]) => s + w, 0) || 1;
    let r = Math.random() * total;
    for (const [a, w] of entries) { r -= w; if (r <= 0) return a; }
    return "block";
  }

  async function refreshAiIntent() {
    if (aiThinking || gameMode !== "ai") return;
    aiThinking = true;
    const aiSpecialReady = performance.now() >= aiFighter.specialCooldownUntil && aiFighter.specialMeter >= 30;
    const gameState = {
      distance: dist(),
      aiSpecialReady,
      aiHealthPct: aiFighter.healthPct,
      playerHealthPct: humanFighter.healthPct,
      farRange: FAR_RANGE,
      nearRange: NEAR_RANGE,
    };
    let action = await Network.requestDecision(gameState);
    if (!action) action = aiDecideFallback(gameState);
    aiIntent = action;
    aiIntentHoldUntil = performance.now() + 420 + Math.random() * 260;
    aiThinking = false;
  }

  function runAiIntent() {
    if (gameMode !== "ai" || !aiFighter.canAct() || !aiIntent) return;
    const d = dist();
    const moveDef = MOVES[aiIntent];

    // AI activates its super move when ready and not in a critical block/dodge state
    if (aiFighter.superReady && !aiFighter.superUsed && !Effects.isSuperActive() && Math.random() < 0.04) {
      tryPlayerSuper(aiFighter, humanFighter);
      return;
    }

    switch (aiIntent) {
      case "advance": aiFighter.setWalk(humanFighter.x > aiFighter.x ? 1 : -1); break;
      case "retreat": aiFighter.setWalk(humanFighter.x > aiFighter.x ? -1 : 1); break;
      case "block": aiFighter.setBlocking(true); break;
      case "dodge": aiFighter.dodge(); aiIntent = null; break;
      case "punch": case "kick": case "special": case "grab": {
        if (d > moveDef.range + 12) { aiFighter.setWalk(humanFighter.x > aiFighter.x ? 1 : -1); }
        else { aiFighter.stopWalk(); if (aiFighter.attack(aiIntent)) aiIntent = null; }
        break;
      }
      default: aiFighter.stopWalk();
    }

    if (aiIntent === "block" && performance.now() > aiIntentHoldUntil) { aiFighter.setBlocking(false); aiIntent = null; }
  }

  function aiReflexCheck() {
    if (gameMode !== "ai" || humanFighter.state !== "attack" || humanFighter._reacted || !aiFighter.canAct()) return;
    const move = MOVES[humanFighter.currentMove];
    if (humanFighter.moveElapsed < move.startup - REACT_LEAD_MS) return;
    if (humanFighter.moveElapsed > move.startup + 10) { humanFighter._reacted = true; return; }
    if (dist() > move.range + 30) return;

    humanFighter._reacted = true;
    const d = diff();
    let chance = d.reflexBase + d.reflexRoundBonus * match.round;
    if (aiKnowledge) {
      const conf = Math.min(1, (aiKnowledge.totalActions || 0) / 8) * d.confScale;
      if (aiKnowledge.preferredMove === humanFighter.currentMove) chance += 0.3 * conf;
    }
    chance = Math.min(d.reflexCap, chance);

    if (Math.random() < chance) {
      if (humanFighter.currentMove === "grab") aiFighter.dodge();
      else Math.random() < 0.6 ? aiFighter.setBlocking(true) : aiFighter.dodge();
      aiIntent = null;
    }
  }

  // ---------------- combat resolution ----------------
  function resolveAttacks() {
    const d = diff();
    for (const [attacker, defender] of [[p1, p2], [p2, p1]]) {
      const hb = attacker.activeHitbox();
      if (!hb || attacker._hitApplied) continue;
      if (aabbOverlap(hb, defender.hurtbox())) {
        attacker._hitApplied = true;
        // apply difficulty damage multiplier for AI attacks in AI mode
        const dmg = (attacker === aiFighter && gameMode === "ai") ? Math.round(hb.damage * d.aiDamageMult) : hb.damage;
        const chipDmg = (attacker === aiFighter && gameMode === "ai") ? Math.round(hb.chip * d.aiDamageMult) : hb.chip;
        const outcome = defender.takeHit({ damage: dmg, chip: chipDmg, pushback: hb.pushback, beatsBlock: hb.beatsBlock, fromX: attacker.x });

        // ── spawn hit/block effects ──
        const impactX = (attacker.x + defender.x) / 2;
        const impactY = defender.y - 50;
        if (outcome.result === "hit") {
          Effects.spawnHitEffect(impactX, impactY, attacker.currentMove || "punch");
        } else if (outcome.result === "blocked") {
          Effects.spawnBlockEffect(impactX, impactY);
        }

        if (attacker === aiFighter && gameMode === "ai") {
          Network.aiAttackOutcome(outcome.result === "hit" ? "hit" : outcome.result === "blocked" ? "blocked" : "dodged");
        }
        if (outcome.result === "hit") {
          const combo = attacker.registerComboHit(performance.now());
          if (combo >= 2) showCombo(combo);
          updateSuperHud();
        }
      }
    }
    // whiff detection for AI learning
    if (gameMode === "ai") {
      for (const attacker of [p1, p2]) {
        if (attacker.state !== "attack" && attacker._pendingWhiffCheck) {
          attacker._pendingWhiffCheck = false;
          if (!attacker._hitApplied && attacker === aiFighter) Network.aiWhiff();
        }
        if (attacker.state === "attack") attacker._pendingWhiffCheck = true;
      }
    }
  }

  function showCombo(n) {
    const el = document.getElementById("combo-toast");
    el.textContent = `${n} HIT COMBO`;
    el.classList.remove("show");
    void el.offsetWidth;
    el.classList.add("show");
  }

  // ---------------- HUD ----------------
  function updateHud() {
    const p1h = document.getElementById("p1-health");
    const p2h = document.getElementById("p2-health");
    p1h.style.width = `${p1.healthPct * 100}%`;
    p2h.style.width = `${p2.healthPct * 100}%`;
    p1h.classList.toggle("low", p1.healthPct < 0.25);
    p2h.classList.toggle("low", p2.healthPct < 0.25);
    document.getElementById("p1-crack").style.opacity = 1 - p1.healthPct;
    document.getElementById("p2-crack").style.opacity = 1 - p2.healthPct;
    document.getElementById("timer").textContent = Math.max(0, Math.ceil(timeLeft));

    document.getElementById("p1-name-display").textContent = p1.name;
    document.getElementById("p2-name-display").textContent = p2.name;
    document.getElementById("p2-tag-display").textContent = gameMode === "ai" ? "AI" : "P2";

    document.getElementById("ai-read-label").textContent = gameMode === "ai" ? "AI READ" : "MODE";
    document.getElementById("ai-read-text").textContent = readText(aiKnowledge);

    updateSuperHud();
  }

  function updateSuperHud() {
    const p1Bar = document.getElementById("p1-super-fill");
    const p2Bar = document.getElementById("p2-super-fill");
    if (p1Bar) {
      p1Bar.style.width = `${p1.superMeterPct * 100}%`;
      p1Bar.classList.toggle("super-ready", p1.superReady && !p1.superUsed);
    }
    if (p2Bar) {
      p2Bar.style.width = `${p2.superMeterPct * 100}%`;
      p2Bar.classList.toggle("super-ready", p2.superReady && !p2.superUsed);
    }
    // show super-ready badge
    const p1badge = document.getElementById("p1-super-badge");
    const p2badge = document.getElementById("p2-super-badge");
    if (p1badge) p1badge.style.display = (p1.superReady && !p1.superUsed) ? "block" : "none";
    if (p2badge) p2badge.style.display = (p2.superReady && !p2.superUsed) ? "block" : "none";
  }

  function renderDots() {
    for (const [id, wins] of [["p1-dots", match.p1Wins], ["p2-dots", match.p2Wins]]) {
      const el = document.getElementById(id);
      el.innerHTML = "";
      for (let i = 0; i < match.best; i++) {
        const dot = document.createElement("span");
        dot.className = "dot" + (i < wins ? " won" : "");
        el.appendChild(dot);
      }
    }
  }

  // ---------------- round / match flow ----------------
  function startRound() {
    Effects.resetSlowMo(); // Guarantee 100% normal speed for the new round
    p1.resetForRound(300, 1);
    p2.resetForRound(660, -1);
    updateSuperHud();
    timeLeft = ROUND_TIME;
    phase = "intro";
    document.getElementById("round-callout").textContent = `ROUND ${match.round}`;
    const fc = document.getElementById("fight-callout");
    fc.textContent = ""; fc.classList.remove("show");
    document.getElementById("overlay-round").classList.remove("hidden");

    if (match.round === 1 && gameMode !== "online") {
      // Play start banter on round 1 start for local/AI modes
      if (window.Sound) {
        Sound.playStartBanter(p1, p2, p1.color === "#33d6c4", () => {
          fc.textContent = "FIGHT!";
          fc.classList.add("show");
          setTimeout(() => {
            document.getElementById("overlay-round").classList.add("hidden");
            phase = "fighting";
          }, 750);
        });
      } else {
        setTimeout(() => {
          fc.textContent = "FIGHT!";
          fc.classList.add("show");
        }, 750);
        setTimeout(() => {
          document.getElementById("overlay-round").classList.add("hidden");
          phase = "fighting";
        }, 1500);
      }
    } else {
      // Deterministic quick start for online mode and subsequent rounds
      setTimeout(() => {
        fc.textContent = "FIGHT!";
        fc.classList.add("show");
      }, 500);
      setTimeout(() => {
        document.getElementById("overlay-round").classList.add("hidden");
        phase = "fighting";
      }, 1200);
    }
  }

  function endRound() {
    if (phase === "roundEnd" || phase === "matchEnd") return;
    phase = "roundEnd";

    const isKO = p1.health <= 0 || p2.health <= 0;
    const playerWon = p2.health <= 0 || (timeLeft <= 0 && p1.health > p2.health);
    const draw = timeLeft <= 0 && p1.health === p2.health;
    if (!draw) { if (playerWon) match.p1Wins++; else match.p2Wins++; }
    renderDots();
    if (gameMode === "ai") Network.roundEnd(playerWon);

    let delay = 900;

    if (isKO) {
      delay = 2000; // slightly longer delay to play the win mock speech
      Effects.triggerSlowMo(1200, 0.2); // Slowmo ONLY AFTER THE KO HIT LANDS
      if (window.Sound) Sound.playKO();

      const koOverlay = document.getElementById("overlay-ko");
      const koWinnerText = document.getElementById("ko-winner-text");
      const winnerName = playerWon ? p1.name.toUpperCase() : p2.name.toUpperCase();
      koWinnerText.textContent = `${winnerName} WINS!`;

      koOverlay.classList.remove("hidden");
      setTimeout(() => {
        koOverlay.classList.add("hidden");
      }, 1400);
    }

    // Play win mock speech
    if (!draw && window.Sound) {
      const winnerFighter = playerWon ? p1 : p2;
      Sound.playWinMock(winnerFighter, winnerFighter.color === "#33d6c4");
    }

    if (match.p1Wins >= match.best || match.p2Wins >= match.best) {
      setTimeout(() => showMatchEnd(match.p1Wins > match.p2Wins), delay);
    } else {
      match.round++;
      setTimeout(startRound, delay);
    }
  }

  function showMatchEnd(playerWon) {
    phase = "matchEnd";
    const winner = match.p1Wins > match.p2Wins ? p1.name : p2.name;
    document.getElementById("end-title").textContent = `${winner.toUpperCase()} VICTORIOUS!`;
    document.getElementById("end-subtitle").textContent = gameMode === "ai"
      ? (playerWon ? "Vex will remember this loss." : "Vex adapted faster than you did. Run it back?")
      : `${winner} claims glory in the rift!`;
    document.getElementById("overlay-end").classList.remove("hidden");
  }

  // ---------------- main loop ----------------
  function loop(ts) {
    const rawDt = Math.min(48, ts - lastTs || 16);
    lastTs = ts;

    if (phase === "fighting") {
      updateMovement();

      if (gameMode === "ai") {
        aiReflexCheck();

        aiTickTimer -= rawDt;
        if ((aiTickTimer <= 0 && p2.canAct()) || (p2.canAct() && !aiIntent)) {
          aiTickTimer = diff().aiTickInterval;
          refreshAiIntent();
        }
        runAiIntent();
      }

      p1.update(rawDt, p2.x);
      p2.update(rawDt, p1.x);
      resolveAttacks();

      timeLeft -= rawDt / 1000;
      updateHud();

      if (p1.health <= 0 || p2.health <= 0 || timeLeft <= 0) endRound();
    } else if (phase === "roundEnd") {
      const slowMoDt = rawDt * Effects.getSlowMoFactor();
      p1.update(slowMoDt, p2.x);
      p2.update(slowMoDt, p1.x);
    }

    Effects.update(rawDt);

    // apply screen shake
    const shake = Effects.getShakeOffset();
    ctx.save();
    ctx.translate(shake.x, shake.y);

    ctx.clearRect(-10, -10, STAGE_W + 20, STAGE_H + 20);
    Effects.drawBackground(ctx, performance.now());
    p1.draw(ctx);
    p2.draw(ctx);
    Effects.draw(ctx);

    ctx.restore();

    requestAnimationFrame(loop);
  }

  // ---------------- difficulty selection ----------------
  function setDifficulty(level) {
    currentDifficulty = level;
    document.getElementById("current-diff-text").textContent = diff().label;
    document.querySelectorAll(".diff-card").forEach(card => {
      card.classList.toggle("selected", card.dataset.diff === level);
    });
  }

  document.querySelectorAll(".diff-card").forEach(card => {
    card.addEventListener("click", () => {
      setDifficulty(card.dataset.diff);
    });
  });

  document.getElementById("btn-difficulty").addEventListener("click", () => {
    document.getElementById("overlay-start").classList.add("hidden");
    document.getElementById("overlay-difficulty").classList.remove("hidden");
    phase = "difficulty";
  });

  document.getElementById("btn-diff-back").addEventListener("click", () => {
    document.getElementById("overlay-difficulty").classList.add("hidden");
    document.getElementById("overlay-start").classList.remove("hidden");
    phase = "menu";
  });

  document.getElementById("btn-diff-confirm").addEventListener("click", () => {
    document.getElementById("overlay-difficulty").classList.add("hidden");
    document.getElementById("overlay-start").classList.remove("hidden");
    phase = "menu";
  });

  // ---------------- setup overlay controls ----------------

  // Helper to manage selected buttons in a group
  function setupOptionGroup(parentSelector, callback) {
    document.querySelectorAll(parentSelector + " .btn-setup-opt").forEach(btn => {
      btn.addEventListener("click", (e) => {
        const parent = btn.parentElement;
        parent.querySelectorAll(".btn-setup-opt").forEach(b => b.classList.remove("selected"));
        btn.classList.add("selected");
        if (callback) callback(btn.dataset.val, btn);
      });
    });
  }

  // VS VEX (AI) Setup Choices
  let aiSetupColor = "blue";
  let aiSetupCtrl = "p1";

  function updateAiSetupSummary() {
    const pName = document.getElementById("input-ai-player-name").value.trim().toUpperCase() || "HERO";
    const summaryEl = document.getElementById("ai-matchup-summary");
    const guideP1 = document.querySelector(".controls-guide-tiny .ctrl-p1-guide");
    const guideP2 = document.querySelector(".controls-guide-tiny .ctrl-p2-guide");

    if (aiSetupColor === "blue") {
      summaryEl.textContent = `${pName} (BLUE, ${aiSetupCtrl.toUpperCase()} keys) vs VEX (RED, AI controls)`;
    } else {
      summaryEl.textContent = `${pName} (RED, ${aiSetupCtrl.toUpperCase()} keys) vs KADE (BLUE, AI controls)`;
    }

    if (aiSetupCtrl === "p1") {
      guideP1.style.display = "block";
      guideP2.style.display = "none";
    } else {
      guideP1.style.display = "none";
      guideP2.style.display = "block";
    }
  }

  document.getElementById("input-ai-player-name").addEventListener("input", updateAiSetupSummary);

  setupOptionGroup("#overlay-ai-setup", (val, btn) => {
    if (btn.id.includes("color")) {
      aiSetupColor = val;
    } else {
      aiSetupCtrl = val;
    }
    updateAiSetupSummary();
  });

  // Local Setup Choices (Player 1 left box vs Player 2 right box)
  let localLeftColor = "blue";
  let localLeftCtrl = "p1";

  function syncLocalSetupUI() {
    // Left options
    document.querySelectorAll("#btn-local-l-blue, #btn-local-l-red").forEach(btn => {
      btn.classList.toggle("selected", btn.dataset.val === localLeftColor);
    });
    document.querySelectorAll("#btn-local-l-ctrl-p1, #btn-local-l-ctrl-p2").forEach(btn => {
      btn.classList.toggle("selected", btn.dataset.val === localLeftCtrl);
    });

    // Right options (must be opposite)
    const localRightColor = localLeftColor === "blue" ? "red" : "blue";
    const localRightCtrl = localLeftCtrl === "p1" ? "p2" : "p1";

    document.querySelectorAll("#btn-local-r-blue, #btn-local-r-red").forEach(btn => {
      btn.classList.toggle("selected", btn.dataset.val === localRightColor);
    });
    document.querySelectorAll("#btn-local-r-ctrl-p1, #btn-local-r-ctrl-p2").forEach(btn => {
      btn.classList.toggle("selected", btn.dataset.val === localRightCtrl);
    });

    // Update guides inside setup boxes
    const leftGuide = document.getElementById("local-left-guide");
    const rightGuide = document.getElementById("local-right-guide");

    const p1GuideHtml = `
      <div><span class="key">A / D</span> Move</div>
      <div><span class="key">W</span> Jump</div>
      <div><span class="key">S</span> Block</div>
      <div><span class="key">Space</span> Dodge</div>
      <div><span class="key">J</span> Punch</div>
      <div><span class="key">K</span> Kick</div>
      <div><span class="key">L</span> Special</div>
      <div><span class="key">G</span> Grab</div>
      <div><span class="key">T</span> ⚡ SUPER</div>
    `;

    const p2GuideHtml = `
      <div><span class="key">← / →</span> Move</div>
      <div><span class="key">↑</span> Jump</div>
      <div><span class="key">↓</span> Block</div>
      <div><span class="key">Numpad 0</span> Dodge</div>
      <div><span class="key">Numpad 1 / I</span> Punch</div>
      <div><span class="key">Numpad 2 / O</span> Kick</div>
      <div><span class="key">Numpad 3 / P</span> Special</div>
      <div><span class="key">Numpad 4 / U</span> Grab</div>
      <div><span class="key">Numpad 5 / Y</span> ⚡ SUPER</div>
    `;

    if (localLeftCtrl === "p1") {
      leftGuide.innerHTML = p1GuideHtml;
      rightGuide.innerHTML = p2GuideHtml;
      document.getElementById("local-left-role-tag").textContent = "P1 CONTROLS";
      document.getElementById("local-right-role-tag").textContent = "P2 CONTROLS";
    } else {
      leftGuide.innerHTML = p2GuideHtml;
      rightGuide.innerHTML = p1GuideHtml;
      document.getElementById("local-left-role-tag").textContent = "P2 CONTROLS";
      document.getElementById("local-right-role-tag").textContent = "P1 CONTROLS";
    }
  }

  // Left click listeners
  document.querySelectorAll("#local-box-left .btn-setup-opt").forEach(btn => {
    btn.addEventListener("click", () => {
      if (btn.id.includes("color")) {
        localLeftColor = btn.dataset.val;
      } else {
        localLeftCtrl = btn.dataset.val;
      }
      syncLocalSetupUI();
    });
  });

  // Right click listeners (update left to keep them opposite)
  document.querySelectorAll("#local-box-right .btn-setup-opt").forEach(btn => {
    btn.addEventListener("click", () => {
      if (btn.id.includes("color")) {
        localLeftColor = btn.dataset.val === "blue" ? "red" : "blue";
      } else {
        localLeftCtrl = btn.dataset.val === "p1" ? "p2" : "p1";
      }
      syncLocalSetupUI();
    });
  });

  // Initialize UI syncs
  updateAiSetupSummary();
  syncLocalSetupUI();

  // ---------------- mode selection & local setup ----------------
  document.getElementById("btn-play-ai").addEventListener("click", async () => {
    document.getElementById("overlay-start").classList.add("hidden");
    document.getElementById("overlay-ai-setup").classList.remove("hidden");
    updateAiSetupSummary();
  });

  document.getElementById("btn-ai-back").addEventListener("click", () => {
    document.getElementById("overlay-ai-setup").classList.add("hidden");
    document.getElementById("overlay-start").classList.remove("hidden");
  });

  document.getElementById("btn-start-ai").addEventListener("click", async () => {
    gameMode = "ai";
    const playerName = document.getElementById("input-ai-player-name").value.trim().toUpperCase() || "HERO";

    // Configure Fighter 1 (Left side, normally Blue) vs Fighter 2 (Right side, normally Red)
    if (aiSetupColor === "blue") {
      // Player is Blue (Left), AI is Red (Right)
      p1.name = playerName;
      p1.color = "#33d6c4";
      p2.name = "VEX";
      p2.color = "#e0334f";

      humanFighter = p1;
      aiFighter = p2;
    } else {
      // Player is Red (Right), AI is Blue (Left)
      p1.name = "KADE";
      p1.color = "#33d6c4";
      p2.name = playerName;
      p2.color = "#e0334f";

      humanFighter = p2;
      aiFighter = p1;
    }

    // Configure control scheme mapping
    if (aiSetupCtrl === "p1") {
      // Player uses P1 controls, AI is on P2 controls (though controlled by computer code)
      p1ControlTarget = humanFighter;
      p2ControlTarget = aiFighter;
    } else {
      // Player uses P2 controls
      p1ControlTarget = aiFighter;
      p2ControlTarget = humanFighter;
    }

    p1.resetForMatch(300, 1);
    p2.resetForMatch(660, -1);

    document.getElementById("overlay-ai-setup").classList.add("hidden");
    await Network.connect();
    renderDots();
    startRound();
  });

  document.getElementById("btn-play-local").addEventListener("click", () => {
    document.getElementById("overlay-start").classList.add("hidden");
    document.getElementById("overlay-local-setup").classList.remove("hidden");
    phase = "localSetup";
    syncLocalSetupUI();
  });

  document.getElementById("btn-local-back").addEventListener("click", () => {
    document.getElementById("overlay-local-setup").classList.add("hidden");
    document.getElementById("overlay-start").classList.remove("hidden");
    phase = "menu";
  });

  document.getElementById("btn-start-local").addEventListener("click", () => {
    gameMode = "local";
    const nameLeft = document.getElementById("input-p1-name").value.trim().toUpperCase() || "PLAYER 1";
    const nameRight = document.getElementById("input-p2-name").value.trim().toUpperCase() || "PLAYER 2";

    // Setup colors
    if (localLeftColor === "blue") {
      p1.name = nameLeft;
      p1.color = "#33d6c4";
      p2.name = nameRight;
      p2.color = "#e0334f";
    } else {
      p1.name = nameLeft;
      p1.color = "#e0334f";
      p2.name = nameRight;
      p2.color = "#33d6c4";
    }

    // Setup control targets
    if (localLeftCtrl === "p1") {
      p1ControlTarget = p1; // left fighter is controlled by P1 controls
      p2ControlTarget = p2; // right fighter is controlled by P2 controls
    } else {
      p1ControlTarget = p2; // right fighter is controlled by P1 controls
      p2ControlTarget = p1; // left fighter is controlled by P2 controls
    }

    p1.resetForMatch(300, 1);
    p2.resetForMatch(660, -1);

    document.getElementById("overlay-local-setup").classList.add("hidden");
    match = { p1Wins: 0, p2Wins: 0, round: 1, best: 2 };
    renderDots();
    startRound();
  });

  // ---------------- online 1v1 multiplayer ----------------
  let onlineSide = null; // "p1" | "p2"
  let onlineRemoteKeys = {};
  let onlineTick = 0;

  document.getElementById("btn-play-online").addEventListener("click", async () => {
    document.getElementById("overlay-start").classList.add("hidden");
    document.getElementById("overlay-online-setup").classList.remove("hidden");
    phase = "onlineSetup";
    await Network.connect();
  });

  document.getElementById("btn-online-back").addEventListener("click", () => {
    document.getElementById("overlay-online-setup").classList.add("hidden");
    document.getElementById("overlay-start").classList.remove("hidden");
    phase = "menu";
  });

  document.getElementById("btn-online-create").addEventListener("click", async () => {
    const p1Name = document.getElementById("input-online-p1-name").value.trim().toUpperCase() || "HOST";
    try {
      const code = await Network.createRoom(p1Name);
      onlineSide = "p1";
      p1.name = p1Name; p1.color = "#33d6c4";
      document.getElementById("online-room-code-display").textContent = code;
      document.getElementById("online-host-code-wrap").style.display = "block";
    } catch (err) {
      alert("Failed to create room: " + err.message);
    }
  });

  document.getElementById("btn-online-join").addEventListener("click", async () => {
    const code = document.getElementById("input-online-room-code").value.trim().toUpperCase();
    const p2Name = document.getElementById("input-online-p2-name").value.trim().toUpperCase() || "CHALLENGER";
    const errEl = document.getElementById("online-join-error");
    errEl.style.display = "none";

    if (!code || code.length !== 6) {
      errEl.textContent = "Please enter a valid 6-character room code.";
      errEl.style.display = "block";
      return;
    }

    try {
      const msg = await Network.joinRoom(code, p2Name);
      startOnlineMatch(msg);
    } catch (err) {
      errEl.textContent = err.message;
      errEl.style.display = "block";
    }
  });

  Network.onRoomEvent((msg) => {
    if (msg.type === "match_start") {
      startOnlineMatch(msg);
    } else if (msg.type === "opponent_left") {
      if (gameMode === "online") {
        alert("Opponent disconnected.");
        location.reload();
      }
    }
  });

  Network.onRemoteInput((keys) => {
    onlineRemoteKeys = keys || {};
  });

  function startOnlineMatch(msg) {
    gameMode = "online";
    onlineSide = msg.side;

    if (onlineSide === "p1") {
      p1.name = document.getElementById("input-online-p1-name").value.trim().toUpperCase() || "HOST";
      p1.color = "#33d6c4";
      p2.name = msg.opponentName || "CHALLENGER";
      p2.color = "#e0334f";
    } else {
      p1.name = msg.opponentName || "HOST";
      p1.color = "#33d6c4";
      p2.name = document.getElementById("input-online-p2-name").value.trim().toUpperCase() || "CHALLENGER";
      p2.color = "#e0334f";
    }

    document.getElementById("overlay-online-setup").classList.add("hidden");
    match = { p1Wins: 0, p2Wins: 0, round: 1, best: 2 };
    renderDots();
    startRound();
  }

  Network.onStateSync((s) => {
    if (!s || onlineSide === "p1") return; // Host is authoritative
    // Client (P2) receives and applies canonical state from Host (P1)
    if (s.p1) {
      p1.x = s.p1.x; p1.y = s.p1.y;
      p1.health = s.p1.health; p1.specialMeter = s.p1.specialMeter;
      if (s.p1.state && p1.state !== s.p1.state) {
        if (s.p1.state === "hitstun") p1.stateTimer = 0;
        p1.state = s.p1.state;
      }
    }
    if (s.p2) {
      p2.x = s.p2.x; p2.y = s.p2.y;
      p2.health = s.p2.health; p2.specialMeter = s.p2.specialMeter;
      if (s.p2.state && p2.state !== s.p2.state) {
        if (s.p2.state === "hitstun") p2.stateTimer = 0;
        p2.state = s.p2.state;
      }
    }
    if (s.timeLeft !== undefined) timeLeft = s.timeLeft;
    updateHud();
  });

  let lastSentKeysStr = "";
  let lastInputSendTime = 0;

  // Hook key sync & state sync into online loop
  const originalUpdateMovement = updateMovement;
  updateMovement = function() {
    if (gameMode === "online") {
      onlineTick++;
      const localKeyList = Array.from(keys);
      const keysStr = localKeyList.slice().sort().join(",");
      const now = performance.now();

      // Send inputs ONLY when keys change OR every 150ms keepalive (prevents socket flooding)
      if (keysStr !== lastSentKeysStr || now - lastInputSendTime > 150) {
        lastSentKeysStr = keysStr;
        lastInputSendTime = now;
        Network.sendInput(localKeyList, onlineTick);
      }

      // Distribute local keys to local fighter, remote keys to remote fighter
      const myFighter = onlineSide === "p1" ? p1 : p2;
      const opponentFighter = onlineSide === "p1" ? p2 : p1;

      // Apply input states
      applyFighterInputState(myFighter, localKeyList);
      applyFighterInputState(opponentFighter, onlineRemoteKeys);

      // Host (P1) broadcasts authoritative game state at 20Hz (every 3 frames)
      if (onlineSide === "p1" && onlineTick % 3 === 0) {
        Network.sendStateSync({
          p1: { x: Math.round(p1.x), y: Math.round(p1.y), health: p1.health, specialMeter: p1.specialMeter, state: p1.state },
          p2: { x: Math.round(p2.x), y: Math.round(p2.y), health: p2.health, specialMeter: p2.specialMeter, state: p2.state },
          timeLeft: Math.round(timeLeft * 10) / 10
        });
      }
    } else {
      originalUpdateMovement();
    }
  };

  function applyFighterInputState(fighter, keyList) {
    if (!fighter || !fighter.canAct()) return;
    const kSet = new Set(Array.isArray(keyList) ? keyList : []);

    // 1. Walk direction
    let dx = 0;
    if (kSet.has("KeyA") || kSet.has("a") || kSet.has("ArrowLeft")) dx -= 1;
    if (kSet.has("KeyD") || kSet.has("d") || kSet.has("ArrowRight")) dx += 1;
    fighter.setWalk(dx);

    // 2. Block state
    if (kSet.has("KeyS") || kSet.has("s") || kSet.has("ArrowDown")) {
      fighter.setBlocking(true);
    } else if (fighter.isBlocking) {
      fighter.setBlocking(false);
    }

    // 3. Jump
    if (kSet.has("KeyW") || kSet.has("w") || kSet.has("ArrowUp")) {
      fighter.jump();
    }

    // 4. Dodge
    if (kSet.has("Space") || kSet.has(" ") || kSet.has("Numpad0") || kSet.has("ShiftRight")) {
      fighter.dodge();
    }

    // 5. Attacks
    if (kSet.has("KeyJ") || kSet.has("j") || kSet.has("KeyI") || kSet.has("i") || kSet.has("Numpad1")) fighter.attack("punch");
    if (kSet.has("KeyK") || kSet.has("k") || kSet.has("KeyO") || kSet.has("o") || kSet.has("Numpad2")) fighter.attack("kick");
    if (kSet.has("KeyL") || kSet.has("l") || kSet.has("KeyP") || kSet.has("p") || kSet.has("Numpad3")) fighter.attack("special");
    if (kSet.has("KeyG") || kSet.has("g") || kSet.has("KeyU") || kSet.has("u") || kSet.has("Numpad4")) fighter.attack("grab");
    if (kSet.has("KeyT") || kSet.has("t") || kSet.has("KeyY") || kSet.has("y") || kSet.has("Numpad5")) tryPlayerSuper(fighter, fighter === p1 ? p2 : p1);
  }

  // ---------------- boot ----------------
  Network.setSummaryHandler((summary) => {
    aiKnowledge = summary;
    if (gameMode === "ai") {
      document.getElementById("ai-read-text").textContent = readText(summary);
    }
  });

  document.getElementById("btn-rematch").addEventListener("click", () => {
    match = { p1Wins: 0, p2Wins: 0, round: 1, best: 2 };
    p1.resetForMatch(300, 1);
    p2.resetForMatch(660, -1);
    document.getElementById("overlay-end").classList.add("hidden");
    renderDots();
    startRound();
  });

  document.getElementById("btn-reset-ai").addEventListener("click", async () => {
    const id = Network.playerId();
    try { await fetch(`/api/profile/${id}/reset`, { method: "POST" }); } catch {}
    aiKnowledge = null;
    if (gameMode === "ai") document.getElementById("ai-read-text").textContent = "observing…";
  });

  requestAnimationFrame(loop);
})();
