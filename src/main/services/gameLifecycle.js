function windowCloseAction({ quitting = false, activeGames = 0 } = {}) {
  if (quitting) return 'close';
  return Number(activeGames) > 0 ? 'hide' : 'quit';
}

function gameExitAction({ closeRequested = false, refocusOnExit = true, windowVisible = false } = {}) {
  if (closeRequested) return 'quit';
  if (refocusOnExit) return 'show';
  return windowVisible ? 'stay' : 'quit';
}

class GameSessionTracker {
  constructor(onExit = () => {}) {
    this.sessions = new Map();
    this.onExit = onExit;
  }

  track(child, details = {}) {
    if (!child || typeof child.once !== 'function') throw new TypeError('Se necesita un proceso de Minecraft válido.');
    const id = Symbol(`minecraft-${child.pid || Date.now()}`);
    const startedAtMs = Number(details.startedAt) || Date.now();
    let finished = false;
    const finish = (session) => {
      if (finished) return;
      finished = true;
      this.sessions.delete(id);
      const endedAtMs = Date.now();
      this.onExit({
        ...details,
        ...session,
        details,
        pid: child.pid || null,
        activeGames: this.sessions.size,
        startedAt: new Date(startedAtMs).toISOString(),
        endedAt: new Date(endedAtMs).toISOString(),
        durationMs: Math.max(0, endedAtMs - startedAtMs)
      });
    };
    this.sessions.set(id, { child, details });
    child.once('error', (error) => finish({ error: error?.message || String(error), code: null, signal: null }));
    child.once('close', (code, signal) => finish({ code: Number.isInteger(code) ? code : null, signal: signal || null, error: '' }));
    return id;
  }

  get size() { return this.sessions.size; }
  get hasActiveGame() { return this.sessions.size > 0; }
}

module.exports = { windowCloseAction, gameExitAction, GameSessionTracker };
