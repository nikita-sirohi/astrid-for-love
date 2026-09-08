import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { AstridApp,JsonFileRepository } from '../src/domain.mjs';

test('a corrected understanding cannot return to Matchy through an old review rationale',async()=>{
  const directory=await mkdtemp(resolve(tmpdir(),'astrid-context-'));
  const repository=new JsonFileRepository(resolve(directory,'state.json'));await repository.init();
  const observed=[];
  const app=new AstridApp({repository,agents:{review:async context=>{observed.push(context);return {decision:'withhold',reason:'No match for this test.',evidenceIds:[],clarifications:[]};}},mode:'offline'});
  try {
    await repository.transact(s=>s.reviews.push({id:'old',participantIds:['maya','eli'],revisions:{maya:1,eli:1},reason:'SUPERSEDED_PRIVATE_EXPECTATION',decision:'withhold'}));
    await app.editMemory('maya','maya-family',{text:'A new confirmed family expectation.',status:'confirmed',strength:'prefers'});
    await app.drain();
    assert.ok(observed.length>0);
    assert.ok(!JSON.stringify(observed).includes('SUPERSEDED_PRIVATE_EXPECTATION'));
  } finally {await app.close();await rm(directory,{recursive:true,force:true});}
});
