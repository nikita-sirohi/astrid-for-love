# Prompt evaluation

The original smoke run intentionally exercised connectivity, streaming, history, and a review. Its dumpling/caregiving conversation and family-living mismatch overlap with authored prompt examples. It is not evidence of generalization.

## Ten-scenario regression suite

Run this suite after behavioral prompt changes, alongside live conversation testing. It now defaults to the selected role versions and records their exact content hashes. A completed run still needs manual assessment against the existing per-case rubrics; transport success is not a behavioral pass.

```sh
npm run eval
npm run eval -- --astrid-version 0.4.0 --matchy-version 0.3.0
```

The historical `npm run eval:unseen` command remains an explicit v0.2.0 baseline run. Its name describes the suite's origin; reruns are known-scenario regression checks. Preserve the fixtures and rubrics across comparisons, record failures, and do not tune prompts mid-run. This ten-case suite does not establish long-conversation pacing; live testing remains necessary.

## Live-conversation developmental regressions

[live-regressions.json](live-regressions.json) contains two short fictional adaptations of issues discovered during live prompt development. No participant transcript is copied into these fixtures. They check priority tradeoffs without Astrid imposing her own relationship values, and ex-friendship boundaries without assuming that an offer to meet resolves every disagreement. Each case has three messages, for six API requests.

```sh
npm run eval -- --suite live-regressions
# Equivalent explicit path:
npm run eval -- --suite evals/live-regressions.json
```

These are **known developmental regressions**, not unseen tests. Their rubrics specify observable behaviors and failures, not a prescribed response. Review intermediate turns as well as the final answer, including whether a scripted follow-up still makes sense after the actual preceding reply. They do not replace live testing of pacing or personality. Desk and food banter remain live-testing observations rather than artificially scripted pacing checks.

The default suite remains `unseen-v1` (also selectable as `original`). Suite files must be JSON within `evals/`; the runner validates case IDs, roles, messages, and rubrics before reading credentials or sending requests. Request counts are calculated from the selected suite. Both suites default to currently selected prompt versions and keep rubrics out of model input. The new cases have offline runner coverage only until an explicit live evaluation is performed.

## Original unseen scenarios v1

[unseen-v1.json](unseen-v1.json) contains ten fictional scenarios, authored after role prompts v0.2.0 and Astrid's companion examples v0.1.0 were frozen. The role prompts and companion are unchanged during this evaluation. None of the new messages is present verbatim in the assembled role prompt. They use new situations to exercise already-stated behavioral rules; this is scenario generalization, not a test of learning wholly new concepts.

Six Astrid conversations cover a radio-repair hobby, relocation and unequal career expectations, separate bedrooms, surveillance demands, a quiet but concrete participant, and permission around a karaoke anecdote. Four Matchy reviews cover financial autonomy, a practical dietary fit, the same dietary pairing with one decisive revised requirement, and a prior attraction decline after an appealing profile update.

The paired dietary cases are a counterfactual check: most evidence remains fixed while a current confirmed kitchen requirement changes. Matchy's decision should change for that reason. Both cases begin with fresh sessions.

```sh
npm run eval:unseen
```

This makes 21 real API requests, using the same prompt assembly, model, reasoning effort, and output limits as the prompt lab. Each case gets a fresh session; turns within a case preserve conversation history. The runner sends only `messages` to the tested role. Case IDs, descriptions, and `rubric` entries are evaluator metadata and are never passed to the model. Results and complete session metadata are saved under ignored `.local/evals/`.

## Review method and limits

The first run is assessed in [RESULTS_UNSEEN_V1.md](RESULTS_UNSEEN_V1.md), including a concrete matching error and limitations.

The v0.5.0/v0.3.0 run is assessed in [RESULTS_REGRESSION_2026-09-08.md](RESULTS_REGRESSION_2026-09-08.md): all 21 requests completed, nine clean passes and one mixed result on manual review.

The latest run is assessed in [RESULTS_REGRESSION_0_6_0.md](RESULTS_REGRESSION_0_6_0.md): Astrid v0.6.0 and Matchy v0.4.0, all 21 requests completed and all ten existing scoped rubrics met in this sample, with coverage limitations recorded.

Write scenario-specific rubrics before the run. Review all outputs against them, including intermediate turns. Use pass, mixed, or fail with short response excerpts and a concrete explanation. A partial success with a material violation is mixed or fail, not a clean pass. Record transport errors separately. Do not grade by matching a prescribed sentence.

This first run is manually assessed by the same assistant that authored the suite, not an independent blinded reviewer or automated judge. One sample per case offers limited evidence about consistency. Fixed follow-up messages may not answer the agent's preceding question; inspect the transcript for that limitation. Authored fixtures and hypothetical context also do not test real permission enforcement, memory updates, work-item routing, or chat membership because the lab has no application tools.

Report what the model actually does without rewriting weak responses or silently rerunning cases until they pass. Do not change the role prompts in the same run. Once findings influence a prompt revision, this suite becomes a regression set; author a fresh unseen set to evaluate that revision's generalization.

Live transcripts remain local by default. A reviewed report may quote limited fictional excerpts without publishing raw provider output, hidden/encrypted reasoning, credentials, or real participant data.
