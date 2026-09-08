import test from 'node:test';
import assert from 'node:assert/strict';
import { facets } from '../src/understanding.mjs';
import { applicationPrompt, createAgents, structuredResponse } from '../src/agents.mjs';

const person = { id: 'a', name: 'Alex', interests: ['woodworking'] };
const other = { id: 'b', name: 'Bo', interests: ['camping'] };
const message = { id: 'msg-1', chatId: 'astrid-a', authorId: 'a', role: 'user', text: 'I want a long-term relationship.' };
const memory = { id: 'mem-1', participantId: 'a', topic: 'dating', facet: 'dating.intent', text: 'Wants a long-term relationship.', status: 'confirmed', strength: 'prefers', evidenceIds: ['msg-1'] };
const input = { participant: person, memories: [memory], messages: [message], clarifications: [] };
const output = () => ({ reply: 'What would you want to make room for together?', permissions: [] });
const understanding = () => ({ memories: [], profileUpdates: [], clarificationUpdates: [], gaps: [] });
const adapter = (data, inspect = () => {}) => createAgents({ mode: 'live', config: { key: 'test-key', model: 'gpt-6-astra' }, client: async request => { inspect(request); return { data, model: 'gpt-6-astra', id: 'test-response' }; } });

test('application prompt keeps role examples, replaces laboratory limitations, and records assets', async () => {
  const prompt = await applicationPrompt('astrid');
  assert.match(prompt.instructions, /authored_fictional_examples/);
  assert.doesNotMatch(prompt.instructions, /local prompt laboratory|No application tools are available/);
  assert.match(prompt.instructions, /one bounded application task/);
  assert.equal(prompt.hash.length, 64);
  assert.equal(prompt.assets.at(-1).file, 'runtime/v0.4.0.md');
});

test('converse whitelists own context and strips private matching rationale from clarifications', async () => {
  const agents = adapter(output(), request => {
    const { context } = JSON.parse(request.input[0].content);
    assert.equal(context.memories.length, 1);
    assert.equal(context.messages.length, 1);
    assert.equal(context.clarifications[0].facet, 'family.household');
    assert.equal(context.clarifications[0].uncertainty, facets.find(facet => facet.id === 'family.household').question);
    assert.ok(!JSON.stringify(context).includes('OTHER SECRET'));
  });
  const result = await agents.converse({ ...input, memories: [...input.memories, { ...memory, id: 'other', participantId: 'b', text: 'OTHER SECRET' }],
    messages: [...input.messages, { ...message, chatId: 'shared', text: 'OTHER SECRET' }],
    clarifications: [{ id: 'q', participantId: 'a', topic: 'family', facet: 'family.household', status: 'queued', reason: 'OTHER SECRET' }] });
  assert.equal(result.metadata.prompt.version, '0.8.0');
  assert.equal(result.metadata.responseId, 'test-response');
});

test('memory updates require own user evidence and cannot overwrite locked memory', async () => {
  const suggestion = { id: null, topic: 'dating', facet: 'dating.intent', text: 'Wants a partner.', status: 'confirmed', strength: 'prefers', evidenceIds: ['fabricated'] };
  await assert.rejects(adapter({ ...understanding(), memories: [suggestion] }).understand(input), /Invalid agent evidence/);
  await assert.rejects(adapter({ ...understanding(), memories: [{ ...suggestion, id: 'mem-1', evidenceIds: ['msg-1'] }] }).understand({ ...input, memories: [{ ...memory, userLocked: true }] }), /Invalid agent evidence/);
  const result = await adapter({ ...understanding(), memories: [{ ...suggestion, evidenceIds: ['msg-1'] }] }).understand(input);
  assert.equal(result.memories[0].id, undefined);
});

