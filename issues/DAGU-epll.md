---
id: DAGU-epll
title: "Dagu UI cannot have more than one browser window open"
status: closed
priority: 2
type: bug
created_at: 2026-10-06T00:49:06Z
created_by: lll
updated_at: 2026-10-08T18:16:56Z
content_hash: "sha256:d02e49ca00a14245b8004c3c31d328bc53e3d358408c9bbdcb7235ae85c67166"
assignee: lll
closed_at: 2026-10-08T18:02:46Z
close_reason: "Fixed on natty-fx f5887abc1 (tag v2.18.2-nfx2, pushed), deployed as ~/.local/bin/dagu-nfx 2026-10-08 10:56. Background tabs now close their SSE stream. Browser-level check (several background tabs, lsof shows <6 Chrome connections) not yet run; reopen if it fails. Upstream issue drafted, not filed."
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
- 2026-10-08T17:48:33Z status: open -> in_progress
- 2026-10-08T17:48:33Z claimed by lll
- 2026-10-08T18:02:46Z status: in_progress -> closed

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

### 2026-10-08T17:48:33Z lll
Claimed
Worktree: /private/tmp/claude-501/-Users-lll-p/ed2912b8-5ecd-41dd-90b9-557328cfb3c3/scratchpad/dagu-sse
Branch: feat/sse-close-hidden
Base: 585a6f008d2af2795093465a0afdf3630b36eba2

### 2026-10-08T17:49:55Z lll
Claimed
Worktree: /Users/lll/p/upkeep/dagu/.claude/worktrees/sse-close-hidden
Branch: feat/sse-close-hidden
Base: 585a6f008d2af2795093465a0afdf3630b36eba2

### 2026-10-08T17:56:37Z lll
Patch 2 written, built and deployed, 2026-10-08.

- Branch feat/sse-close-hidden: c34a5c349 (SSEManager closes the stream
  while the page is hidden, resumes with lastEventId when shown; 3 tests)
  and f5887abc1 (NATTY-FX-PATCH.md documents patch 2 and the Node 25+ test
  flag). Tagged v2.18.2-nfx2 at f5887abc1.
- Tests: SSEManager + useSSE 19/19 and the documented KanbanBoard +
  SSEManager command 16/16; the 3 new tests fail against the unpatched
  SSEManager.ts. tsc, eslint and prettier clean on the changed files.
- Built with go1.27.0 (go.mod) and pnpm 10.13.1. Binary reports
  v2.18.2-nfx2; carries both patches (review/done labels, and
  handleVisibilityChange x1).
- Installed to ~/.local/bin/dagu-nfx 10:56 with the service restarted;
  previous build kept at ~/.local/bin/dagu-nfx.v2.18.2-nfx1. The served
  bundle is v2.18.2-nfx2 and contains the patch. The in-flight waiting run
  3bfed2b survived the restart.

Not yet done: natty-fx fast-forward and push of the branch and tag;
browser-level check that background tabs release their connections; the
upstream issue (drafted, not filed).

### 2026-10-08T18:16:56Z lll
Correction to patch 2, 2026-10-08 (v2.18.2-nfx3).

The first version resumed a shown tab's stream with lastEventId. That is
wrong: the server does not replay, it sends a snapshot only for topics that
changed after lastEventId, and a topic retired while the tab was hidden
(often the hidden tab was its only subscriber) is recreated with
lastChangeEventID 0, so no snapshot is sent and the page stays stale until
the topic next changes. Reproduced on the live server: lastEventId=25 after
retirement gave no message in 4s; a fresh connection got its snapshot at
once.

Fix: fix/sse-fresh-resume 587f6b911 clears lastEventId on suspend, so the
reopened stream gets fresh snapshots; the visibility test now asserts no
lastEventId on the reopened URL and fails without the line. 505a3e5d6
corrects NATTY-FX-PATCH.md. Tagged v2.18.2-nfx3, built, installed
11:16; served bundle carries the fix. Previous build kept at
~/.local/bin/dagu-nfx.v2.18.2-nfx2.

The server-side retire behaviour is an upstream bug of its own (any
reconnect after a topic retires); it is in the upstream issue draft.
