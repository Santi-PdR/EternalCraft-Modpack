const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { windowCloseAction, gameExitAction, GameSessionTracker } = require('../src/main/services/gameLifecycle');

test('closing the window quits without Minecraft and only hides while a game is active', () => {
  assert.equal(windowCloseAction({ activeGames:0 }), 'quit');
  assert.equal(windowCloseAction({ activeGames:1 }), 'hide');
  assert.equal(windowCloseAction({ quitting:true, activeGames:1 }), 'close');
});

test('game exit either restores the launcher or quits a hidden/explicitly closed launcher', () => {
  assert.equal(gameExitAction({ refocusOnExit:true, windowVisible:false }), 'show');
  assert.equal(gameExitAction({ refocusOnExit:false, windowVisible:true }), 'stay');
  assert.equal(gameExitAction({ refocusOnExit:false, windowVisible:false }), 'quit');
  assert.equal(gameExitAction({ closeRequested:true, refocusOnExit:true, windowVisible:true }), 'quit');
});

test('tracked Minecraft children are removed exactly once and report an error/close lifecycle', () => {
  const sessions=[];
  const tracker=new GameSessionTracker((session)=>sessions.push(session));
  const child=new EventEmitter();child.pid=1234;
  tracker.track(child,{safeMode:true,installDirectory:'/instance',startedAt:Date.now()-25});
  assert.equal(tracker.size,1);
  child.emit('close',0,null);
  child.emit('error',new Error('late error'));
  assert.equal(tracker.size,0);
  assert.equal(sessions.length,1);
  assert.equal(sessions[0].safeMode,true);
  assert.equal(sessions[0].installDirectory,'/instance');
  assert.equal(sessions[0].code,0);
  assert.ok(sessions[0].durationMs>=0);
});
