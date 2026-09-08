# Astrid for Love — architecture decisions

Last updated: 2026-09-08

Status: A local end-to-end demo and a separate prompt laboratory are implemented. Production deployment and the fuller semantic protocol remain future work. See [implementation contract](IMPLEMENTATION_CONTRACT.md) and [demo walkthrough](DEMO_WALKTHROUGH.md).

Product behavior is defined in [PRODUCT_VISION.md](PRODUCT_VISION.md). This document records technical decisions, their reasons, and unresolved choices. Update it when a decision changes; distinguish accepted direction from proposed implementation detail.

## AD-001 — Standalone public repository

Accepted. Build a self-contained open-source project. The neighboring agent-loop project is a reference, not a runtime or local-path dependency. Inspect individual building blocks and copy or adapt only what this application needs, after checking licensing and attribution requirements. No source has been copied yet.

Public fixtures must use fictional participants and redistributable assets. Keep real conversations, local runtime data, and credentials out of version control. Repository license selection is still open.

## AD-002 — Two agent roles

Accepted. Astrid is the conversational agent; Matchy is the background matching agent. No additional agent roles are planned for the demo.

- Astrid learns through conversation, checks interpretations, updates understanding, asks sharing permission, presents proposals, introduces people, and checks in privately.
- Matchy reviews eligible participants, assesses mutual compatibility, and recommends a proposal, clarification, or withholding a match. Matchy sends clarification needs to Astrid rather than independently messaging participants.
- Both use persisted application state through scoped APIs. Matchy's private assessment must not automatically enter participant-facing context.

Implemented in Node.js ES modules using the Responses API directly. The application agent adapter returns validated structured results for conversation, review, introduction, and check-in; domain code commits allowed changes. No additional agent framework is required.

## AD-003 — Replaceable persistence, local files first

Accepted. Place application APIs and repository interfaces between callers and persistence. UI code and agent tools must not directly manipulate storage files. Begin with local file-backed implementations that survive application restarts; a later database implementation should preserve application behavior.

Logical records: participants and shareable profiles; conversations, messages, and membership; remembered understanding with evidence, uncertainty, revisions, and sharing permissions; match reviews and proposals; individual acceptance decisions; background jobs and execution metadata.

Implemented as a serialized JSON repository with temporary-file rename, participant/memory revisions, and a single server process lock. Corrections and deletion markers are authoritative; context cutoffs keep prior conversation from resurrecting edited understanding. Historical messages remain visible. Interrupted running jobs are requeued on initialization. This store is not safe for multiple independent writer processes without its server lock.

## AD-004 — Event-triggered matching jobs

Accepted direction. Meaningful changes to participant understanding or preferences queue a persisted matching review. Include a presenter control to run a review explicitly. Scheduled reviews may come later; continuous agent execution is unnecessary.

Flow: save understanding → queue review → check eligibility and baseline → assess candidates → propose, request clarification, or withhold → let Astrid gather missing information → review again when useful information changes.

Implemented with persisted jobs, coalescing of queued reviews, a single in-process worker, pair duplicate suppression, and revision checks before proposal publication. Changes and manual requests trigger work; no periodic scheduler exists. Failed work is visible, and later explicit requests can review again. Clarification creation alone does not trigger an agent-to-agent loop.

## AD-005 — Application code owns consent and access

Accepted. Agents recommend actions; application code validates state changes and access. Only two explicit, current participant acceptances can create the shared introduction chat. One acceptance or a decline cannot do so. Repeated requests must not create duplicate chats.

Sharing permission is specific to material and audience. Tools and context assembly must enforce it, alongside chat membership and private-memory boundaries. Prompt instructions alone are insufficient enforcement.

Multiple simultaneous proposals and chats are allowed. Decline and withdrawal are explicit; pending proposals become stale after relevant participant edits. Disabling matching blocks new introductions and leaves existing chats intact. Automatic expiration and deliberately reopening a declined pair remain future work.

## AD-006 — Three UI experiences

Accepted. Build an attractive, focused demo UI with:

