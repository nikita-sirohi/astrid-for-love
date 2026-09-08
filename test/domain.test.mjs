import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AstridApp, JsonFileRepository } from '../src/domain.mjs';
import { createAgents } from '../src/agents.mjs';

const familyText = 'My mother must be able to live with me. I will arrange separate space and professional care; I do not expect partner caregiving.';
async function setup(t, overrides = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'astrid-domain-'));
  const repository = new JsonFileRepository(join(directory, 'state.json'));
  const app = new AstridApp({ repository, agents: { ...createAgents({ mode: 'offline' }), ...overrides }, mode: 'offline' });
  // Make worker timing deterministic: tests explicitly drain queued durable jobs.
  app.kick = () => {};
  await app.init();
  t.after(async () => { await app.close(); await rm(directory, { recursive: true, force: true }); });
  return { app, repository, directory };
}
async function ready(app) {
  await app.editMemory('maya', 'maya-family', { text: familyText, status: 'confirmed', strength: 'requires' });
  await app.drain();
  return (await app.view('maya')).proposals.find(p => p.participantIds.includes('eli') && p.status === 'pending');
}
const notFound = error => error.status === 404;

test('readiness gates proposals; correction produces one promising pair and withholds firm conflict', async t => {
  const { app } = await setup(t);
  await app.runMatching('maya'); await app.drain();
  assert.equal((await app.view('maya')).proposals.length, 0);
  assert.ok((await app.view('maya')).clarifications.some(c => c.topic === 'family' && c.status === 'queued'));
  const proposal = await ready(app);
  assert.ok(proposal);
  const presenter = await app.presenter();
  assert.ok(presenter.reviews.some(r => r.participantIds.includes('theo') && r.decision === 'withhold'));
  const view = await app.view('maya');
  assert.ok(!Object.hasOwn(view, 'reviews'));
  assert.ok(view.proposals.every(p => Object.keys(p.introductions).every(id => id === 'maya')));
});

test('double opt-in is atomic and idempotent; only members access shared chat and Astrid stays out', async t => {
  let checkinContext;
  const { app, repository } = await setup(t, { checkin: async context => { checkinContext = context; return { reply: 'How is it feeling?' }; } });
  const proposal = await ready(app);
  await assert.rejects(app.decision('theo', proposal.id, 'accepted'), notFound);
  const first = await app.decision('maya', proposal.id, 'accepted');
  assert.equal(first.chat, undefined);
  assert.equal((await app.presenter()).counts.chats, 0);
  const [second, repeated] = await Promise.all([app.decision('eli', proposal.id, 'accepted'), app.decision('eli', proposal.id, 'accepted')]);
  assert.equal(second.chat.id, repeated.chat.id);
  assert.equal((await app.presenter()).counts.chats, 1);
  assert.equal(second.chat.astridPresent, false);
  const opening = await app.chat(second.chat.id, 'maya');
  assert.equal(opening.messages.length, 3);
  assert.match(opening.messages.at(-1).text, /Astrid left/);
  await assert.rejects(app.chat(second.chat.id, 'theo'), notFound);
  await assert.rejects(app.chatMessage(second.chat.id, 'theo', 'Intrusion'), notFound);
  await app.chatMessage(second.chat.id, 'maya', 'Shared-only secret');
  await app.checkin('maya', second.chat.id);
  assert.ok(!JSON.stringify(checkinContext).includes('Shared-only secret'));
  assert.equal((await repository.read()).messages.filter(m => m.chatId === second.chat.id && m.authorId === 'astrid').length, 1);
});

test('editing understanding invalidates pending consent; decline suppresses rematching', async t => {
  const { app } = await setup(t);
  const proposal = await ready(app);
  await app.decision('maya', proposal.id, 'accepted');
  await app.editMemory('eli', 'eli-closeness', { text: 'I need two evenings alone every week.' });
  await assert.rejects(app.decision('eli', proposal.id, 'accepted'), error => error.status === 409);
  assert.equal((await app.presenter()).counts.chats, 0);
  await app.drain();
  const current = (await app.view('maya')).proposals.find(p => p.status === 'pending' && p.participantIds.includes('eli'));
  await app.decision('maya', current.id, 'declined', 'No spark');
  await app.runMatching('maya'); await app.drain();
  assert.equal((await app.view('maya')).proposals.filter(p => p.participantIds.includes('eli') && p.status === 'pending').length, 0);
  assert.ok((await app.view('maya')).messages.some(m => m.text.includes('No spark')));
  assert.ok(!(await app.view('eli')).messages.some(m => m.text.includes('No spark')));
});

test('permission grants are content-version and recipient scoped; denial and edits exclude material', async t => {
  const { app, repository } = await setup(t);
  const { permission } = await app.requestPermission('maya', { memoryId: 'maya-family', recipientId: 'eli' });
  await assert.rejects(app.decidePermission('eli', permission.id, 'granted'), notFound);
  await app.decidePermission('maya', permission.id, 'denied');
  assert.equal(app.sharedMemories(await repository.read(), 'maya', 'eli').length, 0);
  const duplicate = await app.requestPermission('maya', { memoryId: 'maya-family', recipientId: 'eli' });
  assert.equal(duplicate.permission.id, permission.id);
  assert.equal(duplicate.permission.status, 'denied');
  await app.decidePermission('maya', permission.id, 'granted');
  assert.equal(app.sharedMemories(await repository.read(), 'maya', 'eli').length, 1);
  assert.equal(app.sharedMemories(await repository.read(), 'maya', 'theo').length, 0);
  await app.editMemory('maya', 'maya-family', { text: familyText });
  assert.equal(app.sharedMemories(await repository.read(), 'maya', 'eli').length, 0);
  await assert.rejects(app.decidePermission('maya', permission.id, 'granted'), error => error.status === 409);
});

