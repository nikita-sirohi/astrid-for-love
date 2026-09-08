import test from 'node:test';
import assert from 'node:assert/strict';
import { applicationPrompt, createAgents, structuredResponse } from '../src/agents.mjs';

const person = { id: 'a', name: 'Alex', interests: ['woodworking'] };
const other = { id: 'b', name: 'Bo', interests: ['camping'] };
const message = { id: 'msg-1', chatId: 'astrid-a', authorId: 'a', role: 'user', text: 'I want a long-term relationship.' };
const memory = { id: 'mem-1', participantId: 'a', topic: 'dating', text: 'Wants a long-term relationship.', status: 'confirmed', strength: 'prefers', evidenceIds: ['msg-1'] };
const input = { participant: person, memories: [memory], messages: [message], clarifications: [] };
const output = () => ({ reply: 'What would you want to make room for together?', permissions: [] });
const understanding = () => ({ memories: [], clarificationUpdates: [], gaps: [] });
const adapter = (data, inspect = () => {}) => createAgents({ mode: 'live', config: { key: 'test-key', model: 'gpt-6-astra' }, client: async request => { inspect(request); return { data, model: 'gpt-6-astra', id: 'test-response' }; } });

test('application prompt keeps role examples, replaces laboratory limitations, and records assets', async () => {
  const prompt = await applicationPrompt('astrid');
  assert.match(prompt.instructions, /authored_fictional_examples/);
  assert.doesNotMatch(prompt.instructions, /local prompt laboratory|No application tools are available/);
  assert.match(prompt.instructions, /one bounded application task/);
  assert.equal(prompt.hash.length, 64);
  assert.equal(prompt.assets.at(-1).file, 'runtime/v0.2.0.md');
});

test('converse whitelists own context and strips private matching rationale from clarifications', async () => {
  const agents = adapter(output(), request => {
    const { context } = JSON.parse(request.input[0].content);
    assert.equal(context.memories.length, 1);
    assert.equal(context.messages.length, 1);
    assert.deepEqual(context.clarifications[0], { id: 'q', participantId: 'a', topic: 'family', status: 'queued' });
    assert.ok(!JSON.stringify(context).includes('OTHER SECRET'));
  });
  const result = await agents.converse({ ...input, memories: [...input.memories, { ...memory, id: 'other', participantId: 'b', text: 'OTHER SECRET' }],
    messages: [...input.messages, { ...message, chatId: 'shared', text: 'OTHER SECRET' }],
    clarifications: [{ id: 'q', participantId: 'a', topic: 'family', status: 'queued', reason: 'OTHER SECRET' }] });
  assert.equal(result.metadata.prompt.version, '0.8.0');
  assert.equal(result.metadata.responseId, 'test-response');
});

test('memory updates require own user evidence and cannot overwrite locked memory', async () => {
  const suggestion = { id: null, topic: 'dating', text: 'Wants a partner.', status: 'confirmed', strength: 'prefers', evidenceIds: ['fabricated'] };
  await assert.rejects(adapter({ ...understanding(), memories: [suggestion] }).understand(input), /Invalid agent evidence/);
  await assert.rejects(adapter({ ...understanding(), memories: [{ ...suggestion, id: 'mem-1', evidenceIds: ['msg-1'] }] }).understand({ ...input, memories: [{ ...memory, userLocked: true }] }), /Invalid agent evidence/);
  const result = await adapter({ ...understanding(), memories: [{ ...suggestion, evidenceIds: ['msg-1'] }] }).understand(input);
  assert.equal(result.memories[0].id, undefined);
});

