# Local demo implementation contract

Implemented local-demo contract, 2026-09-08. See [README.md](README.md) for startup and limits and [DEMO_WALKTHROUGH.md](DEMO_WALKTHROUGH.md) for the prepared lifecycle. Node 22 ES modules, built-in HTTP server and a browser UI with no build step. Multiple pending proposals and multiple connection chats are allowed. Each participant has a fixed localhost port; these windows are not production authentication. One process binds the participant listeners and a separate operator port to 127.0.0.1. Real provider calls use the existing ignored .env. Offline mode is explicitly labeled scripted demo mode.

## Implementation status

Implemented by src/domain.mjs, src/server.mjs, src/agents.mjs, and web/. The app uses a single file-backed writer process with a server lock, serialized transactions, and restart recovery for running jobs. There is no authentication, periodic scheduler, or full post-date learning workflow. Explicit conversational profile facts update matching fields; UI field locks require resolution of conflicts or an explicit correction. Matching opt-in changes only through UI/API. Matching-disabled participants retain existing chats.

Validate with npm test and isolated offline/live demo smoke commands. Keep run-specific findings under ignored .local/.

## Domain shape

State: {schemaVersion, participants:[], memories:[], messages:[], proposals:[], chats:[], permissions:[], clarifications:[], reviews:[], jobs:[], events:[]}.

Participant: {id,name,age,gender,pronouns,interestedIn:[gender],location,bio,photo,interests:[],matchingEnabled,revision,ageRange:[min,max]}. All fixtures are clearly fictional adults. photo is a local asset path. interests and bio are shareable.

Memory: {id,participantId,topic,facet,text,status:'confirmed'|'tentative',strength:'requires'|'prefers'|'accepts'|'unknown',sharing:'private'|'shareable',evidenceIds:[],revision,history:[],deleted:false}. topic is one of dating,family,ambition,closeness,relationships,repair,convictions. User editing is authoritative, bumps participant revision, suppresses stale assumptions. Agent changes are tentative unless explicit direct evidence supports confirmed. Agent cannot change a user-locked/deleted memory.

Message: {id,chatId,authorId,role:'user'|'assistant'|'system',text,createdAt}. Private chat IDs are astrid-PARTICIPANT; connection chat IDs are generated. authorId is participant ID or astrid/system.

Proposal: {id,participantIds:[a,b],status:'pending'|'introduced'|'declined'|'withdrawn'|'stale',decisions:{[id]:'pending'|'accepted'|'declined'},introductions:{[recipientId]:text},createdAt,chatId:null|id,reviewId,revisions:{[id]:number}}. API only returns proposals involving active participant, with no private review rationale. intro uses shareable profiles plus specifically authorized memory only. Chat: {id,participantIds,astridPresent:false,createdAt,proposalId}; shared opening and departure persist as messages together when second acceptance is committed. Later chat messages never go to an agent.

Permission: {id,participantId,memoryId,recipientId,status:'pending'|'granted'|'denied',text,createdAt,memoryRevision}. Grant authorizes exact memory version for named recipient, not global sharing. Clarification: {id,participantId,topic,facet,evidenceIds,memoryRevisions,uncertainty,completionCondition,status:'queued'|'answered'|'deferred'|'declined'|'obsolete',createdAt}; UI may show own clarifications. Free-form pair rationale never enters private Astrid context. Clarification questions and completion criteria derive from the selected semantic facet; evidence references are recipient-owned.

Job: {id,kind:'matching',status:'queued'|'running'|'completed'|'failed',participantId,createdAt,error?,reviewIds?:[]}. Review: {id,participantIds,decision:'propose'|'needs_clarification'|'withhold',reason,evidenceIds:[],clarifications:[{participantId,topic,facet,evidenceIds}],revisions,createdAt,model?,prompt?}. Presenter-only.

## HTTP API

JSON throughout; errors {error}. Personal ports derive the actor from their fixed participant; any conflicting X-Participant-Id is rejected. The operator listener and bare test server require X-Participant-Id for participant-scoped operations. This is a local routing guard, not authentication. Mutations refresh UI via GET. Server serializes state writes; model calls happen outside transactions with freshness checks at commit.

