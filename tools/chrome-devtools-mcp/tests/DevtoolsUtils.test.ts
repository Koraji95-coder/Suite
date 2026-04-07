/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {afterEach, describe, it} from 'node:test';

import sinon from 'sinon';

import {SymbolizedError, UniverseManager} from '../src/DevtoolsUtils.js';
import {DevTools} from '../src/third_party/index.js';
import type {Browser, Protocol, Target} from '../src/third_party/index.js';

import {
  getMockBrowser,
  getMockPage,
  mockListener,
  withBrowser,
} from './utils.js';

describe('UniverseManager', () => {
  afterEach(() => {
    sinon.restore();
  });

  it('calls the factory for existing pages', async () => {
    const browser = getMockBrowser();
    const factory = sinon.stub().resolves({});
    const manager = new UniverseManager(browser, factory);
    await manager.init(await browser.pages());

    const page = (await browser.pages())[0];
    sinon.assert.calledOnceWithExactly(factory, page);
  });

  it('calls the factory only once for the same page', async () => {
    const browser = {
      ...mockListener(),
    } as unknown as Browser;
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    const factory = sinon.stub().returns(new Promise(() => {})); // Don't resolve.
    const manager = new UniverseManager(browser, factory);
    await manager.init([]);

    sinon.assert.notCalled(factory);

    const page = getMockPage();
    browser.emit('targetcreated', {
      page: () => Promise.resolve(page),
    } as Target);
    browser.emit('targetcreated', {
      page: () => Promise.resolve(page),
    } as Target);

    await new Promise(r => setTimeout(r, 0)); // One event loop tick for the micro task queue to run.

    sinon.assert.calledOnceWithExactly(factory, page);
  });

  it('works with a real browser', async () => {
    await withBrowser(async (browser, page) => {
      const manager = new UniverseManager(browser);
      await manager.init([page]);

      assert.notStrictEqual(manager.get(page), null);
    });
  });

  it('ignores pauses', async () => {
    await withBrowser(async (browser, page) => {
      const manager = new UniverseManager(browser);
      await manager.init([page]);
      const targetUniverse = manager.get(page);
      assert.ok(targetUniverse);
      const model = targetUniverse.target.model(DevTools.DebuggerModel);
      assert.ok(model);

      const pausedSpy = sinon.stub();
      model.addEventListener('DebuggerPaused' as any, pausedSpy); // eslint-disable-line

      const result = await page.evaluate('debugger; 1 + 1');
      assert.strictEqual(result, 2);

      sinon.assert.notCalled(pausedSpy);
    });
  });
});

