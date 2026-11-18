import assert from 'node:assert/strict';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

import { parseViewerMessage, serializeAppMessage } from './bridge.ts';

test('accepts each typed viewer message and rejects malformed or unknown messages', () => {
  assert.deepEqual(parseViewerMessage('{"type":"ready"}'), { type: 'ready' });
  assert.deepEqual(parseViewerMessage('{"type":"campus:flagTapped","eventId":"ev-1"}'), { type: 'campus:flagTapped', eventId: 'ev-1' });
  assert.deepEqual(parseViewerMessage('{"type":"route:stepChanged","stepIndex":2}'), { type: 'route:stepChanged', stepIndex: 2 });
  assert.deepEqual(parseViewerMessage('{"type":"error","message":"bad scene"}'), { type: 'error', message: 'bad scene' });
  assert.equal(parseViewerMessage('{"type":"route:stepChanged","stepIndex":-1}'), null);
  assert.equal(parseViewerMessage('{"type":"campus:flagTapped","eventId":9}'), null);
  assert.equal(parseViewerMessage('{not-json'), null);
  assert.equal(parseViewerMessage('{"type":"future:event"}'), null);
});

test('serializes app messages as data, even when a field looks like JavaScript', () => {
  const message = { type: 'campus:select', eventId: "');globalThis.injected = true;//" };
  const script = serializeAppMessage(message);
  const received = [];
  const context = { window: { ksugo: { receive: (value) => received.push(value) } } };

  runInNewContext(script, context);
  assert.deepEqual(JSON.parse(JSON.stringify(received)), [message]);
  assert.equal(context.injected, undefined);
});
