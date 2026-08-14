import * as vscode from 'vscode';
import { IndexConfig, PathIndex } from './index';
import { attachIndex, copyRealPath, refreshPicker, revealInExplorer, showPicker } from './picker';

function getConfig(): IndexConfig {
	const cfg = vscode.workspace.getConfiguration('pathPicker');
	return {
		exclude: cfg.get<string[]>('exclude', ['node_modules', '.git', '.hg', '.svn']),
		maxEntries: cfg.get<number>('maxEntries', 30000),
		followSymlinks: cfg.get<boolean>('followSymlinks', false),
	};
}

export function activate(context: vscode.ExtensionContext): void {
	const index = new PathIndex(getConfig);
	attachIndex(index);

	context.subscriptions.push(
		vscode.commands.registerCommand('pathPicker.pickPath', () => showPicker()),
		vscode.commands.registerCommand('pathPicker.copyRealPath', copyRealPath),
		vscode.commands.registerCommand('pathPicker.revealInExplorer', revealInExplorer),
		vscode.workspace.onDidChangeWorkspaceFolders(() => {
			void index.build().then(refreshPicker);
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
