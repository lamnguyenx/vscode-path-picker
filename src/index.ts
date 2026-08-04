import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { fuzzyScore, globMatch } from './fuzzy';
import { relativeToRoot, toPosix } from './paths';

export interface IndexEntry {
	abs: string;
	rel: string;
	lowerRel: string;
	isDir: boolean;
}

export interface IndexConfig {
	exclude: string[];
	maxEntries: number;
}

export class PathIndex {
	private entries: IndexEntry[] = [];
	private readonly folders: readonly vscode.WorkspaceFolder[] = [];
	private buildToken = 0;

	constructor(private readonly getConfig: () => IndexConfig) {
		this.folders = vscode.workspace.workspaceFolders ?? [];
	}

	get roots(): string[] {
		return this.folders.map(f => f.uri.fsPath);
	}

	get isEmpty(): boolean {
		return this.folders.length === 0;
	}

	async build(): Promise<void> {
		const token = ++this.buildToken;
		const cfg = this.getConfig();
		const all: IndexEntry[] = [];

		for (const folder of this.folders) {
			if (token !== this.buildToken || all.length >= cfg.maxEntries) {
				break;
			}
			const root = folder.uri.fsPath;
			try {
				const files = await vscode.workspace.findFiles(
					new vscode.RelativePattern(folder, '**/*'),
					undefined,
					Math.max(0, cfg.maxEntries - all.length)
				);
				for (const uri of files) {
					if (all.length >= cfg.maxEntries) {
						break;
					}
					all.push(this.makeEntry(uri.fsPath, root, false));
				}
			} catch {
				// ignore unreadable roots
			}
			await this.walk(root, root, all, cfg);
		}

		if (token !== this.buildToken) {
			return;
		}
		this.entries = all;
	}

	private makeEntry(abs: string, root: string, isDir: boolean): IndexEntry {
		const rel = relativeToRoot(abs, root);
		return { abs, rel, lowerRel: rel.toLowerCase(), isDir };
	}

	private async walk(dir: string, root: string, all: IndexEntry[], cfg: IndexConfig): Promise<void> {
		if (all.length >= cfg.maxEntries) {
			return;
		}
		let children: fs.Dirent[];
		try {
			children = await fs.promises.readdir(dir, { withFileTypes: true });
		} catch {
			return;
		}
		children.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
		for (const child of children) {
			if (all.length >= cfg.maxEntries) {
				return;
			}
			if (child.isDirectory()) {
				if (cfg.exclude.includes(child.name)) {
					continue;
				}
				const abs = path.join(dir, child.name);
				all.push(this.makeEntry(abs, root, true));
				await this.walk(abs, root, all, cfg);
			} else if (child.isFile()) {
				all.push(this.makeEntry(path.join(dir, child.name), root, false));
			}
		}
	}

	entriesFor(query: string, isGlob: boolean): IndexEntry[] {
		if (query === '') {
			return this.rootChildren();
		}
		if (isGlob) {
			const out: IndexEntry[] = [];
			for (const e of this.entries) {
				if (out.length >= 1000) {
					break;
				}
				if (this.matchesGlob(query, e)) {
					out.push(e);
				}
			}
			out.sort((a, b) => a.rel.length - b.rel.length || a.rel.localeCompare(b.rel));
			return out;
		}
		const scored: Array<{ e: IndexEntry; s: number }> = [];
		for (const e of this.entries) {
			const s = this.score(query, e);
			if (s > 0) {
				scored.push({ e, s });
			}
		}
		scored.sort((a, b) => b.s - a.s || a.e.rel.length - b.e.rel.length || a.e.rel.localeCompare(b.e.rel));
		return scored.slice(0, 1000).map(x => x.e);
	}

	private matchesGlob(query: string, e: IndexEntry): boolean {
		return globMatch(query, e.rel);
	}

	private score(query: string, e: IndexEntry): number {
		return fuzzyScore(query, e.lowerRel);
	}

	private rootChildren(): IndexEntry[] {
		const out: IndexEntry[] = [];
		for (const e of this.entries) {
			if (out.length >= 500) {
				break;
			}
			if (!e.rel.includes('/')) {
				out.push(e);
			}
		}
		out.sort((a, b) => Number(b.isDir) - Number(a.isDir) || a.rel.localeCompare(b.rel));
		return out;
	}

	descriptionOf(e: IndexEntry): string {
		const idx = e.rel.lastIndexOf('/');
		return idx > 0 ? toPosix(e.rel.slice(0, idx)) : '';
	}
}