test('corrections suppress older messages and resist agent resurrection; deletion blocks topic writes', async t => {
  const contexts = [];
  const { app, repository } = await setup(t, { understand: async context => {
    contexts.push(context);
    const evidence = context.messages.filter(m => m.role === 'user').at(-1).id;
    return { reply: 'What matters most about that?', memories: [{ topic: 'family', text: 'Resurrected old assumption', status: 'confirmed', strength: 'requires', evidenceIds: [evidence] }] };
  } });
  await app.editMemory('maya', 'maya-family', { text: 'A corrected family expectation.', status: 'confirmed', strength: 'prefers' });
  await app.converse('maya', 'Let us keep talking.');
  assert.equal(contexts[0].messages.length, 1);
  assert.equal(contexts[0].messages[0].text, 'Let us keep talking.');
  assert.equal((await app.view('maya')).memories.find(m => m.id === 'maya-family').text, 'A corrected family expectation.');
  await app.editMemory('maya', 'maya-family', {}, true);
  await app.converse('maya', 'New conversation after deletion.');
  assert.ok(!contexts[1].memories.some(m => m.topic === 'family'));
  assert.equal(contexts[1].messages.length, 1);
  assert.ok(!(await app.view('maya')).memories.some(m => m.topic === 'family'));
  assert.ok((await repository.read()).memories.find(m => m.id === 'maya-family').deleted);
  await assert.rejects(app.editMemory('eli', 'maya-family', { text: 'Wrong owner' }), notFound);
});

test('multiple distinct proposals and chats coexist; repeated matching creates no duplicate pair', async t => {
  const { app } = await setup(t);
  await app.editMemory('theo', 'theo-family', { text: 'I accept sharing a home with a parent with separate space and professional care.', strength: 'accepts' });
  await ready(app);
  const pending = (await app.view('maya')).proposals.filter(p => p.status === 'pending');
  assert.equal(pending.length, 2);
  for (const proposal of pending) {
    await app.decision('maya', proposal.id, 'accepted');
    await app.decision(proposal.participantIds.find(id => id !== 'maya'), proposal.id, 'accepted');
  }
  await app.runMatching('maya'); await app.drain();
  assert.equal((await app.view('maya')).chats.length, 2);
  assert.equal((await app.view('maya')).proposals.length, 2);
});

test('a changed revision during Matchy review discards its result', async t => {
  let entered, release;
  const enteredPromise = new Promise(resolve => { entered = resolve; });
  const paused = new Promise(resolve => { release = resolve; });
  const offline = createAgents({ mode: 'offline' });
  let first = true;
  const { app } = await setup(t, { review: async args => {
    if (first) { first = false; entered(); await paused; }
    return offline.review(args);
  } });
  await app.editMemory('maya', 'maya-family', { text: familyText, status: 'confirmed', strength: 'requires' });
  const { job } = await app.runMatching('maya');
  const running = app.performReview(job);
  await enteredPromise;
  await app.profile('maya', { matchingEnabled: false });
  release(); await running;
  assert.equal((await app.view('maya')).proposals.length, 0);
  assert.ok((await app.presenter()).events.some(event => event.type === 'stale_review'));
});

test('agent failures preserve user messages and mark durable jobs failed without private errors', async t => {
  const { app } = await setup(t, {
    converse: async () => { throw new Error('Provider failed'); },
    review: async () => { throw new Error('Private provider error secret'); },
  });
  await assert.rejects(app.converse('maya', 'Please remember this turn.'), /Provider failed/);
  assert.equal(app.busy.size, 0);
  assert.equal((await app.view('maya')).messages.at(-1).text, 'Please remember this turn.');
  await app.editMemory('maya', 'maya-family', { text: familyText, status: 'confirmed', strength: 'requires' });
  await app.drain();
  const presenter = await app.presenter();
  assert.ok(presenter.jobs.some(job => job.status === 'failed'));
  assert.ok(!JSON.stringify(presenter).includes('Private provider error secret'));
  assert.equal(presenter.counts.proposals, 0);
});

test('repository restart preserves state and recovers interrupted jobs for retry', async t => {
  const { app, repository, directory } = await setup(t);
  await app.editMemory('maya', 'maya-family', { text: familyText, status: 'confirmed', strength: 'requires' });
  await repository.transact(state => { state.jobs[0].status = 'running'; });
  const reopened = new JsonFileRepository(join(directory, 'state.json'));
  await reopened.init();
  const state = await reopened.read();
  assert.equal(state.jobs[0].status, 'queued');
  assert.equal(state.memories.find(m => m.id === 'maya-family').text, familyText);
  await assert.rejects(repository.transact(state => { state.participants[0].name = 'Should roll back'; throw new Error('Abort'); }), /Abort/);
  assert.equal((await repository.read()).participants[0].name, 'Maya');
});
