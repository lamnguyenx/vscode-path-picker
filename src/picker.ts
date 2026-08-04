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
let currentIndex: PathIndex | undefined;
let current: vscode.QuickPick<EntryItem> | undefined;
let isVisible = false;

export function attachIndex(value: PathIndex): void {
	index = value;
}

export async function showPicker(): Promise<void> {
	const src = index;
	if (!src) {
		return;
	}
	if (src.isEmpty) {
		void vscode.window.showInformationMessage('Path Copier: open a folder to pick files or folders.');
		return;
	}
	currentIndex = src;
	if (!current) {
		current = vscode.window.createQuickPick<EntryItem>();
		current.canSelectMany = false;
		current.matchOnDescription = false;
		current.matchOnDetail = false;
		current.ignoreFocusOut = true;
		current.title = 'Path Copier';
		current.onDidChangeValue(() => refresh());
		current.onDidAccept(() => doAccept(false));
		current.onDidHide(() => {
			isVisible = false;
			void vscode.commands.executeCommand('setContext', 'pathCopierPickerVisible', false);
		});
	}
	current.placeholder = 'Search — ⏎ relative · ⇧⏎ real';
	await src.build();
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
	if (!current || !currentIndex) {
		return;
	}
	const query = current.value;
	current.items = currentIndex.entriesFor(query, hasGlobChars(query)).map(toItem);
}

function toItem(e: IndexEntry): EntryItem {
	return {
		label: e.rel.split('/').pop() ?? '',
		description: currentIndex?.descriptionOf(e),
		iconPath: e.isDir ? vscode.ThemeIcon.Folder : vscode.ThemeIcon.File,
		resourceUri: vscode.Uri.file(e.abs),
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
	if (!currentIndex) {
		return;
	}
	const text = copyReal
		? await realPath(e.abs)
		: relativeToRoot(e.abs, rootOf(e.abs, currentIndex.roots) ?? e.abs);
	await copy(text, copyReal);
}

async function tryResolveRawQuery(query: string, copyReal: boolean): Promise<boolean> {
	if (!currentIndex) {
		return false;
	}
	const isAbsolute = query.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(query);
	for (const root of currentIndex.roots) {
		const abs = isAbsolute ? query : path.resolve(root, query);
		try {
			const stat = await fs.promises.stat(abs);
			if (stat.isFile() || stat.isDirectory()) {
				const text = copyReal
					? await realPath(abs)
					: relativeToRoot(abs, rootOf(abs, currentIndex.roots) ?? root);
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
