const ESCAPE = /[.*+?^${}()|[\]\\/]/;

function escapeChar(c: string): string {
	return ESCAPE.test(c) ? '\\' + c : c;
}

function globToRegExpSource(glob: string): string {
	let re = '';
	let i = 0;
	while (i < glob.length) {
		const ch = glob[i];
		if (ch === '*') {
			if (glob[i + 1] === '*') {
				i += 2;
				if (glob[i] === '/') {
					re += '(?:.*/)?';
					i++;
				} else {
					re += '.*';
				}
			} else {
				re += '[^/]*';
				i++;
			}
		} else if (ch === '?') {
			re += '[^/]';
			i++;
		} else if (ch === '{') {
			const end = glob.indexOf('}', i);
			if (end > i) {
				re += '(' + glob.slice(i + 1, end).split(',').join('|') + ')';
				i = end + 1;
			} else {
				re += escapeChar(ch);
				i++;
			}
		} else if (ch === '[') {
			const end = glob.indexOf(']', i);
			if (end > i) {
				re += glob.slice(i, end + 1);
				i = end + 1;
			} else {
				re += escapeChar(ch);
				i++;
			}
		} else {
			re += escapeChar(ch);
			i++;
		}
	}
	return re;
}

export function hasGlobChars(query: string): boolean {
	return /[*?{}[]/.test(query);
}

export function globMatch(query: string, rel: string): boolean {
	const prefix = query.startsWith('**') || query.startsWith('/') ? '' : '(?:.*/)?';
	const re = new RegExp('^' + prefix + globToRegExpSource(query) + '$');
	return re.test(rel);
}

export function fuzzyScore(query: string, lower: string): number {
	const q = query.toLowerCase();
	if (q.length === 0) {
		return 1;
	}
	let qi = 0;
	let score = 0;
	let lastMatch = -2;
	for (let i = 0; i < lower.length && qi < q.length; i++) {
		if (lower.charCodeAt(i) === q.charCodeAt(qi)) {
			let s = 1;
			if (i === lastMatch + 1) {
				s = 2;
			}
			const prev = lower[i - 1];
			if (i === 0 || prev === '/' || prev === '-' || prev === '_' || prev === '.' || prev === ' ') {
				s += 2;
			}
			score += s;
			lastMatch = i;
			qi++;
		}
	}
	if (qi < q.length) {
		return 0;
	}
	if (lower.startsWith(q)) {
		score += 6;
	}
	return score;
}
