# Astrid ↔ Matchy protocol

Version: 0.1.0
Status: Agreed direction translated into a proposed semantic contract; not implemented.

This document defines handoffs and ownership. Exact API routes, tool names, and JSON schemas come with implementation. Product behavior lives in [PRODUCT_VISION.md](PRODUCT_VISION.md); technical decisions live in [ARCHITECTURE_DECISIONS.md](ARCHITECTURE_DECISIONS.md).

## Ownership

**Matchy owns the matching question; Astrid owns how and when to ask it.** The application owns delivery, persistence, access, consent, and valid state transitions. Agents communicate through persisted work items, not unrestricted conversations with each other. A recommendation never grants authority to contact someone or reveal information.

Astrid is one product identity, with participant-scoped conversations. Her conversation with one person does not give that invocation access to everyone's private history. Matchy may use authorized private evidence for a review; participant-facing Astrid receives a restricted brief. A shared-chat opening receives only information authorized for both recipients.

## Handoffs

| Work item | Producer → consumer | Required meaning |
| --- | --- | --- |
| Understanding changed | Application, after Astrid or user edit → matching queue | Participant, committed revision, changed topics, evidence references, confirmation status, baseline gaps, matching opt-in state. The application decides whether the change warrants a review. |
| Matching review | Queue → Matchy | Review ID, trigger, authorized participant snapshots and revisions, eligibility, relevant previous reviews/proposals/declines, and unresolved clarification status. |
| Clarification request | Matchy → application → participant's Astrid | Target participant, topic, uncertainty, safe purpose and decision relevance, evidence about that participant, suggested question angle, required permissions, and completion condition. Separate private review context from the participant-safe brief. |
| Clarification disposition | Astrid/application → review record | Request ID; answered, partial, declined, deferred, or obsolete; resulting evidence and committed revision when present; remaining uncertainty. Quoting an answer does not automatically confirm Astrid's interpretation. |
| Review decision | Matchy → application | Propose, needs clarification, or no suitable match; reviewed revisions; concise evidence-based rationale; disqualifying conflicts and uncertainty; next step and what new information could change it. |
| Authorized delivery task | Application → Astrid | Task type, audience, approved content, related proposal or permission record, current state, and allowed action. Types include proposal presentation, permission request, shared opening, and private check-in. |

Every work item needs an identity, originating event/review, target, status, creation time, and relevant record revisions. Execution records identify role, prompt and example versions/hashes, protocol version, and model configuration. These are design requirements, not existing fields or tools.

## Matching decisions

Matchy can inspect multiple candidates within a bounded review. Record candidate dispositions separately from the review's next action: rejecting one candidate does not mean the whole pool has no suitable match.

- **Propose:** enough understanding for both people, mutual eligibility, no known conflicting firm requirement, and a positive case grounded in practical compatibility. Remaining uncertainty may include chemistry, which participants judge. Include separately permissioned material for each proposal recipient; a private rationale is not proposal copy.
- **Needs clarification:** a specific answer could change a promising candidate's disposition or establish baseline readiness. Identify the highest-impact uncertainty first. Do not ask questions merely to increase data completeness or postpone making a judgment.
- **No suitable match:** no viable candidate currently remains, or a relevant boundary precludes matching. Identify whether new facts or new participants could change the outcome. Do not force a proposal.

An unresolved sharing permission can block delivery without invalidating the private matching assessment. The application can request permission or use already-approved material; it must not send the restricted material while waiting.

## Clarification lifecycle

Proposed states: queued → addressed → answered / partial / declined / deferred / obsolete. A question can also be answered by an ordinary story or direct memory edit before it is asked; reconcile against current understanding first.

