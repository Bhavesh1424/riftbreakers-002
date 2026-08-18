// aiEngine.js
//
// The "brain" of the AI opponent. It is a heuristic pattern-reader, not a
// trained ML model: it keeps running counts of what the player does and how
// those actions turn out, derives a few behavioral traits from those counts,
// and uses the traits to bias a weighted random choice over the AI's next
// move. This is intentionally legible and fast (no training step, no GPU),
// and it "feels" adaptive because the weights visibly shift as the player's
// habits emerge.

const ACTIONS = ["punch", "kick", "special", "grab", "block", "dodge"];
const HISTORY_LIMIT = 30;
const CONFIDENCE_SAMPLES = 8; // below this many samples, trust the read less

function freshProfile() {
  return {
    totalActions: 0,
    actionCounts: { punch: 0, kick: 0, special: 0, block: 0, dodge: 0, grab: 0 },
    history: [], // { action, result, distance, ts }
    afterAiAttack: { blocked: 0, dodged: 0, hit: 0, total: 0 },
    whiffs: 0,
    whiffPunishes: 0, // player attacked within one beat of the AI whiffing
    roundsPlayed: 0,
    roundsWon: 0, // player's round wins, for difficulty pacing
  };
}

class AdaptiveAI {
  constructor(playerId, savedProfile) {
    this.playerId = playerId;
    this.profile = savedProfile || freshProfile();
    this.lastAiWhiffedAt = -Infinity;
  }

  // Called whenever the player performs an action, so the model can learn.
  recordPlayerAction({ action, result, distance }) {
    const p = this.profile;
    if (!ACTIONS.includes(action)) return;
    p.totalActions += 1;
    p.actionCounts[action] += 1;
    p.history.push({ action, result, distance, ts: Date.now() });
    if (p.history.length > HISTORY_LIMIT) p.history.shift();

    if (Date.now() - this.lastAiWhiffedAt < 900 && (action === "punch" || action === "kick" || action === "special")) {
      p.whiffPunishes += 1;
    }
  }

  // Called when the AI's own attack resolves, so it can track whether the
  // player blocked, dodged, or ate the hit.
  recordAiAttackOutcome(outcome) {
    const p = this.profile;
    p.afterAiAttack.total += 1;
    if (outcome === "blocked") p.afterAiAttack.blocked += 1;
    else if (outcome === "dodged") p.afterAiAttack.dodged += 1;
    else if (outcome === "hit") p.afterAiAttack.hit += 1;
  }

  recordAiWhiff() {
    this.profile.whiffs += 1;
    this.lastAiWhiffedAt = Date.now();
  }

  recordRoundResult(playerWon) {
    this.profile.roundsPlayed += 1;
    if (playerWon) this.profile.roundsWon += 1;
  }

  // Derived behavioral traits, recomputed on demand from raw counts.
  traits() {
    const p = this.profile;
    const n = Math.max(1, p.totalActions);
    const blockRate = p.actionCounts.block / n;
    const dodgeRate = p.actionCounts.dodge / n;
    const grabRate = p.actionCounts.grab / n;
    const attackRate = (p.actionCounts.punch + p.actionCounts.kick + p.actionCounts.special) / n;

    let preferredMove = "punch";
    let best = -1;
    for (const a of ["punch", "kick", "special", "grab"]) {
      if (p.actionCounts[a] > best) { best = p.actionCounts[a]; preferredMove = a; }
    }

    const whiffPunishRate = p.whiffs > 0 ? p.whiffPunishes / p.whiffs : 0;
    const aiHitRate = p.afterAiAttack.total > 0 ? p.afterAiAttack.hit / p.afterAiAttack.total : 0.5;
    const aiBlockedRate = p.afterAiAttack.total > 0 ? p.afterAiAttack.blocked / p.afterAiAttack.total : 0;

    // 0..1, how much we trust these reads. Ramps up over the first
    // CONFIDENCE_SAMPLES actions so the AI doesn't overreact in round 1.
    const confidence = Math.min(1, p.totalActions / CONFIDENCE_SAMPLES);

    return { blockRate, dodgeRate, grabRate, attackRate, preferredMove, whiffPunishRate, aiHitRate, aiBlockedRate, confidence };
  }

