#!/usr/bin/env bun
/**
 * Pure-logic check of `src/gitignore.ts` (layered `.gitignore` evaluation).
 * Run with `bun tests/units/gitignore_check.ts`.
 */
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { IgnoreLayer, isIgnored, loadGitignore } from '../../src/gitignore';

const section = (name: string): void => console.log(`\n== ${name} ==`);

async function main(): Promise<void> {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pp-ignore-'));
	try {
		fs.writeFileSync(path.join(root, '.gitignore'), '*.log\nbuild/\n!keep.log\n');
		fs.mkdirSync(path.join(root, 'sub'), { recursive: true });
		fs.writeFileSync(path.join(root, 'sub', '.gitignore'), 'secret.txt\n!keep.log\n');

		const rootLayer = await loadGitignore(root);
		const subLayer = await loadGitignore(path.join(root, 'sub'));
		assert.ok(rootLayer && subLayer, 'both .gitignore files load');

		section('loadGitignore: undefined when there is no .gitignore');
		assert.strictEqual(await loadGitignore(path.join(root, 'sub', 'nope')), undefined);
		console.log('ok - missing .gitignore -> undefined');

		section('isIgnored: no layers and outside-base paths are not ignored');
		assert.strictEqual(isIgnored(path.join(root, 'a.log'), []), false);
		assert.strictEqual(isIgnored('/elsewhere/x.log', [rootLayer as IgnoreLayer]), false);
		console.log('ok - empty layers / outside base -> false');

		section('isIgnored: patterns, directory suffix, and negation');
		assert.strictEqual(isIgnored(path.join(root, 'a.log'), [rootLayer as IgnoreLayer]), true);
		assert.strictEqual(isIgnored(path.join(root, 'a.txt'), [rootLayer as IgnoreLayer]), false);
		assert.strictEqual(isIgnored(path.join(root, 'keep.log'), [rootLayer as IgnoreLayer]), false);
		// `build/` only matches the directory (unless isDir is set).
		assert.strictEqual(isIgnored(path.join(root, 'build'), [rootLayer as IgnoreLayer], true), true);
		assert.strictEqual(isIgnored(path.join(root, 'build'), [rootLayer as IgnoreLayer], false), false);
		assert.strictEqual(isIgnored(path.join(root, 'build', 'out.js'), [rootLayer as IgnoreLayer]), true);
		console.log('ok - *.log, build/, !keep.log, dir suffix');

		section('isIgnored: nested layers override the parent');
		const layers = [rootLayer as IgnoreLayer, subLayer as IgnoreLayer];
		assert.strictEqual(isIgnored(path.join(root, 'sub', 'secret.txt'), layers), true);
		// A pattern in sub/.gitignore does not apply at the root.
		assert.strictEqual(isIgnored(path.join(root, 'secret.txt'), layers), false);
		// sub/.gitignore re-includes keep.log, beating the parent *.log.
		assert.strictEqual(isIgnored(path.join(root, 'sub', 'keep.log'), layers), false);
		assert.strictEqual(isIgnored(path.join(root, 'sub', 'other.log'), layers), true);
		console.log('ok - child layer wins, parent patterns stay scoped');
	} finally {
		fs.rmSync(root, { recursive: true, force: true });
	}

	console.log('\ngitignore_check: all checks passed');
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
