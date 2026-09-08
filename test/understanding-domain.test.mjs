import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AstridApp, JsonFileRepository, eligibility } from '../src/domain.mjs';
import { facetFor } from '../src/understanding.mjs';

const empty = () => ({ memories: [], profileUpdates: [], clarificationUpdates: [], gaps: [] });
const memory = (ctx, text, facet = 'family.household') => ({ topic: facetFor(facet).topic, facet, text, status: 'confirmed', strength: 'prefers', evidenceIds: [ctx.messages.at(-1).id] });
async function setup(t, understand = async () => empty()) {
  const dir = await mkdtemp(join(tmpdir(), 'astrid-understanding-'));
  const file = join(dir, 'state.json');
  const repository = new JsonFileRepository(file);
  const agents = { understand, converse: async () => ({ reply: 'Tell me more.', permissions: [] }) };
  const app = new AstridApp({ repository, agents }); app.kick = () => {}; await app.init();
  await repository.transact(state => { state.memories = state.memories.filter(record => record.participantId !== 'maya'); state.clarifications = []; });
  t.after(async () => { await app.close(); await rm(dir, { recursive: true, force: true }); });
  return { app, repository, file };
}

test('independent beliefs in one facet coexist and editing one preserves its sibling and durable history', async t => {
  const { app, file } = await setup(t, async ctx => ({ ...empty(), memories: [memory(ctx, 'My father may stay for a month.'), memory(ctx, 'I need a room of my own.')] }));
  await app.converse('maya', 'My father may stay for a month and I need a room of my own.');
  const records = (await app.listMemories('maya')).memories;
  assert.equal(records.length, 2); assert.notEqual(records[0].id, records[1].id);
  await app.editMemory('maya', records[0].id, { text: 'My father may stay for two weeks.' });
  assert.equal((await app.listMemories('maya')).memories.find(record => record.id === records[1].id).text, records[1].text);
  const reopened = new JsonFileRepository(file); await reopened.init();
  const app2 = new AstridApp({ repository: reopened, agents: app.agents });
  const history = (await app2.memoryHistory('maya', records[0].id)).revisions;
  assert.deepEqual(history.map(record => record.text), ['My father may stay for a month.', 'My father may stay for two weeks.']);
  assert.equal(history.at(-1).userLocked, true);
});

test('deleted beliefs leave text-free tombstones and do not lock their topic against new understanding', async t => {
  let turn = 0;
  const { app } = await setup(t, async ctx => {
    if (++turn === 1) return { ...empty(), memories: [memory(ctx, 'DELETED PRIVATE BELIEF')] };
    assert.ok(!JSON.stringify(ctx).includes('DELETED PRIVATE BELIEF'));
    assert.equal(ctx.memoryTombstones.length, 1);
    assert.deepEqual(Object.keys(ctx.memoryTombstones[0]).sort(), ['facet', 'id', 'topic']);
    return { ...empty(), memories: [memory(ctx, 'A new independent household expectation.')] };
  });
  await app.converse('maya', 'DELETED PRIVATE BELIEF');
  const [record] = (await app.listMemories('maya')).memories;
  await app.editMemory('maya', record.id, {}, true);
  await app.converse('maya', 'Here is a new independent household expectation.');
  const records = (await app.listMemories('maya')).memories;
  assert.equal(records.length, 1); assert.notEqual(records[0].id, record.id);
});

test('household understanding does not satisfy care readiness in the same broad topic', async t => {
  const { app } = await setup(t, async ctx => ({ ...empty(), memories: [memory(ctx, 'I accept a relative living with us.')] }));
  await app.converse('maya', 'I accept a relative living with us.');
  const view = await app.view('maya');
  assert.equal(view.coverageDetails['family.household'], true);
  assert.equal(view.coverageDetails['family.care'], false);
  assert.equal(view.coverage.family, false);
});

