# Astrid for Love

An AI matchmaking friend that learns what being your partner would actually mean, then introduces people with personality and a reason to be excited. This standalone local demo includes private Astrid chat, editable understanding, background Matchy reviews, double opt-in proposals, and connection chats where Astrid makes the introduction and leaves.

## Run the demo

Requires Node.js 22 or newer. No package installation or build step is needed.

For live Astra conversations, create a local `.env` using `.env.example`, or set `OPENAI_API_KEY` in your environment. The default model is `gpt-6-astra`; the API project needs access. Credentials stay server-side. `.env`, transcripts, and app state under `.local/` are excluded from Git.

```sh
npm start
```

Open [the local demo](http://127.0.0.1:4310). Switch between fictional people using the tabs. The **Behind the scenes** view shows reviews, jobs, and a reset control. Follow the [demo walkthrough](DEMO_WALKTHROUGH.md) to demonstrate the lifecycle and its alternative branches.

For a repeatable walkthrough without a key or network:

```sh
npm run demo:offline
```

Offline mode is explicitly labeled and uses scripted agent responses. It exercises real application state and consent rules; it is not evidence of model performance. Stop one server before starting another. Both modes use the same default app store; reset the fictional demo when changing modes for a clean run.

The server binds to `127.0.0.1`. Participant switching and the presenter view are local demo controls, not authentication or production access security. Use fictional data. Several proposals and connection chats may coexist. Pausing matching stops new introductions; existing connection chats persist.

## What is implemented

- Private participant–Astrid conversations and seven areas of remembered understanding, with editable facts, uncertainty, requirement strength, and sharing controls.
- Explicit profile editing for gender, attraction preferences, age range, biography, and matching opt-in. Conversation does not silently rewrite these profile settings.
- Persisted matching jobs triggered by understanding/profile changes or a manual review; Matchy can propose, ask for clarification, or withhold a match.
- Photos and personalized proposal copy; two current acceptances are required before opening a connection chat.
- An opening, nudge, and visible Astrid departure. Subsequent shared messages are not sent to an agent. A participant can request a private check-in.
- Participant-specific sharing permission requests, memory revision checks, and application enforcement of consent and chat membership.

This is a single-process file-backed demo. The browser displays completed replies with a typing state; token streaming is available in the separate CLI lab. There is no authentication, periodic matching scheduler, production notification system, or full post-date learning workflow. Simple coverage and eligibility checks are demo approximations, not proof of compatibility.

## Keep testing the prompts

The prompt lab remains independent of the app:

```sh
npm run chat -- --session first-conversation
npm run chat -- --role matchy --session review-one --file fixtures/matchy-review.txt
```

Type `/exit` to quit; repeat the command to resume. A session pins its role, prompt/example hashes, and model. Start a new session after changing them. Use `--version VERSION` to compare earlier prompts. Selected roles are Astrid v0.6.0 with conversation examples v0.3.0, and Matchy v0.4.0. In the lab, Matchy produces advisory text; it cannot operate the application. The app adds a separately versioned structured-output runtime contract.

## Validate

```sh
npm test
node src/demo-smoke.mjs
node src/demo-smoke.mjs --live
npm run eval
npm run eval -- --suite live-regressions
```

Tests and the default demo smoke use offline responses. `--live` exercises real conversation, matching, introductions, and a private check-in, incurring API usage. Smoke runs create isolated local state under `.local/demo-smoke/` and do not reset the running demo. The original `npm run smoke` remains a three-request prompt-lab connectivity check.

The default evaluation suite makes 21 requests across ten cases. The live-development regression suite makes six requests across two fictional cases. Both require manual rubric review; successful requests do not establish behavioral quality. See [evaluation methodology and results](evals/README.md). Live long conversations remain necessary for pacing and voice.

The implementation milestone passed 28 offline tests, a full live fictional lifecycle, and desktop/mobile browser walkthroughs. These are bounded checks, not a reliability guarantee across arbitrary conversations.

## Persistence and recovery

The app stores state in `.local/app/state.json`, using serialized transactions and temporary-file rename. Pending jobs survive restart; interrupted running jobs are requeued. The server uses an exclusive `.server.lock` to prevent two processes writing the same app store. After a crash, confirm that the old process has exited before removing a stale lock. This is not a distributed database or worker system.

The CLI stores sessions separately in `.local/sessions/`, including transcripts, response continuation items, prompt metadata, usage, and safe attempt status. It uses per-session locks. Failed or incomplete turns do not become successful history, and no automatic provider retries occur. App conversation messages remain visible if the provider fails. Error messages do not expose raw provider bodies or credentials.

Requests use the Responses API with `store: false`; this does not itself guarantee zero provider retention. Resetting the fictional app leaves prompt-lab sessions intact. Editing or removing app memory supersedes it in future context without rewriting historical chat messages; it is not physical transcript erasure.

## Repository map

- [Product vision](PRODUCT_VISION.md), [architecture decisions](ARCHITECTURE_DECISIONS.md), [agent protocol](AGENT_PROTOCOL.md), and [implemented API contract](IMPLEMENTATION_CONTRACT.md).
- [Versioned prompts](prompts/README.md) and [evaluation fixtures](evals/README.md).
- `src/domain.mjs`: repository, consent, memory, proposals, and jobs.
- `src/agents.mjs`: scoped agent contexts and structured Astra responses.
- `src/server.mjs`: local HTTP API and static UI serving; `web/`: browser interface.
- `src/runtime.mjs` and `src/cli.mjs`: streaming prompt laboratory.
- `fixtures/demo.json`: fictional participant pool; [portrait provenance](web/assets/portraits/README.md).

No neighboring checkout is required, and no source code was copied from agent-loop. Repository license selection remains open.
