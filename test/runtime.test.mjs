import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileSessionStore, streamResponse, turn, promptFor, safeError } from '../src/runtime.mjs';

const completed = { id: 'response-test', model: 'test', status: 'completed',
  output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Hello 🌸' }] }], usage: { total_tokens: 12 } };
function streamed(events) {
  const bytes = new TextEncoder().encode(events.map(e => 'data: ' + JSON.stringify(e) + '\r\n\r\n').join(''));
  return new Response(new ReadableStream({ start(controller) {
    for (const byte of bytes) controller.enqueue(Uint8Array.of(byte));
    controller.close();
  } }));
}
test('stream parser survives byte boundaries and retains final response', async () => {
  let text = '';
  const result = await streamResponse({ key: 'fake', model: 'test', input: [], instructions: '', onText: value => text += value,
    fetchImpl: async (_, request) => {
      const body = JSON.parse(request.body);
      assert.equal(body.store, false);
      assert.deepEqual(body.include, ['reasoning.encrypted_content']);
      return streamed([{ type: 'response.output_text.delta', delta: 'Hello 🌸' }, { type: 'response.completed', response: completed }]);
    } });
  assert.equal(text, 'Hello 🌸'); assert.equal(result.text, text);
});
test('truncated and incomplete streams never count as successful replies', async () => {
  for (const events of [[{ type: 'response.output_text.delta', delta: 'partial' }],
    [{ type: 'response.incomplete', response: { ...completed, status: 'incomplete' } }]]) {
    await assert.rejects(streamResponse({ key: 'fake', model: 'test', input: [], instructions: '', fetchImpl: async () => streamed(events) }));
  }
});
test('provider error text is neither surfaced nor persisted', async () => {
  await assert.rejects(streamResponse({ key: 'secret', model: 'test', input: [], instructions: '',
    fetchImpl: async () => new Response('secret provider content', { status: 401 }) }), { message: 'API HTTP 401' });
  assert.equal(safeError(new Error('secret')), 'Request timed out or failed');
});
test('sessions resume full output; failed turns do not contaminate history; lock and prompt checks work', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'astrid-test-'));
  try {
    const store = new FileSessionStore(directory);
    const config = { key: 'fake', model: 'test' };
    const output = [{ type: 'reasoning', encrypted_content: 'opaque-test' }, ...completed.output];
    await turn({ store, id: 's', role: 'astrid', text: 'first', config,
      client: async () => ({ ...completed, output, text: 'Hello 🌸' }) });
    await assert.rejects(turn({ store: new FileSessionStore(directory), id: 's', role: 'astrid', text: 'second', config,
      client: async ({ input }) => { assert.deepEqual(input.slice(1, 3), output); throw new Error('secret'); } }));
    const saved = await store.load('s');
    assert.equal(saved.history.length, 3); assert.equal(saved.turns.length, 1);
    assert.equal(saved.attempts[1].status, 'failed'); assert.ok(!JSON.stringify(saved).includes('secret'));
    await assert.rejects(turn({ store, id: 's', role: 'matchy', text: 'wrong role', config }));
    const unlock = await store.lock('s');
    await assert.rejects(store.lock('s')); await unlock();
    assert.throws(() => store.path('../escape'));
  } finally { await rm(directory, { recursive: true, force: true }); }
});
test('versioned prompt assembly separates examples and pins hashes', async () => {
  const astrid = await promptFor('astrid'); const matchy = await promptFor('matchy');
  assert.equal(astrid.assets.length, 2); assert.equal(matchy.assets.length, 1);
  assert.ok(astrid.instructions.includes('<authored_fictional_examples>'));
  assert.ok(astrid.instructions.includes('No application tools are available'));
  await assert.rejects(promptFor('../escape'));
});