test('permission and clarification mutations require exact authorized IDs and answer evidence', async () => {
  await assert.rejects(adapter({ ...output(), permissions: [{ memoryId: 'mem-1', recipientId: 'b' }] }).converse(input), /Invalid agent evidence/);
  const result = await adapter({ ...output(), permissions: [{ memoryId: 'mem-1', recipientId: 'b' }] }).converse({ ...input, permissionRecipients: [other] });
  assert.equal(result.permissions.length, 1);
  await assert.rejects(adapter({ ...understanding(), clarificationUpdates: [{ id: 'q', status: 'answered' }] }).understand({ ...input,
    clarifications: [{ id: 'q', participantId: 'a', topic: 'family', status: 'queued' }] }), /Invalid agent evidence/);
});

test('proposals need evidence from both participants; fabricated review references fail', async () => {
  const review = { decision: 'propose', reason: 'These practical expectations align.', evidenceIds: ['mem-1'], clarifications: [] };
  const args = { participants: [person, other], memories: [memory, { ...memory, id: 'mem-2', participantId: 'b' }] };
  await assert.rejects(adapter(review).review(args), /Invalid agent evidence/);
  assert.equal((await adapter({ ...review, evidenceIds: ['mem-1', 'mem-2'] }).review(args)).decision, 'propose');
  await assert.rejects(adapter({ ...review, evidenceIds: ['mem-1', 'invented'] }).review(args), /Invalid agent evidence/);
});

test('introductions omit extraneous private fields and private checkins never receive shared chat', async () => {
  await adapter({ text: 'Meet Bo. Ask about camping.' }, request => {
    assert.ok(!request.input[0].content.includes('PRIVATE'));
  }).introduce({ recipient: person, other: { ...other, secret: 'PRIVATE' }, privateRationale: 'PRIVATE', shareableMemories: [] });
  await adapter({ reply: 'How is the connection feeling?' }, request => {
    assert.ok(!request.input[0].content.includes('PRIVATE'));
  }).checkin({ ...input, other, messages: [{ ...message, chatId: 'connection-1', text: 'PRIVATE' }] });
});

test('Responses adapter sends strict schema, disables storage and sanitizes failures/refusals', async () => {
  let body;
  const result = await structuredResponse({ key: 'test-key', model: 'gpt-6-astra', instructions: 'task', input: [], schema: {}, task: 'converse',
    fetchImpl: async (_url, options) => {
      body = JSON.parse(options.body);
      assert.ok(options.signal instanceof AbortSignal);
      return { ok: true, json: async () => ({ status: 'completed', model: body.model, output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(output()) }] }] }) };
    } });
  assert.equal(body.store, false);
  assert.equal(body.text.format.strict, true);
  assert.equal(result.data.reply, output().reply);
  await assert.rejects(structuredResponse({ fetchImpl: async () => { throw new Error('secret credential'); } }), error => error.message === 'Agent request failed or timed out.');
  await assert.rejects(structuredResponse({ fetchImpl: async () => ({ ok: true, json: async () => ({ status: 'completed', output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'private text' }] }] }) }) }), /Invalid agent response/);
});

test('offline review shows readiness, firm family conflict and positive demo branches', async () => {
  const agents = createAgents({ mode: 'offline' });
  const topics = ['dating', 'family', 'ambition', 'closeness', 'relationships', 'repair', 'convictions'];
  const records = [person, other].flatMap(person => topics.map(topic => ({ ...memory, id: `${person.id}-${topic}`, participantId: person.id, topic })));
  records.find(memory => memory.id === 'a-family').text = 'My mother must be able to live with me with separate space and professional care.';
  records.find(memory => memory.id === 'a-family').strength = 'requires';
  records.find(memory => memory.id === 'b-family').text = 'I will never live with a partner’s parent; this is a firm boundary.';
  records.find(memory => memory.id === 'b-family').strength = 'requires';
  const args = { participants: [person, other], memories: records };
  assert.equal((await agents.review(args)).decision, 'withhold');
  records.find(memory => memory.id === 'b-family').text = 'I accept sharing a home with a parent with separate space and professional care.';
  records.find(memory => memory.id === 'b-family').strength = 'accepts';
  const result = await agents.review(args);
  assert.equal(result.decision, 'propose');
  assert.equal(result.metadata.model, 'scripted-demo');
  records.pop();
  assert.equal((await agents.review(args)).decision, 'needs_clarification');
});

