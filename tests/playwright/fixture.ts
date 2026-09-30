/**
 * Runtime fixtures for the Path Picker E2E suite.
 *
 * The **committed** tree under `tests/workspace/` is deliberately clean (a
 * `.gitignore`, a few source/docs files). Everything that exists only to be
 * *ignored* by the picker — plus the symlink and the long path — is written
 * here at the start of a run and removed again afterwards. The generated names
 * are all listed in the repo's root `.gitignore`, so a crashed run does not
 * dirty `git status`.
 *
 * The runner writes these on the host; code-server sees them through the
 * read-only `~/git` bind mount, so files created after the container started
 * are still visible to the extension host.
 */
import * as fs from 'node:fs';
import { join } from 'node:path';
import { truncateLeft } from '../../src/text';

export const IGNORED_FILE = 'ignored.log';
export const TMP_FILE = 'scratch.tmp';
export const BUILD_DIR = 'build';
export const SYMLINK = 'symlink-src';
export const LONG_DIR = 'long-paths';

export const LONG_DIR_A = 'very-long-directory-name';
export const LONG_DIR_B = 'another-very-long-directory-name';
export const LONG_FILE = 'an-example-file-with-a-long-name.ts';

/** Path relative to the workspace root (posix, as the picker shows it). */
export const LONG_REL = `${LONG_DIR}/${LONG_DIR_A}/${LONG_DIR_B}/${LONG_FILE}`;
/** Crafted so the file label exceeds `MAX_LABEL_LENGTH` and is truncated. */
export const LONG_LABEL = truncateLeft(LONG_REL);

/** Names created by {@link setupFixture}; removed by {@link cleanupFixture}. */
const RUNTIME_ENTRIES = [IGNORED_FILE, TMP_FILE, BUILD_DIR, SYMLINK, LONG_DIR];

/**
 * (Re)create the runtime half of the fixture workspace. Idempotent: a previous
 * run's leftovers are removed first.
 */
export function setupFixture(workspace: string): void {
	cleanupFixture(workspace);

	fs.writeFileSync(join(workspace, IGNORED_FILE), 'IGNORED\n');
	fs.writeFileSync(join(workspace, TMP_FILE), 'IGNORED\n');

	fs.mkdirSync(join(workspace, BUILD_DIR), { recursive: true });
	fs.writeFileSync(join(workspace, BUILD_DIR, 'output.js'), 'IGNORED\n');

	if (process.platform !== 'win32') {
		fs.symlinkSync('src', join(workspace, SYMLINK));
	}

	const longDir = join(workspace, LONG_DIR, LONG_DIR_A, LONG_DIR_B);
	fs.mkdirSync(longDir, { recursive: true });
	fs.writeFileSync(join(longDir, LONG_FILE), 'export const long = 1;\n');
}

/** Remove everything {@link setupFixture} created. Safe to call repeatedly. */
export function cleanupFixture(workspace: string): void {
	for (const entry of RUNTIME_ENTRIES) {
		fs.rmSync(join(workspace, entry), { recursive: true, force: true });
	}
}
