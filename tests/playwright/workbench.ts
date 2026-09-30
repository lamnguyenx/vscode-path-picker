/**
 * Workbench + QuickPick helpers for the Path Picker E2E suite.
 *
 * Division of labour (meta repo `how-to-test-all.md` §3):
 *   REST Control  → arrange + act  (open the picker, run the copy/reveal
 *                                    commands, change settings)
 *   CDP/Playwright → assert only    (the QuickPick DOM and the status-bar echo)
 *
 * Unlike a webview extension there is **no iframe** here: the picker is the
 * workbench's own QuickInput widget, rendered in the top-level page, so plain
 * Playwright locators see it.
 *
 * The suite runs against a **dedicated fixture workspace** (`tests/workspace`)
 * so paths are short and deterministic. `code-server` is navigated to it in
 * `beforeAll` and back to the original folder in `afterAll`.
 */
import { chromium, expect, type Browser, type Page } from '@playwright/test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { restAvailable, restCmd, restEval } from './rest';

export const CDP_ENDPOINT = `http://127.0.0.1:${process.env.CDP_PORT || '9024'}`;
export const CODE_SERVER_ORIGIN = process.env.CODE_SERVER_ORIGIN || 'https://localhost:9620';
const CODE_SERVER_HOST = new URL(CODE_SERVER_ORIGIN).host;

/** The extension under test (override for a fork). */
export const EXT_ID = process.env.PP_EXT_ID || 'lamnguyenx.hacker-path-picker';

const HERE = __dirname; // tests/playwright
/** This extension's checkout, as both the runner and the extension host see it. */
export const EXT_ROOT: string = process.env.PP_EXT_ROOT || join(HERE, '..', '..');
/** The controlled fixture workspace: the code-server folder the suite opens. */
export const WORKSPACE = join(EXT_ROOT, 'tests', 'workspace');
export const WORKSPACE_URL = `${CODE_SERVER_ORIGIN}/?folder=${encodeURIComponent(WORKSPACE)}`;

/** Folder to restore when the browser was already left on the fixture. */
function fallbackFolder(): string | undefined {
	const meta = join(EXT_ROOT, '..', '..');
	return existsSync(meta) ? meta : undefined;
}

function folderUrl(folder: string): string {
	return `${CODE_SERVER_ORIGIN}/?folder=${encodeURIComponent(folder)}`;
}

export interface Workbench {
	browser: Browser;
	page: Page;
}

/** Connect to the already-running CDP browser and return the code-server tab. */
export async function connectWorkbench(): Promise<Workbench> {
	const browser = await chromium.connectOverCDP(CDP_ENDPOINT);
	const context = browser.contexts()[0];
	if (!context) throw new Error(`no browser context on ${CDP_ENDPOINT}`);

	const page = context.pages().find((p) => p.url().includes(CODE_SERVER_HOST)) ?? (await context.newPage());
	if (!page.url().includes(CODE_SERVER_HOST)) {
		await page.goto(CODE_SERVER_ORIGIN, { waitUntil: 'domcontentloaded' });
	}
	await page.locator('.monaco-workbench').waitFor({ timeout: 60000 });
	return { browser, page };
}

/** Poll until the REST Control endpoint answers again (e.g. after a folder switch). */
export async function waitForRest(page: Page, timeoutMs = 45000): Promise<void> {
	await expect
		.poll(() => restAvailable().catch(() => false), { timeout: timeoutMs, intervals: [500, 1000, 2000] })
		.toBe(true);
	await page.waitForTimeout(800);
}

/** Navigate code-server to `folder` and wait for the restarted extension host. */
export async function openFolder(page: Page, folder: string): Promise<void> {
	await page.goto(folderUrl(folder), { waitUntil: 'domcontentloaded', timeout: 60000 });
	await page.locator('.monaco-workbench').waitFor({ timeout: 60000 });
	await waitForRest(page);
}

/** Remember the current folder, open the fixture workspace; returns the previous URL. */
export async function openWorkspace(page: Page): Promise<string> {
	const previous = page.url();
	await openFolder(page, WORKSPACE);
	return previous;
}

/** Restore the workbench to `url`, unless it is already the fixture workspace. */
export async function restoreWorkspace(page: Page, url: string | undefined): Promise<void> {
	const target = !url || url.includes(encodeURIComponent(WORKSPACE)) ? fallbackFolder() : undefined;
	if (target) {
		await openFolder(page, target);
		return;
	}
	await page.goto(url as string, { waitUntil: 'domcontentloaded', timeout: 60000 });
	await page.locator('.monaco-workbench').waitFor({ timeout: 60000 });
	await waitForRest(page);
}

