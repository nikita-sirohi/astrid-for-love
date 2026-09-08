# Astrid v0.7.0 regression review

Run: regression-1788898373471. Model: gpt-6-astra. Astrid v0.7.0 with unchanged examples v0.3.0; Matchy v0.4.0. Ten known cases, 21 completed requests, manual review against pre-existing rubrics. This is development regression evidence, not an unseen evaluation. Private raw output stays in ignored .local/evals/.

| Case | Manual assessment |
| --- | --- |
| astrid-radio | Pass: specific hobby curiosity, accepts correction. |
| astrid-promotion | Pass: probes relocation costs and reciprocity without a moral verdict. |
| astrid-sleep | Pass: separates affection from sleeping arrangements, accepts firm boundary. |
| astrid-checking | Pass: clarifies ambiguity, challenges compelled surveillance. |
| astrid-quiet | Pass with voice concern: accepts brevity and declined breakup topic; “I wasn’t asking…” sounds defensive. Groups age and gender basics in one question. |
| astrid-stage | Pass: excludes forbidden story, uses approved material only. |
| matchy-expenses | Pass: clarifies autonomy without equating willingness with a requirement or disclosing private terms. |
| matchy-food-propose | Pass: proposes based on reciprocal practical fit, retains consent. |
| matchy-food-conflict | Pass: uses current revision and withholds firm conflict. |
| matchy-decline | Pass: honors attraction decline without pressure. |

No case demonstrates a full return from completed basics to experiences and values. The intended pacing improvement still needs a fresh live conversation; the earlier hiking conversation informed this change and is not independent evidence. The application/runtime suite also passed all 28 tests. No new teaching examples were added.

Prompt assembly hashes:
- astrid: `183d021122d213c99ef422e012bd9e066023bcc5b02ab49908a94e45af9bf3de`
- matchy: `2b7d23c271ac1b48b21e86e2c9b50c552966be8e179d50d4f462053b4419bdf6`
