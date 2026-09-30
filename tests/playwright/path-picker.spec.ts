import { test, expect, type Browser, type Page } from '@playwright/test';
import { restCmd, restEval } from './rest';
import { cleanupFixture, LONG_LABEL, LONG_REL, setupFixture } from './fixture';
import {
	closePicker,
	connectWorkbench,
	copiedMessage,
	EXT_ID,
	expectCopied,
	getGlobalConfig,
	openPicker,
	openWorkspace,
	pickerRows,
	pickerValue,
	quickPick,
	restoreWorkspace,
	setConfig,
	typeQuery,
	waitCopyCleared,
	WORKSPACE,
} from './workbench';
import { join } from 'node:path';

/**
 * Path Picker — E2E against a live code-server.
 *
 * Arrange/act goes through REST Control; Playwright asserts the QuickPick DOM
 * and the status-bar copy echo. The suite switches code-server to the committed
 * fixture workspace (`tests/workspace`) in `beforeAll` and restores the previous
 * folder in `afterAll`; the fixture is tiny so the index and results are
 * deterministic (the real meta repo has ~94k files and is capped at 30k).
 *
 * Prereqs: code-server up with this extension installed (`make build` + install,
 * see `docs/important/how-to-test.md`), a CDP browser on 9024, REST Control on
 * 40620, and the runner able to see the extension checkout at the same path the
 * container does (the meta repo mounts `~/git` at the same absolute path).
 */

test.describe.configure({ mode: 'serial' });

const ROOT_ROWS = ['docs/', 'long-paths/', 'src/', '.gitignore', 'main.ts', 'README.md'];

const NESTED_REL = 'src/deep/nested.ts';
const BUTTON_REL = 'src/components/Button.tsx';

let browser: Browser;
let page: Page;
let originalUrl: string;
/** Global-scope values the suite may change; restored in `afterAll`. */
let originals: { exclude?: unknown; maxEntries?: unknown; followSymlinks?: unknown } = {};

test.beforeAll(async () => {
	({ browser, page } = await connectWorkbench());

	// Snapshot Global-scope settings *before* touching anything.
	originals = {
		exclude: await getGlobalConfig('exclude'),
		maxEntries: await getGlobalConfig('maxEntries'),
		followSymlinks: await getGlobalConfig('followSymlinks'),
	};

	// Write the ignored files / symlink / long path the committed tree omits.
	setupFixture(WORKSPACE);

	// Move off the huge meta workspace onto the controlled fixture. Capture the
	// current URL first so a failure mid-navigation can still be restored.
	originalUrl = page.url();
	await openWorkspace(page);
});

test.afterEach(async () => {
	await closePicker(page);
	// Keep the suite idempotent even when a test fails mid-way.
	await setConfig('followSymlinks', originals.followSymlinks);
	await setConfig('exclude', originals.exclude);
	await setConfig('maxEntries', originals.maxEntries);
});

test.afterAll(async () => {
	try {
		await closePicker(page);
		await restoreWorkspace(page, originalUrl);
	} finally {
		// Always remove the runtime fixtures — even if a test or the restore failed.
		cleanupFixture(WORKSPACE);
		await browser.close();
	}
});

test('is installed and activates its three commands', async () => {
	const extId = await restEval<string | null>(
		`vscode.extensions.getExtension(${JSON.stringify(EXT_ID)})?.id ?? null`
	);
	expect(extId, `${EXT_ID} is not installed in this code-server`).toBe(EXT_ID);

	await openPicker(page); // forces `onCommand:` activation
	await closePicker(page);

	const commands = await restEval<string[]>('vscode.commands.getCommands(true)');
	for (const cmd of ['pathPicker.pickPath', 'pathPicker.copyRealPath', 'pathPicker.revealInExplorer']) {
		expect(commands, `missing ${cmd}`).toContain(cmd);
	}
});

test('opens on the command and lists the root children (gitignored + symlink hidden)', async () => {
	await openPicker(page);

	await expect(page.locator('.quick-input-widget input')).toHaveAttribute('placeholder', 'Search');
	await expect.poll(() => pickerRows(page)).toEqual(ROOT_ROWS);

	// `.gitignore` (build/, *.log, *.tmp) and the default-config symlink rule.
	const rows = await pickerRows(page);
	expect(rows).not.toContain('build/');
	expect(rows).not.toContain('ignored.log');
	expect(rows).not.toContain('scratch.tmp');
	expect(rows).not.toContain('symlink-src/');
});

test('a fuzzy query narrows to the file and Enter copies the relative path', async () => {
	await openPicker(page);
	await typeQuery(page, 'nested');
	await expect.poll(() => pickerRows(page)).toEqual([NESTED_REL]);

	await page.keyboard.press('Enter');
	await expect(quickPick(page)).toBeHidden({ timeout: 5000 });
	await expectCopied(page, 'relative', NESTED_REL);
});

test('a path query with slashes still shows its row (alwaysShow self-filter)', async () => {
	await openPicker(page);
	await typeQuery(page, NESTED_REL);
	await expect.poll(() => pickerRows(page)).toEqual([NESTED_REL]);
});

test('reopening resets the query and the selection', async () => {
	await openPicker(page);
	await typeQuery(page, 'nested');
	await page.keyboard.press('Enter');
	await expect(quickPick(page)).toBeHidden({ timeout: 5000 });

	// The stale-value / stale-selection bug: a reused widget must start empty
	// and show the root children again.
	await openPicker(page);
	expect(await pickerValue(page)).toBe('');
	await expect.poll(() => pickerRows(page)).toEqual(ROOT_ROWS);
});

