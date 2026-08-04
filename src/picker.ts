import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { hasGlobChars } from './fuzzy';
import { IndexEntry, PathIndex } from './index';
import { realPath, relativeToRoot, rootOf } from './paths';

interface EntryItem extends vscode.QuickPickItem {
	entry: IndexEntry;
}

let index: PathIndex | undefined;
let current: vscode.QuickPick<EntryItem> | undefined;
let isVisible = false;

export function attachIndex(value: PathIndex): void {
	index = value;
}

export async function showPicker(): Promise<void> {
	if (!index) {
		return;
	}
	if (index.isEmpty) {
		void vscode.window.showInformationMessage('Path Copier: open a folder to pick files or folders.');
		return;
	}
	if (!current) {
		current = vscode.window.createQuickPick<EntryItem>();
		current.canSelectMany = false;
		current.matchOnDescription = false;
		current.matchOnDetail = false;
		current.ignoreFocusOut = true;
		current.title = 'Path Copier';
		current.placeholder = 'Search files and folders  —  Enter: copy relative path, Shift+Enter: copy real path';
		current.onDidChangeValue(() => refresh());
		current.onDidAccept(() => doAccept(false));
		current.onDidHide(() => {
			isVisible = false;
			void vscode.commands.executeCommand('setContext', 'pathCopierPickerVisible', false);
		});
	}
	await index.build();
	current.value = '';
	current.activeItems = [];
	current.selectedItems = [];
	await vscode.commands.executeCommand('setContext', 'pathCopierPickerVisible', true);
	isVisible = true;
	refresh();
	current.show();
}

export function refreshPicker(): void {
	if (isVisible) {
		refresh();
	}
}

function refresh(): void {
	if (!current || !index) {
		return;
	}
	const query = current.value;
	current.items = index.entriesFor(query, hasGlobChars(query)).map(toItem);
}

function toItem(e: IndexEntry): EntryItem {
	return {
		label: (e.isDir ? '$(folder)' : '$(file)') + ' ' + e.rel.split('/').pop(),
		description: index?.descriptionOf(e),
		alwaysShow: true,
		entry: e,
	};
}

async function doAccept(copyReal: boolean): Promise<void> {
	if (!current) {
		return;
	}
	const picked = (current.activeItems[0] ?? current.selectedItems[0]) as EntryItem | undefined;
	if (picked) {
		await copyEntry(picked.entry, copyReal);
		current.hide();
		return;
	}
	if (await tryResolveRawQuery(current.value, copyReal)) {
		current.hide();
	}
}

export async function copyRealPath(): Promise<void> {
	if (!current || !isVisible) {
		return;
	}
	await doAccept(true);
}

async function copyEntry(e: IndexEntry, copyReal: boolean): Promise<void> {
	if (!index) {
		return;
	}
	const text = copyReal
		? await realPath(e.abs)
		: relativeToRoot(e.abs, rootOf(e.abs, index.roots) ?? e.abs);
	await copy(text, copyReal);
}

async function tryResolveRawQuery(query: string, copyReal: boolean): Promise<boolean> {
	if (!index) {
		return false;
	}
	const isAbsolute = query.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(query);
	for (const root of index.roots) {
		const abs = isAbsolute ? query : path.resolve(root, query);
		try {
			const stat = await fs.promises.stat(abs);
			if (stat.isFile() || stat.isDirectory()) {
				const text = copyReal
					? await realPath(abs)
					: relativeToRoot(abs, rootOf(abs, index.roots) ?? root);
				await copy(text, copyReal);
				return true;
			}
		} catch {
			// keep trying next root
		}
	}
	return false;
}

async function copy(text: string, copyReal: boolean): Promise<void> {
	await vscode.env.clipboard.writeText(text);
	void vscode.window.setStatusBarMessage(
		`Copied ${copyReal ? 'real' : 'relative'} path: ${text}`,
		4000
	);
}