- GET /api/bootstrap → {participants:[publicProfile],mode:'live'|'offline',topics:[{id,label}],facets,activeParticipantId,operator,fictional:true}
- GET /api/participants/:id → {participant,memories,coverage:{[topic]:boolean},coverageDetails:{[facet]:boolean},profileConflicts,messages:[private],proposals,chats:[{...chat,other:publicProfile,messages}],permissions,clarifications,busy:boolean}
- POST /api/participants/:id/messages {text} → {message,reply?,memoryUpdates?,error?}. Async model work can take time; UI shows typing. User message persists even if agent fails. No character deltas initially: reliable completed-message transport first.
- PATCH /api/participants/:id/profile {matchingEnabled?,age?,location?,gender?,pronouns?,interestedIn?,bio?,ageRange?} → {participant}
- GET /api/participants/:id/memories → {memories}
- GET /api/participants/:id/memories/:memoryId/history → {revisions}; owner-scoped, includes historical and removed records for user control; never passed to agents.
- POST /api/participants/:id/memories {topic,facet,text,status?,strength?,sharing?} → {memory}
- PATCH /api/participants/:id/memories/:memoryId {text?,status?,strength?,sharing?,topic?,facet?} → {memory}
- DELETE /api/participants/:id/memories/:memoryId → {ok:true}
- POST /api/participants/:id/matching {} → {job}; runs asynchronously, polling sees progress.
- POST /api/participants/:id/permissions {memoryId,recipientId} → {permission}; demo-accessible explicit way to exercise sharing request. Agent may also request it with authorized recipient context.
- POST /api/participants/:id/permissions/:permissionId {decision:'granted'|'denied'} → {permission}
- POST /api/proposals/:id/decision {decision:'accepted'|'declined'|'withdrawn',feedback?:text} → {proposal,chat?}; actor from header. Optional feedback stays private.
- GET /api/chats/:id → {chat,messages}; actor must be a member.
- POST /api/chats/:id/messages {text} → {message}; actor must be member, no agent.
- POST /api/participants/:id/checkin {chatId} → {reply}; only own context plus approved other profile, no shared transcript.
- GET /api/presenter (operator port only) → {jobs,reviews,events,counts,mode}; explicitly separate fictional presenter screen.
- POST /api/demo/reset (operator port only) {} → {ok:true}; rejects while model work is active; resets only app store, never prompt-lab sessions.

## Agent module exports (root consumes)

`createAgents({mode:'live'|'offline'})` returns:

- `understand({participant,memories,messages,clarifications})` → {memories:[{id?:existingId,topic,facet,text,status,strength,evidenceIds:[]}],profileUpdates:[{field,value:JSON-string,correction:boolean,evidenceIds}],clarificationUpdates:[{id,status,evidenceIds}],gaps:[{topic,reason}],metadata}. Memy runs first; validated changes commit before Astrid.
- `converse({participant,memories,messages,clarifications,understanding:{gaps},permissionRecipients=[]})` → {reply,permissions:[{memoryId,recipientId}],metadata}. Astrid reads freshly committed own context and cannot write memory. The application checks participant revision at both commit boundaries.
- `review({participants:[a,b],memories,previousReviews=[]})` → {decision:'propose'|'needs_clarification'|'withhold',reason,evidenceIds:[],clarifications:[{participantId,topic,facet,evidenceIds}],metadata}. Only candidate pair snapshots. Domain performs deterministic eligibility, readiness, previous decline, consent, and revision checks outside model.
- `introduce({recipient,other,shareableMemories=[]})` → {text,metadata}. Only approved public data passed; generate 2–3 sentences with spark. No private pair rationale.
- `checkin({participant,other,memories,messages})` → {reply,metadata}. Own private context, no shared messages; encourage self-disclosure without inventing knowledge of encounter.

Live mode uses gpt-6-astra and selected versioned role bodies WITHOUT the prompt-lab “no tools” overlay. App runtime overlay supplies these output contracts and application authority limits. Persist prompt versions/hashes in metadata. All provider errors safe. Offline mode deterministic and visibly labeled, not evidence of model performance.

## Acceptance essentials