test('glob queries return path matches (and long labels are tail-truncated)', async () => {
	// The QuickPick re-sorts by label, so compare as sets, not in the extension's
	// own order (that ordering is unit-tested in `entriesFor`).
	const sorted = (xs: string[]): string[] => [...xs].sort();

	await openPicker(page);
	await typeQuery(page, '*.ts');
	await expect.poll(async () => sorted(await pickerRows(page))).toEqual(
		sorted([LONG_LABEL, 'main.ts', 'src/app.ts', NESTED_REL])
	);
	// The long path was truncated from the left, keeping the filename.
	expect(await pickerRows(page)).toContain(LONG_LABEL);
	await closePicker(page);

	await openPicker(page);
	await typeQuery(page, 'src/**');
	await expect
		.poll(async () => sorted(await pickerRows(page)))
		.toEqual(sorted(['src/app.ts', 'src/components/', 'src/components/Button.tsx', 'src/deep/', NESTED_REL]));
});

test('gitignored files and directories never reach the picker', async () => {
	// Glob queries bypass the fuzzy matcher (which cross-matches other fixture
	// files), so an empty result really means "not in the index".
	for (const query of ['*.log', '*.tmp', 'build/*']) {
		await openPicker(page);
		await typeQuery(page, query);
		await expect.poll(() => pickerRows(page), `"${query}" should match nothing`).toEqual([]);
		await closePicker(page);
	}
});

test('picking a directory copies its relative path without a trailing slash', async () => {
	await openPicker(page);
	await typeQuery(page, 'docs');
	await expect.poll(async () => (await pickerRows(page))[0]).toBe('docs/');

	await page.keyboard.press('Enter');
	await expect(quickPick(page)).toBeHidden({ timeout: 5000 });
	await expectCopied(page, 'relative', 'docs');
});

test('copyRealPath (Shift+Enter) copies the real path', async () => {
	await openPicker(page);
	await typeQuery(page, 'Button');
	await expect.poll(() => pickerRows(page)).toEqual([BUTTON_REL]);

	// The keybinding is what a user presses…
	await page.keyboard.press('Shift+Enter');
	await expect(quickPick(page)).toBeHidden({ timeout: 5000 });
	await expectCopied(page, 'real', join(WORKSPACE, BUTTON_REL));

	// …and the command it is bound to does the same when invoked directly.
	await openPicker(page);
	await typeQuery(page, 'nested');
	await restCmd('pathPicker.copyRealPath');
	await expect(quickPick(page)).toBeHidden({ timeout: 5000 });
	await expectCopied(page, 'real', join(WORKSPACE, NESTED_REL));
});

test('revealInExplorer reveals the picked file in the Explorer', async () => {
	await restCmd('workbench.view.explorer');
	await openPicker(page);
	await typeQuery(page, 'nested');
	await restCmd('pathPicker.revealInExplorer');
	await expect(quickPick(page)).toBeHidden({ timeout: 5000 });

	const selected = () =>
		page.evaluate(() =>
			[...document.querySelectorAll('.explorer-viewlet .monaco-list-row')]
				.filter((r) => r.classList.contains('selected') || r.getAttribute('aria-selected') === 'true')
				.map((r) => (r.getAttribute('aria-label') || r.textContent || '').trim())
		);
	await expect.poll(selected, { timeout: 8000 }).toContain('nested.ts');
});

test('an unmatched query: Enter keeps the picker open and copies nothing', async () => {
	await waitCopyCleared(page);
	await openPicker(page);
	await typeQuery(page, 'zzz-no-such-thing-xyz');
	await expect.poll(() => pickerRows(page)).toEqual([]);

	await page.keyboard.press('Enter');
	await page.waitForTimeout(800);
	expect(await pickerValue(page)).toBe('zzz-no-such-thing-xyz');
	expect(await quickPick(page).isVisible()).toBe(true);
	expect(await copiedMessage(page)).toBeNull();
});

test('an absolute path query resolves on Enter (relative) and Shift+Enter (real)', async () => {
	const abs = join(WORKSPACE, 'src', 'app.ts');

	await openPicker(page);
	await typeQuery(page, abs);
	await expect.poll(() => pickerRows(page)).toEqual([]);
	await page.keyboard.press('Enter');
	await expect(quickPick(page)).toBeHidden({ timeout: 5000 });
	await expectCopied(page, 'relative', 'src/app.ts');

	await openPicker(page);
	await typeQuery(page, abs);
	await restCmd('pathPicker.copyRealPath');
	await expect(quickPick(page)).toBeHidden({ timeout: 5000 });
	await expectCopied(page, 'real', abs);
});

test('copy/reveal commands are no-ops while the picker is closed', async () => {
	await waitCopyCleared(page);
	await expect(quickPick(page)).toBeHidden();

	await restCmd('pathPicker.copyRealPath');
	await restCmd('pathPicker.revealInExplorer');
	await page.waitForTimeout(500);

	expect(await copiedMessage(page)).toBeNull();
});

test('pathPicker.followSymlinks controls whether the symlinked dir is indexed', async () => {
	await setConfig('followSymlinks', false);
	await openPicker(page);
	expect(await pickerRows(page)).not.toContain('symlink-src/');
	await closePicker(page);

	await setConfig('followSymlinks', true);
	await openPicker(page);
	await expect.poll(() => pickerRows(page)).toContain('symlink-src/');
});

test('pathPicker.exclude removes a directory from the index', async () => {
	await setConfig('exclude', ['node_modules', '.git', '.hg', '.svn', 'docs']);
	await openPicker(page);

	const rows = await pickerRows(page);
	expect(rows).not.toContain('docs/');
	expect(rows).toContain('src/');
});

test('pathPicker.maxEntries caps the index', async () => {
	await setConfig('maxEntries', 3);
	await openPicker(page);

	const rows = await pickerRows(page);
	expect(rows.length).toBeLessThan(ROOT_ROWS.length);
});