1. Private person–Astrid chat, including proposals and permission requests.
2. A shared introduction chat: person–Astrid–connection briefly, then person–connection after Astrid's visible departure. Subsequent support happens privately; shared messages do not automatically trigger or enter Astrid's context.
3. An editable “What Astrid knows about you” panel showing confirmed understanding, tentative interpretations, gaps, and sharing controls. Corrections feed back into matching.

A separate presenter view exposes concise decision evidence, pending jobs, and lifecycle state for fictional demo participants. It is clearly labeled for fictional demonstration. The implementation uses browser HTML/CSS/JavaScript with no build step, separate participant ports instead of authentication, and completed-message responses with a typing indicator. The server binds to localhost; the presenter surface is not production access control.

## AD-007 — Versioned prompts are repository assets

Accepted. Keep role prompts in separate, explicitly versioned Markdown files. Selected versions are drafts:

- [Astrid v0.8.0](prompts/astrid/v0.8.0.md), with [conversation examples v0.3.0](prompts/astrid/examples.v0.3.0.md)
- [Matchy v0.6.0](prompts/matchy/v0.6.0.md)

See [prompt versioning rules](prompts/README.md). Both runtimes select explicit versions and record hashes with executions; the application adds [runtime overlay v0.5.0](prompts/runtime/v0.5.0.md). Prompts are behavioral instructions; tool contracts, authorization, persistence, and job execution belong in code.

## AD-008 — Demo-first validation

Accepted direction. Use a resettable fictional dataset and live conversations, matching decisions, and state changes. Demonstrate the full handoff plus corrected memory changing a decision, an incompatible candidate being rejected, and one-sided acceptance remaining pending. Include withholding when no candidate fits.

Validate meaningful behavioral outcomes and application invariants. Do not depend on identical model wording. Record whether a result was live or prepared and which prompt version produced it. The milestone passed 28 offline tests, a live fictional conversation-to-introduction lifecycle, and desktop/mobile browser walkthroughs. See README.md for reproducible commands. These are scoped checks, not general behavioral guarantees.

## AD-009 — Persisted agent handoffs and conversational judgment

Accepted direction; semantic contract drafted in [AGENT_PROTOCOL.md](AGENT_PROTOCOL.md), version 0.1.0. Matchy owns the matching question; Astrid owns how and when to ask it. Work items carry purpose, evidence, revisions, audience, and lifecycle status. Clarifications can be answered, partial, declined, deferred, or obsolete. The application routes work; agents do not repeatedly invoke each other while waiting for people.

Keep Matchy's private pair assessment separate from the participant-safe clarification brief. Context assembly must restrict information for each participant and for shared openings. Prompt guidance alone cannot guarantee a generated brief is safe; the implementation must validate content and permissions.

Astrid's prompt teaches next-move selection and an opinionated but revisable point of view, supported by separately versioned authored conversations. Matchy's prompt requires a positive matching case, attention to disconfirming evidence, and prioritized clarification. Regression fixtures live under evals/; run outputs and temporary findings stay under ignored .local/. Live conversation testing remains necessary. The application implements a narrower handoff vocabulary documented in IMPLEMENTATION_CONTRACT.md.

## AD-010 — Minimal executable prompt lab

Implemented. Use Node.js 22+ ES modules and the Responses HTTP/SSE API directly for this first testing milestone. There are no third-party runtime dependencies. Default model: gpt-6-astra; low reasoning effort, 4096 maximum output tokens, and a 120-second per-request timeout. The application now uses the same Node runtime with a separate structured-response adapter and browser UI.

The lab loads explicit prompt/example versions and pins their hashes per session. It supports interactive or single-turn Astrid conversations, advisory Matchy reviews against fictional records, and local transcript resumption. No application tools are advertised, so prompts explicitly distinguish conversation persistence from structured profile memory and real matchmaking actions.

Streaming deltas are display observations; only a completed final response becomes successful history. Preserve full output items for subsequent turns, including encrypted reasoning content where provided. Use store:false and replay local history. Failed/incomplete attempts remain recorded separately. Errors use bounded safe labels rather than provider response bodies. No automatic retries are performed.

FileSessionStore exposes load/save/lock operations. Saves use temporary files and rename; a per-session exclusive lock prevents concurrent writes. Crash-left locks require manual recovery for now. Credentials live in ignored .env or environment variables; transcripts in ignored .local/. The authorized key was copied locally from the reference project's configuration without introducing a runtime dependency on that checkout. No source was copied.