// ---------------------------------------------------------------------------
// QuickPick — the picker's UI lives in the workbench page.
// ---------------------------------------------------------------------------

export const QP = '.quick-input-widget';
const ROW = `${QP} .monaco-list-row`;

export function quickPick(page: Page) {
	return page.locator(QP);
}

/** Open the picker via the command and wait until it is focused and titled. */
export async function openPicker(page: Page): Promise<void> {
	await closePicker(page);
	await restCmd('pathPicker.pickPath');
	await expect(quickPick(page)).toBeVisible({ timeout: 15000 });
	await expect(page.locator(`${QP} .quick-input-title`)).toHaveText('Path Picker');
	await expect(page.locator(`${QP} input`)).toBeFocused({ timeout: 5000 });
}

/** Dismiss the picker if it is open. */
export async function closePicker(page: Page): Promise<void> {
	if (await quickPick(page).isVisible().catch(() => false)) {
		await page.keyboard.press('Escape');
		await expect(quickPick(page)).toBeHidden({ timeout: 5000 });
	}
}

/** Type into the picker's input, letting `onDidChangeValue` refresh. */
export async function typeQuery(page: Page, text: string): Promise<void> {
	await page.keyboard.type(text, { delay: 15 });
	await page.waitForTimeout(350);
}

/** Visible row labels (trimmed, single-spaced). */
export function pickerRows(page: Page): Promise<string[]> {
	return page.evaluate(
		(sel) =>
			([...document.querySelectorAll(sel)] as HTMLElement[])
				.map((r) => (r.textContent || '').replace(/\s+/g, ' ').trim())
				.filter(Boolean),
		ROW
	);
}

/** The picker input's current value. */
export function pickerValue(page: Page): Promise<string> {
	return page.locator(`${QP} input`).inputValue();
}

// ---------------------------------------------------------------------------
// Copy oracle — the extension echoes every copy to the status bar.
//
// The real clipboard is not a usable oracle in this topology: code-server routes
// `vscode.env.clipboard.writeText` through the browser and a host-side
// `readText()` hangs, while the browser clipboard is shared/synced. The status
// message is the extension's user-visible echo and carries the exact payload.
// ---------------------------------------------------------------------------

export async function statusTexts(page: Page): Promise<string[]> {
	return page.evaluate(() =>
		[...document.querySelectorAll('.statusbar-item')].map((e) => (e.textContent || '').trim()).filter(Boolean)
	);
}

/** The active `Copied relative path: …` / `Copied real path: …` message, if any. */
export async function copiedMessage(page: Page): Promise<string | null> {
	const found = (await statusTexts(page)).find((t) => /^Copied (?:relative|real) path: /.test(t));
	return found ?? null;
}

/** Assert the picker produced exactly this copy echo. */
export function expectCopied(page: Page, kind: 'relative' | 'real', payload: string, timeoutMs = 6000) {
	return expect
		.poll(() => copiedMessage(page), { timeout: timeoutMs, intervals: [150, 250, 400] })
		.toBe(`Copied ${kind} path: ${payload}`);
}

/** Wait for any previous copy echo to expire (they auto-hide after ~4s). */
export async function waitCopyCleared(page: Page, timeoutMs = 7000): Promise<void> {
	try {
		await expect.poll(() => copiedMessage(page), { timeout: timeoutMs, intervals: [300, 500] }).toBeNull();
	} catch {
		// A stale echo that will not clear must not fail the cleanup.
	}
}

// ---------------------------------------------------------------------------
// Settings — snapshot the Global scope, restore (or remove) in `afterAll`.
// ---------------------------------------------------------------------------

export function getGlobalConfig<T = unknown>(key: string): Promise<T | undefined> {
	return restEval<T | undefined>(
		`vscode.workspace.getConfiguration('pathPicker').inspect(${JSON.stringify(key)})?.globalValue`
	);
}

/** Set a `pathPicker.*` setting at Global scope, or remove it with null/undefined. */
export async function setConfig(key: string, value: unknown): Promise<void> {
	const arg = value === undefined || value === null ? 'undefined' : JSON.stringify(value);
	await restEval(
		`vscode.workspace.getConfiguration('pathPicker').update(${JSON.stringify(key)}, ${arg}, vscode.ConfigurationTarget.Global)`
	);
	await new Promise((r) => setTimeout(r, 300));
}
