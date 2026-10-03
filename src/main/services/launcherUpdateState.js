const STATES = new Set(['idle', 'unconfigured', 'checking', 'current', 'available', 'progress', 'downloaded', 'error']);

function normalizeLauncherUpdateState(value = {}, currentVersion = '') {
  const source = value && typeof value === 'object' ? value : {};
  const type = STATES.has(String(source.type || '')) ? String(source.type) : 'idle';
  return {
    type,
    info: source.info && typeof source.info === 'object' ? source.info : null,
    progress: source.progress && typeof source.progress === 'object' ? source.progress : null,
    error: String(source.error || source.message || ''),
    currentVersion: String(source.currentVersion || currentVersion || ''),
    checkedAt: String(source.checkedAt || '')
  };
}

function reduceLauncherUpdateState(previous, event = {}, currentVersion = '') {
  const oldState = normalizeLauncherUpdateState(previous, currentVersion);
  const nextEvent = event && typeof event === 'object' ? event : {};
  const type = STATES.has(String(nextEvent.type || '')) ? String(nextEvent.type) : oldState.type;
  const info = Object.prototype.hasOwnProperty.call(nextEvent, 'info') ? nextEvent.info : oldState.info;
  const progress = type === 'progress'
    ? (Object.prototype.hasOwnProperty.call(nextEvent, 'progress') ? nextEvent.progress : oldState.progress)
    : null;
  const error = String(nextEvent.error || nextEvent.message || (['available', 'current', 'downloaded', 'checking', 'progress'].includes(type) ? '' : oldState.error));
  return normalizeLauncherUpdateState({
    type,
    info,
    progress: type === 'progress' ? progress : (type === 'downloaded' ? null : progress),
    error,
    currentVersion,
    checkedAt: ['current', 'available', 'error'].includes(type) ? new Date().toISOString() : oldState.checkedAt
  }, currentVersion);
}

function hasLauncherUpdate(state) {
  const type = normalizeLauncherUpdateState(state).type;
  return type === 'available' || type === 'progress' || type === 'downloaded';
}

module.exports = { STATES, normalizeLauncherUpdateState, reduceLauncherUpdateState, hasLauncherUpdate };
