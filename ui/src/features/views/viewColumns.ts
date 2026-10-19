// Copyright (C) 2026 Yota Hamada
// SPDX-License-Identifier: GPL-3.0-or-later

import { ViewColumn } from '@/api/v1/schema';

// natty-fx patch: this instance drives git-land approvals, where a run is
// created by `git land-approve submit` and waits for the operator, so the
// waiting column is the one a run STARTS in and belongs leftmost.
export const DEFAULT_VIEW_COLUMNS: readonly ViewColumn[] = [
  ViewColumn.review,
  ViewColumn.queued,
  ViewColumn.running,
  ViewColumn.done,
  ViewColumn.failed,
];

// natty-fx patch: review/done renamed to the vocabulary of the one workflow
// this fork serves — a run is submitted for approval, and succeeds by landing.
export const VIEW_COLUMN_LABELS: Record<ViewColumn, string> = {
  [ViewColumn.queued]: 'Queued',
  [ViewColumn.running]: 'Running',
  [ViewColumn.review]: 'Submitted',
  [ViewColumn.done]: 'Landed',
  [ViewColumn.failed]: 'Failed',
};

export interface ViewColumnSetting {
  column: ViewColumn;
  visible: boolean;
}

export function normalizeViewColumns(
  columns?: readonly ViewColumn[]
): ViewColumn[] {
  if (!columns?.length) {
    return [...DEFAULT_VIEW_COLUMNS];
  }

  const supported = new Set(DEFAULT_VIEW_COLUMNS);
  const normalized = columns.filter(
    (column, index) =>
      supported.has(column) && columns.indexOf(column) === index
  );
  return normalized.length > 0 ? normalized : [...DEFAULT_VIEW_COLUMNS];
}

export function createViewColumnSettings(
  visibleColumns?: readonly ViewColumn[]
): ViewColumnSetting[] {
  const visible = normalizeViewColumns(visibleColumns);
  return [
    ...visible.map((column) => ({ column, visible: true })),
    ...DEFAULT_VIEW_COLUMNS.filter((column) => !visible.includes(column)).map(
      (column) => ({ column, visible: false })
    ),
  ];
}

export function setViewColumnVisibility(
  settings: ViewColumnSetting[],
  column: ViewColumn,
  visible: boolean
): ViewColumnSetting[] {
  const setting = settings.find((item) => item.column === column);
  if (!setting || setting.visible === visible) {
    return settings;
  }

  const remaining = settings.filter((item) => item.column !== column);
  if (!visible) {
    const visibleCount = settings.filter((item) => item.visible).length;
    return visibleCount === 1
      ? settings
      : [...remaining, { column, visible: false }];
  }

  const firstHiddenIndex = remaining.findIndex((item) => !item.visible);
  const insertionIndex =
    firstHiddenIndex === -1 ? remaining.length : firstHiddenIndex;
  return [
    ...remaining.slice(0, insertionIndex),
    { column, visible: true },
    ...remaining.slice(insertionIndex),
  ];
}

export function moveVisibleViewColumn(
  settings: ViewColumnSetting[],
  column: ViewColumn,
  direction: -1 | 1
): ViewColumnSetting[] {
  const index = settings.findIndex((item) => item.column === column);
  if (index === -1 || !settings[index]!.visible) {
    return settings;
  }

  const target = index + direction;
  if (target < 0 || target >= settings.length || !settings[target]!.visible) {
    return settings;
  }

  const next = [...settings];
  [next[index], next[target]] = [next[target]!, next[index]!];
  return next;
}