Five offline tests cover stream fragmentation, incomplete results, safe errors, session history/resumption, locking, and prompt assembly. A live three-request gpt-6-astra smoke run passed on 2026-09-08: Astrid continued the story into care expectations; Matchy distinguished uncertain compatibility from a firm conflict. This is limited manual evidence, not a full prompt evaluation. See README.md for commands.

## AD-011 — Local demo application and deliberate limits

Implemented. The HTTP API and JsonFileRepository isolate the browser and agents from file layout. Application routes enforce participant ownership, consent, revisions, and chat membership. This is a replaceable persistence boundary, not a production database service. Each participant has a fixed local port and profiles remain editable; there is no login.

Readiness currently requires a confirmed record in each of 16 facets across seven topics, with no tentative record in that facet. Requirement strength is independent: a confirmed undecided position may be recorded as unknown strength. This mechanical check does not prove the substance of a facet is understood; Matchy must still evaluate consequential uncertainty. Eligibility checks explicit gender interests in both directions, age ranges, matching opt-in, and same location. These are conservative demo approximations: topic coverage is not a quality score, gender labels currently compare exactly, and distance flexibility is not modeled. Matchy's judgment remains necessary after deterministic checks.

Matchy receives pair-scoped memory. Private Astrid context receives only that person's memory and facet-scoped clarification needs; free-form pair rationale is kept out. Introductions receive public profiles and appropriately authorized details. The shared opening and departure are persisted together after double acceptance. Later connection messages do not go to an agent. Check-ins are private and manually requested; full post-date learning is deferred.

The offline launch command selects scripted responses and exercises state transitions without a provider; technical mode labels stay out of the personal interface. Live mode uses current versioned prompts and validated structured outputs. Prepared demo fixtures and portrait assets are fictional; [asset provenance](web/assets/portraits/README.md) is recorded separately.

## Next decisions

- Authentication, production access control, deployment, notifications, and data lifecycle policy.
- A database-backed repository and multi-worker job handling when needed.
- Deliberate reopening of declined/deferred clarification topics and richer participant-authorized handoffs when a fixed semantic question is insufficient.
- Broader attraction and distance preference modeling, proposal expiration, and participant-controlled reopening after decline.
- Post-date learning and private check-in scheduling.
- Further ethical boundary examples and live prompt improvements. Existing evals are known regressions, including the two conversation-derived cases; they do not replace long live conversations.
- Open-source license selection and attribution review for any future reused code/assets.

## AD-012: Sequential Memy understanding before Astrid

Memy owns evidence-backed memory suggestions, clarification status and at most two consequential gaps. On each user turn the application saves the message, calls Memy, validates and commits updates with a participant revision check, then calls Astrid with fresh memory and recent conversation. Astrid returns reply and permission requests only. Gaps are advisory, not interview assignments. Matchy runs independently from committed changes.

Memy failure prevents a stale Astrid reply; Astrid failure retains already committed memory. Concurrent user edits invalidate in-flight results. The extra call adds measured latency; asynchronous memory extraction is not used. Memory storage and handoff granularity are specified in AD-013 below.

## AD-013: Atomic memory, semantic handoffs, and one matching profile

Each memory is an independently editable belief, with a stable ID, topic, specific facet, user-message evidence, confirmation/strength, revision history, and sharing controls. Multiple beliefs coexist within a topic or facet. `FileMemoryStore` provides scoped list/history and transaction-aware apply/edit operations over the local JSON repository. HTTP list/create/edit/delete/history routes form the app boundary. Keeping memory, participant revision, and stale-proposal changes in one serialized file transaction prevents partial updates; a database adapter can preserve that transaction contract later.

Readiness checks specific facets rather than treating one family fact as the entire family conversation. Missing or tentative facets remain unresolved. Memy must interpret substantive evidence; these guides are not an interview order. Legacy summaries are preserved unclassified instead of receiving invented coverage.

Matchy selects a recipient, exact facet, and that recipient’s own evidence IDs. The application derives the uncertainty and completion condition from shared definitions, pins evidence revisions, and excludes private pair reasoning. Memy can close a clarification only using fresh evidence for the requested facet. Unrelated updates no longer close every question in a broad topic. Partial answers remain queued; declined/deferred questions remain suppressed.

