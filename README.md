# Astrid for Love

An opinionated AI matchmaking friend that learns what being your partner would actually mean—including the messy expectations—and helps people find a connection worth exploring.

Astrid for Love was built from scratch as a **one-day hackathon project on September 8, 2026**. The original application code, prompts, tests, documentation, and generated illustrations were created that day. The app uses OpenAI's API and standard platform capabilities; it has no third-party runtime packages or dependency on another local project.

Astrid's goal is a good introduction, not a longer conversation. She learns through stories, probes meaningful tradeoffs, and checks her understanding. Browsing assessments explain real compatibility, including potential friction. Introductions lead with personality and require both people to say yes.

## Start your own demo

Requires **Node.js 22+** and an OpenAI API key with access to **gpt-6-astra**. There is no install or build step.

Copy `.env.example` to `.env` and set `OPENAI_API_KEY`, or supply it as an environment variable. Never commit your key or conversation data.

```sh
npm start -- --profiles 4 --store .local/my-demo/state.json --port 4310
```

This creates four empty profiles sharing one local JSON store. Each gets a separate browser address, printed at startup: ports 4310–4313 in this example. The next port hosts the operator view. Open the profile windows you want to use, enter a name, and start talking to Astrid. Four reusable illustrated portraits are provided; larger pools reuse them.

- `--profiles N`: create 1–12 profiles in a **new** store. Existing stores must have the same count; they are never resized or reset by this option.
- `--store PATH`: local JSON file for profiles, chat, memory, matching and consent. Relative paths resolve from the working directory. `ASTRID_STORE` is the environment-variable equivalent.
- `--port N`: first listening port; the remaining profile and operator ports are consecutive. `PORT` is also supported.
- `--mode live|offline`: live Astra calls or explicitly scripted responses. `ASTRID_MODE` is also supported.

To resume, use the same file:

```sh
npm start -- --store .local/my-demo/state.json --port 4310
```

Without options, live mode resumes `.local/app/state.json` or creates four empty profiles there. **Your lore → Clear all** resets only the current profile and its connections; other people's private conversations and lore remain. This lets a demo mix established profiles with fresh arrivals.

For a prepared, repeatable lifecycle without API usage:

```sh
npm run demo:offline
```

Offline mode uses a separate default store, `.local/offline/state.json`, and prepared fictional records. It validates application behavior, not model quality. Stores opened by the server are marked with their mode to prevent accidentally mixing scripted and live runs.

## What makes it agentic

Three specialists share a small, bounded tool-use runner:

- **Astrid** owns the conversation. She can inspect participant-safe match results, request a background review, and ask permission to share a specific memory with a specific person.
- **Memy** owns understanding. It can inspect current records and user evidence, then commit concise learnings and explicit profile facts. Astrid sees the committed result before replying.
- **Matchy** owns the compatibility judgment for an assigned pair. It can inspect relationship beliefs and private story evidence, check a proposed decision against application constraints, and return a proposal, consequential clarification, or hold.

Agents can call tools, observe results, and choose another step. Each run permits at most six model calls and eight tool calls within a 120-second deadline. Tools are scoped by role; the model cannot select an arbitrary person's private data. The application schedules matching work and enforces eligibility, revisions, sharing permissions and double opt-in. Successful runs record tool names, outcomes and prompt versions for inspection.

## Show the lifecycle

1. Talk to Astrid and watch concise, editable **lore** appear.
2. Explore **potential plot twists**. Early comparisons identify useful questions before the full introduction baseline is complete.
3. Correct a preference or establish a boundary and see matching reconsider it.
4. View a photo and personalized introduction proposal. One acceptance stays pending; two open a shared chat.
5. Astrid writes a playful opening using information authorized for both people, then leaves. Further shared messages are not sent to any agent; check-ins happen privately.

The [walkthrough](DEMO_WALKTHROUGH.md) contains prepared scenarios for repeatable consent and compatibility branches.

Lore keeps consequential preferences and their conditions, including unusual or blunt requirements. Refreshing lore asks Memy to reconcile the authorized conversation with current memories, updating learnings, readiness and concise summaries before queuing a new match review. It preserves chat history and profile facts, respects user edits and deletion barriers, and rejects stale work after a concurrent correction. Stories inform Matchy’s private assessment but do not count as readiness or authorize disclosure.

## Validate

```sh
npm test
node src/demo-smoke.mjs
node src/browse-smoke.mjs
```

These checks use isolated stores and scripted responses. Add `--live` to either smoke command to test the real model; API usage applies. They never reset a running demo.

```sh
npm run eval
npm run eval -- --suite live-regressions
npm run chat:memy -- --session fresh-conversation --message "Hi"
```

The eval suites test role behavior and require manual rubric review. They do not replace tool-loop tests or live conversation testing. The Memy chat command exercises the application conversation loop in a separate personal store. See [prompt versions](prompts/README.md) and [evaluation methodology](evals/README.md).

## Demo boundaries

This is a local, single-process application. Listener ports identify profiles for demonstration; they are **not authentication**. The store serializes transactions and replaces files atomically. An exclusive server lock prevents concurrent writers. After an unclean shutdown, confirm the previous process is gone before removing its stale `.server.lock`. Interrupted matching jobs are requeued on restart; provider calls are not automatically retried.

Introductions require basic understanding across seven relationship areas, plus conservative age, attraction and location checks. Sixteen facets guide discovery; they are not a mandatory interview checklist. Memy marks substantive understanding, and Matchy still evaluates consequential uncertainty and firm conflicts. These are approximations, not proof of compatibility. Matchy investigates one assigned pair at a time; there is no autonomous pool-wide planner. Browser replies are not streamed, and full post-date learning and production notifications are deferred.

A failed private turn can be retried from its saved message. Completed Memy work and successful matching/sharing requests survive retries and restarts without being repeated. A newer message or profile revision prevents retrying stale work. This is recovery between application stages, not arbitrary resumption inside a model call. Existing conversations and memories remain readable without a migration; older confirmed facet records retain baseline credit pending further conversation.

Memory deletion stops future use but does not erase historical transcripts. Requests use `store: false`; this is not a claim of zero provider retention. Keep custom storage targets outside tracked source files; `.env` and `.local/` are ignored by Git. An open-source license has not yet been selected.

## Architecture

- [Product vision](PRODUCT_VISION.md), [architecture decisions](ARCHITECTURE_DECISIONS.md), [agent protocol](AGENT_PROTOCOL.md), [API contract](IMPLEMENTATION_CONTRACT.md).
- `src/agent-runner.mjs`: bounded tool execution; `src/agents.mjs`: role contexts, schemas and provider adapter.
- `src/domain.mjs`: application rules and transactional repository; `src/memory-store.mjs`: scoped memory operations.
- `src/server.mjs`, `src/startup.mjs`: local API, profile listeners and configuration; `web/`: browser interface.
- `src/runtime.mjs`, `src/cli.mjs`: separate streaming prompt laboratory.
