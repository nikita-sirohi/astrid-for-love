# Agent prompts

These are initial behavioral prompt drafts, not executable agents. Product intent lives in [PRODUCT_VISION.md](../PRODUCT_VISION.md); runtime decisions live in [ARCHITECTURE_DECISIONS.md](../ARCHITECTURE_DECISIONS.md).

| Role | Selected draft | Purpose |
| --- | --- | --- |
| Astrid | [v0.2.0](astrid/v0.2.0.md) | Conversation, understanding, and participant-facing matchmaking |
| Matchy | [v0.2.0](matchy/v0.2.0.md) | Private background compatibility reviews |

Astrid's selected companion is [conversation examples v0.1.0](astrid/examples.v0.1.0.md). Both roles use the semantic handoff contract in [AGENT_PROTOCOL.md](../AGENT_PROTOCOL.md), currently v0.1.0. Earlier role drafts remain available for comparison.

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

The selected drafts were used in a live gpt-6-astra smoke run on 2026-09-08: two Astrid conversation turns and one fictional Matchy review. Preserve these versions; future changes should use new versions. Transport and basic behavior worked, but this small manual check is not a comprehensive voice or adherence evaluation. The prompt lab runtime and commands are documented in the root README.md.

## Review cases

Review revisions against the product demo and its branches: natural story-led probing; baseline gaps; polished evasions; an apparent mismatch clarified; a firm mismatch withheld; a no-spark decline; permission before uncertain sharing; corrected memory changing a match; and double opt-in followed by Astrid leaving the shared chat. These are review scenarios, not claims that the prompts have been evaluated.
