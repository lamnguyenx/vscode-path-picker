#!/usr/bin/env bun
/**
 * Pure-logic check of the fuzzy/glob matcher (`src/fuzzy.ts`).
 * No dev host, no vscode — run with `bun tests/units/fuzzy_check.ts`.
 */
import assert from 'node:assert';
import { fuzzyScore, globMatch, hasGlobChars } from '../../src/fuzzy';

const section = (name: string): void => console.log(`\n== ${name} ==`);

section('hasGlobChars: only path-glob metacharacters');
assert.strictEqual(hasGlobChars(''), false);
assert.strictEqual(hasGlobChars('src/app.ts'), false);
assert.strictEqual(hasGlobChars('a/b'), false);
assert.strictEqual(hasGlobChars('*'), true);
assert.strictEqual(hasGlobChars('?'), true);
assert.strictEqual(hasGlobChars('{a,b}'), true);
assert.strictEqual(hasGlobChars('[abc]'), true);
console.log('ok - detects *, ?, {, [, }');

section('globMatch: basename globs match at any depth');
assert.strictEqual(globMatch('*.ts', 'app.ts'), true);
assert.strictEqual(globMatch('*.ts', 'src/deep/nested.ts'), true);
assert.strictEqual(globMatch('*.ts', 'app.tsx'), false);
assert.strictEqual(globMatch('**/*.ts', 'src/deep/nested.ts'), true);
assert.strictEqual(globMatch('**/*.ts', 'nested.ts'), true);
assert.strictEqual(globMatch('*.md', 'nested.ts'), false);
console.log('ok - *.ts basename + **/ prefix');

section('globMatch: a query with a slash is anchored to a path segment');
assert.strictEqual(globMatch('src/*.ts', 'src/app.ts'), true);
// The implicit `(?:.*/)?` prefix is intentional: a nested `src/` still matches.
assert.strictEqual(globMatch('src/*.ts', 'a/src/app.ts'), true);
assert.strictEqual(globMatch('src/*.ts', 'src/deep/app.ts'), false);
assert.strictEqual(globMatch('src/**', 'src/deep/nested.ts'), true);
assert.strictEqual(globMatch('src/**', 'docs/guide.md'), false);
console.log('ok - prefix bug fixed (raw regex built first, prefix prepended after)');

section('globMatch: braces, classes, `?`, and regex metacharacter escaping');
assert.strictEqual(globMatch('*.{ts,tsx}', 'Button.tsx'), true);
assert.strictEqual(globMatch('*.{ts,tsx}', 'Button.js'), false);
assert.strictEqual(globMatch('ma[in]n.ts', 'main.ts'), true);
assert.strictEqual(globMatch('ma[in]n.ts', 'maon.ts'), false);
assert.strictEqual(globMatch('ma?n.ts', 'main.ts'), true);
assert.strictEqual(globMatch('ma?n.ts', 'man.ts'), false);
assert.strictEqual(globMatch('a+b.ts', 'a+b.ts'), true);
assert.strictEqual(globMatch('a+b.ts', 'aab.ts'), false);
assert.strictEqual(globMatch('a.b', 'axb'), false);
assert.strictEqual(globMatch('a.b', 'a.b'), true);
console.log('ok - {a,b}, [abc], ?, and metacharacters are escaped');

section('fuzzyScore: empty / no-match');
assert.strictEqual(fuzzyScore('', 'anything'), 1);
assert.strictEqual(fuzzyScore('zzz', 'abc'), 0);
// Order matters: the characters must appear in sequence.
assert.strictEqual(fuzzyScore('ab', 'ba'), 0);
console.log('ok - empty query scores 1, non-subsequence scores 0');

section('fuzzyScore: exact numbers lock the scoring');
assert.strictEqual(fuzzyScore('ab', 'ab'), 11); // start bonus + contiguous + prefix bonus
assert.strictEqual(fuzzyScore('ab', 'a_b'), 6); // boundary bonus, not contiguous
assert.strictEqual(fuzzyScore('a/b', 'a/b'), 15); // two boundaries + contiguous + prefix
assert.strictEqual(fuzzyScore('AB', 'ab'), 11); // case-insensitive
console.log('ok - exact scores match the documented weights');

section('fuzzyScore: prefix beats mid-string, boundary beats plain, contiguous beats split');
assert.ok(fuzzyScore('main', 'main.ts') > fuzzyScore('main', 'xmain.ts'), 'prefix bonus');
assert.ok(fuzzyScore('b', 'a/b') > fuzzyScore('b', 'ab'), 'path-boundary bonus');
assert.ok(fuzzyScore('ab', 'abx') > fuzzyScore('ab', 'axb'), 'contiguity bonus');
console.log('ok - ranking relations hold');

console.log('\nfuzzy_check: all checks passed');
