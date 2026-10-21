# natty-fx patch

This fork exists to carry two small patches against upstream dagu, for the
single instance that serves `git land-approve` in `~/p/natty-fx`: the Cockpit
column order and labels, and closing the live-update stream in hidden tabs.
Everything else tracks upstream unchanged.

Upstream base: **v2.19.0**, exact commit
`2493ea5c5b6dc036a09ba38de704ec9a47589527`. Upgrade candidate branch:
**`feat/dagu-v2.19.0-nfx`**. Both patches remain necessary: upstream has neither
these Cockpit labels/order nor visibility handling in `SSEManager`.

Patched builds identify themselves with **v2.19.0-nfx1**. Pass
`BUILD_VERSION=v2.19.0-nfx1` to `make bin`; its existing linker setting embeds
that value. This candidate does not rewrite existing tags or the shared
`natty-fx` branch. The default Makefile value still comes from `git describe`.

## Patch 1: Cockpit column order and labels

One file, `ui/src/features/views/viewColumns.ts`:

- `DEFAULT_VIEW_COLUMNS` puts `review` leftmost, ahead of `queued`.
- `VIEW_COLUMN_LABELS` renames `review` to **Submitted** and `done` to
  **Landed**.

Both are for the same reason. This instance runs one workflow: `git
land-approve submit` creates a run that immediately waits for the operator,
so the waiting column is where a run *starts*, and a successful run has
*landed*. Upstream's generic ordering (queued first) and vocabulary (Review,
Done) describe a scheduler, not this workflow.

`ui/src/features/cockpit/components/__tests__/KanbanBoard.test.tsx` asserts
both the labels and their left-to-right order, so a rebase that silently
drops the reorder fails the test rather than shipping.

## Patch 2: close the live-update stream in hidden tabs

One file, `ui/src/hooks/SSEManager.ts` (hidden-tab stream fix). Each Dagu
tab holds one EventSource (`/api/v1/events/stream`) for as long as it is
open, background tabs included. This instance is plain HTTP/1.1, where
Chrome allows six connections per host, so six open tabs left the next one
unable to load at all: its requests queued behind the held streams, never
errored, and the polling fallback never started. `git land-approve` makes
that easy to reach, because every submit hands the operator a new run page.

The patch listens for `visibilitychange`. A hidden tab closes its streams
and cancels pending reconnects, keeping its subscriptions; a shown tab
reconnects at once and gets a fresh snapshot of every topic. SWR does not
poll hidden tabs, so a hidden tab makes no requests at all.

The reconnect deliberately drops `lastEventId`. The server does not replay
missed events: on a reconnect it sends a snapshot only for topics that
changed after `lastEventId`. A hidden tab is often a topic's only
subscriber, so the server retires the topic, and the recreated topic
reports no change since any id, so a resumed stream got no snapshot and the
page stayed stale until the topic next changed. Measured on v2.18.2:
`lastEventId=25` after retirement gave no message in 4s; a fresh connection
got its snapshot at once. That server behaviour also affects ordinary
reconnects after a network drop and is an upstream bug of its own.

