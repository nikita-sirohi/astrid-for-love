# Demo walkthrough

This walkthrough uses the prepared fictional records from `npm run demo:offline`: open Maya at http://127.0.0.1:4310, Eli at http://127.0.0.1:4311, Theo at http://127.0.0.1:4312 and Elena at http://127.0.0.1:4313 in separate windows. Offline responses are scripted and should be presented as such. Fresh `npm start` stores instead contain blank profiles; see [startup options](README.md#start-your-own-demo) for a chosen profile count and storage target. Resume an existing live store to retain its actual conversations. The isolated `node src/demo-smoke.mjs --live` exercises these prepared branches against Astra without changing that store.

Open http://127.0.0.1:4314/?view=presenter and use the reset control before a clean demonstration. Reset waits until active conversations and matching work have finished. It resets application data, not prompt-lab sessions.

## 1. Get to know Maya

Open Maya’s window. The prepared fictional understanding covers six of the seven areas; **Family & future** remains unresolved. This is an accelerated continuation of getting acquainted, not a claim that six topics were learned during the demo.

Begin with a short story about a Sunday with her mother, then let Astrid follow the conversation. In live mode, respond to what she actually asks rather than forcing a memorized script. Show how her question moves from the story toward an expectation that matters to a future relationship.

For the prepared matching branch, make Maya's practical expectation explicit:

> My mother needs to be able to live with me. I would arrange separate space and professional care. I do not expect my partner to become her caregiver.

This is fictional demo input. It overlaps with the prepared lifecycle and must not be presented as an unseen prompt evaluation. In offline mode, use an explicit family/caregiving statement to exercise the scripted memory update; arbitrary conversation is not modeled.

Inspect **Understanding**: the family memory should now express the expectation, its strength, confirmation state, and private sharing status. A vague answer may remain tentative in live mode; clarify or edit it rather than calling the topic understood prematurely.

## 2. Show the decision behind the introduction

A meaningful committed change queues matching work. **Find a connection** also requests a review. Open the operator window on port4314 to watch the job and candidate decisions.

The prepared records are designed to make Maya and Eli promising: Eli can accept family living arrangements with separate space and professional care. Theo has a conflicting firm expectation. The live smoke produced a Maya/Eli proposal and withheld Maya/Theo; a new live run can instead request clarification. Inspect the rationale rather than forcing a success label.

Return to Maya’s window and private chat. Her proposal should contain Eli's photo, basic information, and short personality-led copy. The private family assessment belongs in the presenter view, not in that proposal. The [portraits are generated fictional assets](web/assets/portraits/README.md).

## 3. Demonstrate two real decisions

Accept as Maya. Show that no connection chat exists yet. Open Eli’s window: his proposal has his own introduction copy. Accept as Eli.

The connection chat now opens with Astrid's personalized introduction and her visible departure. Live openings use public profiles and records authorized for both people; the offline version is scripted. If generation fails after both accept, retry the introduction without submitting new consent. Send a message as Maya and reply as Eli. Astrid does not receive or answer those shared messages. Multiple distinct proposals and chats are supported; accepting one does not require closing every other conversation.

From the connection, request the private Astrid check-in. It uses that participant's own context and the approved other profile, not the shared transcript. It may encourage a direct conversation about expectations without claiming to have watched the encounter. This is a manual check-in, not a full post-date learning system.

## 4. Show memory control and changed judgment

In an isolated prepared store, reset and repeat the family clarification for a clean alternative branch. Do not reset a live store whose conversations you want to preserve. Before accepting a proposal, edit Maya's family memory to make hands-on partner caregiving a **confirmed firm requirement**. Save it and review again.

The old pending proposal becomes stale. The revised expectation should alter the matching assessment, potentially withholding Eli or generating a consequential clarification. Inspect that actual result. A user edit is authoritative and is not silently overwritten from old chat history. Removing a memory can also reopen a coverage gap. These operations do not erase the displayed historical transcript.

## 5. Show sharing permission

On a private memory card, choose **Sharing permission**, select a recipient, and create the request. Return to the private chat and approve or decline it.

Approval applies to this detail, its version, and this recipient. It does not make every memory public or automatically send a message. Changing the remembered material invalidates the old permission for that material. For a simple demonstration, use a harmless fictional anecdote rather than a necessary family disclosure. Introductions remain focused on spark.

## Other short branches

- **No spark:** decline a proposal. Optional feedback stays private; Astrid does not pressure the participant or automatically propose the declined pair again.
- **One-sided interest:** stop after Maya accepts; no shared chat opens.
- **Paused matching:** open **Your profile → Edit your profile**, disable matching, and save. New introductions stop; existing connection chats remain.
- **Explicit attraction preferences:** edit gender, interested-in genders, or age range through the profile panel. These are participant-owned settings, not guesses inferred from a chat. Explicit facts learned in chat update the matching profile; user-edited field conflicts require resolution. Age and location are also editable. Broader distance modeling remains future work.

## What to say about the build

This is a local, single-process demo with a scoped file-backed memory API and separate Memy, Astrid, and Matchy roles. Jobs are event-triggered or manually requested; there is no periodic scheduler. Separate participant ports and the operator screen are local access controls, not authentication. The browser waits for completed replies; the independent prompt lab supports streaming. Keep improving prompts through live conversations and the regression suites alongside this application walkthrough.

## Browse-first clubhouse

Start at Eli’s window on port4311. Select Elena under the active conversations; the inline profile panel automatically asks Astrid for her assessment. The offline branch calls their planning/spontaneity difference worth exploring; live Matchy may judge their stated flexibility sufficient for a promising match. Express interest, then open Elena’s window on port4313 and accept separately. Both windows now share a connection; Astrid opens it and leaves. Ask about Maya to demonstrate withholding while important understanding remains incomplete. Your lore controls profile visibility as well as memory and matching consent.
