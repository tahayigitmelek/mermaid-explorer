import { setIcon } from 'obsidian';
import type { MermaidDiagram } from '../types';

export function createIconButton(
	parent: HTMLElement,
	icon: string,
	label: string,
	onClick: () => void | Promise<void>,
): HTMLButtonElement {
	const button = parent.createEl('button', {
		cls: 'mermaid-explorer-icon-button',
		attr: {
			'aria-label': label,
			title: label,
			type: 'button',
		},
	});
	setIcon(button, icon);
	button.addEventListener('click', () => {
		void onClick();
	});
	return button;
}

export function createTextButton(
	parent: HTMLElement,
	label: string,
	icon: string,
	onClick: () => void | Promise<void>,
): HTMLButtonElement {
	const button = parent.createEl('button', {
		cls: 'mermaid-explorer-text-button',
		attr: { type: 'button' },
	});
	setIcon(button, icon);
	button.createSpan({ text: label });
	button.addEventListener('click', () => {
		void onClick();
	});
	return button;
}

export function createBadge(parent: HTMLElement, text: string): HTMLElement {
	return parent.createSpan({
		cls: 'mermaid-explorer-badge',
		text,
	});
}

export function formatDate(timestamp: number): string {
	if (!timestamp) {
		return 'Unknown';
	}

	return new Date(timestamp).toLocaleString();
}

export function getExportBaseName(diagram: MermaidDiagram): string {
	return `${diagram.noteTitle}-diagram-${diagram.blockIndex + 1}`
		.replace(/[^\w.-]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.toLowerCase();
}

export function countBy<T>(values: T[], getKey: (value: T) => string): Map<string, number> {
	const counts = new Map<string, number>();

	for (const value of values) {
		const key = getKey(value) || 'Unknown';
		counts.set(key, (counts.get(key) ?? 0) + 1);
	}

	return counts;
}

export function sortedCounts(counts: Map<string, number>): Array<[string, number]> {
	return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}
