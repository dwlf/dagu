---
id: DAGU-epll
title: "Dagu UI cannot have more than one browser window open"
status: open
priority: 2
type: bug
created_at: 2026-10-06T00:49:06Z
created_by: lll
updated_at: 2026-10-06T00:49:06Z
content_hash: "sha256:667c84ecf5afe40b49bfa58ee4afec22693401a15e1237f7b0dad71fbef907f3"
---

## Description
## Description

Reported by the operator, 2026-10-05: the Dagu UI behind `git land-approve`
(dagu-nfx, http://127.0.0.1:8477) cannot have more than one browser window
open at once.

Symptom not yet pinned down. Record which of these happens before scoping:

1. the second window spins or never finishes loading
2. it loads, but runs and the approve control stop updating
3. it logs out, or one window breaks the other

Hypothesis, untested: browsers allow about 6 concurrent HTTP/1.1 connections
per host. The Dagu UI holds long-lived streaming connections for live updates
(believed to be server-sent events — not verified in the source), so each tab
on 127.0.0.1:8477 consumes some of that budget and a new tab queues behind
them. If so, symptom 1 or 2, closing one tab un-sticks the others
immediately, and the behaviour is upstream Dagu's, not the natty-fx patch's
(the patch touches only ui/src/features/views/viewColumns.ts).

## Acceptance (draft — finalize after reproduction)

- [ ] The symptom is reproduced and recorded with the browser, the number of windows, and what the second window shows
- [ ] The cause is identified from the UI source or the network panel (connection count per tab), not inferred
- [ ] Either a fix is carried on the natty-fx branch with a note in NATTY-FX-PATCH.md, or the issue is reported upstream (dagucloud/dagu) and linked here

## Acceptance Criteria


## Design


## Notes


## History


## Links


## Comments
