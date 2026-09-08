# Demo compared with the original plan

Audit date: 2026-09-08. Read-only review of implementation and repository history; no new model calls or test runs were made for this report. Baseline: the product vision, architecture decisions, and agent protocol in initial commit `4f8ceb1`, compared with demo milestone `069178e` and the working files available at audit time. Later user decisions—participant tabs, multiple chats, and fewer conversational logistics questions—take precedence over the original draft.

**The lifecycle infrastructure is substantially implemented. The largest remaining gaps concern how well understanding survives a long conversation, how a specific matching uncertainty reaches Astrid, and demonstrating the less scripted parts of the experience.** Adding more UI surfaces is lower priority.

The newly agreed **Memy → committed understanding → Astrid** sequence is being implemented in parallel. It is an in-progress architecture change, not a missing feature from the original two-agent plan. This report describes the pre-Memy implementation where relevant; it does not certify that new work.

## What is already present

| Original commitment | Status and implementation evidence |
| --- | --- |
| Standalone public project; local persistent storage behind APIs | Implemented. `JsonFileRepository` in `src/domain.mjs` uses serialized transactions and atomic replacement; `src/server.mjs` provides the API and process lock. The repository has separate product and implementation commits. No neighboring checkout is needed. |
| Private Astrid chat, editable understanding, attractive demo UI | Implemented. `web/app.js` renders private conversations, profile controls, memory status/strength, sharing requests, and a presenter panel. `AstridApp.editMemory` makes corrections authoritative and invalidates pending proposals. |
| Meaningful understanding changes trigger background matching | Implemented. `enqueue`, `drain`, and `performReview` in `src/domain.mjs` persist jobs, gate readiness/eligibility, and record propose/clarify/withhold decisions. Manual review is also available. |
| Private compatibility reasoning; spark-led proposal for each recipient | Implemented structurally. `performReview` calls `introduce` with public profiles and authorized memories; private pair rationale goes to the presenter. `src/agents.mjs` filters context and validates evidence references. Actual appeal remains a behavioral judgment. |
| Double opt-in, multiple connections, no-pressure decline | Implemented. `decision` creates a shared chat only after both current acceptances; `pairBlocked` prevents duplicate or declined-pair proposals. Tests cover one acceptance, idempotency, stale proposals, and multiple chats. |
| Astrid opens a shared chat and leaves; support stays private | Implemented. The shared opening/departure are persisted together; `chatMessage` never calls an agent. `checkin` supplies only the participant's private context and the other public profile. |
| Specific sharing permission and user memory control | Implemented. `addPermission`, `decidePermission`, and `sharedMemories` scope grants by memory revision and recipient. Corrections/deletions prevent old assumptions returning through prior history or review rationale. |
| Resettable fictional demo, presenter evidence, versioned prompts/evals | Implemented. `fixtures/demo.json`, `DEMO_WALKTHROUGH.md`, `src/demo-smoke.mjs`, versioned `prompts/`, and `evals/` supply these pieces. Existing milestone documentation reports offline tests, one live lifecycle, and browser checks; those were not rerun in this audit. |

## Highest-priority demo gaps

### 1. A matching question loses its actual meaning in transit — partial

The original protocol requires uncertainty, decision relevance, participant-owned evidence, and a completion condition. Current clarification records carry only an ID, participant, broad topic, status, and timestamp. `performReview` intentionally removes all free-form pair prose; `ownContext` sends only the topic to Astrid. That protects privacy but can turn “Would separate living space resolve your objection?” into a generic “family” conversation.

There is also no explicit partial state or route to revisit a deferred question. Deduplication is by participant and topic, so declining one family question can suppress a different family question later. Conversely, any memory update in that topic makes queued work obsolete, without proving that its particular uncertainty was resolved.

**Next useful increment:** retain a restricted, participant-owned uncertainty and completion condition, with originating review/revision references. Keep candidate secrets out of the brief. Demonstrate one initially uncertain pairing becoming proposed or withheld because a specific answer resolved the uncertainty. Memy can help interpret the answer, but needs meaningful work-item context to do so.

### 2. Memory and readiness are too coarse to establish the promised understanding — partial

`coverage()` treats a topic as covered when any active memory has `status: confirmed` and a non-unknown strength. In the current conversation writer, a new memory without an ID updates the existing memory for that topic. One summary and one strength can therefore carry several different expectations: wanting children, accepting a parent's stay, and refusing caregiver duties, for example. A family fact can mark the whole family area covered without establishing children preferences.