test('offline family conversation records evidence and answers own queued work only after specifics', async () => {
  const agents = createAgents({ mode: 'offline' });
  const result = await agents.understand({ ...input, messages: [{ ...message,
    text: 'My mother must be able to live with me. I will arrange separate space and professional care; I do not expect partner caregiving.' }],
    clarifications: [{ id: 'q', participantId: 'a', topic: 'family', status: 'queued' }] });
  assert.equal(result.memories[0].status, 'confirmed');
  assert.deepEqual(result.memories[0].evidenceIds, ['msg-1']);
  assert.deepEqual(result.clarificationUpdates, [{ id: 'q', status: 'answered' }]);
});

test('Memy has a standalone versioned prompt and only receives own authorized understanding', async () => {
  const prompt = await applicationPrompt('memy');
  assert.deepEqual(prompt.assets.map(asset => asset.file), ['memy/v0.1.0.md']);
  assert.match(prompt.instructions, /before Astrid's reply/);
  const result = await adapter(understanding(), request => {
    const { context } = JSON.parse(request.input[0].content);
    assert.equal(request.task, 'understand');
    assert.deepEqual(Object.keys(request.schema.properties), ['memories', 'clarificationUpdates', 'gaps']);
    assert.equal(context.memories.length, 1);
    assert.equal(context.messages.length, 1);
    assert.equal(context.clarifications.length, 0);
    assert.equal(context.permissionRecipients, undefined);
    assert.ok(!JSON.stringify(context).includes('OTHER SECRET'));
  }).understand({ ...input, permissionRecipients: [{ ...other, name: 'OTHER SECRET' }],
    memories: [...input.memories, { ...memory, participantId: 'b', text: 'OTHER SECRET' }],
    messages: [...input.messages, { ...message, chatId: 'astrid-b', authorId: 'b', text: 'OTHER SECRET' }],
    clarifications: [{ id: 'q', participantId: 'b', topic: 'family', status: 'queued', reason: 'OTHER SECRET' }] });
  assert.equal(result.metadata.prompt.role, 'memy');
  assert.equal(result.metadata.prompt.version, '0.1.0');
});

test('Astrid receives compact gap briefing but cannot produce understanding mutations', async () => {
  await adapter(output(), request => {
    const { context } = JSON.parse(request.input[0].content);
    assert.deepEqual(Object.keys(request.schema.properties), ['reply', 'permissions']);
    assert.deepEqual(context.understanding, { gaps: [{ topic: 'family', reason: 'Care expectations are uncertain.' }] });
    assert.ok(!JSON.stringify(context).includes('SECRET'));
  }).converse({ ...input, understanding: { gaps: [{ topic: 'family', reason: 'Care expectations are uncertain.', internal: 'SECRET' }], internal: 'SECRET' } });
  await assert.rejects(adapter({ ...output(), memories: [] }).converse(input), /Invalid agent response/);
  await assert.rejects(adapter({ ...understanding(), reply: 'Hello' }).understand(input), /Invalid agent response/);
  await assert.rejects(adapter({ ...understanding(), gaps: Array(3).fill({ topic: 'family', reason: 'Uncertain.' }) }).understand(input), /Invalid agent response/);
});

test('Memy cannot bypass a locked topic with a fresh ID or change an existing memory topic', async () => {
  const suggestion = { id: null, topic: 'dating', text: 'Wants a partner.', status: 'confirmed', strength: 'prefers', evidenceIds: ['msg-1'] };
  await assert.rejects(adapter({ ...understanding(), memories: [suggestion] }).understand({ ...input, memories: [{ ...memory, userLocked: true }] }), /Invalid agent evidence/);
  await assert.rejects(adapter({ ...understanding(), memories: [{ ...suggestion, id: 'mem-1', topic: 'family' }] }).understand(input), /Invalid agent evidence/);
});
