import type { DiagramFilters, MermaidDiagram } from '../types';

export const DEFAULT_FILTERS: DiagramFilters = {
	query: '',
	folder: '',
	note: '',
	type: '',
	tag: '',
	sortBy: 'modified',
	sortDirection: 'desc',
};

export function applyFilters(
	diagrams: MermaidDiagram[],
	filters: DiagramFilters,
): MermaidDiagram[] {
	const query = filters.query.trim().toLowerCase();

	return diagrams
		.filter((diagram) => {
			if (filters.folder && diagram.folder !== filters.folder) return false;
			if (filters.note && diagram.filePath !== filters.note) return false;
			if (filters.type && diagram.type !== filters.type) return false;
			if (filters.tag && !diagram.tags.includes(filters.tag)) return false;
			if (!query) return true;

			const searchable = [
				diagram.code,
				diagram.noteTitle,
				diagram.filePath,
				diagram.folder,
				diagram.type,
				...diagram.tags,
			]
				.join(' ')
				.toLowerCase();

			return searchable.includes(query);
		})
		.sort((a, b) => compareDiagrams(a, b, filters));
}

export function uniqueSorted(values: string[]): string[] {
	return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function compareDiagrams(
	a: MermaidDiagram,
	b: MermaidDiagram,
	filters: DiagramFilters,
): number {
	const direction = filters.sortDirection === 'asc' ? 1 : -1;

	switch (filters.sortBy) {
		case 'title':
			return direction * a.noteTitle.localeCompare(b.noteTitle);
		case 'path':
			return direction * a.filePath.localeCompare(b.filePath);
		case 'type':
			return direction * a.type.localeCompare(b.type);
		case 'modified':
			return direction * (a.updatedAt - b.updatedAt);
	}

	return 0;
}
