import { readFile, mkdir, writeFile, rename, open, unlink } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

export const root = fileURLToPath(new URL('../', import.meta.url));
const hash = text => createHash('sha256').update(text).digest('hex');

export async function configuration() {
  let local = {};
  try { local = parseEnv(await readFile(resolve(root, '.env'), 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const key = process.env.OPENAI_API_KEY || local.OPENAI_API_KEY;
  if (!key) throw new Error('Set OPENAI_API_KEY in the environment or local .env.');
  return { key, model: process.env.OPENAI_MODEL || local.OPENAI_MODEL || 'gpt-6-astra' };
}

export async function promptFor(role, version = '0.2.0') {
  if (!['astrid', 'matchy'].includes(role) || !/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error('Invalid role or prompt version.');
  }
  const raw = await readFile(resolve(root, `prompts/${role}/v${version}.md`), 'utf8');
  const marker = '## Prompt body\n';
  if (!raw.includes(marker)) throw new Error('Prompt body marker missing.');
  let instructions = raw.slice(raw.indexOf(marker) + marker.length).trim();
  const assets = [{ role, version, hash: hash(raw) }];
  const companion = raw.match(/^Companion examples: (examples\.v\d+\.\d+\.\d+\.md)$/m)?.[1];
  if (companion) {
    const examples = await readFile(resolve(root, `prompts/${role}/${companion}`), 'utf8');
    const body = examples.split('## Example body\n')[1];
    if (!body) throw new Error('Example body marker missing.');
    instructions += '\n\n<authored_fictional_examples>\n' + body + '\n</authored_fictional_examples>';
    assets.push({ file: companion, hash: hash(examples) });
  }
  instructions += '\n\nRuntime mode: local prompt laboratory. No application tools are available. You can converse or recommend next steps, but cannot update profile memory, share information, record consent, create proposals, or open chats. Do not claim those actions happened. Local transcript persistence is not structured participant memory.';
  if (role === 'matchy') instructions += '\nReturn a concise review with decision (propose, needs clarification, or no suitable match), evidence, unresolved questions, and next action. This is an advisory text review, not an executable work item.';
  return { instructions, assets, hash: hash(instructions) };
}

// Only public-safe error labels are persisted or printed. Provider error bodies may echo secrets.
export function safeError(error) {
  if (/^(API HTTP \d{3}|Stream ended without completion|Response (failed|incomplete)|Invalid SSE data|Unexpected response output|Response contained no text|Request timed out or failed)$/.test(error.message)) return error.message;
  return 'Request timed out or failed';
}

export async function streamResponse({ key, model, instructions, input, onText = () => {}, fetchImpl = fetch, timeoutMs = 120000 }) {
  const response = await fetchImpl('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify({ model, instructions, input, stream: true, store: false,
      include: ['reasoning.encrypted_content'], reasoning: { effort: 'low' }, max_output_tokens: 4096 }),
  });
  if (!response.ok) throw new Error(`API HTTP ${response.status}`);
  if (!response.body) throw new Error('Stream ended without completion');
  let buffer = '', terminal;
  const decoder = new TextDecoder();
  function event(block) {
    const data = block.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
    if (!data || data === '[DONE]') return;
    let value;
    try { value = JSON.parse(data); } catch { throw new Error('Invalid SSE data'); }
    if (value.type === 'response.output_text.delta') onText(value.delta);
    if (['response.completed', 'response.failed', 'response.incomplete'].includes(value.type)) terminal = value.response;
    if (value.type === 'error') throw new Error('Response failed');
  }
  for await (const chunk of response.body) {
    buffer += decoder.decode(chunk, { stream: true });
    // Normalize only complete CRLF pairs, retaining a trailing CR across chunks.
    buffer = buffer.replace(/\r\n/g, '\n');
    let boundary;
    while ((boundary = buffer.indexOf('\n\n')) !== -1) {
      event(buffer.slice(0, boundary)); buffer = buffer.slice(boundary + 2);
    }
  }
  buffer += decoder.decode();
  if (buffer.trim()) event(buffer);
  if (!terminal) throw new Error('Stream ended without completion');
  if (terminal.status !== 'completed') throw new Error(terminal.status === 'incomplete' ? 'Response incomplete' : 'Response failed');
  if (!Array.isArray(terminal.output) || terminal.output.some(item => !['message', 'reasoning'].includes(item.type))) throw new Error('Unexpected response output');
  const text = terminal.output.filter(item => item.type === 'message').flatMap(item => item.content || []).filter(item => item.type === 'output_text').map(item => item.text).join('');
  if (!text) throw new Error('Response contained no text');
  return { id: terminal.id, model: terminal.model, output: terminal.output, text, usage: terminal.usage };
}

export class FileSessionStore {
  constructor(directory = resolve(root, '.local/sessions')) { this.directory = directory; }
  path(id) {
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(id)) throw new Error('Session ID must contain 1–80 letters, digits, underscores, or hyphens.');
    return resolve(this.directory, `${id}.json`);
  }
  async load(id) {
    try { return JSON.parse(await readFile(this.path(id), 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  }
  async save(id, value) {
    const target = this.path(id);
    await mkdir(dirname(target), { recursive: true, mode: 0o700 });
    const temp = target + '.' + randomUUID() + '.tmp';
    await writeFile(temp, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
    await rename(temp, target);
  }
  async lock(id) {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const path = this.path(id) + '.lock';
    let handle;
    try { handle = await open(path, 'wx', 0o600); }
    catch (error) { if (error.code === 'EEXIST') throw new Error('Session is locked. Stop its other process; after a crash, remove its .local/sessions/*.lock file manually.'); throw error; }
    await handle.writeFile(String(process.pid));
    return async () => { await handle.close(); await unlink(path); };
  }
}

export async function turn({ store, id, role, version = '0.2.0', text, config, onText, client = streamResponse }) {
  if (!text?.trim()) throw new Error('Message must not be empty.');
  const prompt = await promptFor(role, version);
  const release = await store.lock(id);
  try {
    let session = await store.load(id);
    if (session && (session.role !== role || session.promptHash !== prompt.hash || session.model !== config.model)) {
      throw new Error('Session role, prompt, or model changed. Start a new session for a clean comparison.');
    }
    session ||= { schemaVersion: 1, id, role, model: config.model, promptHash: prompt.hash, promptAssets: prompt.assets,
      settings: { reasoning: 'low', maxOutputTokens: 4096, store: false }, history: [], turns: [], attempts: [] };
    const input = [...session.history, { role: 'user', content: text }];
    const attempt = { startedAt: new Date().toISOString(), status: 'pending', userText: text };
    session.attempts.push(attempt);
    await store.save(id, session);
    const start = Date.now();
    let result;
    try { result = await client({ ...config, instructions: prompt.instructions, input, onText }); }
    catch (error) {
      attempt.status = 'failed'; attempt.error = safeError(error); attempt.durationMs = Date.now() - start;
      await store.save(id, session); throw new Error(attempt.error);
    }
    attempt.status = 'completed'; attempt.durationMs = Date.now() - start;
    session.history = [...input, ...result.output];
    session.turns.push({ user: text, assistant: result.text, responseId: result.id, model: result.model,
      usage: result.usage, durationMs: attempt.durationMs, completedAt: new Date().toISOString() });
    await store.save(id, session);
    return result;
  } finally { await release(); }
}
