# natty-fx patch

This fork exists to carry one patch against upstream dagu, for the single
instance that serves `git land-approve` in `~/p/natty-fx`. Everything else
tracks upstream unchanged.

Upstream base: **v2.13.0**. Patch branch: **`natty-fx`**.

Patched builds identify themselves. The Makefile feeds `git describe --tags`
into `-X main.version`, so an annotated tag on this branch *is* the version
marker: a build from `v2.13.0-nfx1` reports `v2.13.0-nfx1`, where brew's
unpatched binary reports `2.13.0`. Re-tagging is a step in the bump procedure
below — skip it and the next build silently reports a bare upstream version
again, which is the one thing the marker exists to prevent. Nothing in the
Makefile is patched to achieve this; the tag is the whole mechanism, so it
adds no rebase surface.

## What the patch changes

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

## Why a patch and not configuration

Checked against v2.13.0 before forking:

- `ViewSpec.columns` (the saved-view API) *does* control column order, and a
  saved view is enough if you only want the reorder — see the `Land` view on
  the live instance. It does not carry labels, and it only applies on
  `/views/<id>`, never on `/cockpit`.
- `UIDef` (`internal/cmn/config/definition.go`) exposes only
  `log_encoding_charset`, `navbar_color`, `navbar_title`,
  `max_dashboard_page_limit` and `dags.sort_*`. No column labels.
- There is no custom CSS or JS injection hook, and no locale layer
  (`ui/src/locales` does not exist), so the strings are compiled into the
  embedded bundle.

## What the patch deliberately does NOT change

The rename covers the Cockpit board's column headers and nothing else. Every
other dagu view still reads upstream's generic vocabulary, and that is the
decided scope rather than an unfinished pass (natty-fx `1a4fda3`).

The easiest thing to be wrong about here: `git land-approve submit` prints a
**run-detail** URL — `/dag-runs/git-land/<run-id>`, see
`bin/git-land-approve:358` — not a Cockpit link. So the page an operator
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

Verified against v2.13.0: `ui/src/locales` does not exist, so none of this is
reachable through a locale layer.

## Rebuilding after an upstream bump

```sh
git fetch upstream --tags
git rebase v<new-tag> natty-fx     # expect a conflict only if upstream
                                   # touches viewColumns.ts
git tag -a v<new-tag>-nfx1 -m 'natty-fx patched build 1, on upstream v<new-tag>'
cd ui && pnpm install && cd ..
make ui && make bin
```

Tag **before** building: the version string is baked in at link time from
`git describe --tags`, so a build that precedes the tag carries the old
marker and has to be redone. Bump the `-nfxN` counter when re-patching the
same upstream tag; the existing tag then moves with `git tag -d` and a fresh
`git tag -a` at the new tip.

Measured on an arm64 Mac: `pnpm install` ~35s, `make ui && make bin` ~90s.
A full `make build` from cold, including the UI cache clean, ~4 min.

Verify before pointing the service at it — the built binary should carry the
patched strings and the new marker, and the Cockpit page at
`http://127.0.0.1:8477/cockpit` should read its columns left to right as
`SUBMITTED | QUEUED | RUNNING | LANDED | FAILED`:

```sh
cd ui && pnpm vitest run src/features/cockpit/components/__tests__/KanbanBoard.test.tsx
.local/bin/dagu version
grep -ao 'review\]:"[A-Za-z]*"' .local/bin/dagu | head -1
grep -ao 'done\]:"[A-Za-z]*"' .local/bin/dagu | head -1
```

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

`bin/git-land-approve` and `etc/launchagents/us.dwlf.git-land-approve.plist`
resolve the binary through `DAGU_BIN`, defaulting to `dagu` on PATH. Setting
`DAGU_BIN=$HOME/.local/bin/dagu-nfx` switches the service to this build;
unsetting it reverts to brew's, with no other change. Brew's `dagu` is never
shadowed.
