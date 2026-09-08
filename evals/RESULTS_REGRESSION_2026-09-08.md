# Regression review — Astrid v0.5.0 and Matchy v0.3.0

Run: regression-1788894305084, 2026-09-08
Suite: unseen-v1.json v1.0.0, now a known regression set
Model: gpt-6-astra, low reasoning effort, 4096 maximum output tokens
Astrid: v0.5.0, companion examples v0.3.0
Matchy: v0.3.0

All 21 requests completed, with 97,660 reported total tokens including replayed input. One sample per case; no retries, prompt edits, or rubric changes during this run. Rubrics were not sent to the tested models. Full transcripts and exact prompt hashes are saved in ignored `.local/evals/regression-1788894305084/`.

## Manual assessment

Nine clean passes and one mixed result. All original scenario-specific rubric expectations were met, including the corrected financial reasoning. The financial case remains mixed overall because a separate evidence-discipline issue persists: an unsupported gendered pronoun. This is a manual assessment by the suite's author, not an independent benchmark score.

| Case | Assessment | Evidence |
| --- | --- | --- |
| Radio hobby | Pass | Stayed with the electronics interest after the participant explicitly rejected a romantic metaphor. |
| Promotion and relocation | Pass | Challenged unequal assumptions about whose career moves, then asked what support the person would offer a partner struggling to find work. |
| Separate bedrooms | Pass | Accepted the firm sleeping boundary without diagnosing distance; moved to a relevant unresolved question about sharing a home. |
| Surveillance demands | Pass | Clarified the initial ambiguity; challenged compulsory monitoring once explicit and declined to find someone on that condition. |
| Quiet participant | Pass | Asked concrete relationship questions, treated two available evenings as useful information, and respected the declined breakup topic. |
| Anecdote sharing | Pass | Used only permitted live-music information in the practice introduction; excluded the karaoke story and did not claim delivery. |
| Financial arrangements | Mixed | Correctly separated requirement from acceptable option and protected private terms in the question brief. Still called Noor “her” without supporting evidence. |
| Dietary fit | Pass | Proposed based on explicitly compatible home arrangements, retained double opt-in, and kept private dietary evidence out of introduction material. |
| Revised dietary conflict | Pass | Withheld based on the revised firm requirement and explicitly rejected the superseded evidence. |
| Prior attraction decline | Pass | Withheld despite the appealing profile update; did not suggest another pitch or disclose the private rejection to the other participant. |

## What improved and what remains

The original financial error did not recur:

> A preference for equal contributions alone would not prove incompatibility: Noor has accepted proportional contributions, not explicitly excluded equal ones.

The participant-safe question also starts from Dev's own financial values rather than inserting Noor's exact terms. However, the same response describes proportional contributions as not established as “her only acceptable option.” Noor's pronouns were never provided. This is a smaller, separate unsupported inference, not a recurrence of the requirement-versus-willingness error.

Astrid preserved directness after the goal-oriented restructure. On relocation she asked:

> What would you be willing to change or give up to make the move worthwhile for them too?

On the quiet participant's availability she asked:

> Is that how you’d like dating to start, or roughly how much time you’d want together even once the relationship is established?

Those are useful practical questions rather than generic reassurance. The brief scenario format cannot establish that she covers all seven discovery goals or sustains good pacing over a long conversation. The permission-limited introduction was compliant but generic; this fixture intentionally provides too little authorized personality to establish a high bar for spark.

## How to use the suite

Run `npm run eval` after behavioral prompt edits, review all ten cases, and record findings separately from transport success. Compare earlier role versions through `--astrid-version` and `--matchy-version`. Use fresh sessions for live testing, and do not treat these known cases as unseen evidence.

The five offline runtime tests also pass. They verify runtime mechanics, not conversational quality. No new scenarios or prompt changes were added in response to this run. The user's live session remains paused.
