# Spikes

A spike tests one design assumption on the real platform before we build on it. The code is
throwaway and lives in [`spikes/`](../../spikes/README.md); the **note** here stays. Each note
gives a clear go / no-go per question, the numbers behind it and what changes if the answer is
no.

| Note | Question | Status |
| --- | --- | --- |
| [0005-free-plan](0005-free-plan.md) | Does the chosen design fit Cloudflare's free plan? | 4 of 6 go; password hash and AES need run 2 |
