import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { configuration, FileSessionStore, turn, root } from './runtime.mjs';

try {
  const config = await configuration();
  const store = new FileSessionStore();
  const stamp = Date.now();
  const id = `smoke-astrid-${stamp}`;
  for (const text of ['Hi, I spent Sunday making terrible-looking dumplings with my sister. We ate all of them anyway.',
    'We do this every Sunday. Our mother is getting less independent and eventually she will live with me. That part is non-negotiable.']) {
    const result = await turn({ store, id, role: 'astrid', text, config });
    console.log('Astrid:', result.text);
  }
  const review = await turn({ store: new FileSessionStore(), id: `smoke-matchy-${stamp}`, role: 'matchy',
    text: await readFile(resolve(root, 'fixtures/matchy-review.txt'), 'utf8'), config });
  console.log('Matchy:', review.text);
  console.log('Live smoke completed. Local records:', id, `smoke-matchy-${stamp}`);
} catch (error) { console.error(error.message); process.exitCode = 1; }
