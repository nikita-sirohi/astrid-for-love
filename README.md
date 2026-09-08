# Astrid for Love

An AI matchmaking friend that learns what being your partner would actually mean, then introduces people with personality and a reason to be excited. This standalone local demo includes private Astrid chat, editable understanding, background Matchy reviews, double opt-in proposals, and connection chats where Astrid makes the introduction and leaves.

## Run the demo

Requires Node.js 22 or newer. No package installation or build step is needed.

For live Astra conversations, create a local `.env` using `.env.example`, or set `OPENAI_API_KEY` in your environment. The default model is `gpt-6-astra`; the API project needs access. Credentials stay server-side. `.env`, transcripts, and app state under `.local/` are excluded from Git.

```sh
npm start
```

Open each person in their own browser window: [Maya](http://127.0.0.1:4310), [Eli](http://127.0.0.1:4311), [Theo](http://127.0.0.1:4312), and [Elena](http://127.0.0.1:4313). Each port stays with that person; all windows share matching and connection state. Operator controls live separately at [port 4314](http://127.0.0.1:4314/?view=presenter). Follow the [walkthrough](DEMO_WALKTHROUGH.md) for the lifecycle and alternative branches.

For a repeatable walkthrough without a key or network:

```sh
npm run demo:offline
```

The offline command uses scripted agent responses; the personal interface stays visually identical to live mode. It exercises real application state and consent rules; it is not evidence of model performance. Stop one server before starting another. Both modes use the same default app store; reset the fictional demo when changing modes for a clean run.

One process binds to `127.0.0.1` on ports 4310–4314 (or consecutively from `PORT`). Participant ports enforce a fixed identity and exclude operator endpoints; these local windows are not production authentication. Use fictional data. Several proposals and connection chats may coexist. Pausing matching stops new introductions; existing connection chats persist.

Start in Eli’s window: select Elena in Your potential plot twists to see her illustrated portrait and Astrid’s assessment, then express interest. Elena must separately accept before a shared chat opens. Live assessments can vary; the offline pool demonstrates an ordinary planning-versus-spontaneity uncertainty. Maya demonstrates a hold while baseline understanding is incomplete. Browse smoke state is isolated under `.local/browse-smoke/`.

## What is implemented

- Private participant–Astrid conversations with separate evidence-backed beliefs, grouped into seven areas. Each record has its own uncertainty, requirement strength, sharing controls, and revision history.
- Explicit profile editing for age, gender, pronouns, location, attraction preferences, age range, biography, and matching opt-in. Memy also records explicitly stated profile facts from conversation. Conflicts with user-edited fields block matching until resolved; conversation never infers matching opt-in.
- Persisted matching jobs triggered by understanding/profile changes or a manual review; Matchy can propose, ask for clarification, or withhold a match.
- Photos and personalized proposal copy; two current acceptances are required before opening a connection chat.
- An opening, nudge, and visible Astrid departure. Subsequent shared messages are not sent to an agent. A participant can request a private check-in.
- Participant-specific sharing permission requests, memory revision checks, and application enforcement of consent and chat membership.

This is a single-process file-backed demo. The interface is an eccentric illustrated singles clubhouse, with a fallen Cupid, fictional partygoers, and Astrid as its opinionated host. Technical status and operator controls stay outside personal conversations. The browser displays completed replies with a typing state; token streaming is available in the separate CLI lab. There is no authentication, periodic matching scheduler, production notification system, or full post-date learning workflow. Simple coverage and eligibility checks are demo approximations, not proof of compatibility.

## Keep testing the prompts

The prompt lab remains independent of the app:

```sh
npm run chat -- --session first-conversation
npm run chat -- --role matchy --session review-one --file fixtures/matchy-review.txt
```

Type `/exit` to quit; repeat the command to resume. A session pins its role, prompt/example hashes, and model. Start a new session after changing them. Use `--version VERSION` to compare earlier prompts. Selected roles are Astrid v0.8.0 with conversation examples v0.3.0, and Matchy v0.6.0. In the lab, Matchy produces advisory text; it cannot operate the application. The app adds a separately versioned structured-output runtime contract.

## Validate

```sh
npm test
node src/demo-smoke.mjs
node src/demo-smoke.mjs --live
node src/browse-smoke.mjs
node src/browse-smoke.mjs --live
npm run eval
npm run eval -- --suite live-regressions
```

Tests and the default demo smoke use offline responses. `--live` exercises real conversation, matching, introductions, and a private check-in, incurring API usage. Smoke runs create isolated local state under `.local/demo-smoke/` and do not reset the running demo. The original `npm run smoke` remains a three-request prompt-lab connectivity check.

The default evaluation suite makes 21 requests across ten cases. The live-development regression suite makes six requests across two fictional cases. Both require manual rubric review; successful requests do not establish behavioral quality. See [evaluation methodology](evals/README.md). Live long conversations remain necessary for pacing and voice.

Keep run outputs and temporary findings under ignored `.local/`; commit reusable test fixtures, prompts, and lasting product/architecture decisions.

## Persistence and recovery

The app stores state in `.local/app/state.json`, using serialized transactions and temporary-file rename. `FileMemoryStore` exposes scoped reads, revisions, and writes through that repository; the HTTP API exposes listing, creation, editing, deletion, and history. Memory changes share the same atomic commit as profile revisions and consent invalidation. Legacy records remain readable without guessed facets; unclassified records do not satisfy readiness until clarified or edited. Reset only when you want fresh fictional demo data. Pending jobs survive restart; interrupted running jobs are requeued. The server uses an exclusive `.server.lock` to prevent two processes writing the same app store. After a crash, confirm that the old process has exited before removing a stale lock. This is not a distributed database or worker system.

The CLI stores sessions separately in `.local/sessions/`, including transcripts, response continuation items, prompt metadata, usage, and safe attempt status. It uses per-session locks. Failed or incomplete turns do not become successful history, and no automatic provider retries occur. App conversation messages remain visible if the provider fails. Error messages do not expose raw provider bodies or credentials.

Requests use the Responses API with `store: false`; this does not itself guarantee zero provider retention. Resetting the fictional app leaves prompt-lab sessions intact. Editing or removing app memory supersedes it in future context without rewriting historical chat messages; it is not physical transcript erasure.

## Repository map

- [Product vision](PRODUCT_VISION.md), [architecture decisions](ARCHITECTURE_DECISIONS.md), [agent protocol](AGENT_PROTOCOL.md), and [implemented API contract](IMPLEMENTATION_CONTRACT.md).
- [Versioned prompts](prompts/README.md) and [evaluation fixtures](evals/README.md).
- `src/domain.mjs`: transactional file repository, consent, proposals, and jobs.
- `src/memory-store.mjs`: scoped memory store API, independent records and revision history; `src/understanding.mjs`: specific questions and completion criteria.
- `src/agents.mjs`: scoped agent contexts and structured Astra responses.
- `src/server.mjs`: local HTTP API and static UI serving; `web/`: browser interface.
- `src/runtime.mjs` and `src/cli.mjs`: streaming prompt laboratory.
- `fixtures/demo.json`: fictional participant pool; [portrait provenance](web/assets/portraits/README.md).

No neighboring checkout is required, and no source code was copied from agent-loop. Repository license selection remains open.

## Try the Memy conversation loop

The loop is **user → Memy → committed understanding/profile → Astrid**. Memy records individual beliefs and flags consequential gaps; Astrid owns the conversation. Matching runs separately.

For a fresh personal conversation through this same loop, without fictional profile memories:

```sh
npm run chat:memy -- --session first-memy-conversation --message "Hi"
```

Reuse the session ID for later messages, or pass `--file PATH`. State stays under ignored `.local/memy-sessions/`; matching is disabled in this personal lab. The original `npm run chat` remains the single-agent comparison laboratory. Restart an existing web server to load the new architecture.

Live startup/reset now uses `fixtures/people.json`: illustrated character shells with no invented ages, attraction preferences, biographies, interests, or relationship memories. Learn those from actual conversations. Explicitly scripted offline mode and automated tests retain `fixtures/demo.json` for repeatable branches. The local character shells may be browsed while basics are unknown; introductions remain blocked by normal eligibility and readiness checks.

**Your lore** displays actual understanding. **Your potential plot twists** is a scrollable inline list ordered by fresh review disposition: promising, exploratory, unassessed, then held, with alphabetical ties and no invented probabilities. Selecting a person opens an inline assessment. **Talk it through with Astrid** persists that private explanation and a concrete own-expectation question in the Astrid chat; it does not fabricate a user message or memory.
