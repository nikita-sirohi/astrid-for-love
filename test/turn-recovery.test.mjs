import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {AstridApp,JsonFileRepository} from '../src/domain.mjs';
import {freshProfiles} from '../src/startup.mjs';
const empty=()=>({memories:[],stories:[],profileUpdates:[],clarificationUpdates:[],gaps:[]});
async function setup(t,agents){const dir=await mkdtemp(join(tmpdir(),'astrid-retry-'));const file=join(dir,'state.json');const app=new AstridApp({repository:new JsonFileRepository(file,freshProfiles(2)),agents});app.kick=()=>{};await app.init();t.after(async()=>{await app.close();await rm(dir,{recursive:true,force:true});});return {app,file};}
const answer=async()=>({reply:'A real reply.',permissions:[]});
test('retry failed understanding reuses the saved message and completed retries are idempotent',async t=>{
 let calls=0;const {app}=await setup(t,{understand:async()=>{if(!calls++)throw Error('provider');return empty();},converse:answer});
 await assert.rejects(app.converse('person-1','Hello'));
 const view=await app.view('person-1');assert.ok(view.retryMessageId);assert.equal(view.participant.understandingPending,true);
 const result=await app.retryTurn('person-1',view.retryMessageId);assert.equal(result.reply.text,'A real reply.');
 const again=await app.retryTurn('person-1',view.retryMessageId);assert.equal(again.reply.id,result.reply.id);assert.equal(calls,2);assert.equal((await app.view('person-1')).messages.length,2);
 await assert.rejects(app.retryTurn('person-2',view.retryMessageId),/not found/);
});
test('a committed Memy tool survives its final-response failure and retry skips extraction',async t=>{
 let calls=0;const {app}=await setup(t,{understand:async ctx=>{calls++;await ctx.commitUnderstanding({...empty(),memories:[{topic:'closeness',facet:'closeness.time',text:'Needs time alone.',status:'confirmed',strength:'requires',evidenceIds:[ctx.messages.at(-1).id]}]});throw Error('after commit');},converse:answer});
 await assert.rejects(app.converse('person-1','I need time alone.'));const view=await app.view('person-1');assert.equal(view.memories.length,1);assert.equal(view.participant.understandingPending,false);
 await app.retryTurn('person-1',view.retryMessageId);assert.equal(calls,1);assert.equal((await app.view('person-1')).memories.length,1);
});
test('reply retry after restart reuses persisted matching and permission receipts',async t=>{
 let memy=0;const {app,file}=await setup(t,{understand:async()=>{memy++;return empty();},converse:async ctx=>{await ctx.actions.requestMatching();await ctx.actions.requestPermission({memoryId:'own-note',recipientId:'person-2'});throw Error('reply failed');}});
 await app.repo.transact(s=>s.memories.push({id:'own-note',participantId:'person-1',topic:'closeness',facet:'closeness.time',text:'Independent weekends.',status:'confirmed',strength:'prefers',revision:1,sharing:'private'}));
 await assert.rejects(app.converse('person-1','Could you look for someone?'));const view=await app.view('person-1');await app.close();
 const resumed=new AstridApp({repository:new JsonFileRepository(file),agents:{understand:async()=>{throw Error('must not rerun Memy');},converse:async ctx=>{assert.equal((await ctx.actions.requestMatching()).reused,true);assert.equal((await ctx.actions.requestPermission({memoryId:'own-note',recipientId:'person-2'})).reused,true);return answer();}}});resumed.kick=()=>{};await resumed.init();t.after(()=>resumed.close());
 await resumed.retryTurn('person-1',view.retryMessageId);const s=await resumed.repo.read();assert.equal(s.jobs.length,1);assert.equal(s.permissions.length,1);assert.equal(s.messages.filter(m=>m.role==='user').length,1);assert.equal(memy,1);
});
test('retry cannot replay older failed turns over newer messages or user corrections',async t=>{
 const {app}=await setup(t,{understand:async()=>{throw Error('fail');},converse:answer});
 await assert.rejects(app.converse('person-1','First'));const first=(await app.view('person-1')).retryMessageId;
 await assert.rejects(app.converse('person-1','Second'));await assert.rejects(app.retryTurn('person-1',first),/newer message/);
 const second=(await app.view('person-1')).retryMessageId;await app.profile('person-1',{name:'Corrected'});await assert.rejects(app.retryTurn('person-1',second),/understanding changed/);
});