  // Main decision function. gameState carries just enough context (distance,
  // health, whether special/grab are currently usable) to keep the AI
  // grounded in the current exchange, layered on top of the learned traits.
  decide(gameState) {
    const { distance, aiSpecialReady, aiHealthPct, playerHealthPct, farRange, nearRange } = gameState;
    const t = this.traits();
    const k = t.confidence; // how strongly to lean on learned traits

    const weights = {
      advance: 1,
      retreat: 0.4,
      punch: 2,
      kick: 1.6,
      special: aiSpecialReady ? 1 : 0,
      grab: distance <= nearRange ? 0.6 : 0,
      block: 1,
      dodge: 1,
    };

    // --- Spacing ---
    if (distance > farRange) {
      weights.advance += 3;
      weights.punch = 0; weights.kick = 0; weights.grab = 0; weights.block *= 0.3;
      weights.special = aiSpecialReady ? weights.special + 1 : 0;
    } else if (distance < nearRange) {
      weights.grab += 1;
    }

    // --- Learned counters (scaled by confidence) ---
    // Player blocks a lot -> blocking is losing value for them; mix in
    // grabs and specials, which beat block.
    weights.grab += k * (t.blockRate * 5);
    weights.special += k * (t.blockRate * 2);
    weights.punch *= 1 - k * t.blockRate * 0.4;

    // Player leans on one strike -> counter it specifically.
    if (t.preferredMove === "kick") { weights.dodge += k * 2.2; weights.block += k * 0.8; }
    if (t.preferredMove === "punch") { weights.block += k * 1.8; weights.dodge += k * 0.6; }
    if (t.preferredMove === "special") { weights.dodge += k * 2.6; }
    if (t.preferredMove === "grab") { weights.dodge += k * 1.5; weights.retreat += k * 1; }

    // Player is aggressive (attacks far more than they block/dodge) ->
    // play patient, punish on read.
    if (t.attackRate > 0.55) { weights.block += k * 2; weights.dodge += k * 1.2; weights.advance *= 0.7; }

    // Player punishes whiffs hard -> stop throwing risky, unsafe moves.
    if (t.whiffPunishRate > 0.5) { weights.special *= 1 - k * 0.5; weights.kick *= 1 - k * 0.3; weights.block += k * 1; }

    // AI's own attacks keep getting blocked -> stop feeding into their guard.
    if (t.aiBlockedRate > 0.5) { weights.grab += k * 2; weights.punch *= 0.8; weights.kick *= 0.8; }

    // --- Comeback / mercy pacing so it stays fun, not just optimal ---
    const healthGap = aiHealthPct - playerHealthPct; // -1..1
    if (healthGap > 0.35) { weights.block += 0.8; weights.dodge += 0.5; weights.punch *= 0.85; } // AI winning big: ease off
    if (healthGap < -0.35) { weights.advance += 1; weights.special += aiSpecialReady ? 1 : 0; } // AI losing big: press harder

    return this._weightedPick(weights);
  }

  _weightedPick(weights) {
    const entries = Object.entries(weights).filter(([, w]) => w > 0);
    const total = entries.reduce((s, [, w]) => s + w, 0);
    if (total <= 0) return "block";
    let r = Math.random() * total;
    for (const [action, w] of entries) {
      r -= w;
      if (r <= 0) return action;
    }
    return entries[entries.length - 1][0];
  }

  summary() {
    const t = this.traits();
    return {
      totalActions: this.profile.totalActions,
      confidence: Number(t.confidence.toFixed(2)),
      blockRate: Number(t.blockRate.toFixed(2)),
      preferredMove: t.preferredMove,
      whiffPunishRate: Number(t.whiffPunishRate.toFixed(2)),
      roundsPlayed: this.profile.roundsPlayed,
      roundsWon: this.profile.roundsWon,
    };
  }
}

module.exports = { AdaptiveAI, freshProfile, ACTIONS };
