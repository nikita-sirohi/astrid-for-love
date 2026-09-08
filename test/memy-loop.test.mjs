import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AstridApp, JsonFileRepository } from '../src/domain.mjs';
async function setup(t,agents) {
 const dir=await mkdtemp(join(tmpdir(),'memy-loop-'));
 const repository=new JsonFileRepository(join(dir,'state.json'));
 const app=new AstridApp({repository,agents});app.kick=()=>{};await app.init();
 t.after(async()=>{await app.close();await rm(dir,{recursive:true,force:true});});return {app,repository};
}
const update=ctx=>({memories:[{id:'maya-family',topic:'family',facet:'family.household',text:'My mother needs her own space; I arrange her care.',status:'confirmed',strength:'requires',evidenceIds:[ctx.messages.at(-1).id]}],clarificationUpdates:[],gaps:[]});
test('Memy commits before Astrid reads context and Astrid cannot mutate memory',async t=>{
 let calls=[];let repository;
 const setupResult=await setup(t,{understand:async ctx=>{calls.push('memy');return update(ctx);},converse:async ctx=>{
 calls.push('astrid');assert.equal(ctx.memories.find(m=>m.id==='maya-family').status,'confirmed');
 assert.equal((await repository.read()).memories.find(m=>m.id==='maya-family').status,'confirmed');
 return {reply:'What would you make room for in return?',memories:[{topic:'family',facet:'family.household',text:'Do not save this'}]};}});
 repository=setupResult.repository;await setupResult.app.converse('maya','My mother needs her own space; I arrange her care.');
 assert.deepEqual(calls,['memy','astrid']);assert.ok(!JSON.stringify(await repository.read()).includes('Do not save this'));
});
test('Memy failure stops the turn; Astrid failure preserves committed understanding',async t=>{
 let called=false;
 const {app}=await setup(t,{understand:async()=>{throw Error('Memy failed');},converse:async()=>{called=true;}});
 await assert.rejects(app.converse('maya','Remember this.'),/Memy failed/);assert.equal(called,false);assert.equal(app.busy.size,0);
 app.agents.understand=async ctx=>update(ctx);app.agents.converse=async()=>{throw Error('Astrid failed');};
 await assert.rejects(app.converse('maya','My mother needs her own space; I arrange her care.'),/Astrid failed/);
 assert.equal((await app.view('maya')).memories.find(m=>m.id==='maya-family').status,'confirmed');
});
test('a user correction while Memy runs wins and prevents an outdated reply',async t=>{
 let release,entered;const gate=new Promise(r=>release=r),started=new Promise(r=>entered=r);let called=false;
 const {app}=await setup(t,{understand:async ctx=>{entered();await gate;return update(ctx);},converse:async()=>{called=true;return {reply:'No'};}});
 const turn=app.converse('maya','My mother needs her own space; I arrange her care.');await started;
 await app.editMemory('maya','maya-family',{text:'Authoritative correction'});release();
 await assert.rejects(turn,e=>e.status===409);assert.equal(called,false);
 assert.equal((await app.view('maya')).memories.find(m=>m.id==='maya-family').text,'Authoritative correction');
});

test('fresh confirmation evidence can close a queued question without changing the belief wording',async t=>{
 const {app,repository}=await setup(t,{understand:async ctx=>{
  const memory=ctx.memories.find(m=>m.id==='maya-family');const evidenceIds=[ctx.messages.at(-1).id];
  return {memories:[{...memory,evidenceIds}],clarificationUpdates:[{id:'confirm-household',status:'answered',evidenceIds}],gaps:[]};
 },converse:async()=>({reply:'What has surprised you about dating lately?'})});
 await repository.transact(s=>{s.memories.find(m=>m.id==='maya-family').status='confirmed';s.clarifications.push({id:'confirm-household',participantId:'maya',topic:'family',facet:'family.household',status:'queued',evidenceIds:['maya-family']});});
 await app.converse('maya','Yes, that is exactly the household arrangement I mean.');
 assert.equal((await repository.read()).clarifications.find(c=>c.id==='confirm-household').status,'answered');
});
