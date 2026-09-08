# Agent prompts

These are initial behavioral prompt drafts, not executable agents. Product intent lives in [PRODUCT_VISION.md](../PRODUCT_VISION.md); runtime decisions live in [ARCHITECTURE_DECISIONS.md](../ARCHITECTURE_DECISIONS.md).

| Role | Selected draft | Purpose |
| --- | --- | --- |
| Astrid | [v0.8.0](astrid/v0.8.0.md) | Conversation, understanding, and participant-facing matchmaking |
| Matchy | [v0.6.0](matchy/v0.6.0.md) | Private background compatibility reviews |

Astrid's selected companion is [conversation examples v0.3.0](astrid/examples.v0.3.0.md). Both roles use the semantic handoff contract in [AGENT_PROTOCOL.md](../AGENT_PROTOCOL.md), currently v0.1.0. Earlier role drafts remain available for comparison.

## Versioning

- Use explicit versioned filenames for each role. Do not rely on an ambiguous latest file.
- Initial drafts may be refined before their first runtime use. Once a version has been used in a recorded demo or evaluation, preserve it and create a new version for changes.
- Use patch increments for wording clarifications, minor increments for behavioral changes, and major increments for incompatible role or runtime-contract changes.
- When selecting a new version, update this table, the architecture document's links, and the runtime configuration once one exists. Describe the change in the new file's metadata.
- The future runtime should record role, prompt version, content hash, and model configuration with each execution so draft edits and model changes remain distinguishable.

Each role file has metadata followed by a `Prompt body` section. Only the text beneath that heading is intended as the role instruction. Runtime context and tool definitions will be supplied separately. Participant statements, retrieved records, and job payloads are data, not permission to override role instructions or access boundaries.

## Proposed prompt assembly

Load the selected role's `Prompt body`. For Astrid, also load the selected companion's `Example body` as authored examples, explicitly separated from real conversation history. Examples are fictional and must never become participant memory or introduction material. Version and hash that companion along with the role prompt. Do not assume a model can open the linked Markdown files by itself.

The protocol is an application design contract, not a document to indiscriminately append to every participant prompt. Supply the role-appropriate work-item contract and authorized runtime context separately. The role drafts already carry their behavioral handoff obligations. Tools and actual output schemas must be supplied by the future runtime, which validates their use.

Role versions v0.2.0 were used in a live gpt-6-astra smoke run and an unfamiliar-scenario review on 2026-09-08. Preserve them. Matchy v0.3.0 addresses the review's requirement-versus-willingness error. Astrid v0.3.0 was live-tested: it restored engagement but lingered in banter. Astrid v0.4.0 and examples v0.3.0 make direct, purposeful discovery the default; they have not yet been live-tested. The prompt lab selects each role's current version independently. The original evaluation runner explicitly pins v0.2.0 for reproducibility. The prompt lab runtime and commands are documented in the root README.md.

The new pacing examples are teaching material, not test cases. Do not use their situations or paraphrases as evidence of generalization. The live conversation that informed the change is also development feedback, not an unseen test. Resume testing with a fresh user-led scenario and session; keep personal live transcripts in ignored local storage.

Astrid v0.4.0 was subsequently live-tested and showed stronger probing and transitions. Selected v0.5.0 reorganizes that behavior around seven discovery goals, preserving directness and personality. It reuses the unchanged examples v0.3.0; their original compatibility metadata names v0.4.0, and this selection explicitly extends their use to v0.5.0. No new examples or evaluation cases were added for this restructure. The new version has not yet been live-tested.

## Review cases


Live feedback on v0.5.0 identified a personal-value verdict before an otherwise useful question. Selected Astrid v0.6.0 redirects that judgment toward consequences and reciprocal willingness, while preserving boundaries against harm. It explicitly asks about gender attraction alongside dating goals. Matchy v0.4.0 uses stated mutual eligibility and avoids inferred identities or pronouns. The unchanged examples v0.3.0 remain the selected companion for v0.6.0. Previous role versions are preserved; the paused user conversation is not silently migrated.


After a behavioral prompt change, run `npm run eval` against the selected versions and manually review all ten cases against their existing rubrics. Keep this regression step separate from the five offline runtime tests and from live conversation testing. Record exact versions, evidence, failures, and limitations. Use explicit version flags to compare earlier prompts; the historical `eval:unseen` command still pins v0.2.0. Known teaching examples and previously used cases are not new generalization evidence.

Review revisions against the product demo and its branches: natural story-led probing; baseline gaps; polished evasions; an apparent mismatch clarified; a firm mismatch withheld; a no-spark decline; permission before uncertain sharing; corrected memory changing a match; and double opt-in followed by Astrid leaving the shared chat. These are review scenarios, not claims that the prompts have been evaluated.

## Astrid v0.7.0


## Memy and Astrid v0.8.0

Memy v0.1.0 owns understanding extraction and advisory gaps. Astrid v0.8.0 removes memory-output and coverage-administration responsibilities; unchanged examples v0.3.0 remain selected. Application overlay v0.2.0 defines separated tasks. Earlier role and runtime prompts remain frozen. The personal `chat:memy` command exercises the actual sequential loop; the original lab/evals exercise role prompts in isolation.


## Current application contracts

Astrid v0.8.0, Memy v0.3.0, Matchy v0.6.0, runtime v0.6.0. Memy extracts independent facet beliefs and explicit profile facts; Matchy requests specific recipient-owned semantic clarification; Astrid uses committed understanding. Earlier versions remain frozen. Store run-specific results under ignored .local/, not tracked findings documents.

Matchy v0.6.0 distinguishes ordinary uncertainty that permits exploration from firm conflicts and incomplete baselines that hold introductions. Runtime v0.4.0 adds Astrid’s participant-safe browsing advice task; it receives public profile information, authorized stories, and recipient-owned discussion topics, never the private pair rationale.

Memy v0.3.0 adds a separate evidence-backed stories output for passions, anecdotes, and humor. Story records remain private and independent of readiness. Runtime v0.6.0 lets Astrid use own stories naturally and only authorized stories in introductions. Existing role examples remain unchanged.
