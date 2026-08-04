import * as vscode from 'vscode';
import { IndexConfig, PathIndex } from './index';
import { attachIndex, attachRogueIndex, copyRealPath, refreshPicker, showPicker } from './picker';

function getConfig(): IndexConfig {
	const cfg = vscode.workspace.getConfiguration('pathCopier');
	return {
		exclude: cfg.get<string[]>('exclude', ['node_modules', '.git', '.hg', '.svn']),
		maxEntries: cfg.get<number>('maxEntries', 30000),
		followSymlinks: cfg.get<boolean>('followSymlinks', false),
		ignoreGitignore: false,
	};
}

function getRogueConfig(): IndexConfig {
	const cfg = vscode.workspace.getConfiguration('pathCopier');
	return {
		exclude: cfg.get<string[]>('exclude', ['node_modules', '.git', '.hg', '.svn']),
		maxEntries: cfg.get<number>('maxEntries', 30000),
		followSymlinks: cfg.get<boolean>('rogueFollowSymlinks', false),
		ignoreGitignore: true,
	};
}

export function activate(context: vscode.ExtensionContext): void {
	const index = new PathIndex(getConfig);
	const rogueIndex = new PathIndex(getRogueConfig);
	attachIndex(index);
	attachRogueIndex(rogueIndex);

	context.subscriptions.push(
		vscode.commands.registerCommand('pathCopier.pickPath', () => showPicker(false)),
		vscode.commands.registerCommand('pathCopier.pickPathRogue', () => showPicker(true)),
		vscode.commands.registerCommand('pathCopier.copyRealPath', copyRealPath),
		vscode.workspace.onDidChangeWorkspaceFolders(() => {
			void index.build().then(refreshPicker);
			void rogueIndex.build().then(refreshPicker);
		})
	);

	let timer: NodeJS.Timeout | undefined;
	const watcher = vscode.workspace.createFileSystemWatcher('**/*');
	context.subscriptions.push(watcher);
	const schedule = () => {
		if (timer) {
			clearTimeout(timer);
		}
		timer = setTimeout(() => {
			timer = undefined;
			void index.build().then(refreshPicker);
			void rogueIndex.build().then(refreshPicker);
		}, 1200);
	};
	context.subscriptions.push(
		watcher.onDidCreate(schedule),
		watcher.onDidDelete(schedule),
		watcher.onDidChange(schedule)
	);
}

export function deactivate(): void {
	// nothing to clean up
}
