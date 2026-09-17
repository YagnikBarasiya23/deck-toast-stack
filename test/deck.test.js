import test from 'node:test';
import assert from 'node:assert/strict';
import { stackExtent, stackLayout, swipeOutcome } from '../deck.js';

const ys = layout => layout.map(l => l.y);

test('expanded bottom stack fans upwards with gaps', () => {
  assert.deepEqual(ys(stackLayout([60, 80, 70], { expanded: true, gap: 10, direction: -1 })), [-0, -70, -160]);
});

test('expanded top stack fans downwards', () => {
  assert.deepEqual(ys(stackLayout([60, 80], { expanded: true, gap: 10, direction: 1 })), [0, 70]);
});

test('collapsed toasts peek past the front toast by a fixed amount', () => {
  const heights = [60, 90, 40];
  const bottom = stackLayout(heights, { peek: 12, direction: -1 });
  // Bottom stack: each toast's top edge sits 12px above the one in front.
  heights.forEach((h, i) => assert.equal(bottom[i].y - h, -60 - i * 12));
  const top = stackLayout(heights, { peek: 12, direction: 1 });
  // Top stack: each toast's bottom edge sits 12px below the one in front.
  heights.forEach((h, i) => assert.equal(top[i].y + h, 60 + i * 12));
});

test('collapsed toasts shrink and those past max are hidden', () => {
  const layout = stackLayout([50, 50, 50, 50, 50], { max: 3 });
  assert.deepEqual(layout.map(l => l.scale), [1, 0.95, 0.9, 0.85, 0.85]);
  assert.deepEqual(layout.map(l => l.hidden), [false, false, false, true, true]);
  assert.equal(stackLayout([50, 50, 50, 50], { max: 3, expanded: true })[3].hidden, false);
});

test('swipes dismiss when far enough or fast enough in the same direction', () => {
  assert.equal(swipeOutcome(150, 0, 300), 1);
  assert.equal(swipeOutcome(-150, 0, 300), -1);
  assert.equal(swipeOutcome(40, 0.9, 300), 1);
  assert.equal(swipeOutcome(40, -0.9, 300), 0);
  assert.equal(swipeOutcome(40, 0.1, 300), 0);
});

test('extent covers the furthest visible toast', () => {
  assert.equal(stackExtent([60, 80], { expanded: true, gap: 10 }), 150);
  assert.equal(stackExtent([60, 60, 60, 60], { max: 3, peek: 12 }), 84);
});
