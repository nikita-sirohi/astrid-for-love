import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadSuite, runEvaluation } from '../src/evaluate.mjs';

test('suite selection counts requests and confines files to evals', async () => {
  assert.equal((await loadSuite()).requestCount, 21);
  assert.equal((await loadSuite('live-regressions')).requestCount, 6);
  assert.equal((await loadSuite('evals/live-regressions.json')).suite.cases.length, 2);
  await assert.rejects(loadSuite('../.env'));
  const directory = await mkdtemp(join(tmpdir(), 'astrid-eval-validation-'));
  try {
    await writeFile(join(directory, 'invalid.json'), JSON.stringify({ version: '1', cases: [{ id: '../bad' }] }));
    await assert.rejects(loadSuite('invalid.json', directory));
    await symlink(join(process.cwd(), 'package.json'), join(directory, 'outside.json'));
    await assert.rejects(loadSuite('outside.json', directory), /inside evals/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('evaluation passes only fixture messages to model turns and retains rubrics for review', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'astrid-eval-run-'));
  const { suite } = await loadSuite('live-regressions');
  const received = [];
  try {
    const report = await runEvaluation({ suite: 'live-regressions' }, {
      directory, config: { model: 'offline-test', key: 'fake' },
      turn: async input => {
        received.push(input);
        assert.deepEqual(Object.keys(input).sort(), ['config', 'id', 'role', 'store', 'text', 'version']);
        return { text: 'Offline response', id: 'offline', usage: { total_tokens: 2 } };
      },
    });
    assert.deepEqual(received.map(input => input.text), suite.cases.flatMap(item => item.messages));
    assert.equal(report.plannedRequests, 6);
    assert.equal(report.totalTokens, 12);
    assert.equal(report.status, 'completed');
    assert.deepEqual(report.cases.map(item => item.rubric), suite.cases.map(item => item.rubric));
    assert.ok(received.every(input => input.version === report.prompts.astrid.version));
  } finally { await rm(directory, { recursive: true, force: true }); }
});
