import * as path from 'path';
import * as fs from 'fs';

export function toPosix(p: string): string {
	return p.split(path.sep).join('/');
}

export async function realPath(abs: string): Promise<string> {
	try {
		return await fs.promises.realpath(abs);
	} catch {
		return abs;
	}
}

export function rootOf(abs: string, roots: string[]): string | undefined {
	let best: string | undefined;
	for (const root of roots) {
		const rel = path.relative(root, abs);
		if (rel.startsWith('..') || path.isAbsolute(rel)) {
			continue;
		}
		if (!best || root.length > best.length) {
			best = root;
		}
	}
	return best;
}

export function relativeToRoot(abs: string, root: string): string {
	return toPosix(path.relative(root, abs));
}