Explicit latest-user profile facts update the authoritative matching profile before Astrid replies. UI edits lock individual fields; a conflicting new statement requires resolution unless the user explicitly corrects the field. Unresolved conflicts block proposals. Opt-in remains an explicit UI/API decision. Age and location are editable.

Temporary audit reports and evaluation findings are local artifacts, not repository documentation. Keep lasting decisions here and in product/protocol/prompt files; keep reusable tests and fixtures in code.

## AD-014: Personal windows and a warm conversation interface

Each participant has a fixed local port; one application process and file-store writer serve all windows. Default ports are Maya4310, Eli4311, Theo4312, Elena4313; a separate operator listener on4314 exposes review/reset tools. Requests on a personal port cannot impersonate a different participant or access operator endpoints. This remains a local demo access model, not production authentication. Browser drafts are independent by origin.

The participant experience has no identity switcher, model/storage badges, demo banners, or operator navigation. Use a clean, cozy storybook chat design with parchment, moss, and sky tones. Astrid has a younger Mediterranean-looking illustrated portrait, clearly distinct from the photographic participants; avoid pink-heart decoration. Memory and profile controls remain accessible without displaying readiness as a score or interview checklist. Technical details belong in operator tools and developer documentation.

## Profile browsing and advisory exploration

The active conversation is the landing view; muted potential connections appear under the active conversations in the sidebar. Only opted-in, discoverable, mutually eligible profiles enter the browse pool. Matchy reviews current understanding on demand, returning a decision plus explicit exploration allow/hold. Complete baseline understanding remains mandatory; a firm conflict or prior decline cannot be overridden by interest. Astrid receives a separate participant-safe advice context: own understanding, public counterpart profile, specifically permitted counterpart stories, and own discussion facets. Private pair rationale never enters this context.

Advice and interest bind to reviewed participant revisions. Interest records one acceptance; the existing proposal lifecycle requires the other acceptance before creating a chat. File-store transactions persist advice, reviews, clarifications, and consent. The interface uses an absurd illustrated clubhouse and keeps internal agent names and operator status out of participant copy.

## Personality without readiness inflation

Memy records distinctive passions, actual anecdotes, and humor separately from compatibility beliefs. These story records use the existing transactional FileMemoryStore and memory controls, distinguished by `kind: story` and no relationship facet. They enrich Astrid's own conversational recall and permission-authorized introduction material, but cannot satisfy baseline readiness or serve as Matchy's compatibility evidence. Current names, photos, bios and interests are not automatically rewritten from stories. No invented biography is used to fill empty profiles.

Stories require latest-user evidence; recording a possible introduction hook never authorizes disclosure. User edits revoke prior grants and protect records, and deletion removes active context while preserving owner history. Semantically detecting a paraphrase of a locked or deleted story remains a model responsibility, as it is for beliefs; application enforcement protects IDs, evidence scope and context cutoffs.


## Foundation review decisions

Persist `understandingPending` with a new private user message, clear it only after Memy changes commit, and block proposal publication/acceptance while either participant has unresolved extraction. Failed extraction remains recoverable through a subsequent private turn. Reviews encountering pending understanding defer matching until it finishes.

Maintain current pending proposal acceptances when a turn only adds new private stories; advance their participant revision alongside the context revision, since no compatibility or previously disclosed content changed. Other memory mutations retain conservative invalidation. This is a narrow exception, not a full split of context, compatibility and disclosure versions.

A current-version recipient-specific denial overrides broad shareable status. Model revisions reset general sharing to private; exact-recipient grants remain tied to the prior record revision. Background introductions retain the uncertainty of all authorized memory material. Story edits preserve tentative status unless the owner explicitly confirms it.

Remaining intentional demo limits: readiness is a structural gate over 16 facets rather than a semantic proof; matching order uses disposition buckets, not relative likelihood; clarification questions use fixed recipient-safe facet definitions; the shared-chat opening remains templated; check-ins and retries are manual; full-state local transactions and recent-message windows are not a scalable retrieval system. These do not prevent conversation and personality iteration, but should not be presented as completed production capabilities.
