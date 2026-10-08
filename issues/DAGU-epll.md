---
id: DAGU-epll
title: "Dagu UI cannot have more than one browser window open"
status: open
priority: 2
type: bug
created_at: 2026-10-06T00:49:06Z
created_by: lll
updated_at: 2026-10-08T17:46:05Z
content_hash: "sha256:da2e89d61d971d94ecc74bd879cd72f5d17ff70f50c221ea9843c7647a66bf34"
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

### 2026-10-08T17:46:05Z lll
Findings, 2026-10-05 (reproduced) and 2026-10-08 (cause from source). The
hypothesis in the description holds; details and evidence below.

## Reproduction (acceptance item 1)

- Browser: Chrome. Windows: six tabs on 127.0.0.1:8477 (dashboard x2,
  /dag-runs, three git-land run pages left open after approvals).
- Symptom: number 1 in the description. A seventh page (an approval link)
  spun and never finished loading; the whole UI read as "slow".
- `lsof -iTCP:8477 -sTCP:ESTABLISHED` showed exactly 6 Chrome connections
  to 127.0.0.1:8477, Chrome's HTTP/1.1 per-host limit.
- The server was not slow: the run page, /api/v1/dag-runs and the 1.5 MB
  bundle (441 KB gzip) each answered in 2-31 ms over curl at the same time.
- The service log (~/Library/Logs/git-land-approve.log, 10:37:21) shows
  "error listing dag-runs: context canceled": a queued page load abandoned.
- Closing the six tabs dropped Chrome to 1 connection and the approval page
  loaded at once.

## Cause (acceptance item 2)

- Each tab opens ONE multiplexed EventSource, GET /api/v1/events/stream
  (ui/src/hooks/SSEManager.ts:467; all topics share it). Opened with curl
  it returns 200 and stays open until the client leaves.
- Hidden/background tabs keep it open: dagu's UI has no visibilitychange or
  document.hidden handling (checked ui/src at v2.18.2 and upstream/main
  659d4cb66, 2026-10-08).
- The 7th tab's stream and fetches queue behind the 6 held connections
  instead of erroring, so SSEManager's polling fallback
  (FALLBACK_AFTER_RETRIES) never triggers.
- Not a regression from the v2.18.2 rebase: the v2.13.0-nfx1 binary embeds
  the same EventSource and events/stream code. Not the natty-fx patch
  (viewColumns.ts only).
- Server side is not the limit: sse/multiplex.go caps sessions at 1000.

## Fix (proposed for acceptance item 3)

Two independent parts:

1. Deployment, natty-fx: serve the UI over TLS so Chrome multiplexes all
   tabs over one HTTP/2 connection. dagu already supports it (config
   tls.cert_file / tls.key_file); needs a locally trusted cert (mkcert)
   and https in bin/git-land-approve (serve at :536, printed URLs at :466
   and :507, health check at :435) and its LaunchAgent.
2. UI, this fork: in SSEManager, close the stream while the page is hidden
   and reconnect with lastEventId on visible (resume is already supported).
   Carry it on the natty-fx branch with a NATTY-FX-PATCH.md note.

Upstream (dagucloud/dagu): no existing issue (searched EventSource, SSE
tabs, connection limit, multiple tabs, visibility). Part 2 is a candidate
contribution; CONTRIBUTING.md asks for an issue before the PR. Not filed.
