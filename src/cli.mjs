import { parseArgs } from 'node:util';
import { readFile } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';
import { configuration, FileSessionStore, turn } from './runtime.mjs';

const { values } = parseArgs({ options: {
  role: { type: 'string', default: 'astrid' }, session: { type: 'string' },
  version: { type: 'string', default: '0.2.0' }, message: { type: 'string' },
  file: { type: 'string' }, help: { type: 'boolean' },
} });
if (values.help) {
  console.log('npm run chat -- [--role astrid|matchy] [--session ID] [--version 0.2.0] [--message TEXT | --file PATH]\nWithout message/file, starts interactive chat. /exit quits. Reuse session ID to resume.');
} else {
  try {
    if (values.message && values.file) throw new Error('Use either --message or --file.');
    const config = await configuration();
    const id = values.session || `${values.role}-${Date.now()}`;
    const store = new FileSessionStore();
    console.log(`${values.role} · ${config.model} · session ${id}`);
    const send = async text => {
      process.stdout.write(`\n${values.role}> `);
      try {
        const result = await turn({ store, id, role: values.role, version: values.version, text, config,
          onText: delta => process.stdout.write(delta) });
        console.log(`\n[${result.usage?.total_tokens ?? '?'} tokens; saved locally]\n`);
      } catch (error) { console.log('\n[Turn not completed]'); throw error; }
    };
    if (values.message || values.file) await send(values.message || await readFile(values.file, 'utf8'));
    else {
      if (!process.stdin.isTTY) throw new Error('Use --message or --file for non-interactive input.');
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      try {
        while (true) {
          const text = await rl.question('you> ');
          if (text.trim() === '/exit') break;
          if (text.trim()) await send(text);
        }
      } finally { rl.close(); }
    }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