test('permission and clarification mutations require exact authorized IDs and answer evidence', async () => {
  await assert.rejects(adapter({ ...output(), permissions: [{ memoryId: 'mem-1', recipientId: 'b' }] }).converse(input), /Invalid agent evidence/);
  const result = await adapter({ ...output(), permissions: [{ memoryId: 'mem-1', recipientId: 'b' }] }).converse({ ...input, permissionRecipients: [other] });
  assert.equal(result.permissions.length, 1);
  await assert.rejects(adapter({ ...understanding(), clarificationUpdates: [{ id: 'q', status: 'answered', evidenceIds: ['msg-1'] }] }).understand({ ...input,
    clarifications: [{ id: 'q', participantId: 'a', topic: 'family', facet: 'family.household', status: 'queued' }] }), /Invalid agent evidence/);
});

test('proposals need evidence from both participants; fabricated review references fail', async () => {
  const review = { decision: 'propose', exploration: 'hold', reason: 'These practical expectations align.', evidenceIds: ['mem-1'], clarifications: [] };
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
  const records = [person, other].flatMap(person => facets.map(facet => ({ ...memory, id: `${person.id}-${facet.id}`, participantId: person.id, topic: facet.topic, facet: facet.id })));
  records.find(memory => memory.id === 'a-family.household').text = 'My mother must be able to live with me with separate space and professional care.';
  records.find(memory => memory.id === 'a-family.household').strength = 'requires';
  records.find(memory => memory.id === 'b-family.household').text = 'I will never live with a partner’s parent; this is a firm boundary.';
  records.find(memory => memory.id === 'b-family.household').strength = 'requires';
  const args = { participants: [person, other], memories: records };
  assert.equal((await agents.review(args)).decision, 'withhold');
  records.find(memory => memory.id === 'b-family.household').text = 'I accept sharing a home with a parent with separate space and professional care.';
  records.find(memory => memory.id === 'b-family.household').strength = 'accepts';
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
    clarifications: [{ id: 'q', participantId: 'a', topic: 'family', facet: 'family.household', status: 'queued' }] });
  assert.equal(result.memories[0].status, 'confirmed');
  assert.deepEqual(result.memories[0].evidenceIds, ['msg-1']);
  assert.deepEqual(result.clarificationUpdates, [{ id: 'q', status: 'answered', evidenceIds: ['msg-1'] }]);
});

