import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AstridApp, JsonFileRepository } from '../src/domain.mjs';
import { createAgents } from '../src/agents.mjs';
async function setup(t, overrides = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'astrid-browsing-'));
  const repository = new JsonFileRepository(join(directory, 'state.json'));
  const agents = { ...createAgents({ mode: 'offline' }), ...overrides };
  const app = new AstridApp({ repository, agents, mode: 'offline' });
  app.kick = () => {}; await app.init();
  t.after(async () => { await app.close(); await rm(directory, { recursive: true, force: true }); });
  return { app, repository };
}
const conflict = error => error.status === 409;
const notFound = error => error.status === 404;

test('discovery lists only eligible visible people and hidden profiles stay out of bootstrap and advice', async t => {
  const { app } = await setup(t);
  assert.deepEqual((await app.discover('eli')).profiles.map(person => person.id).sort(), ['elena', 'maya']);
  await app.profile('elena', { discoverable: false });
  assert.deepEqual((await app.discover('eli')).profiles.map(person => person.id), ['maya']);
  assert.ok(!(await app.bootstrap('eli')).participants.some(person => person.id === 'elena'));
  await assert.rejects(app.browseAdvice('eli', 'elena'), notFound);
  await app.profile('maya', { matchingEnabled: false });
  assert.deepEqual((await app.discover('eli')).profiles, []);
});

test('an exploratory request records one yes and opens a chat only after the other person accepts', async t => {
  const { app } = await setup(t);
  const advice = await app.browseAdvice('eli', 'elena');
  assert.equal(advice.assessment.status, 'explore'); assert.equal(advice.assessment.canRequest, true);
  const { proposal } = await app.browseInterest('eli', 'elena', advice.assessment.reviewId);
  assert.equal(proposal.exploratory, true);
  assert.deepEqual(proposal.decisions, { eli: 'accepted', elena: 'pending' });
  assert.equal((await app.presenter()).counts.chats, 0);
  const accepted = await app.decision('elena', proposal.id, 'accepted');
  assert.ok(accepted.chat.id); assert.equal(accepted.chat.astridPresent, false);
});

test('missing baseline and known firm conflicts hold and cannot request an introduction', async t => {
  const { app } = await setup(t);
  const incomplete = await app.browseAdvice('eli', 'maya');
  assert.equal(incomplete.assessment.status, 'hold'); assert.equal(incomplete.assessment.canRequest, false);
  await assert.rejects(app.browseInterest('eli', 'maya', incomplete.assessment.reviewId), conflict);
  await app.editMemory('maya', 'maya-family', { text: 'My mother must be able to live with me with separate space and professional care.', status: 'confirmed', strength: 'requires' });
  const firm = await app.browseAdvice('maya', 'theo');
  assert.equal(firm.assessment.status, 'hold'); assert.equal(firm.assessment.canRequest, false);
  await assert.rejects(app.browseInterest('maya', 'theo', firm.assessment.reviewId), conflict);
});

test('advice receives neither counterpart private memories nor private pair rationale', async t => {
  let received;
  const { app, repository } = await setup(t, { advise: async context => { received = context; return { text: 'I think this is worth exploring.' }; } });
  await repository.transact(state => {
    state.memories.find(memory => memory.id === 'elena-ambition').text = 'COUNTERPART PRIVATE STORY';
    const ids = ['eli', 'elena'];
    state.reviews.push({ id: 'private-review', participantIds: ids, revisions: Object.fromEntries(ids.map(id => [id, state.participants.find(person => person.id === id).revision])), decision: 'needs_clarification', exploration: 'allow', reason: 'PRIVATE PAIR REASON', evidenceIds: ['eli-closeness', 'elena-closeness'], clarifications: [{ participantId: 'eli', topic: 'closeness', facet: 'closeness.time', evidenceIds: ['eli-closeness'] }, { participantId: 'elena', topic: 'ambition', facet: 'ambition.work', evidenceIds: ['elena-ambition'] }] });
  });
  await app.browseAdvice('eli', 'elena');
  assert.ok(!JSON.stringify(received).includes('COUNTERPART PRIVATE STORY'));
  assert.ok(!JSON.stringify(received).includes('PRIVATE PAIR REASON'));
  assert.deepEqual(received.assessment.topics, [{ facet: 'closeness.time', evidenceIds: ['eli-closeness'] }]);
  assert.ok(received.memories.every(memory => memory.participantId === 'eli'));
});

