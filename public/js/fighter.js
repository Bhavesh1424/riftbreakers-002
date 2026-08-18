// fighter.js — a single combatant: physics, moves, state machine, drawing.
// Both the human-controlled fighter and the AI-controlled fighter are the
// same class; only who calls .doAction() differs.

const STAGE_W = 960, STAGE_H = 540, GROUND_Y = 430;
const GRAVITY = 0.0022;
const MOVE_SPEED = 0.24;
const JUMP_VELOCITY = -0.72;

const MOVES = {
  punch:   { startup: 90,  active: 70,  recovery: 170, range: 78,  damage: 3,  chip: 1, pushback: 10, meter: 8  },
  kick:    { startup: 140, active: 90,  recovery: 240, range: 92,  damage: 6, chip: 1, pushback: 16, meter: 12 },
  special: { startup: 230, active: 130, recovery: 340, range: 110, damage: 18, chip: 4, pushback: 26, meter: 0, cooldown: 4200 },
  grab:    { startup: 110, active: 70,  recovery: 280, range: 58,  damage: 13, chip: 13, pushback: 40, meter: 6, beatsBlock: true },
};
const DODGE_DURATION = 260;
const DODGE_INVULN = [40, 200]; // ms window within the dodge that's invulnerable
const COMBO_WINDOW = 850;
const MAX_HEALTH = 100;
const MAX_SPECIAL_METER = 100;
const SUPER_COMBO_THRESHOLD = 5; // combo hits needed to unlock super move

class Fighter {
  constructor(name, x, color, facing) {
    this.name = name;
    this.x = x;
    this.y = GROUND_Y;
    this.vx = 0;
    this.vy = 0;
    this.facing = facing; // 1 = faces right, -1 = faces left
    this.color = color;

    this.health = MAX_HEALTH;
    this.specialMeter = 40;
    this.state = "idle"; // idle | walk | jump | attack | block | hitstun | dodge | grab | ko
    this.stateTimer = 0;
    this.currentMove = null;
    this.moveElapsed = 0;
    this.specialCooldownUntil = 0;

    this.comboCount = 0;
    this.lastHitAt = -Infinity;
    this.grounded = true;
    this.blocking = false;
    this.wantsBlock = false;
    this.hitstunDuration = 340; // ms — overridden to 3000 for super hits

    // super move system
    this.superComboHits = 0;   // accumulated across match
    this.superReady = false;   // true once threshold reached
    this.superUsed = false;    // can only use once per match
    this.superActive = false;  // currently executing super
    this.superTimer = 0;       // animation timer

    // speech bubble system
    this.speechText = "";
    this.speechTimer = 0;
  }

  get alive() { return this.health > 0; }
  get healthPct() { return Math.max(0, this.health / MAX_HEALTH); }
  get isBusy() { return ["attack", "hitstun", "dodge", "grab"].includes(this.state); }
  get isInvulnerable() {
    if (this.state !== "dodge") return false;
    const t = this.stateTimer;
    return t >= DODGE_INVULN[0] && t <= DODGE_INVULN[1];
  }

  canAct() { return this.state === "idle" || this.state === "walk" || this.state === "block"; }

  // ---- intents from input/AI ----
  setWalk(dir) {
    if (dir === 0) {
      this.stopWalk();
      return;
    }
    if (this.canAct() && !this.blocking) {
      this.vx = dir * MOVE_SPEED;
      this.state = "walk";
    }
  }
  stopWalk() { if (this.state === "walk") { this.vx = 0; this.state = "idle"; } }

  jump() {
    if (this.grounded && this.canAct()) {
      this.vy = JUMP_VELOCITY;
      this.grounded = false;
      this.state = "jump";
    }
  }

  setBlocking(on) {
    this.wantsBlock = on;
    if (on && this.canAct()) { this.blocking = true; this.vx = 0; this.state = "block"; }
    if (!on && this.state === "block") { this.blocking = false; this.state = "idle"; }
  }

  dodge() {
    if (this.canAct()) {
      this.state = "dodge";
      this.stateTimer = 0;
      this.vx = -this.facing * 0.3;
      this.blocking = false;
    }
  }

