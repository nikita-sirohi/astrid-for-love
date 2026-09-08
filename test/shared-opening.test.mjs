import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AstridApp,JsonFileRepository } from '../src/domain.mjs';

async function setup(t,sharedOpening) {
  const dir=await mkdtemp(join(tmpdir(),'astrid-opening-'));
  const repository=new JsonFileRepository(join(dir,'state.json'));
  const app=new AstridApp({repository,agents:{sharedOpening,checkin:async context=>{assert.ok(!JSON.stringify(context).includes('private shared chat secret'));return {reply:'How did it feel?'};}},mode:'offline'});
  app.kick=()=>{};await app.init();
  await repository.transact(s=>{
    s.memories=[];s.permissions=[];s.proposals=[];
    const ids=['maya','eli'];
    s.proposals.push({id:'p',participantIds:ids,status:'pending',decisions:{maya:'pending',eli:'pending'},introductions:{maya:'Audience-specific private preview',eli:'Other private preview'},revisions:Object.fromEntries(ids.map(id=>[id,s.participants.find(p=>p.id===id).revision]))});
    const record=(id,text)=>({id,participantId:'maya',text,status:'confirmed',kind:'story',storyType:'anecdote',revision:1,sharing:'private',history:[{text:'secret old version'}]});
    s.memories.push(record('approved','Built a tiny cinema for her pet snails.'),record('wrong-audience','Secret chess tournament.'),record('stale','Secret mountain trip.'),{...record('denied','Secret kite collection.'),sharing:'shareable'});
    s.permissions.push({memoryId:'approved',recipientId:'eli',memoryRevision:1,status:'granted'},{memoryId:'wrong-audience',recipientId:'theo',memoryRevision:1,status:'granted'},{memoryId:'stale',recipientId:'eli',memoryRevision:0,status:'granted'},{memoryId:'denied',recipientId:'eli',memoryRevision:1,status:'denied'});
  });
  t.after(async()=>{await app.close();await rm(dir,{recursive:true,force:true});});
  return {app,repository};
}
const latch=()=>{let release;return {promise:new Promise(resolve=>release=resolve),release:()=>release()};};

test('shared opening gets only material authorized for both listeners; one opening then departure',async t=>{
  let calls=0;
  const {app}=await setup(t,async context=>{
    calls++;
    assert.deepEqual(context.shareableMemories.map(m=>m.id),['approved']);
    assert.ok(!JSON.stringify(context).includes('secret old version'));
    assert.ok(!JSON.stringify(context).includes('private preview'));
    return {text:'Maya, Eli: the tiny snail cinema deserves an opening night. What film gets the first screening? I’ll leave you to cast it.'};
  });
  assert.equal((await app.decision('maya','p','accepted')).chat,undefined);
  const [a,b]=await Promise.all([app.decision('eli','p','accepted'),app.decision('eli','p','accepted')]);
  assert.equal(a.chat.id,b.chat.id);assert.equal(calls,1);
  const {messages}=await app.chat(a.chat.id,'maya');assert.equal(messages.length,3);assert.match(messages[1].text,/snail cinema/);assert.match(messages[2].text,/Astrid left/);
  await app.chatMessage(a.chat.id,'maya','private shared chat secret');await app.checkin('maya',a.chat.id);assert.equal(calls,1);
});

for(const change of ['decline','revision','permission'])test(`shared opening discards generated text after ${change} changes`,async t=>{
  const started=latch(),finish=latch();
  const {app,repository}=await setup(t,async()=>{started.release();await finish.promise;return {text:'Unsafe stale opening'};});
  await app.decision('maya','p','accepted');
  const acceptance=app.decision('eli','p','accepted');await started.promise;
  if(change==='decline')await app.decision('maya','p','declined');
  else await repository.transact(s=>{if(change==='revision')s.participants.find(p=>p.id==='maya').revision++;else s.permissions.find(p=>p.memoryId==='approved').status='denied';});
  finish.release();await assert.rejects(acceptance,error=>error.status===409);
  assert.equal((await repository.read()).chats.length,0);
});

test('failed shared opening preserves consent and permits retry without duplicate introduction',async t=>{
  let calls=0;const {app,repository}=await setup(t,async()=>{if(++calls===1)throw new Error('Provider unavailable');return {text:'You both said yes. What would make a memorable first afternoon? I’ll leave you to it.'};});
  await app.decision('maya','p','accepted');await assert.rejects(app.decision('eli','p','accepted'),/Provider unavailable/);
  const state=await repository.read();assert.deepEqual(state.proposals[0].decisions,{maya:'accepted',eli:'accepted'});assert.equal(state.chats.length,0);
  const result=await app.decision('eli','p','accepted');assert.ok(result.chat);assert.equal(calls,2);
  assert.equal((await app.decision('maya','p','accepted')).chat.id,result.chat.id);assert.equal(calls,2);
});
