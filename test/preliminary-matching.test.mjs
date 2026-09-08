import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AstridApp, JsonFileRepository } from '../src/domain.mjs';
import { createAgents } from '../src/agents.mjs';

async function setup(t, review) {
  const directory=await mkdtemp(join(tmpdir(),'astrid-preliminary-'));
  const repository=new JsonFileRepository(join(directory,'state.json'));
  const app=new AstridApp({repository,agents:{...createAgents({mode:'offline'}),review}});
  app.kick=()=>{};await app.init();
  await repository.transact(s=>{
    s.participants=s.participants.filter(p=>['eli','elena'].includes(p.id));
    s.memories=s.memories.filter(m=>['eli','elena'].includes(m.participantId)&&['dating.intent','dating.structure','closeness.time'].includes(m.facet));
    for(const p of s.participants)p.location='';
  });
  t.after(async()=>{await app.close();await rm(directory,{recursive:true,force:true});});
  return {app,repository,pair:async()=>{const s=await repository.read();return app.evaluatePair(s,...s.participants);}};
}
const clarify=()=>({decision:'needs_clarification',exploration:'hold',reason:'Compare the practical room they make for dating.',evidenceIds:[],clarifications:[{participantId:'eli',topic:'dating',facet:'dating.availability',evidenceIds:[]}]});

test('partial understanding triggers a real preliminary review and persists its consequential handoff',async t=>{
  let received;
  const {app,repository}=await setup(t,async input=>{received=input;return clarify();});
  const {job}=await app.runMatching('eli');await app.performReview(job);
  assert.equal(received.phase,'preliminary');assert.ok(received.missingFacets.some(m=>m.facet==='family.care'));
  assert.equal(received.memories.length,6);
  const state=await repository.read();assert.equal(state.reviews[0].phase,'preliminary');
  assert.equal(state.clarifications[0].facet,'dating.availability');assert.equal(state.proposals.length,0);
});

test('an overoptimistic preliminary response cannot propose or allow an introduction',async t=>{
  const {app,repository}=await setup(t,async()=>({decision:'propose',exploration:'allow',reason:'A possible fit.',evidenceIds:[],clarifications:[]}));
  const {job}=await app.runMatching('eli');await app.performReview(job);
  const state=await repository.read(),review=state.reviews[0];
  assert.equal(review.decision,'needs_clarification');assert.equal(review.exploration,'hold');assert.ok(review.clarifications.length);
  assert.equal(state.proposals.length,0);
  const advice=await app.browseAdvice('eli','elena');assert.equal(advice.assessment.canRequest,false);
  await assert.rejects(app.browseInterest('eli','elena',review.id),error=>error.status===409);
});

test('stories and tentative beliefs cannot satisfy the preliminary threshold',async t=>{
  let calls=0;const {repository,pair}=await setup(t,async()=>{calls++;return clarify();});
  await repository.transact(s=>{const records=s.memories.filter(m=>m.participantId==='eli');records[0].kind='story';records[1].status='tentative';});
  assert.equal((await pair()).phase,'gated');assert.equal(calls,0);
});

test('known eligibility conflicts and unestablished attraction still block early review',async t=>{
  for(const change of [p=>p.age=17,p=>p.interestedIn=[],p=>p.interestedIn=['women'],p=>p.matchingEnabled=false,p=>p.ageRange=[40,50],p=>p.profileConflicts=[{field:'gender'}]]) {
    let calls=0;const {repository,pair}=await setup(t,async()=>{calls++;return clarify();});
    await repository.transact(s=>change(s.participants.find(p=>p.id==='elena')));
    assert.equal((await pair()).phase,'gated');assert.equal(calls,0);
  }
});

test('early firm conflicts remain withheld and pending understanding prevents review',async t=>{
  let calls=0;const {app,repository,pair}=await setup(t,async()=>{calls++;return {...clarify(),decision:'withhold',reason:'Explicit incompatible requirements.'};});
  const result=await pair();assert.equal(result.decision,'withhold');assert.equal(result.exploration,'hold');assert.deepEqual(result.clarifications,[]);
  await repository.transact(s=>s.participants[0].understandingPending=true);
  const {job}=await app.runMatching('eli');await app.performReview(job);assert.equal(calls,1);
  assert.equal((await repository.read()).reviews.length,0);
});

test('a preliminary browsing assessment survives missing location without authorizing an introduction',async t=>{
  const {app,repository}=await setup(t,async()=>clarify());
  let received;app.agents.advise=async context=>{received=context;return {text:'Worth exploring; let’s clarify the practical expectations.'};};
  await repository.transact(s=>{for(const p of s.participants){p.location='';p.demoShell=true;}});
  const result=await app.browseAdvice('eli','elena');
  assert.equal(result.assessment.status,'explore');assert.equal(result.assessment.canRequest,false);
  assert.equal(received.assessment.basis,'preliminary');
  assert.equal((await app.discover('eli')).profiles[0].matchStatus,'explore');
  await assert.rejects(app.browseInterest('eli','elena',result.assessment.reviewId),error=>error.status===409);
});

test('an empty counterpart is identified without inventing more homework for the established reader',async t=>{
  const {app,repository}=await setup(t,async()=>clarify());
  let received;app.agents.advise=async context=>{received=context;return {text:'The other person needs to get started.'};};
  await repository.transact(s=>{s.memories=s.memories.filter(m=>m.participantId!=='elena');const p=s.participants.find(p=>p.id==='elena');p.demoShell=true;p.age=null;p.interestedIn=[];});
  const result=await app.browseAdvice('eli','elena');
  assert.equal(result.assessment.canRequest,false);assert.equal(received.assessment.basis,'other_unstarted');assert.deepEqual(received.assessment.topics,[]);
});