One acceptance never opens chat; two explicit current acceptances do exactly once. Multiple distinct proposals supported, pair duplicates suppressed, decline respected. Profile/memory changes invalidate pending reviews/proposals, matching disabled prevents introductions. User corrections/deletions override prior history (context cutoff or equivalent). Restart preserves state/jobs. Actor scoping covers every private mutation. No keys or real sessions become fixtures or tracked files. Demo covers meaningful follow-up, coverage gap, private rationale, spark, double consent, handoff/departure, own check-in, editable memory, withhold, correction, and one-sided pending branches.

## Browsing

Profile `discoverable` is an explicit editable boolean. `GET /api/participants/:id/discover` returns mutually eligible public profiles opted into browsing. `POST /api/participants/:id/discover/:otherId/advice` returns public `other` and `assessment` containing status (`promising`, `explore`, `hold`), text, canRequest, reviewId, revisions, and optional proposalId. `POST /api/participants/:id/discover/:otherId/interest` accepts `{reviewId}` and returns the participant-projected proposal. All routes enforce the port’s participant identity.

Reviews carry `exploration: allow|hold`. Explore requires full baseline coverage, evidence from both people, and no firm conflict. Advice uses a separate agent `advise` task with authorized context only. Reviews, advice, and clarification records persist in the file repository. Interest rejects stale revisions, withheld decisions, hidden profiles, and prior declines; it records only the requesting person’s acceptance and uses the existing double-consent transition.

Browsing profiles now include `matchStatus`, derived only from a current-revision review or `unknown`; ordering uses disposition without a probability score. Live character shells explicitly marked `demoShell` can be previewed while basic eligibility is unknown, but cannot be introduced until ordinary eligibility and readiness pass. This is restricted to fictional local shells. `POST /api/participants/:id/discover/:otherId/discuss` with `{reviewId}` requires current advice and writes its safe explanation to the actor’s private chat, idempotently by advice ID. It never writes user evidence or understanding. Runtime v0.5.0 retains missing-own-evidence facets as legitimate discussion questions.

## Story memory

`understand` also returns `stories: [{id: string|null, storyType: "passion"|"anecdote"|"humor", text, status: "confirmed"|"tentative", evidenceIds: string[]}]` (at most six). Fresh latest-user evidence is required in addition to any cited prior own user messages. Stories persist atomically before Astrid replies in the existing memory API with `kind: "story"`, `topic: "story"`, `facet: null`, and `strength: "unknown"`; absent kind identifies existing compatibility records. No store migration is necessary.

Story IDs support the same private listing, revision history, edit/delete locks, text-free tombstones and exact-recipient versioned permission grants as beliefs. A story cannot change into a compatibility belief through editing. Astrid receives own stories as memories; introduction context receives only already-authorized records. Matchy context and readiness exclude story records. Lore displays them as compact editable notes. Broad shareable status remains an explicit user setting, never model output.


## Pending understanding and sharing precedence

Participant `understandingPending` is persisted before Memy runs and cleared with successful understanding commit. Proposal publication and acceptance reject pending participants, including after extraction failure. `matchingDeferred` requeues a review skipped during extraction. Only newly added private stories may advance pending proposal revisions without discarding acceptances; other updates use existing invalidation.

A current-recipient/current-memory-revision denied permission wins over `sharing: shareable`. Automatic memory revisions reset sharing to private. Introduction contexts preserve status. The story editor exposes explicit tentative/confirmed status and supports new story creation through the existing memory POST endpoint.


## Agent execution and startup

Live role tasks support scoped Responses function calls with six model steps, eight tool calls and a 120-second run budget. Memy can atomically commit before returning; Astrid can request matching or sharing permission and inspect safe match state. Matchy can inspect records and test its final disposition; application code still controls pair scheduling and publication. Successful metadata includes steps and toolTrace. Prompt-only CLI evaluations remain separate.

Startup accepts --profiles N, --store PATH, --port N and --mode live|offline. Counts initialize new stores only; incompatible existing counts/modes fail. Fresh profiles ask for a name and contain no invented compatibility facts. GET /api/participants/:id/matching/:jobId returns an owner-scoped job; POST /api/participants/:id/clear resets that participant and related connections; POST /api/participants/:id/lore/refresh compresses existing own memory for display without changing facts or revisions.
