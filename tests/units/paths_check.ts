#!/usr/bin/env bun
/**
 * Pure-logic check of `src/paths.ts` (no vscode — uses node fs/path only).
 * Run with `bun tests/units/paths_check.ts`.
 */
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { realPath, relativeToRoot, rootOf, toPosix } from '../../src/paths';

const section = (name: string): void => console.log(`\n== ${name} ==`);

async function main(): Promise<void> {
	section('toPosix: replaces the platform separator with "/"');
	assert.strictEqual(toPosix(['a', 'b', 'c'].join(path.sep)), 'a/b/c');
	assert.ok(!toPosix(['a', 'b'].join(path.sep)).includes('\\'));
	console.log('ok - platform separator normalized');

	section('rootOf: longest containing root, undefined when outside');
	const roots = ['/r1', '/r1/sub'];
	assert.strictEqual(rootOf('/r1/sub/x.ts', roots), '/r1/sub');
	assert.strictEqual(rootOf('/r1/x.ts', roots), '/r1');
	assert.strictEqual(rootOf('/r1', roots), '/r1');
	assert.strictEqual(rootOf('/r1/sub', roots), '/r1/sub');
	assert.strictEqual(rootOf('/r2/x.ts', roots), undefined);
	// A sibling whose name merely shares a prefix must not match.
	assert.strictEqual(rootOf('/r1-other/x.ts', roots), undefined);
	console.log('ok - picks the longest root, rejects outside/prefix-only paths');

	section('relativeToRoot: posix-relative path');
	assert.strictEqual(relativeToRoot('/r1/a/b', '/r1'), 'a/b');
	assert.strictEqual(relativeToRoot('/r1', '/r1'), '');
	console.log('ok - relative path is posix-formatted');

	section('realPath: resolves symlinks, degrades to the input on missing paths');
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pp-paths-'));
	try {
		const file = path.join(dir, 'real.txt');
		fs.writeFileSync(file, 'x');
		assert.strictEqual(await realPath(file), fs.realpathSync(file));
		assert.strictEqual(await realPath(path.join(dir, 'missing.txt')), path.join(dir, 'missing.txt'));

		if (process.platform !== 'win32') {
			const link = path.join(dir, 'link.txt');
			fs.symlinkSync(file, link);
			assert.strictEqual(await realPath(link), fs.realpathSync(file));
			assert.notStrictEqual(await realPath(link), link);
		}
		console.log('ok - realpath on file + symlink, input on ENOENT');
	} finally {
		fs.rmSync(dir, { recursive: true, force: true });
	}

	console.log('\npaths_check: all checks passed');
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