test('a clarification retains its safe facet purpose and cannot be answered by unrelated same-topic evidence', async t => {
  const { app, repository } = await setup(t, async ctx => {
    assert.equal(ctx.clarifications[0].uncertainty, facetFor('family.care').question);
    assert.equal(ctx.clarifications[0].completionCondition, facetFor('family.care').completionCondition);
    assert.ok(!JSON.stringify(ctx).includes('OTHER PERSON SECRET'));
    return { ...empty(), memories: [memory(ctx, 'My father can live with us.')], clarificationUpdates: [{ id: 'care-question', status: 'answered', evidenceIds: [ctx.messages.at(-1).id] }] };
  });
  await repository.transact(state => state.clarifications.push({ id: 'care-question', participantId: 'maya', topic: 'family', facet: 'family.care', status: 'queued', reason: 'OTHER PERSON SECRET', uncertainty: 'OTHER PERSON SECRET', evidenceIds: [] }));
  await app.converse('maya', 'My father can live with us.');
  assert.equal((await app.view('maya')).clarifications[0].status, 'queued');
});

test('conversation profile facts become authoritative before Astrid replies without changing matching opt-in', async t => {
  const { app } = await setup(t, async ctx => ({ ...empty(), profileUpdates: [['age', 27], ['gender', 'woman'], ['location', 'Oakland']].map(([field, value]) => ({ field, value: JSON.stringify(value), correction: false, evidenceIds: [ctx.messages.at(-1).id] })) }));
  const before = (await app.view('maya')).participant.matchingEnabled;
  app.agents.converse = async ctx => { assert.equal(ctx.participant.age, 27); assert.equal(ctx.participant.location, 'Oakland'); return { reply: 'What brought you there?' }; };
  await app.converse('maya', 'I am 27, a woman, and live in Oakland.');
  const person = (await app.view('maya')).participant;
  assert.equal(person.age, 27); assert.equal(person.gender, 'woman'); assert.equal(person.location, 'Oakland'); assert.equal(person.matchingEnabled, before);
});

test('a protected profile conflict blocks eligibility until a deliberate UI edit resolves it', async t => {
  const { app, repository } = await setup(t, async ctx => ({ ...empty(), profileUpdates: [{ field: 'age', value: '26', correction: false, evidenceIds: [ctx.messages.at(-1).id] }] }));
  await app.profile('maya', { age: 25 });
  await app.converse('maya', 'I am 26.');
  let state = await repository.read(); let maya = state.participants.find(person => person.id === 'maya'); const eli = state.participants.find(person => person.id === 'eli');
  assert.equal(maya.age, 25); assert.equal(maya.profileConflicts[0].field, 'age');
  assert.equal(eligibility(maya, eli), 'Profile facts need confirmation.');
  await app.profile('maya', { age: 26 });
  state = await repository.read(); maya = state.participants.find(person => person.id === 'maya');
  assert.equal(maya.age, 26); assert.deepEqual(maya.profileConflicts, []); assert.equal(eligibility(maya, eli), null);
});

test('lore compression changes only display summaries and skips concurrent edits', async t => {
  const { app, repository } = await setup(t);
  const note=await app.editMemory('maya',null,{topic:'family',facet:'family.household',text:'A relative can live with us for two weeks, but not permanently.',status:'confirmed',strength:'accepts',sharing:'private'});
  const before=await repository.read();const record=before.memories.find(m=>m.participantId==='maya');
  app.agents.summarize=async ctx=>{assert.equal(ctx.memories.length,1);return {summaries:[{id:record.id,summary:'Accepts relatives staying briefly, not moving in permanently.'}]};};
  assert.equal((await app.summarizeLore('maya')).updated,1);
  const after=await repository.read();const compact=after.memories.find(m=>m.id===record.id);
  const {summary,...unchanged}=compact;const {summary:oldSummary,...original}=record;assert.deepEqual(unchanged,original);assert.deepEqual(after.participants,before.participants);assert.deepEqual(after.jobs,before.jobs);
  app.agents.summarize=async()=>{await app.editMemory('maya',record.id,{text:'A relative can stay for one week.'});return {summaries:[{id:record.id,summary:'Old stale summary'}]};};
  assert.equal((await app.summarizeLore('maya')).updated,0);
  assert.equal((await app.listMemories('maya')).memories[0].summary,null);
});
