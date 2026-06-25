import type { TFile } from 'obsidian';

export const VIEW_TYPE_MERMAID_EXPLORER = 'mermaid-explorer-view';

export type DiagramType =
	| 'Flowchart'
	| 'Sequence diagram'
	| 'Class diagram'
	| 'State diagram'
	| 'ER diagram'
	| 'Journey'
	| 'Gantt'
	| 'Mindmap'
	| 'Timeline'
	| 'Git graph'
	| 'Sankey'
	| 'Requirement diagram'
	| 'C4 diagram'
	| 'Pie chart'
	| 'Quadrant chart'
	| 'XY chart'
	| 'Block diagram'
	| 'Packet diagram'
	| 'Architecture diagram'
	| 'Unknown';

export interface MermaidBlock {
	blockIndex: number;
	code: string;
	openingFence: string;
	closingFence: string;
	startLine: number;
	endLine: number;
	startOffset: number;
	endOffset: number;
	codeStartOffset: number;
	codeEndOffset: number;
	type: DiagramType;
}

export interface MermaidDiagram {
	id: string;
	file: TFile;
	filePath: string;
	noteTitle: string;
	folder: string;
	blockIndex: number;
	code: string;
	openingFence: string;
	closingFence: string;
	startLine: number;
	endLine: number;
	startOffset: number;
	endOffset: number;
	codeStartOffset: number;
	codeEndOffset: number;
	type: DiagramType;
	tags: string[];
	createdAt: number;
	updatedAt: number;
	indexedAt: number;
	contentHash: string;
}

export interface MermaidIndexSnapshot {
	diagrams: MermaidDiagram[];
	indexedFiles: number;
	lastIndexedAt: number;
	progress: MermaidIndexProgress;
}

export interface MermaidIndexProgress {
	isIndexing: boolean;
	completedFiles: number;
	totalFiles: number;
	currentPath: string;
	startedAt: number;
}

export type SerializedMermaidDiagram = Omit<MermaidDiagram, 'file'>;

export interface MermaidIndexCache {
	version: 1;
	diagrams: SerializedMermaidDiagram[];
	indexedFileStats: Array<{
		path: string;
		mtime: number;
	}>;
	lastIndexedAt: number;
}

export interface MermaidExplorerPluginData {
	settings: MermaidExplorerSettings;
	indexCache?: MermaidIndexCache;
}

export interface DiagramFilters {
	query: string;
	folder: string;
	note: string;
	type: string;
	tag: string;
	sortBy: MermaidSortKey;
	sortDirection: 'asc' | 'desc';
}

export type MermaidSortKey = 'modified' | 'title' | 'path' | 'type';

export interface MermaidExplorerSettings {
	autoIndexing: boolean;
	refreshIntervalMinutes: number;
	liveSynchronization: boolean;
	generateThumbnails: boolean;
	defaultZoomLevel: number;
	defaultLayout: 'viewer' | 'editor' | 'dashboard';
	exportScale: number;
	exportBackground: string;
}

export interface MermaidExplorerViewState extends Record<string, unknown> {
	selectedDiagramId?: string;
	mode?: 'viewer' | 'editor' | 'dashboard';
}