- Astrid may rephrase, defer, or explain that the question is already answered. She must preserve its decision purpose, not obey suggested wording literally.
- A normal clarification joins an appropriate private conversation. Its existence alone is not authorization to send unsolicited messages.
- When a user declines, record that disposition and stop asking. Matchy may hold the candidate; it must not reissue the same question in new wording.
- Partial information can justify another focused question if something consequential remains, but it is not an invitation to badger someone.
- Deferred requests wait for a suitable conversation or explicit revisit. Passage of time alone does not constitute an answer or permission.
- If the participant withdraws from matching, a candidate becomes ineligible, or new information settles the uncertainty, close obsolete requests.
- Re-review when relevant committed understanding or eligibility changes. A clarification request and its acknowledgment alone must not bounce the agents into another review.

## Privacy at the handoff

Keep Matchy's private pair assessment outside participant-facing prompts. Supply a safe question brief that can stand on its own without a candidate's identity, private story, or identifying specifics. Never pass the whole assessment with an instruction to “keep this secret.”

Safe briefs still need to preserve purpose: for example, “Understand which extended-family living arrangements you could accept; the answer distinguishes acceptable arrangements from a firm housing boundary.” If explaining or asking the actual question would reveal another person's private fact, obtain that person's specific permission first, choose a broader legitimate baseline question, or hold the review. Do not disguise disclosure as a hypothetical with identifying details, and do not invent a reason for asking.

Permission grants identify owner, content/version, audience, and scope. Silence is not permission. Shared-chat content must be authorized for both recipients. Private check-ins use the participant's own conversation and permitted profile context, not subsequent messages from the pair's chat.

The future context builder and tool/API layer must enforce these boundaries. Free-form model output is not automatically safe because it is labeled “safe brief”; validate its evidence and allowed content before delivery. Exact validation strategy remains an implementation decision.

## Worked exchange: apparent family mismatch

All people and statements here are fictional.

1. Alex confirms that a dependent parent must be able to live with them. Sam has said, “I need our home to be ours.” Matchy sees a possible conflict, not evidence that either person would compromise.
2. Matchy's private review records both statements and their revisions. Its brief for Sam's Astrid only asks what Sam means by a private home and whether any family living arrangements would be acceptable. It does not mention Alex or Alex's parent.
3. If Sam is telling an unrelated vulnerable story, Astrid defers. Later: “When you said the home needed to be yours as a couple, did you mean no family living there, or having a say in the arrangement?”
4. Sam says, “I could do it with a separate space and hired care. I won't become the default caregiver.” Astrid checks that interpretation and commits it through the application. The request is answered, but the match is not yet established.
5. Matchy now needs evidence that Alex's actual expectations can fit those conditions. It routes a separate permission-safe clarification to Alex's Astrid. If they can fit, it can recommend a proposal; if Alex requires hands-on care from a partner, it withholds this candidate.
6. Any eventual proposal uses approved personality and photos. Neither private family discussion is automatically disclosed. Astrid encourages the pair to discuss their expectations themselves as their connection develops.

## Reliability and authority

- Persist committed understanding before queuing a review. Carry evidence versions through the decision and revalidate before delivering a proposal.
- User corrections supersede stale inferences. Canceled or stale jobs cannot resurrect them.
- Deduplicate work by relevant participant/pair revisions and purpose. A retry must not send another proposal, permission request, or introduction.
- Bound each execution and its tool calls. Stop when waiting on a person; save a work item instead of holding a model loop open.
- Only application-verified, explicit acceptance by both people opens a chat. Matchy's recommendation and Astrid's language cannot substitute for it.
- The shared opening is a bounded task. The application records Astrid's departure and stops routing the pair's later messages to her.
- Model/tool failures leave work retryable or visibly failed, not falsely completed. Exact transactional, retry, and recovery mechanisms remain open.

## Remaining design questions

- Exact schemas, tool surfaces, context validation, and failure/retry mechanics.
- Private check-in scheduling and notification behavior.
- Product policy for expiration, withdrawal, multiple proposals, and changed understanding after proposal delivery.
- Concrete ethical refusal examples beyond the already-established violence, abuse, and coercion boundaries.
