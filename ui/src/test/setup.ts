// Copyright (C) 2026 Yota Hamada
// SPDX-License-Identifier: GPL-3.0-or-later

/// <reference types="vitest/jsdom" />

import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
});

class ResizeObserverMock {
  observe(target: Element, options?: ResizeObserverOptions): void {
    void target;
    void options;
  }
  unobserve(target: Element): void {
    void target;
  }
  disconnect(): void {}
}

Object.defineProperty(globalThis, 'ResizeObserver', {
  configurable: true,
  value: ResizeObserverMock,
});

// jsdom doesn't implement scrollIntoView
Element.prototype.scrollIntoView = () => {};

// jsdom doesn't implement the Pointer Capture API, which Radix's Select uses
// to track a press that starts on the trigger.
Element.prototype.hasPointerCapture = () => false;
Element.prototype.setPointerCapture = () => {};
Element.prototype.releasePointerCapture = () => {};

// Node 25+ has its own localStorage and sessionStorage globals, which are
// undefined unless Node runs with --localstorage-file. Vitest's jsdom
// environment leaves a global alone when Node already defines it, so point
// both at jsdom's Storage.
for (const key of ['localStorage', 'sessionStorage'] as const) {
  Object.defineProperty(globalThis, key, {
    configurable: true,
    writable: true,
    value: jsdom.window[key],
  });
}