  attack(type) {
    if (!this.canAct()) return false;
    if (type === "special" && performance.now() < this.specialCooldownUntil) return false;
    if (type === "special" && this.specialMeter < 30) return false;
    this.state = "attack";
    this.currentMove = type;
    this.moveElapsed = 0;
    this.vx = 0;
    this.blocking = false;
    this._hitApplied = false;
    this._reacted = false;
    if (type === "special") {
      this.specialCooldownUntil = performance.now() + MOVES.special.cooldown;
      this.specialMeter -= 30;
    }
    return true;
  }

  // ---- combat resolution ----
  hurtbox() {
    return { x: this.x - 26, y: this.y - 92, w: 52, h: 92 };
  }
  activeHitbox() {
    if (this.state !== "attack" || !this.currentMove) return null;
    const move = MOVES[this.currentMove];
    if (this.moveElapsed < move.startup || this.moveElapsed > move.startup + move.active) return null;
    const reach = move.range;
    const x = this.facing === 1 ? this.x + 20 : this.x - 20 - reach;
    return { x, y: this.y - 90, w: reach, h: 70, move: this.currentMove, damage: move.damage, chip: move.chip, pushback: move.pushback, beatsBlock: !!move.beatsBlock };
  }

  takeHit({ damage, chip, pushback, beatsBlock, fromX }) {
    const canBlock = this.blocking && this.wantsBlock && !beatsBlock;
    const dir = this.x < fromX ? -1 : 1;

    if (this.isInvulnerable) return { result: "dodged" };

    if (canBlock) {
      this.health = Math.max(0, this.health - chip);
      this.vx = dir * (pushback * 0.3) * 0.02;
      this.x = clamp(this.x + dir * pushback * 0.3, 40, STAGE_W - 40);
      return { result: "blocked" };
    }

    this.health = Math.max(0, this.health - damage);
    this.state = "hitstun";
    this.stateTimer = 0;
    this.blocking = false;
    this.x = clamp(this.x + dir * pushback, 40, STAGE_W - 40);
    return { result: "hit" };
  }

  // ---- per-frame update ----
  update(dt, opponentX) {
    this.facing = opponentX >= this.x ? 1 : -1;
    if (this.specialMeter < MAX_SPECIAL_METER) this.specialMeter = Math.min(MAX_SPECIAL_METER, this.specialMeter + dt * 0.004);
    if (this.speechTimer > 0) this.speechTimer -= dt;

    // horizontal movement + bounds
    this.x += this.vx * dt;
    this.x = clamp(this.x, 40, STAGE_W - 40);

    // gravity / jump arc
    if (!this.grounded) {
      this.vy += GRAVITY * dt;
      this.y += this.vy * dt;
      if (this.y >= GROUND_Y) { this.y = GROUND_Y; this.vy = 0; this.grounded = true; if (this.state === "jump") this.state = "idle"; }
    }

    this.stateTimer += dt;

    if (this.state === "attack") {
      this.moveElapsed += dt;
      const move = MOVES[this.currentMove];
      const total = move.startup + move.active + move.recovery;
      if (this.moveElapsed >= total) {
        this.state = "idle";
        this.currentMove = null;
      }
    } else if (this.state === "hitstun") {
      if (this.stateTimer > this.hitstunDuration) { this.state = "idle"; this.comboCount = 0; this.hitstunDuration = 340; }
    } else if (this.state === "dodge") {
      if (this.stateTimer > DODGE_DURATION) { this.state = "idle"; this.vx = 0; }
    } else if (this.state === "block" && !this.wantsBlock) {
      this.state = "idle";
      this.blocking = false;
    }

    if (this.health <= 0) this.state = "ko";
  }

  registerComboHit(now) {
    if (now - this.lastHitAt < COMBO_WINDOW) this.comboCount += 1;
    else this.comboCount = 1;
    this.lastHitAt = now;
    // accumulate super meter — always refills, even after use
    if (!this.superReady) {
      this.superComboHits = Math.min(SUPER_COMBO_THRESHOLD, this.superComboHits + 1);
      if (this.superComboHits >= SUPER_COMBO_THRESHOLD) {
        this.superReady = true;
        this.superUsed = false; // re-enable firing once meter is full again
      }
    }
    return this.comboCount;
  }

  get superMeterPct() { return Math.min(1, this.superComboHits / SUPER_COMBO_THRESHOLD); }