The privacy fix for edits also excludes all earlier private messages from future agent context and locks the edited/deleted topic against agent changes. This reliably respects corrections, but drops unrelated conversational continuity and requires manual edits for later learning in that topic.

**Next useful increment:** have Memy preserve distinct claims, qualifications, and evidence; keep consequential unknowns explicit even when a broad area has been discussed. Check that a correction does not prevent recording a different new expectation in the same area. Do not turn this into exhaustive mandatory subquestions.

### 3. Conversational facts and matching profiles can disagree — partial

The runtime overlay explicitly leaves profile edits to the UI. Saying a gender preference in chat does not update `participant.interestedIn`, which is what `eligibility()` uses. The current profile API/UI can edit gender, interests, pronouns, age range, bio, and matching opt-in, but cannot edit the participant's own age or location. There is no participant-creation flow; all people begin as fixtures.

This matters especially after moving logistics out of Astrid's conversation: the UI needs to carry the responsibility it has taken over. Gender matching currently normalizes case and whitespace but otherwise compares literal labels; location must match exactly, with no supported distance preference.

**Next useful increment:** make the small set of authoritative eligibility fields editable and make explicit chat statements eligible for a visible, user-confirmed profile update. A new-person flow is useful if the demo should show someone starting from scratch; it is not necessary for the agreed prepared-pool walkthrough.

### 4. The compelling behavioral branches are described more fully than they are demonstrated — partially verified

The executable lifecycle smoke begins with an explicit caregiving statement, and fixtures already cover six of Maya's seven topics. It verifies important state transitions, but skips the harder “ordinary story → useful probe → checked meaning” progression. The prepared family scenario also overlaps existing prompt examples and is correctly documented as a demo, not an unseen evaluation.

The walkthrough describes correction, permission, and no-spark branches, and unit tests cover their mechanics. That is different from seeing Astrid naturally request a shareable anecdote, resolve a value mismatch over several turns, or privately encourage disclosure of a consequential expectation. The current check-in can do the latter, but neither its timing nor that behavior is established by an assertion that a reply exists.

**Next useful increment:** run a long, fresh conversation through the actual Memy/Astrid application loop and inspect what persisted. Then demonstrate one clarification branch and one specific private disclosure nudge with fictional material absent from the prompts. These are live quality checks, not a request for a larger contrived eval suite.

## Smaller gaps worth tracking

- **Optional decline feedback is retained but learning waits.** `decision` writes feedback into the person's private conversation; it does not invoke understanding extraction or queue matching from the feedback itself. A later conversation may incorporate it. Lightweight feedback learning was first-pass scope; full post-date learning was explicitly second-pass.
- **The shared opening is generic.** The application uses the first public interest from each person plus a fixed afternoon question. This satisfies departure and privacy, but cannot yet use the richer funny-story material envisioned for the handoff. The per-recipient proposals do use model-generated copy.
- **Execution provenance is incomplete.** Conversation replies and reviews retain metadata, but the current domain discards introduction metadata and check-in metadata. The original protocol calls for versioned execution records across tasks; retain those before comparing behavior between prompt versions.
- **Ethical boundaries remain partly a product decision.** Prompts establish violence, abuse, and coercion boundaries; the vision itself leaves the broader meaning of “unethical” open. There is no separate persisted matching-suspension/refusal workflow. Do not present that ambiguity as solved by the current application.
- **Public is not yet fully licensed open source.** The repository is public, but `ARCHITECTURE_DECISIONS.md` and README still identify license selection as open. Choose a license before claiming unrestricted reuse rights.

## Deliberate deferrals, not demo failures

Authentication and production presenter access; a hosted database and multi-worker queue; scheduled reviews/notifications; automatic proposal expiration and reopening declined pairs; full post-date learning; richer distance modeling; and streaming browser responses are explicitly deferred or unnecessary for this milestone. Local participant tabs, one file-backed writer, event-triggered matching, and manual private check-ins match the accepted demo scope. Web search was optional support, not the source of matches, so its absence is not a matchmaking gap.

The practical order is: finish Memy and test a long conversation, improve the specificity of clarification handoffs, close the small eligibility/profile mismatch, then demonstrate the remaining behavioral branches. Keep the implemented consent and privacy boundaries while doing that work.

## Implementation update after audit

The parent implementation completed sequential Memy v0.1.0 → committed memory → Astrid v0.8.0 after this audit. The live lifecycle and 34 automated tests passed; see [validation](evals/RESULTS_MEMY_0_1_0.md). The semantic handoff, memory granularity and profile-authority gaps above remain.
