import type { MermaidDiagram } from '../types';
import { countBy, sortedCounts } from './viewHelpers';

export function renderDashboard(
	parent: HTMLElement,
	diagrams: MermaidDiagram[],
	onOpenNote: (diagram: MermaidDiagram) => void | Promise<void>,
): void {
	parent.empty();
	parent.addClass('mermaid-explorer-dashboard');

	const summary = parent.createDiv({ cls: 'mermaid-explorer-stat-grid' });
	createStat(summary, 'Total diagrams', String(diagrams.length));
	createStat(summary, 'Notes with diagrams', String(new Set(diagrams.map((d) => d.filePath)).size));
	createStat(summary, 'Folders', String(new Set(diagrams.map((d) => d.folder)).size));
	createStat(summary, 'Diagram types', String(new Set(diagrams.map((d) => d.type)).size));

	const columns = parent.createDiv({ cls: 'mermaid-explorer-dashboard-columns' });
	renderCountSection(columns, 'By type', sortedCounts(countBy(diagrams, (d) => d.type)));
	renderMostActiveNotes(columns, diagrams, onOpenNote);
}

function createStat(parent: HTMLElement, label: string, value: string): void {
	const stat = parent.createDiv({ cls: 'mermaid-explorer-stat' });
	stat.createDiv({ cls: 'mermaid-explorer-stat-value', text: value });
	stat.createDiv({ cls: 'mermaid-explorer-stat-label', text: label });
}

function renderCountSection(
	parent: HTMLElement,
	title: string,
	rows: Array<[string, number]>,
): void {
	const section = parent.createDiv({ cls: 'mermaid-explorer-dashboard-section' });
	section.createEl('h3', { text: title });

	for (const [label, count] of rows.slice(0, 10)) {
		const row = section.createDiv({ cls: 'mermaid-explorer-dashboard-row' });
		row.createSpan({ text: label });
		row.createSpan({ text: String(count) });
	}
}

function renderMostActiveNotes(
	parent: HTMLElement,
	diagrams: MermaidDiagram[],
	onOpenNote: (diagram: MermaidDiagram) => void | Promise<void>,
): void {
	const section = parent.createDiv({ cls: 'mermaid-explorer-dashboard-section' });
	section.createEl('h3', { text: 'Most active notes' });
	const firstDiagramByPath = new Map<string, MermaidDiagram>();
	for (const diagram of diagrams) {
		if (!firstDiagramByPath.has(diagram.filePath)) {
			firstDiagramByPath.set(diagram.filePath, diagram);
		}
	}

	for (const [filePath, count] of sortedCounts(countBy(diagrams, (d) => d.filePath)).slice(0, 10)) {
		const diagram = firstDiagramByPath.get(filePath);
		if (!diagram) {
			continue;
		}

		const row = section.createEl('button', {
			cls: 'mermaid-explorer-dashboard-row mermaid-explorer-dashboard-row-button',
			attr: {
				type: 'button',
				title: filePath,
			},
		});
		row.createSpan({ text: diagram.noteTitle });
		row.createSpan({ text: String(count) });
		row.addEventListener('click', () => {
			void onOpenNote(diagram);
		});
	}
}
