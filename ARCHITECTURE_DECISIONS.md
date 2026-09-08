# Astrid for Love — architecture decisions

Last updated: 2026-09-08

Status: Product architecture is in design. A minimal local prompt-testing runtime is implemented; product tools, UI, matching jobs, and agent handoffs are not yet implemented.

Product behavior is defined in [PRODUCT_VISION.md](PRODUCT_VISION.md). This document records technical decisions, their reasons, and unresolved choices. Update it when a decision changes; distinguish accepted direction from proposed implementation detail.

## AD-001 — Standalone public repository

Accepted. Build a self-contained open-source project. The neighboring agent-loop project is a reference, not a runtime or local-path dependency. Inspect individual building blocks and copy or adapt only what this application needs, after checking licensing and attribution requirements. No source has been copied yet.

Public fixtures must use fictional participants and redistributable assets. Keep real conversations, local runtime data, and credentials out of version control. Repository license selection is still open.

## AD-002 — Two agent roles

Accepted. Astrid is the conversational agent; Matchy is the background matching agent. No additional agent roles are planned for the demo.

- Astrid learns through conversation, checks interpretations, updates understanding, asks sharing permission, presents proposals, introduces people, and checks in privately.
- Matchy reviews eligible participants, assesses mutual compatibility, and recommends a proposal, clarification, or withholding a match. Matchy sends clarification needs to Astrid rather than independently messaging participants.
- Both use persisted application state through scoped APIs. Matchy's private assessment must not automatically enter participant-facing context.

Start with a small shared model/tool execution layer. The language, provider, and exact harness are undecided. Tool names and structured output schemas will be defined with the runtime, not invented in the initial prompts.

## AD-003 — Replaceable persistence, local files first

Accepted. Place application APIs and repository interfaces between callers and persistence. UI code and agent tools must not directly manipulate storage files. Begin with local file-backed implementations that survive application restarts; a later database implementation should preserve application behavior.

Logical records: participants and shareable profiles; conversations, messages, and membership; remembered understanding with evidence, uncertainty, revisions, and sharing permissions; match reviews and proposals; individual acceptance decisions; background jobs and execution metadata.

Implementation requirements to resolve in the storage design: safe writes, concurrent updates, record versioning, and recovery after interrupted operations. Edits to remembered understanding must supersede stale assumptions without rewriting historical chat messages. Removed understanding must not be silently reconstructed from old messages; the exact deletion and context-filtering mechanism remains open.

## AD-004 — Event-triggered matching jobs

Accepted direction. Meaningful changes to participant understanding or preferences queue a persisted matching review. Include a presenter control to run a review explicitly. Scheduled reviews may come later; continuous agent execution is unnecessary.

Flow: save understanding → queue review → check eligibility and baseline → assess candidates → propose, request clarification, or withhold → let Astrid gather missing information → review again when useful information changes.

Proposed implementation requirements: coalesce redundant reviews, bound retries and model/tool work, and prevent duplicate proposals on job replay. Record the participant revisions used by each review and recheck them before publishing a proposal so a stale job cannot override a correction. Clarification alone must not generate an endless review loop. Exact queue and worker mechanics remain open.

## AD-005 — Application code owns consent and access

Accepted. Agents recommend actions; application code validates state changes and access. Only two explicit, current participant acceptances can create the shared introduction chat. One acceptance or a decline cannot do so. Repeated requests must not create duplicate chats.

Sharing permission is specific to material and audience. Tools and context assembly must enforce it, alongside chat membership and private-memory boundaries. Prompt instructions alone are insufficient enforcement.

Proposal expiration, withdrawal, simultaneous proposals, and the handling of material profile changes during a pending proposal still need product decisions.

## AD-006 — Three UI experiences

Accepted. Build an attractive, focused demo UI with:

1. Private person–Astrid chat, including proposals and permission requests.
2. A shared introduction chat: person–Astrid–connection briefly, then person–connection after Astrid's visible departure. Subsequent support happens privately; shared messages do not automatically trigger or enter Astrid's context.
3. An editable “What Astrid knows about you” panel showing confirmed understanding, tentative interpretations, gaps, and sharing controls. Corrections feed back into matching.

