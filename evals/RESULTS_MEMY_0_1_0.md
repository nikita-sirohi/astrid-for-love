# Astrid v0.8.0 and Memy integration validation

Role regression run: regression-1788898897060, gpt-6-astra, Astrid v0.8.0/examples v0.3.0 and Matchy v0.4.0. All 21 requests completed across ten known cases. Manual review found the existing rubrics satisfied: hobby correction, ambition reciprocity, sleeping boundary, surveillance challenge, quiet-user respect, restricted introduction, financial clarification, dietary compatibility, current-revision conflict and attraction decline. The quiet-user case retains a slightly defensive “I wasn’t asking…” line. These are known regressions, not unseen evidence.

This suite exercises isolated role prompts, not Memy. Separate live integration run `.local/demo-smoke/1788898845152/state.json` passed: Memy committed a confirmed family expectation before Astrid replied; Matchy proposed Maya/Eli and withheld Maya/Theo; double opt-in opened a chat and private check-in completed. Memy took 3655 ms and Astrid 3931 ms in that one turn. Prepared fictional input, no general latency or quality claim.

All 34 offline tests passed, including commit-before-reply, failure handling, concurrent corrections, scoped worker context and extraction authority. The personal Memy chat command supports unseeded, matching-disabled sessions for subsequent live tests. Fresh extended conversation remains necessary to assess pacing and voice. No personal user transcript is published.

Prompt assembly hashes:
- astrid: `5302c342d7c5994bc08ebfe0b74f5b01e817e3b273510f909814f9c187d9ec56`
- matchy: `2b7d23c271ac1b48b21e86e2c9b50c552966be8e179d50d4f462053b4419bdf6`
