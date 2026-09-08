# Astrid for Love

A demo-focused AI matchmaking friend. The current executable is a local prompt lab for conversational Astrid and background reviewer Matchy. The product UI, structured participant memory, agent handoff jobs, and introductions are not implemented yet.

## Run the prompt lab

Requires Node.js 22 or newer. No package installation is needed.

Create a local `.env` using the variable names in `.env.example`, or set `OPENAI_API_KEY` in your environment. The default model is `gpt-6-astra`; access depends on your API project. Credentials stay server-side/local. `.env` and `.local/` are excluded from Git.

```sh
npm run chat -- --session first-conversation
```

Type `/exit` to quit. Run the same command to resume. Each session pins its role, prompt content hash, example hash, and configured model; start a new session when changing them.

For single turns or comparing earlier prompts:

```sh
npm run chat -- --session trial --message "Hi, I spent Sunday making dumplings with my sister."
npm run chat -- --session earlier-prompt --version 0.1.0 --message "Hi, tell me where we should start."
npm run chat -- --role matchy --session review-one --file fixtures/matchy-review.txt
```

The selected role prompts are v0.2.0. Astrid also receives authored examples v0.1.0, explicitly separated from actual participant history. Matchy currently produces advisory text for manual inspection, not validated protocol work items.

## Persistence and failures

Local session JSON lives in `.local/sessions/`. It includes transcripts, full response output for continuation (including encrypted reasoning items when returned), prompt metadata, usage, elapsed time, and attempt status. Requests use the OpenAI Responses API with `store: false`; local history is sent again on each turn. This is not a guarantee of zero provider retention; the provider's data policies still apply.

Each session is locked during a turn, and saves use a temporary file plus rename. Failed/incomplete turns do not enter successful conversation history. Partial streamed text may appear on screen before a failure; it is not a completed reply. Failed attempts are recorded with safe error labels; raw provider error bodies and credentials are not logged. No automatic retries are performed, so a failed connection does not silently incur repeat requests. Retry the message explicitly if desired.

After a crashed process, an attempt may remain pending and a lock may remain. Confirm the original process is stopped before removing that session's `.json.lock` file. This is a small local store, not a production database or full job recovery system. Transcripts are sensitive local data, not public fixtures. The lab has no memory-editing/deletion API yet.

## Validate

```sh
npm test
npm run smoke
```

Tests use fake responses and require no key/network. The smoke command makes three real API requests: two turns with Astrid and one fictional Matchy review. It incurs API usage and saves local transcripts. Inspect voice and decisions manually; successful transport does not prove prompt quality.

## Design documents

- [Product vision](PRODUCT_VISION.md)
- [Architecture decisions](ARCHITECTURE_DECISIONS.md)
- [Agent protocol](AGENT_PROTOCOL.md)
- [Prompt versions and examples](prompts/README.md)

## Implementation map

- `src/runtime.mjs`: prompt assembly, Responses streaming client, file-backed session repository, and turn execution.
- `src/cli.mjs`: interactive and one-shot prompt testing.
- `src/smoke.mjs`: small live conversation/review check.
- `test/runtime.test.mjs`: stream, failure, persistence, locking, and prompt-assembly checks.
- `fixtures/`: explicitly fictional review inputs safe to publish.

The implementation is standalone. It takes inspiration from agent-loop's separation of streaming observations from final response state; no source code was copied and no neighboring checkout is needed to run it. Repository license selection remains open.

API references: [Responses conversation state](https://developers.openai.com/api/docs/guides/conversation-state), [streaming responses](https://developers.openai.com/api/docs/guides/streaming-responses).