test('Memy has a standalone versioned prompt and only receives own authorized understanding', async () => {
  const prompt = await applicationPrompt('memy');
  assert.deepEqual(prompt.assets.map(asset => asset.file), ['memy/v0.2.0.md']);
  assert.match(prompt.instructions, /before Astrid's reply/);
  const result = await adapter(understanding(), request => {
    const { context } = JSON.parse(request.input[0].content);
    assert.equal(request.task, 'understand');
    assert.deepEqual(Object.keys(request.schema.properties), ['memories', 'profileUpdates', 'clarificationUpdates', 'gaps']);
    assert.equal(context.memories.length, 1);
    assert.equal(context.messages.length, 1);
    assert.equal(context.clarifications.length, 0);
    assert.equal(context.permissionRecipients, undefined);
    assert.ok(!JSON.stringify(context).includes('OTHER SECRET'));
  }).understand({ ...input, permissionRecipients: [{ ...other, name: 'OTHER SECRET' }],
    memories: [...input.memories, { ...memory, participantId: 'b', text: 'OTHER SECRET' }],
    messages: [...input.messages, { ...message, chatId: 'astrid-b', authorId: 'b', text: 'OTHER SECRET' }],
    clarifications: [{ id: 'q', participantId: 'b', topic: 'family', facet: 'family.household', status: 'queued', reason: 'OTHER SECRET' }] });
  assert.equal(result.metadata.prompt.role, 'memy');
  assert.equal(result.metadata.prompt.version, '0.2.0');
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

test('Memy protects individual locked records while allowing independent beliefs in the topic', async () => {
  const suggestion = { id: null, topic: 'dating', facet: 'dating.intent', text: 'Wants a partner.', status: 'confirmed', strength: 'prefers', evidenceIds: ['msg-1'] };
  assert.equal((await adapter({ ...understanding(), memories: [{ ...suggestion, facet: 'dating.structure', text: 'Wants exclusivity.' }] }).understand({ ...input, memories: [{ ...memory, userLocked: true }] })).memories.length, 1);
  await assert.rejects(adapter({ ...understanding(), memories: [{ ...suggestion, id: memory.id }] }).understand({ ...input, memories: [{ ...memory, userLocked: true }] }), /Invalid agent evidence/);
  await assert.rejects(adapter({ ...understanding(), memories: [{ ...suggestion, id: 'mem-1', topic: 'family' }] }).understand(input), /Invalid agent evidence/);
});

test('profile extraction requires latest user evidence and validates typed values without inferring opt-in', async () => {
  const prior = { ...message, id: 'old' };
  const update = { field: 'age', value: '17', correction: true, evidenceIds: [message.id] };
  const result = await adapter({ ...understanding(), profileUpdates: [update] }).understand({ ...input, messages: [prior, message] });
  assert.equal(result.profileUpdates[0].value, '17');
  await assert.rejects(adapter({ ...understanding(), profileUpdates: [{ ...update, evidenceIds: ['old'] }] }).understand({ ...input, messages: [prior, message] }), /Invalid agent evidence/);
  await assert.rejects(adapter({ ...understanding(), profileUpdates: [{ ...update, field: 'matchingEnabled', value: 'true' }] }).understand(input), /Invalid agent response/);
  await assert.rejects(adapter({ ...understanding(), profileUpdates: [{ ...update, field: 'ageRange', value: '[17,25]' }] }).understand(input), /Invalid agent evidence/);
});

test('semantic handoffs derive questions from fixed facets and cannot disclose pair-specific wording', async () => {
  await adapter(output(), request => {
    const { context } = JSON.parse(request.input[0].content);
    assert.ok(!JSON.stringify(context).includes('OTHER SECRET'));
    assert.equal(context.clarifications[0].completionCondition, facets.find(facet => facet.id === 'family.children').completionCondition);
    assert.deepEqual(context.clarifications[0].evidenceIds, []);
  }).converse({ ...input, clarifications: [{ id: 'q', participantId: 'a', topic: 'family', facet: 'family.children', status: 'queued', uncertainty: 'OTHER SECRET', completionCondition: 'OTHER SECRET', evidenceIds: ['other-memory'] }] });
  const args = { participants: [person, other], memories: [memory, { ...memory, id: 'b-memory', participantId: 'b' }] };
  const review = { decision: 'needs_clarification', exploration: 'hold', reason: 'Private reasoning stays here.', evidenceIds: [], clarifications: [{ participantId: 'a', topic: 'dating', facet: 'dating.intent', evidenceIds: ['b-memory'] }] };
  await assert.rejects(adapter(review).review(args), /Invalid agent evidence/);
});

test('clarification answers need same-facet fresh evidence, and tombstone contents stay out of context', async () => {
  const args = { ...input, clarifications: [{ id: 'q', participantId: 'a', topic: 'family', facet: 'family.care', status: 'queued' }] };
  const changes = { ...understanding(), memories: [{ id: null, topic: 'family', facet: 'family.children', text: 'I want children.', status: 'confirmed', strength: 'prefers', evidenceIds: [message.id] }], clarificationUpdates: [{ id: 'q', status: 'answered', evidenceIds: [message.id] }] };
  await assert.rejects(adapter(changes).understand(args), /Invalid agent evidence/);
  await adapter(understanding(), request => assert.ok(!request.input[0].content.includes('DELETED TEXT'))).understand({ ...input, memoryTombstones: [{ id: 'removed', topic: 'family', facet: 'family.care', text: 'DELETED TEXT' }] });
  await assert.rejects(adapter({ ...understanding(), memories: [{ ...changes.memories[0], id: 'removed' }] }).understand({ ...input, memoryTombstones: [{ id: 'removed', topic: 'family', facet: 'family.children' }] }), /Invalid agent evidence/);
});

test('browse advice omits private review and other-person context and derives own discussion topics', async () => {
  const own = { ...memory, facet: 'closeness.time', topic: 'closeness' };
  const result = await adapter({ text: 'Bo looks worth exploring. See what a good week together might look like.' }, request => {
    const { context } = JSON.parse(request.input[0].content);
    assert.ok(!JSON.stringify(context).includes('PRIVATE SECRET'));
    assert.equal(context.messages, undefined);
    assert.equal(context.clarifications, undefined);
    assert.equal(context.assessment.topics.length, 1);
    assert.equal(context.assessment.topics[0].question, facets.find(facet => facet.id === 'closeness.time').question);
    assert.equal(context.shareableMemories.length, 1);
    assert.equal(context.assessment.canRequest, true);
  }).advise({ participant: person, memories: [own, { ...memory, participantId: 'b', text: 'PRIVATE SECRET' }], other: { ...other, privateNote: 'PRIVATE SECRET' },
    shareableMemories: [{ ...memory, id: 'approved', participantId: 'b', text: 'Specifically approved story.' }],
    messages: [{ ...message, text: 'PRIVATE SECRET' }], previousReviews: [{ reason: 'PRIVATE SECRET' }],
    assessment: { status: 'explore', canRequest: true, reason: 'PRIVATE SECRET', topics: [{ facet: 'closeness.time', evidenceIds: [own.id], question: 'PRIVATE SECRET' }, { facet: 'family.care', evidenceIds: ['other-person-record'] }] } });
  assert.equal(result.metadata.task, 'advise');
  assert.equal(result.metadata.prompt.role, 'astrid');
});

test('exploration cannot bypass missing baseline or a withhold decision', async () => {
  const review = { decision: 'needs_clarification', exploration: 'allow', reason: 'Ordinary uncertainty.', evidenceIds: [], clarifications: [{ participantId: 'a', topic: 'dating', facet: 'dating.intent', evidenceIds: [] }] };
  const args = { participants: [person, other], memories: [memory] };
  await assert.rejects(adapter(review).review(args), /Invalid agent evidence/);
  await assert.rejects(adapter({ ...review, decision: 'withhold', clarifications: [] }).review(args), /Invalid agent evidence/);
  await adapter({ text: 'I would hold off for now.' }, request => {
    assert.equal(JSON.parse(request.input[0].content).context.assessment.canRequest, false);
  }).advise({ participant: person, memories: [], other, assessment: { status: 'hold', canRequest: true, topics: [] } });
});

test('offline review permits exploring ordinary planning preferences after complete understanding', async () => {
  const records = [person, other].flatMap(participant => facets.map(facet => ({ ...memory, id: `${participant.id}-${facet.id}`, participantId: participant.id, topic: facet.topic, facet: facet.id })));
  records.find(memory => memory.id === 'a-closeness.time').text = 'I prefer frequent spontaneous dates.';
  records.find(memory => memory.id === 'b-closeness.time').text = 'I prefer planned dates.';
  const agents = createAgents({ mode: 'offline' });
  const result = await agents.review({ participants: [person, other], memories: records });
  assert.equal(result.decision, 'needs_clarification');
  assert.equal(result.exploration, 'allow');
  assert.equal(result.clarifications.length, 2);
  assert.ok(result.clarifications.every(item => item.facet === 'closeness.time'));
  for (const status of ['promising', 'explore', 'hold']) {
    const advice = await agents.advise({ participant: person, memories: records, other, assessment: { status, topics: [], canRequest: status !== 'hold' } });
    assert.ok(advice.text.length > 0); assert.doesNotMatch(advice.text, /Matchy/);
  }
});