test('profile revision changes invalidate an already delivered browsing recommendation', async t => {
  const { app } = await setup(t);
  const advice = await app.browseAdvice('eli', 'elena');
  await app.profile('elena', { bio: 'A revised public introduction.' });
  await assert.rejects(app.browseInterest('eli', 'elena', advice.assessment.reviewId), conflict);
  assert.equal((await app.presenter()).counts.proposals, 0);
});

test('a revision change while advice is running prevents saving or returning stale advice', async t => {
  let release, entered;
  const gate = new Promise(resolve => { release = resolve; });
  const started = new Promise(resolve => { entered = resolve; });
  const { app, repository } = await setup(t, { advise: async () => { entered(); await gate; return { text: 'Outdated advice.' }; } });
  const request = app.browseAdvice('eli', 'elena'); await started;
  await app.profile('elena', { bio: 'A different introduction.' }); release();
  await assert.rejects(request, conflict);
  assert.ok(!(await repository.read()).browseAdvice?.some(advice => advice.text === 'Outdated advice.'));
});

test('a declined introduction cannot be resurrected through browsing', async t => {
  const { app } = await setup(t);
  const advice = await app.browseAdvice('eli', 'elena');
  const { proposal } = await app.browseInterest('eli', 'elena', advice.assessment.reviewId);
  await app.decision('elena', proposal.id, 'declined', 'No spark for me.');
  const later = await app.browseAdvice('eli', 'elena');
  assert.equal(later.assessment.status, 'hold'); assert.equal(later.assessment.canRequest, false);
  await assert.rejects(app.browseInterest('eli', 'elena', advice.assessment.reviewId), conflict);
  assert.equal((await app.presenter()).counts.chats, 0);
});

test('current verdicts order discovery without fabricated scores; discussion persists safe advice once', async t => {
 const {app,repository}=await setup(t);
 const unknown=await app.discover('eli');assert.ok(unknown.profiles.every(p=>p.matchStatus==='unknown'));
 const elena=await app.browseAdvice('eli','elena');
 const maya=await app.browseAdvice('eli','maya');
 const ranked=await app.discover('eli');assert.equal(ranked.profiles[0].id,'elena');
 assert.ok(ranked.profiles.every(p=>p.score===undefined));
 const first=await app.discussAdvice('eli','maya',maya.assessment.reviewId);
 const again=await app.discussAdvice('eli','maya',maya.assessment.reviewId);
 assert.equal(first.message.id,again.message.id);assert.match(first.message.text,/About Maya/);
 assert.equal(first.message.authorId,'astrid');
 await app.profile('eli',{bio:'Updated'});
 await assert.rejects(app.discussAdvice('eli','elena',elena.assessment.reviewId),conflict);
});

test('missing own evidence still produces a concrete private discussion question', async t=>{
 const {app,repository}=await setup(t);
 await repository.transact(s=>{s.memories=s.memories.filter(m=>m.participantId!=='eli');});
 const advice=await app.browseAdvice('eli','elena');
 assert.match(advice.assessment.text,/explore/i);
 const result=await app.discussAdvice('eli','elena',advice.assessment.reviewId);
 assert.match(result.message.text,/What kind of relationship do you want/);
 assert.equal((await repository.read()).memories.filter(m=>m.participantId==='eli').length,0);
});

test('blank fictional shells are previewable but cannot bypass adult eligibility or readiness',async t=>{
 const {app,repository}=await setup(t);
 await repository.transact(s=>{for(const p of s.participants){p.demoShell=true;p.age=null;p.gender='';p.interestedIn=[];p.bio='';p.interests=[];}s.memories=[];});
 assert.equal((await app.discover('eli')).profiles.length,3);
 const advice=await app.browseAdvice('eli','elena');assert.equal(advice.assessment.canRequest,false);
 await assert.rejects(app.browseInterest('eli','elena',advice.assessment.reviewId),conflict);
 await repository.transact(s=>{s.participants.find(p=>p.id==='elena').age=17;});
 assert.ok(!(await app.discover('eli')).profiles.some(p=>p.id==='elena'));
});
