// network.js — talks to the backend's AdaptiveAI & Online Rooms over WebSocket.
const Network = (() => {
  let ws = null;
  let ready = false;
  let connectingPromise = null;
  let reqCounter = 0;
  const pendingDecisions = new Map();
  let onSummary = () => {};
  let remoteInputHandler = null;
  let roomEventsHandler = null;
  let stateSyncHandler = null;
  let remoteHitHandler = null;
  let remoteSuperHandler = null;
  let remoteRematchHandler = null;

  function playerId() {
    let id = localStorage.getItem("riftbreakers_pid");
    if (!id) {
      id = "p_" + Math.random().toString(36).slice(2, 10);
      localStorage.setItem("riftbreakers_pid", id);
    }
    return id;
  }

  function connect() {
    if (ready && ws && ws.readyState === WebSocket.OPEN) return Promise.resolve();
    if (connectingPromise) return connectingPromise;

    connectingPromise = new Promise((resolve) => {
      try {
        const proto = location.protocol === "https:" ? "wss" : "ws";
        const url = `${proto}://${location.host}/ws`;
        ws = new WebSocket(url);

        ws.onopen = () => {
          ready = true;
          connectingPromise = null;
          send({ type: "init", playerId: playerId() });
          resolve();
        };

        ws.onmessage = (ev) => {
          let msg;
          try { msg = JSON.parse(ev.data); } catch { return; }

          if (msg.type === "init_ack") {
            onSummary(msg.summary);
          } else if (msg.type === "decision") {
            const cb = pendingDecisions.get(msg.requestId);
            if (cb) { cb(msg.action); pendingDecisions.delete(msg.requestId); }
          } else if (msg.type === "summary") {
            onSummary(msg.summary);
          } else if (msg.type === "remote_input" && remoteInputHandler) {
            remoteInputHandler(msg.keys, msg.tick);
          } else if (msg.type === "remote_hit" && remoteHitHandler) {
            remoteHitHandler(msg.hit);
          } else if (msg.type === "remote_super" && remoteSuperHandler) {
            remoteSuperHandler(msg.side);
          } else if (msg.type === "remote_rematch" && remoteRematchHandler) {
            remoteRematchHandler();
          } else if (msg.type === "state_sync" && stateSyncHandler) {
            stateSyncHandler(msg.state);
          } else if ((msg.type === "match_start" || msg.type === "opponent_left") && roomEventsHandler) {
            roomEventsHandler(msg);
          }
        };

        ws.onerror = () => {
          ready = false;
          connectingPromise = null;
          resolve();
        };

        ws.onclose = () => {
          ready = false;
          connectingPromise = null;
        };

        setTimeout(() => {
          connectingPromise = null;
          resolve();
        }, 2000);
      } catch (err) {
        connectingPromise = null;
        resolve();
      }
    });

    return connectingPromise;
  }

  function send(obj) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(obj));
    }
  }

  function isReady() { return ready && ws && ws.readyState === WebSocket.OPEN; }

  function requestDecision(gameState) {
    return new Promise((resolve) => {
      if (!isReady()) { resolve(null); return; }
      const requestId = ++reqCounter;
      pendingDecisions.set(requestId, resolve);
      send({ type: "requestDecision", gameState, requestId });
      setTimeout(() => {
        if (pendingDecisions.has(requestId)) {
          pendingDecisions.delete(requestId);
          resolve(null);
        }
      }, 400);
    });
  }

  function playerAction(action, result, distance) { send({ type: "playerAction", action, result, distance }); }
  function aiAttackOutcome(outcome) { send({ type: "aiAttackOutcome", outcome }); }
  function aiWhiff() { send({ type: "aiWhiff" }); }
  function roundEnd(playerWon) { send({ type: "roundEnd", playerWon }); }
  function setSummaryHandler(fn) { onSummary = fn; }

  async function createRoom(p1Name) {
    await connect();
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      throw new Error("Cannot connect to WebSocket server at " + location.host);
    }
    return new Promise((resolve, reject) => {
      const onMsg = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type === "room_created") {
            ws.removeEventListener("message", onMsg);
            resolve(msg.code);
          } else if (msg.type === "room_error") {
            ws.removeEventListener("message", onMsg);
            reject(new Error(msg.message));
          }
        } catch {}
      };
      ws.addEventListener("message", onMsg);
      send({ type: "create_room", p1Name });
    });
  }

  async function joinRoom(code, p2Name) {
    await connect();
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      throw new Error("Cannot connect to WebSocket server at " + location.host);
    }
    return new Promise((resolve, reject) => {
      const onMsg = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type === "match_start") {
            ws.removeEventListener("message", onMsg);
            resolve(msg);
          } else if (msg.type === "room_error") {
            ws.removeEventListener("message", onMsg);
            reject(new Error(msg.message));
          }
        } catch {}
      };
      ws.addEventListener("message", onMsg);
      send({ type: "join_room", code, p2Name });
    });
  }

  function sendInput(keys, tick) { send({ type: "input", keys, tick }); }
  function sendStateSync(state) { send({ type: "state_sync", state }); }
  function sendHit(hit) { send({ type: "hit", hit }); }
  function sendSuper(side) { send({ type: "super", side }); }
  function sendRematch() { send({ type: "rematch" }); }

  function onStateSync(fn) { stateSyncHandler = fn; }
  function onRemoteInput(fn) { remoteInputHandler = fn; }
  function onRemoteHit(fn) { remoteHitHandler = fn; }
  function onRemoteSuper(fn) { remoteSuperHandler = fn; }
  function onRemoteRematch(fn) { remoteRematchHandler = fn; }
  function onRoomEvent(fn) { roomEventsHandler = fn; }

  return {
    connect,
    isReady, requestDecision, playerAction, aiAttackOutcome, aiWhiff, roundEnd, setSummaryHandler, playerId,
    createRoom, joinRoom, sendInput, sendStateSync, sendHit, sendSuper, sendRematch,
    onStateSync, onRemoteInput, onRemoteHit, onRemoteSuper, onRemoteRematch, onRoomEvent
  };
})();
