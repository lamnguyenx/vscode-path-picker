#!/usr/bin/env bun
/**
 * Pure-logic check of the picker label truncation (`src/text.ts`).
 * Run with `bun tests/units/text_check.ts`.
 */
import assert from 'node:assert';
import { MAX_LABEL_LENGTH, truncateLeft } from '../../src/text';

const section = (name: string): void => console.log(`\n== ${name} ==`);

section('short labels are returned unchanged');
assert.strictEqual(truncateLeft('src/app.ts'), 'src/app.ts');
assert.strictEqual(truncateLeft(''), '');
assert.strictEqual(truncateLeft('a'.repeat(MAX_LABEL_LENGTH)), 'a'.repeat(MAX_LABEL_LENGTH));
console.log('ok - up to MAX_LABEL_LENGTH is untouched');

section('a too-long unbroken string keeps the tail and an ellipsis');
const noSlash = 'a'.repeat(MAX_LABEL_LENGTH + 10);
const cut = truncateLeft(noSlash);
assert.strictEqual(cut.length, MAX_LABEL_LENGTH);
assert.ok(cut.startsWith('…'), 'ellipsis prefix');
assert.strictEqual(cut, '…' + noSlash.slice(noSlash.length - (MAX_LABEL_LENGTH - 1)));
console.log('ok - plain right-aligned slice');

section('segment-aware: whole leading segments are dropped, never cut through one');
const twoSeg = 'x'.repeat(30) + '/' + 'y'.repeat(60);
assert.strictEqual(truncateLeft(twoSeg), '…/' + 'y'.repeat(60));

const threeSeg = 'a'.repeat(40) + '/' + 'b'.repeat(40) + '/' + 'c'.repeat(40);
assert.strictEqual(truncateLeft(threeSeg), '…/' + 'c'.repeat(40));
console.log('ok - drops one or more leading segments');

console.log('\ntext_check: all checks passed');
