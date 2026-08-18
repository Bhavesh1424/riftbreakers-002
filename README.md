# Riftbreakers

A 2D one-on-one fighting game (Mortal Kombat–style) with an AI opponent, **Vex**,
that reads your habits mid-match and counters them — plays cautious against
turtles, mixes in grabs against block-happy players, and dodges more against
whoever spams kicks.

## Run it

```bash
npm install
npm start
```

Then open **http://localhost:3000**.

Controls: `A`/`D` move · `W` jump · `S` hold to block · `Space` dodge ·
`J` punch · `K` kick · `L` special · `G` grab.

## How it's built

```
public/            the frontend — plain HTML/CSS/canvas, no build step
  index.html        HUD + overlays + canvas
  css/style.css      arcade/molten visual theme
  js/fighter.js      Fighter class: physics, moves, hit/block resolution, drawing
  js/network.js      WebSocket client to the AI backend
  js/game.js         input, main loop, round/match flow, AI controller

server/             the backend
  server.js          Express (serves the frontend) + a WebSocket endpoint
                      that hosts the AdaptiveAI per player
  aiEngine.js         the adaptive AI itself
  data/profiles.json  per-player memory, written on disconnect/round end
```

## How the AI adapts

`aiEngine.js` is a **heuristic pattern-reader**, not a trained model — no
training step, fully deterministic to inspect, and it reacts within a
single match instead of needing thousands of games:

1. Every player action (punch, kick, special, grab, block, dodge) is
   counted, along with what happened right after Vex's own attacks
   (blocked / dodged / hit) and whether the player punishes Vex's whiffs.
2. From those raw counts it derives a few traits each decision: block
   rate, attack rate, preferred move, whiff-punish rate.
3. `decide()` starts from baseline move weights, then nudges them using
   those traits — e.g. a high block rate raises the weight on grabs and
   specials (both beat block); a preference for kicks raises Vex's dodge
   weight. A **confidence** value (based on sample size) scales how hard
   it leans on a read, so Vex doesn't overreact in the first few seconds
   of round 1.
4. A separate **reflex layer** in `game.js` lets Vex react to a
   *telegraphed* incoming attack (block/dodge) with a probability that
   goes up if that attack type matches what the player favors — this is
   what makes Vex feel like it's "seen this coming."
5. Profiles persist to `server/data/profiles.json` per browser (via a
   generated id in `localStorage`), so Vex remembers you between
   sessions. The "forget me" button on the start screen wipes it.

If the WebSocket can't reach the server (e.g. you open the HTML without
running the backend), `game.js` falls back to a local copy of the same
heuristic so the game still runs — just without persistence.

## Known simplifications (good next steps)

- No air attacks; jumping is purely for movement/mixups right now.
- Two fixed fighters (Kade vs Vex) — no roster/select screen yet.
- The AI decision endpoint is called over a real network round-trip; on a
  slow connection this is masked by a local fallback decision, but a
  same-process worker would remove the round-trip entirely.