A separate presenter view exposes concise decision evidence, pending jobs, and lifecycle state for fictional demo participants. This is not a participant route to other people's private information. UI framework, identity/session handling, and streaming transport remain open.

## AD-007 — Versioned prompts are repository assets

Accepted. Keep role prompts in separate, explicitly versioned Markdown files. Selected versions are drafts:

- [Astrid v0.2.0](prompts/astrid/v0.2.0.md), with [conversation examples v0.1.0](prompts/astrid/examples.v0.1.0.md)
- [Matchy v0.2.0](prompts/matchy/v0.2.0.md)

See [prompt versioning rules](prompts/README.md). The future runtime must select explicit versions and record them with executions and match reviews. Prompts are behavioral instructions; tool contracts, authorization, persistence, and job execution belong in code.

## AD-008 — Demo-first validation

Accepted direction. Use a resettable fictional dataset and live conversations, matching decisions, and state changes. Demonstrate the full handoff plus corrected memory changing a decision, an incompatible candidate being rejected, and one-sided acceptance remaining pending. Include withholding when no candidate fits.

Validate meaningful behavioral outcomes and application invariants. Do not depend on identical model wording. Record whether a result was live or prepared and which prompt version produced it. No harness, automated evaluations, or runtime tests exist yet.

## AD-009 — Persisted agent handoffs and conversational judgment

Accepted direction; semantic contract drafted in [AGENT_PROTOCOL.md](AGENT_PROTOCOL.md), version 0.1.0. Matchy owns the matching question; Astrid owns how and when to ask it. Work items carry purpose, evidence, revisions, audience, and lifecycle status. Clarifications can be answered, partial, declined, deferred, or obsolete. The application routes work; agents do not repeatedly invoke each other while waiting for people.

Keep Matchy's private pair assessment separate from the participant-safe clarification brief. Context assembly must restrict information for each participant and for shared openings. Prompt guidance alone cannot guarantee a generated brief is safe; the implementation must validate content and permissions.

Astrid's prompt teaches next-move selection and an opinionated but revisable point of view, supported by separately versioned authored conversations. Matchy's prompt requires a positive matching case, attention to disconfirming evidence, and prioritized clarification. These drafts have not yet been evaluated with a model.

## AD-010 — Minimal executable prompt lab

Implemented. Use Node.js 22+ ES modules and the Responses HTTP/SSE API directly for this first testing milestone. There are no third-party runtime dependencies. Default model: gpt-6-astra; low reasoning effort, 4096 maximum output tokens, and a 120-second per-request timeout. UI framework and broader product stack remain undecided.

The lab loads explicit prompt/example versions and pins their hashes per session. It supports interactive or single-turn Astrid conversations, advisory Matchy reviews against fictional records, and local transcript resumption. No application tools are advertised, so prompts explicitly distinguish conversation persistence from structured profile memory and real matchmaking actions.

Streaming deltas are display observations; only a completed final response becomes successful history. Preserve full output items for subsequent turns, including encrypted reasoning content where provided. Use store:false and replay local history. Failed/incomplete attempts remain recorded separately. Errors use bounded safe labels rather than provider response bodies. No automatic retries are performed.

FileSessionStore exposes load/save/lock operations. Saves use temporary files and rename; a per-session exclusive lock prevents concurrent writes. Crash-left locks require manual recovery for now. Credentials live in ignored .env or environment variables; transcripts in ignored .local/. The authorized key was copied locally from the reference project's configuration without introducing a runtime dependency on that checkout. No source was copied.

Five offline tests cover stream fragmentation, incomplete results, safe errors, session history/resumption, locking, and prompt assembly. A live three-request gpt-6-astra smoke run passed on 2026-09-08: Astrid continued the story into care expectations; Matchy distinguished uncertain compatibility from a firm conflict. This is limited manual evidence, not a full prompt evaluation. See README.md for commands.

## Next decisions

- UI framework and whether the prompt lab's Node runtime becomes the product backend.
- Concrete API/tool schemas and enforcement mechanisms for the semantic contracts in AGENT_PROTOCOL.md.
- File layout, safe persistence strategy, and resumable job implementation.
- Identity/session model for switching between fictional demo participants.
- Product questions tracked in PRODUCT_VISION.md, especially proposal lifecycle and concrete ethical limits.
- Open-source license and attribution for any selectively reused code or assets.
