import * as fs from 'fs';
import * as path from 'path';
import ignore = require('ignore');

export interface IgnoreLayer {
	base: string;
	ig: ignore.Ignore;
}

export async function loadGitignore(dir: string): Promise<IgnoreLayer | undefined> {
	try {
		const content = await fs.promises.readFile(path.join(dir, '.gitignore'), 'utf8');
		return { base: dir, ig: ignore().add(content) };
	} catch {
		return undefined;
	}
}

export function isIgnored(abs: string, layers: readonly IgnoreLayer[], isDir = false): boolean {
	const suffix = isDir ? '/' : '';
	let decision: boolean | undefined;
	for (const layer of layers) {
		const rel = path.relative(layer.base, abs);
		if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
			continue;
		}
		const t = layer.ig.test(rel + suffix);
		if (t.ignored || t.unignored) {
			decision = t.ignored;
		}
	}
	return decision ?? false;
}
