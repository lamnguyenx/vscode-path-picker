import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { fuzzyScore, globMatch } from './fuzzy';
import { isIgnored, loadGitignore, IgnoreLayer } from './gitignore';
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
	followSymlinks: boolean;
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
			const seenFiles = new Set<string>();
			const layers: IgnoreLayer[] = [];
			const rootIgnore = await loadGitignore(root);
			if (rootIgnore) {
				layers.push(rootIgnore);
			}
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
					if (isIgnored(uri.fsPath, layers)) {
						continue;
					}
					seenFiles.add(uri.fsPath);
					all.push(this.makeEntry(uri.fsPath, root, false));
				}
			} catch {
				// ignore unreadable roots
			}
			await this.walk(root, root, all, cfg, layers, new Set(), seenFiles);
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

	private async walk(
		dir: string,
		root: string,
		all: IndexEntry[],
		cfg: IndexConfig,
		layers: IgnoreLayer[],
		visitedDirs: Set<string>,
		seenFiles: Set<string>
	): Promise<void> {
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
		let childLayers = layers;
		if (children.some(c => c.name === '.gitignore' && !c.isDirectory())) {
			const ignoreLayer = await loadGitignore(dir);
			if (ignoreLayer) {
				childLayers = [...layers, ignoreLayer];
			}
		}
		for (const child of children) {
			if (all.length >= cfg.maxEntries) {
				return;
			}
			if (child.name === '.gitignore') {
				continue;
			}
			const abs = path.join(dir, child.name);
			if (child.isSymbolicLink()) {
				if (!cfg.followSymlinks) {
					continue;
				}
				let target: fs.Stats;
				try {
					target = await fs.promises.stat(abs);
				} catch {
					continue;
				}
				if (isIgnored(abs, childLayers, target.isDirectory())) {
					continue;
				}
				if (target.isDirectory()) {
					if (cfg.exclude.includes(child.name)) {
						continue;
					}
					let real = abs;
					try {
						real = await fs.promises.realpath(abs);
					} catch {
						// keep the link path
					}
					if (visitedDirs.has(real)) {
						continue;
					}
					visitedDirs.add(real);
					all.push(this.makeEntry(abs, root, true));
					await this.walk(abs, root, all, cfg, childLayers, visitedDirs, seenFiles);
				} else if (target.isFile()) {
					if (!seenFiles.has(abs)) {
						seenFiles.add(abs);
						all.push(this.makeEntry(abs, root, false));
					}
				}
				continue;
			}
			if (isIgnored(abs, childLayers, child.isDirectory())) {
				continue;
			}
			if (child.isDirectory()) {
				if (cfg.exclude.includes(child.name)) {
					continue;
				}
				all.push(this.makeEntry(abs, root, true));
				await this.walk(abs, root, all, cfg, childLayers, visitedDirs, seenFiles);
			} else if (child.isFile()) {
				// files are indexed via findFiles; only symlinked files are added here
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
