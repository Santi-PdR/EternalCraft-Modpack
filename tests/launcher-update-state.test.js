const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeLauncherUpdateState, reduceLauncherUpdateState, hasLauncherUpdate } = require('../src/main/services/launcherUpdateState');

test('launcher update state is a durable snapshot shared by all UI surfaces', () => {
  let state=normalizeLauncherUpdateState({type:'idle'},'0.81.0');
  state=reduceLauncherUpdateState(state,{type:'checking'},'0.81.0');
  assert.equal(state.type,'checking');
  state=reduceLauncherUpdateState(state,{type:'available',info:{version:'0.82.0'}},'0.81.0');
  assert.equal(hasLauncherUpdate(state),true);
  assert.equal(state.info.version,'0.82.0');
  state=reduceLauncherUpdateState(state,{type:'progress',progress:{percent:42}},'0.81.0');
  assert.equal(hasLauncherUpdate(state),true);
  assert.equal(state.progress.percent,42);
  state=reduceLauncherUpdateState(state,{type:'downloaded'},'0.81.0');
  assert.equal(state.type,'downloaded');
  assert.equal(state.progress,null);
  state=reduceLauncherUpdateState(state,{type:'current',info:null},'0.81.0');
  assert.equal(hasLauncherUpdate(state),false);
  assert.equal(state.type,'current');
});

test('cancelling a launcher download clears progress and returns to a retryable available state', () => {
  const progress={type:'progress',info:{version:'0.82.0'},progress:{percent:42,transferred:420,total:1000}};
  const cancelled=reduceLauncherUpdateState(progress,{type:'available',info:{version:'0.82.0'},error:''},'0.81.0');
  assert.equal(cancelled.type,'available');
  assert.equal(cancelled.progress,null);
  assert.equal(cancelled.error,'');
  assert.equal(hasLauncherUpdate(cancelled),true);
});

test('update-state errors remain retryable and unknown event types are normalized', () => {
  const error=reduceLauncherUpdateState({type:'available',info:{version:'0.82.0'}},{type:'error',message:'offline'},'0.81.0');
  assert.equal(error.type,'error');
  assert.equal(error.error,'offline');
  assert.equal(hasLauncherUpdate(error),false);
  assert.equal(normalizeLauncherUpdateState({type:'not-a-state'}).type,'idle');
});
