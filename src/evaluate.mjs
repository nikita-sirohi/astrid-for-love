import { readFile, mkdir, writeFile, realpath } from 'node:fs/promises';
import { resolve, relative, isAbsolute, extname } from 'node:path';
import { createHash } from 'node:crypto';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { configuration, FileSessionStore, root, turn, selectedVersions, promptFor } from './runtime.mjs';

export async function loadSuite(name = 'unseen-v1', base = resolve(root, 'evals')) {
  const aliases = { original: 'unseen-v1.json', 'unseen-v1': 'unseen-v1.json', 'live-regressions': 'live-regressions.json' };
  const filename = Object.hasOwn(aliases, name) ? aliases[name] : name.replace(/^evals\//, '');
  const directory = await realpath(base);
  const candidate = resolve(directory, filename);
  const inside = path => {
    const location = relative(directory, path);
    return location && !location.startsWith('..') && !isAbsolute(location);
  };
  if (!inside(candidate) || extname(candidate) !== '.json') throw new Error('Suite must be a JSON file inside evals/.');
  const path = await realpath(candidate);
  if (!inside(path)) throw new Error('Suite must be a JSON file inside evals/.');
  const raw = await readFile(path, 'utf8');
  const suite = JSON.parse(raw);
  const ids = new Set();
  if (typeof suite.version !== 'string' || !Array.isArray(suite.cases) || !suite.cases.length) throw new Error('Invalid evaluation suite.');
  for (const item of suite.cases) {
    if (!/^[a-zA-Z0-9_-]+$/.test(item.id || '') || ids.has(item.id) || !['astrid', 'matchy'].includes(item.role)
      || !Array.isArray(item.messages) || !item.messages.length || item.messages.some(value => typeof value !== 'string' || !value.trim())
      || !Array.isArray(item.rubric) || !item.rubric.length || item.rubric.some(value => typeof value !== 'string')) {
      throw new Error('Invalid evaluation case.');
    }
    ids.add(item.id);
  }
  return { raw, suite, requestCount: suite.cases.reduce((sum, item) => sum + item.messages.length, 0) };
}

export async function runEvaluation(values = {}, dependencies = {}) {
  const { raw, suite, requestCount } = await loadSuite(values.suite);
  const versions = { astrid: values['astrid-version'] || selectedVersions.astrid,
    matchy: values['matchy-version'] || selectedVersions.matchy };
  const prompts = {};
  for (const [role, version] of Object.entries(versions)) {
    const prompt = await promptFor(role, version);
    prompts[role] = { version, hash: prompt.hash, assets: prompt.assets };
  }

  // Evaluation rubrics are deliberately never passed to turn or the tested model.
  const config = dependencies.config || await configuration();
  const runTurn = dependencies.turn || turn;
  const run = `regression-${Date.now()}`;
  const directory = dependencies.directory || resolve(root, '.local/evals', run);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const store = new FileSessionStore(resolve(directory, 'sessions'));
  const report = { run, suiteVersion: suite.version, suiteHash: createHash('sha256').update(raw).digest('hex'),
    plannedRequests: requestCount, model: config.model, prompts, evaluationType: 'known-scenario regression', status: 'running',
    startedAt: new Date().toISOString(), cases: [] };
  console.log(`${suite.cases.length} scenarios / ${requestCount} API requests. Astrid ${versions.astrid}; Matchy ${versions.matchy}. Rubrics stay out of model input.`);
  for (const item of suite.cases) {
    const result = { id: item.id, role: item.role, rubric: item.rubric, turns: [] };
    for (const message of item.messages) {
      try {
        const current = await promptFor(item.role, versions[item.role]);
        if (current.hash !== prompts[item.role].hash) throw new Error('Prompt changed during evaluation; start a new run.');
        const output = await runTurn({ store, id: item.id, role: item.role, version: versions[item.role], text: message, config });
        result.turns.push({ user: message, assistant: output.text, responseId: output.id, usage: output.usage });
        console.log(`${item.id} turn ${result.turns.length}/${item.messages.length} completed`);
      } catch (error) { result.error = error.message; process.exitCode = 1; break; }
    }
    report.cases.push(result);
    await writeFile(resolve(directory, 'report.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  }
  report.status = report.cases.some(item => item.error) ? 'completed_with_errors' : 'completed';
  report.completedAt = new Date().toISOString();
  report.totalTokens = report.cases.flatMap(item => item.turns).reduce((sum, item) => sum + (item.usage?.total_tokens || 0), 0);
  await writeFile(resolve(directory, 'report.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  console.log(`Results for manual review: ${directory}/report.json`);
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { values } = parseArgs({ options: {
    'astrid-version': { type: 'string' }, 'matchy-version': { type: 'string' },
    suite: { type: 'string', default: 'unseen-v1' }, help: { type: 'boolean' },
  } });
  if (values.help) {
    console.log('npm run eval -- [--suite unseen-v1|live-regressions|evals/NAME.json] [--astrid-version VERSION] [--matchy-version VERSION]\nDefaults to the original suite and currently selected prompts. Results require manual rubric review.');
  } else {
    await runEvaluation(values);
  }
}