It is an upstream candidate rather than a natty-fx preference: nothing in
it is specific to this workflow. Drop it at the rebase that brings an
upstream equivalent. `ui/src/hooks/__tests__/SSEManager.test.ts` ("page
visibility") fails if the behaviour goes missing.

## Why patch 1 is a patch and not configuration

Checked against v2.13.0 before forking, and re-checked against v2.19.0:

- `ViewSpec.columns` (the saved-view API) *does* control column order, and a
  saved view is enough if you only want the reorder — see the `Land` view on
  the live instance. It does not carry labels, and it only applies on
  `/views/<id>`, never on `/cockpit`.
- `UIDef` (`internal/cmn/config/definition.go`) exposes only
  `log_encoding_charset`, `navbar_color`, `navbar_title`,
  `max_dashboard_page_limit` and `dags.sort_*`. No column labels.
- There is no custom CSS or JS injection hook, so the strings are compiled
  into the embedded bundle.
- v2.16 added an i18n layer (`ui/src/i18n/`, upstream `8615e3223`), but it is
  not a way in. `translateStatic` returns the English source string unchanged
  for `en` and looks other locales up in a built-in table keyed by that
  string; there is no runtime or config override. The column headers are still
  the `VIEW_COLUMN_LABELS` literals, so the patch still works. Under `ja` or
  `zh`, `Submitted` and `Landed` have no table entry and render in English.

## What patch 1 deliberately does NOT change

The rename covers the Cockpit board's column headers and nothing else. Every
other dagu view still reads upstream's generic vocabulary, and that is the
decided scope rather than an unfinished pass (the existing fork scope).

The easiest thing to be wrong about here: `git land-approve submit` prints a
**run-detail** URL — `/dag-runs/git-land/<run-id>`, see
the `url=` line in `bin/git-land-approve` — not a Cockpit link. So the page an operator
actually opens in order to approve a land is not the page this patch
relabels. There, a waiting run reads `Waiting for manual action` and a landed
one reads `succeeded`.

Relabelling *that* page is a categorically larger patch, because its words
are not TSX literals:

- The headline status word is the API's `statusLabel` enum value —
  `"succeeded"`, `"waiting"`, `"queued"` — defined in `api/v1/api.gen.go`,
  which is **generated** from the OpenAPI spec. Renaming it means forking
  generated Go plus the TS schema derived from it, so every upstream API
  change becomes a rebase conflict, against the single `viewColumns.ts`
  conflict this patch costs today.
- `ui/src/lib/status-utils.ts` carries colors and icons only. There is no
  central label function to intercept, so there is no cheap single-file
  interception point either.
- The remaining per-component literals are scattered across
  `ui/src/pages/event-logs/index.tsx:93,109`,
  `ui/src/features/queues/components/QueueCard.tsx:59,61`,
  `ui/src/features/dags/components/visualization/TimelineChart.tsx:54-92`
  and
  `ui/src/features/dags/components/dag-details/DAGStatusOverview.tsx:66-95`.
  Renaming all of them would still leave the headline reading `succeeded` —
  so that extension does not buy the thing it looks like it buys, which is
  why it was not taken.

The i18n layer added in v2.16 does not change this: the `statusLabel` word is
an API enum value, not a static UI string, and nothing in the translation
table can be overridden at runtime.

## Rebuilding after an upstream bump

Prepare each upgrade on an isolated non-main branch based on the exact release.
Carry the two behavior files, their regression tests and this guide; inspect
upstream first and remove a patch only when its equivalent exists there.
Never rewrite shared branches or existing tags.

The v2.19.0 release declares **Go 1.27.0** in `go.mod` and
**pnpm 10.13.1** (including its integrity pin) in `ui/package.json`.
Use those versions so the lockfile and Go dependencies keep their declared
build environment. The following commands prepare this candidate's embedded
UI and distinctly marked binary:

```sh
(cd ui && npx --yes pnpm@10.13.1 install --frozen-lockfile --ignore-scripts)
(cd ui && npx --yes pnpm@10.13.1 build)
make cp-assets
GOTOOLCHAIN=go1.27.0 make bin BUILD_VERSION=v2.19.0-nfx1
```

Run the focused regressions against unpatched release behavior first, then
against both carried patches. The saved-view editor tests also assert the
Submitted-first default order when creating or restoring columns. Keep the failing and passing output with the
candidate's build and isolated-browser evidence under `.local/artifacts/`.
Use a separate runtime directory and unused loopback port. Verify Cockpit
labels/order and that hiding a tab closes its stream; after another client
changes its subscribed data, showing it must immediately receive the current
snapshot without `lastEventId`. Candidate preparation does not install the
binary, restart services or alter live runtime data.

Earlier arm64 Mac measurements: dependency installation ~35s, UI and binary
builds ~90s; a cold full build ~4 min. Candidate timing varies with cache state.

Verify before pointing the service at it — the built binary should carry the
patched strings and the new marker, and the Cockpit page at
`http://127.0.0.1:32919/cockpit` should read its columns left to right as
`SUBMITTED | QUEUED | RUNNING | LANDED | FAILED`:

```sh
(cd ui && NODE_OPTIONS=--no-experimental-webstorage pnpm vitest run \
  src/features/cockpit/components/__tests__/KanbanBoard.test.tsx \
  src/hooks/__tests__/SSEManager.test.ts)
.local/bin/dagu version
grep -ao 'review\]:"[A-Za-z]*"' .local/bin/dagu | head -1
grep -ao 'done\]:"[A-Za-z]*"' .local/bin/dagu | head -1
grep -ac 'handleVisibilityChange' .local/bin/dagu
```

`NODE_OPTIONS=--no-experimental-webstorage` is needed on Node 25 and later,
whose built-in `localStorage` is undefined without `--localstorage-file` and
shadows jsdom's, so every test touching storage fails with "Cannot read
properties of undefined (reading 'getItem')". Measured on Node 26.10.0 only;
drop the variable on a Node too old to know the flag. The last grep counts
patch 2 in the embedded bundle
(minifiers keep method names); it must be at least 1.

Then install and restart the service, which is what actually puts the new
build in front of the operator:

```sh
cp .local/bin/dagu ~/.local/bin/dagu-nfx.new
mv ~/.local/bin/dagu-nfx.new ~/.local/bin/dagu-nfx
launchctl kickstart -k gui/$(id -u)/us.dwlf.git-land-approve
```

Write-then-rename rather than `cp` straight onto the target: the service
holds that path open, and a rename swaps it without writing through the
running process's binary. The `kickstart` is not optional — without it the
old process keeps serving from the file it already opened, so every check
above passes while the board is unchanged.

`~/.local/bin` is outside the agent sandbox's write allowlist, so the install
needs the sandbox disabled. So does the Go build, which writes to
`~/Library/Caches/go-build` and `~/go/pkg/mod`.

Both greps read from the binary rather than the source tree, so they are the
check to trust when the UI is not open — a source tree can be patched while
`~/.local/bin/dagu-nfx` is still a pre-patch build. Run them against
`~/.local/bin/dagu-nfx` after installing, too; the mtime is not evidence,
since a build from a dirty tree predates the commit that captured it.

## How natty-fx consumes it

`bin/git-land-approve` runs only this build: it defaults to
`~/.local/bin/dagu-nfx` and never consults `dagu` on PATH, so brew's dagu is
not a fallback (natty-fx decision 2026-10-04, recorded as an amendment to its
`design-research/0014`). The LaunchAgent and a shell `git land-approve submit`
therefore run the same binary with no environment to set. `DAGU_BIN` still
overrides the path. If the file is missing, `git land-approve` refuses and
points back here rather than running anything else — so the install step above
is what keeps the service working. PATH is still never shadowed: `dagu`
elsewhere on the machine means whatever it meant before.