  resetForRound(x, facing) {
    this.x = x; this.y = GROUND_Y; this.vx = 0; this.vy = 0;
    this.facing = facing;
    this.health = MAX_HEALTH;
    this.state = "idle";
    this.comboCount = 0;
    this.blocking = false;
    this.wantsBlock = false;
    this.currentMove = null;
    this.superActive = false;
    this.superTimer = 0;
  }

  resetForMatch(x, facing) {
    this.resetForRound(x, facing);
    this.superComboHits = 0;
    this.superReady = false;
    this.superUsed = false;
  }

  // ---- procedural rendering (no sprite assets — stylized silhouette) ----
  draw(ctx) {
    const { x, y, color, facing } = this;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(facing, 1);

    // ground shadow
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.ellipse(0, 4, 30, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.shadowColor = color;
    ctx.shadowBlur = this.state === "hitstun" ? 2 : 14;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 8;
    ctx.lineCap = "round";

    const crouch = this.state === "block" ? 8 : this.state === "dodge" ? 14 : 0;
    const bob = this.state === "idle" ? Math.sin(performance.now() / 220) * 2 : 0;
    const hipY = -46 + crouch + bob;
    const headY = -86 + crouch * 0.6 + bob;
    const lean = this.state === "hitstun" ? -10 : this.state === "attack" ? 6 : 0;

    // legs
    ctx.beginPath();
    ctx.moveTo(-10, 0); ctx.lineTo(-6 + lean * 0.2, hipY);
    ctx.moveTo(10 + this._legKick(), 0); ctx.lineTo(6 + lean * 0.2, hipY);
    ctx.stroke();

    // torso
    ctx.beginPath();
    ctx.moveTo(0, hipY); ctx.lineTo(lean * 0.4, headY + 20);
    ctx.stroke();

    // arms
    const arm = this._armPose();
    ctx.beginPath();
    ctx.moveTo(lean * 0.4, headY + 26); ctx.lineTo(arm.back.x, arm.back.y);
    ctx.moveTo(lean * 0.4, headY + 26); ctx.lineTo(arm.front.x, arm.front.y);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(lean * 0.4, headY, 13, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    // Draw speech bubble above head (unscaled by scale(facing, 1) to prevent reversed text)
    if (this.speechTimer > 0 && this.speechText) {
      ctx.save();
      ctx.translate(x, y);

      ctx.font = 'bold 13px "Rajdhani", sans-serif';
      const textWidth = ctx.measureText(this.speechText).width;
      const padX = 14;
      const padY = 8;
      const bubbleW = textWidth + padX * 2;
      const bubbleH = 28;
      const bx = -bubbleW / 2;
      const by = -135; // above head

      // Draw bubble background
      ctx.fillStyle = "rgba(12, 10, 16, 0.96)";
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5;
      ctx.shadowColor = color;
      ctx.shadowBlur = 10;
      roundRect(ctx, bx, by, bubbleW, bubbleH, 6);
      ctx.fill();
      ctx.stroke();

      // Draw little pointer triangle at bottom
      ctx.fillStyle = "rgba(12, 10, 16, 0.96)";
      ctx.beginPath();
      ctx.moveTo(-6, by + bubbleH);
      ctx.lineTo(6, by + bubbleH);
      ctx.lineTo(0, by + bubbleH + 7);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Draw text
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.shadowBlur = 0; // no text shadow for legibility
      ctx.fillText(this.speechText, 0, by + bubbleH / 2);
      ctx.restore();
    }
  }

  _legKick() {
    if (this.state === "attack" && this.currentMove === "kick") {
      const move = MOVES.kick;
      if (this.moveElapsed >= move.startup && this.moveElapsed <= move.startup + move.active) return 26;
    }
    return 0;
  }

  _armPose() {
    const back = { x: -18, y: -30 };
    let front = { x: 18, y: -30 };
    if (this.state === "attack") {
      const move = MOVES[this.currentMove];
      const inActive = this.moveElapsed >= move.startup && this.moveElapsed <= move.startup + move.active;
      if (this.currentMove === "punch" && inActive) front = { x: 42, y: -34 };
      if (this.currentMove === "special" && inActive) front = { x: 50, y: -30 };
      if (this.currentMove === "grab" && inActive) front = { x: 36, y: -20 };
    } else if (this.state === "block") {
      front = { x: 22, y: -50 };
    } else if (this.state === "dodge") {
      front = { x: 10, y: -20 };
    }
    return { back, front };
  }
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function aabbOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

// Rounded rectangle helper
function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}
