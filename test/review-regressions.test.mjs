import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {AstridApp,JsonFileRepository} from '../src/domain.mjs';
import {createAgents} from '../src/agents.mjs';
const empty=()=>({memories:[],stories:[],profileUpdates:[],clarificationUpdates:[],gaps:[]});
async function setup(t,overrides={}){const dir=await mkdtemp(join(tmpdir(),'astrid-review-'));const repository=new JsonFileRepository(join(dir,'state.json'));const app=new AstridApp({repository,agents:{...createAgents({mode:'offline'}),...overrides},mode:'offline'});app.kick=()=>{};await app.init();t.after(async()=>{await app.close();await rm(dir,{recursive:true,force:true});});return {app,repository};}
async function proposal(app){const a=await app.browseAdvice('eli','elena');return (await app.browseInterest('eli','elena',a.assessment.reviewId)).proposal;}
test('recipient denial overrides global sharing without withholding from other recipients',async t=>{const {app,repository}=await setup(t);const {memory}=await app.editMemory('eli',null,{kind:'story',storyType:'anecdote',topic:'story',facet:null,text:'A private-to-Elena anecdote.',status:'confirmed',strength:'unknown',sharing:'shareable'});const {permission}=await app.requestPermission('eli',{memoryId:memory.id,recipientId:'elena'});await app.decidePermission('eli',permission.id,'denied');const s=await repository.read();assert.ok(!app.sharedMemories(s,'eli','elena').some(m=>m.id===memory.id));assert.ok(app.sharedMemories(s,'eli','maya').some(m=>m.id===memory.id));});
test('pending or failed understanding blocks second acceptance until extraction succeeds',async t=>{
 let unblock,entered;const began=new Promise(r=>entered=r);const {app,repository}=await setup(t,{understand:async()=>{entered();await new Promise(r=>unblock=r);throw Error('Extraction failed');}});const p=await proposal(app);const turn=app.converse('eli','There is something new to consider.').catch(e=>e);await began;
 await assert.rejects(app.decision('elena',p.id,'accepted'),/still being updated/);unblock();await turn;
 assert.equal((await repository.read()).participants.find(p=>p.id==='eli').understandingPending,true);
 await assert.rejects(app.decision('elena',p.id,'accepted'),/still being updated/);
 app.agents.understand=async()=>empty();await app.converse('eli','Please continue.');const accepted=await app.decision('elena',p.id,'accepted');assert.ok(accepted.chat);
});
test('new private story preserves an existing yes and is committed before the reply',async t=>{
 const {app,repository}=await setup(t,{understand:async ctx=>({...empty(),stories:[{id:null,storyType:'anecdote',text:'I made a paper lantern shaped like a squid.',status:'confirmed',evidenceIds:[ctx.messages.at(-1).id]}]}),converse:async ctx=>{assert.ok(ctx.memories.some(m=>m.kind==='story'));return {reply:'What inspired the squid?',permissions:[]};}});
 const p=await proposal(app);await app.converse('eli','I made a paper lantern shaped like a squid.');const current=(await repository.read()).proposals.find(x=>x.id===p.id);assert.equal(current.status,'pending');assert.equal(current.decisions.eli,'accepted');assert.ok((await app.decision('elena',p.id,'accepted')).chat);
});
test('twenty beliefs cannot crowd out a valid story in the same extraction',async t=>{
 const {app,repository}=await setup(t,{understand:async ctx=>{const evidenceIds=[ctx.messages.at(-1).id];return {...empty(),memories:Array.from({length:20},(_,i)=>({topic:'dating',facet:'dating.intent',text:`Distinct belief ${i}`,status:'confirmed',strength:'prefers',evidenceIds})),stories:[{storyType:'passion',text:'I collect broken umbrellas.',status:'confirmed',evidenceIds}]};}});await app.converse('eli','A deliberately large extraction fixture.');assert.equal((await repository.read()).memories.filter(m=>m.participantId==='eli'&&m.kind==='story').length,1);
});
test('background introduction retains uncertainty on an authorized story',async t=>{
 let saw=false;const {app,repository}=await setup(t,{review:async ctx=>({decision:'propose',exploration:'allow',reason:'Prepared compatible pair.',evidenceIds:ctx.participants.map(p=>ctx.memories.find(m=>m.participantId===p.id).id),clarifications:[]}),introduce:async ctx=>{for(const m of ctx.shareableMemories)if(m.kind==='story'){saw=true;assert.equal(m.status,'tentative');}return {text:'Would you like to meet?'};}});
 await app.editMemory('eli',null,{kind:'story',storyType:'passion',topic:'story',facet:null,text:'Considering taking up puppetry.',status:'tentative',strength:'unknown',sharing:'shareable'});const {job}=await app.runMatching('eli');await app.performReview(job);assert.equal(saw,true);
});
test('automatic revision of a globally shared story requires renewed sharing',async t=>{
 let id;const {app,repository}=await setup(t,{understand:async ctx=>({...empty(),stories:[{id,storyType:'anecdote',text:'A corrected, more private version.',status:'confirmed',evidenceIds:[ctx.messages.at(-1).id]}]})});
 const {memory}=await app.editMemory('eli',null,{kind:'story',storyType:'anecdote',topic:'story',facet:null,text:'Original authorized version.',status:'confirmed',sharing:'shareable'});id=memory.id;
 // Model-created, globally authorized record: unlike a manual text edit, its content is unlocked.
 await repository.transact(s=>{s.memories.find(m=>m.id===id).userLocked=false;});
 await app.converse('eli','Here is a correction.');const s=await repository.read();assert.equal(s.memories.find(m=>m.id===id).sharing,'private');assert.ok(!app.sharedMemories(s,'eli','elena').some(m=>m.id===id));
});
test('interest generation cannot publish a proposal after a new private turn begins',async t=>{
 let start,finish;const began=new Promise(r=>start=r);const {app,repository}=await setup(t,{introduce:async()=>{start();await new Promise(r=>finish=r);return {text:'Would you like to meet?'};}});
 const a=await app.browseAdvice('eli','elena');const interest=app.browseInterest('eli','elena',a.assessment.reviewId);await began;
 await repository.transact(s=>{s.participants.find(p=>p.id==='eli').understandingPending=true;});
 app.agents.introduce=async()=>({text:'Would you like to meet?'});finish();await assert.rejects(interest,/introduction changed/);assert.equal((await repository.read()).proposals.length,0);
});