describe('SymbolizedError', () => {
  it('createForTesting returns an instance with message only', () => {
    const error = SymbolizedError.createForTesting('Test error message');
    assert.strictEqual(error.message, 'Test error message');
    assert.strictEqual(error.stackTrace, undefined);
    assert.strictEqual(error.cause, undefined);
  });

  it('createForTesting returns an instance with stackTrace', () => {
    const stackTrace = {
      syncFragment: {frames: [{line: 1, column: 0, url: 'test.js', name: 'fn'}]},
      asyncFragments: [],
    } as unknown as DevTools.StackTrace.StackTrace.StackTrace;
    const error = SymbolizedError.createForTesting('Error with stack', stackTrace);
    assert.strictEqual(error.message, 'Error with stack');
    assert.strictEqual(error.stackTrace, stackTrace);
    assert.strictEqual(error.cause, undefined);
  });

  it('createForTesting returns an instance with cause chain', () => {
    const cause = SymbolizedError.createForTesting('Root cause');
    const error = SymbolizedError.createForTesting('Outer error', undefined, cause);
    assert.strictEqual(error.message, 'Outer error');
    assert.strictEqual(error.cause, cause);
    assert.strictEqual(error.cause?.message, 'Root cause');
  });

  it('fromDetails extracts plain text message when no exception object', async () => {
    const details: Protocol.Runtime.ExceptionDetails = {
      exceptionId: 1,
      text: 'SyntaxError: Unexpected token',
      lineNumber: 5,
      columnNumber: 3,
    };
    const error = await SymbolizedError.fromDetails({
      details,
      targetId: 'target-1',
    });
    assert.strictEqual(error.message, 'SyntaxError: Unexpected token');
    assert.strictEqual(error.stackTrace, undefined);
    assert.strictEqual(error.cause, undefined);
  });

  it('fromDetails prefixes "Uncaught" when text is "Uncaught" and exception is present', async () => {
    const details: Protocol.Runtime.ExceptionDetails = {
      exceptionId: 2,
      text: 'Uncaught',
      lineNumber: 0,
      columnNumber: 0,
      exception: {
        type: 'object',
        subtype: 'error',
        description: 'TypeError: Cannot read properties of undefined\n    at foo (foo.js:1:1)',
      },
    };
    const error = await SymbolizedError.fromDetails({
      details,
      targetId: 'target-1',
    });
    assert.strictEqual(error.message, 'Uncaught TypeError: Cannot read properties of undefined');
  });

  it('fromDetails does not resolve stack/cause when includeStackAndCause is false', async () => {
    const details: Protocol.Runtime.ExceptionDetails = {
      exceptionId: 3,
      text: 'RangeError: Stack overflow',
      lineNumber: 0,
      columnNumber: 0,
    };
    const error = await SymbolizedError.fromDetails({
      details,
      targetId: 'target-1',
      includeStackAndCause: false,
    });
    assert.strictEqual(error.message, 'RangeError: Stack overflow');
    assert.strictEqual(error.stackTrace, undefined);
    assert.strictEqual(error.cause, undefined);
  });

  it('fromDetails passes resolvedStackTraceForTesting through the fast path when no devTools', async () => {
    const stackTrace = {
      syncFragment: {frames: [{line: 10, column: 2, url: 'app.js', name: 'run'}]},
      asyncFragments: [],
    } as unknown as DevTools.StackTrace.StackTrace.StackTrace;
    const details: Protocol.Runtime.ExceptionDetails = {
      exceptionId: 4,
      text: 'Error: test',
      lineNumber: 0,
      columnNumber: 0,
    };
    const error = await SymbolizedError.fromDetails({
      details,
      targetId: 'target-1',
      includeStackAndCause: true,
      resolvedStackTraceForTesting: stackTrace,
    });
    // When devTools is not provided, the fast path runs and passes resolvedStackTraceForTesting through.
    assert.strictEqual(error.message, 'Error: test');
    assert.strictEqual(error.stackTrace, stackTrace);
  });

  it('fromDetails uses resolvedStackTraceForTesting when devTools is provided', async () => {
    const stackTrace = {
      syncFragment: {frames: [{line: 10, column: 2, url: 'app.js', name: 'run'}]},
      asyncFragments: [],
    } as unknown as DevTools.StackTrace.StackTrace.StackTrace;
    const details: Protocol.Runtime.ExceptionDetails = {
      exceptionId: 5,
      text: 'Error: with devtools',
      lineNumber: 0,
      columnNumber: 0,
    };
    await withBrowser(async (browser, page) => {
      const manager = new UniverseManager(browser);
      await manager.init([page]);
      const devTools = manager.get(page);
      assert.ok(devTools);

      const error = await SymbolizedError.fromDetails({
        details,
        devTools,
        targetId: 'target-1',
        includeStackAndCause: true,
        resolvedStackTraceForTesting: stackTrace,
      });
      assert.strictEqual(error.message, 'Error: with devtools');
      assert.strictEqual(error.stackTrace, stackTrace);
    });
  });

  it('fromDetails uses resolvedCauseForTesting when devTools is provided', async () => {
    const cause = SymbolizedError.createForTesting('Root cause');
    const details: Protocol.Runtime.ExceptionDetails = {
      exceptionId: 6,
      text: 'AppError: outer',
      lineNumber: 0,
      columnNumber: 0,
    };
    await withBrowser(async (browser, page) => {
      const manager = new UniverseManager(browser);
      await manager.init([page]);
      const devTools = manager.get(page);
      assert.ok(devTools);

      const error = await SymbolizedError.fromDetails({
        details,
        devTools,
        targetId: 'target-1',
        includeStackAndCause: true,
        resolvedCauseForTesting: cause,
      });
      assert.strictEqual(error.message, 'AppError: outer');
      assert.strictEqual(error.cause, cause);
    });
  });

  it('fromError returns error with message from description when no devTools', async () => {
    const remoteObject: Protocol.Runtime.RemoteObject = {
      type: 'object',
      subtype: 'error',
      description: 'ReferenceError: x is not defined\n    at eval (eval:1:1)',
    };
    const error = await SymbolizedError.fromError({
      error: remoteObject,
      targetId: 'target-1',
    });
    assert.strictEqual(error.message, 'ReferenceError: x is not defined');
    assert.strictEqual(error.stackTrace, undefined);
  });

  it('fromError returns empty message for non-error remote object without devTools', async () => {
    const remoteObject: Protocol.Runtime.RemoteObject = {
      type: 'string',
      value: 'some string',
    };
    const error = await SymbolizedError.fromError({
      error: remoteObject,
      targetId: 'target-1',
    });
    // Non-error type: description is undefined so message is empty string.
    assert.strictEqual(error.message, '');
  });

  it('fromError with a real browser resolves error message from a thrown exception', async () => {
    await withBrowser(async (browser, page) => {
      const manager = new UniverseManager(browser);
      await manager.init([page]);
      const devTools = manager.get(page);
      assert.ok(devTools);

      // Evaluate an expression that throws; capture the remote object via Runtime.evaluate.
      const session = await page.createCDPSession();
      const result = await session.send('Runtime.evaluate', {
        expression: 'new TypeError("integration test error")',
        generatePreview: false,
      }) as {result: Protocol.Runtime.RemoteObject};

      const remoteObject = result.result;
      assert.strictEqual(remoteObject.type, 'object');

      const error = await SymbolizedError.fromError({
        error: remoteObject,
        devTools,
        targetId: 'target-1',
      });
      assert.ok(
        error.message.includes('TypeError') || error.message.includes('integration test error'),
        `Unexpected message: ${error.message}`,
      );
    });
  });
});
