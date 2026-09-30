/**
 * Pure text helpers for the picker label (no `vscode` import, so this module is
 * unit-checkable with bun — see `tests/units/text_check.ts`).
 */

export const MAX_LABEL_LENGTH = 80;

/**
 * Truncate a path-like label from the **left**, keeping the tail so the
 * filename stays visible. Truncation is segment-aware: whole leading path
 * segments are dropped and a `…/` prefix is added, rather than cutting through
 * a segment. A long unbroken string falls back to a plain right-aligned slice.
 */
export function truncateLeft(rel: string): string {
	if (rel.length <= MAX_LABEL_LENGTH) {
		return rel;
	}
	let out = rel;
	while (out.length > MAX_LABEL_LENGTH) {
		const slash = out.indexOf('/');
		if (slash === -1) {
			return '…' + out.slice(out.length - (MAX_LABEL_LENGTH - 1));
		}
		out = out.slice(slash + 1);
	}
	return '…/' + out;
}
