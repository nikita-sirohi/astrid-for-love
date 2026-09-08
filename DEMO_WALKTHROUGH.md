# Demo walkthrough

Start with `npm start` for live Astra or `npm run demo:offline` for scripted responses, then open http://127.0.0.1:4310. The mode label distinguishes them. Both use fictional participants and real local application state. Live wording and decisions can vary; offline wording is prepared and should be presented as such.

Use **Behind the scenes → Reset fictional demo** before a clean demonstration. Reset waits until active conversations and matching work have finished. It resets application data, not prompt-lab sessions.

## 1. Get to know Maya

Select Maya's participant tab. The prepared fictional understanding covers six of the seven areas; **Family & future** remains unresolved. This is an accelerated continuation of getting acquainted, not a claim that six topics were learned during the demo.

Begin with a short story about a Sunday with her mother, then let Astrid follow the conversation. In live mode, respond to what she actually asks rather than forcing a memorized script. Show how her question moves from the story toward an expectation that matters to a future relationship.

For the prepared matching branch, make Maya's practical expectation explicit:

> My mother needs to be able to live with me. I would arrange separate space and professional care. I do not expect my partner to become her caregiver.

This is fictional demo input. It overlaps with the prepared lifecycle and must not be presented as an unseen prompt evaluation. In offline mode, use an explicit family/caregiving statement to exercise the scripted memory update; arbitrary conversation is not modeled.

Inspect **Understanding**: the family memory should now express the expectation, its strength, confirmation state, and private sharing status. A vague answer may remain tentative in live mode; clarify or edit it rather than calling the topic understood prematurely.

## 2. Show the decision behind the introduction

A meaningful committed change queues matching work. **Find a connection** also requests a review. Open **Behind the scenes** to watch the job and candidate decisions.

The prepared records are designed to make Maya and Eli promising: Eli can accept family living arrangements with separate space and professional care. Theo has a conflicting firm expectation. The live smoke produced a Maya/Eli proposal and withheld Maya/Theo; a new live run can instead request clarification. Inspect the rationale rather than forcing a success label.

Return to Maya's private chat. Her proposal should contain Eli's photo, basic information, and short personality-led copy. The private family assessment belongs in the presenter view, not in that proposal. The [portraits are generated fictional assets](web/assets/portraits/README.md).

## 3. Demonstrate two real decisions

Accept as Maya. Show that no connection chat exists yet. Switch to Eli: his proposal has his own introduction copy. Accept as Eli.

The connection chat now opens with Astrid's introduction, a light nudge, and her visible departure. Send a message as Maya and reply as Eli. Astrid does not receive or answer those shared messages. Multiple distinct proposals and chats are supported; accepting one does not require closing every other conversation.

From the connection, request the private Astrid check-in. It uses that participant's own context and the approved other profile, not the shared transcript. It may encourage a direct conversation about expectations without claiming to have watched the encounter. This is a manual check-in, not a full post-date learning system.

## 4. Show memory control and changed judgment

For a clean alternative branch, reset and repeat the family clarification. Before accepting a proposal, edit Maya's family memory to make hands-on partner caregiving a **confirmed firm requirement**. Save it and review again.

The old pending proposal becomes stale. The revised expectation should alter the matching assessment, potentially withholding Eli or generating a consequential clarification. Inspect that actual result. A user edit is authoritative and is not silently overwritten from old chat history. Removing a memory can also reopen a coverage gap. These operations do not erase the displayed historical transcript.

## 5. Show sharing permission

On a private memory card, choose **Sharing permission**, select a recipient, and create the request. Return to the private chat and approve or decline it.

Approval applies to this detail, its version, and this recipient. It does not make every memory public or automatically send a message. Changing the remembered material invalidates the old permission for that material. For a simple demonstration, use a harmless fictional anecdote rather than a necessary family disclosure. Introductions remain focused on spark.

## Other short branches

- **No spark:** decline a proposal. Optional feedback stays private; Astrid does not pressure the participant or automatically propose the declined pair again.
- **One-sided interest:** stop after Maya accepts; no shared chat opens.
- **Paused matching:** open **Your profile → Edit your profile**, disable matching, and save. New introductions stop; existing connection chats remain.
- **Explicit attraction preferences:** edit gender, interested-in genders, or age range through the profile panel. These are participant-owned settings, not guesses inferred from a chat. Current eligibility uses exact stated gender labels, age ranges, and matching location; broader preference modeling remains future work.

## What to say about the build

This is a local, single-process demo with a replaceable file repository and separate conversation/matching agents. Jobs are event-triggered or manually requested; there is no periodic scheduler. Participant tabs and the presenter screen are deliberate demo controls, not authentication. The browser waits for completed replies; the independent prompt lab supports streaming. Keep improving prompts through live conversations and the regression suites alongside this application walkthrough.
