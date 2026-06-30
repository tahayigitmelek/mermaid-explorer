import { ItemView, WorkspaceLeaf } from 'obsidian';
import type MermaidExplorerPlugin from '../main';
import type {
	DiagramFilters,
	MermaidDiagram,
	MermaidExplorerViewState,
	MermaidIndexProgress,
	MermaidIndexSnapshot,
} from '../types';
import { VIEW_TYPE_MERMAID_EXPLORER } from '../types';
import { downloadPng, downloadSvg, copyRenderedImage, copyText } from './export';
import { DEFAULT_FILTERS, applyFilters, uniqueSorted } from './filtering';
import { renderMermaid } from './mermaidRenderer';
import {
	createBadge,
	createIconButton,
	createTextButton,
	formatDate,
	getExportBaseName,
} from './viewHelpers';
import { renderDashboard } from './dashboard';

const MAX_LIST_ITEMS = 500;
const MAX_RENDERED_THUMBNAILS = 40;

export class MermaidExplorerView extends ItemView {
	private readonly plugin: MermaidExplorerPlugin;
	private filters: DiagramFilters = { ...DEFAULT_FILTERS };
	private mode: 'viewer' | 'editor' | 'dashboard';
	private selectedDiagramId: string | null = null;
	private zoom = 1;
	private currentSvg = '';
	private editorValue = '';
	private editorHistory: string[] = [];
	private editorHistoryIndex = -1;
	private renderTimer: number | null = null;
	private syncTimer: number | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: MermaidExplorerPlugin) {
		super(leaf);
		this.plugin = plugin;
		this.mode = plugin.settings.defaultLayout;
		this.zoom = plugin.settings.defaultZoomLevel;
	}

	getViewType(): string {
		return VIEW_TYPE_MERMAID_EXPLORER;
	}

	getDisplayText(): string {
		return 'Mermaid explorer';
	}

	getIcon(): string {
		return 'workflow';
	}

	async onOpen(): Promise<void> {
		this.registerDomEvent(this.contentEl, 'keydown', (event) => {
			this.handleKeydown(event);
		});

		const unsubscribe = this.plugin.indexer.onChange(() => {
			this.render();
		});
		this.register(unsubscribe);
		this.registerThemeObserver();
		this.register(() => this.clearTimers());
		this.render();
	}

	async onClose(): Promise<void> {
		this.clearTimers();
	}

	async setState(state: MermaidExplorerViewState): Promise<void> {
		this.selectedDiagramId = state.selectedDiagramId ?? this.selectedDiagramId;
		this.mode = state.mode ?? this.mode;
		this.render();
	}

	getState(): MermaidExplorerViewState {
		return {
			selectedDiagramId: this.selectedDiagramId ?? undefined,
			mode: this.mode,
		};
	}

	selectDiagram(id: string): void {
		const diagram = this.plugin.indexer.getDiagram(id);
		if (!diagram) {
			return;
		}

		this.selectedDiagramId = id;
		this.editorValue = diagram.code;
		this.editorHistory = [diagram.code];
		this.editorHistoryIndex = 0;
		this.currentSvg = '';
		this.render();
	}

	refresh(): void {
		this.render();
	}

	private render(): void {
		const root = this.contentEl;
		root.empty();
		root.addClass('mermaid-explorer');
		root.setAttr('tabindex', '0');

		const snapshot = this.plugin.indexer.getSnapshot();
		const diagrams = snapshot.diagrams;
		const selected = this.getSelectedDiagram(diagrams);
		const filtered = applyFilters(diagrams, this.filters);

		this.renderHeader(root, snapshot);
		const body = root.createDiv({ cls: 'mermaid-explorer-body' });
		this.renderSidebar(body, diagrams, filtered, selected);
		this.renderWorkspace(body, diagrams, filtered, selected);
	}

	private registerThemeObserver(): void {
		const observer = new MutationObserver(() => {
			this.currentSvg = '';
			this.render();
		});
		observer.observe(activeDocument.body, {
			attributes: true,
			attributeFilter: ['class'],
		});
		this.register(() => observer.disconnect());
	}

	private renderHeader(parent: HTMLElement, snapshot: MermaidIndexSnapshot): void {
		const header = parent.createDiv({ cls: 'mermaid-explorer-header' });
		const total = snapshot.diagrams.length;
		const titleGroup = header.createDiv({ cls: 'mermaid-explorer-title-group' });
		titleGroup.createEl('h2', { text: 'Mermaid explorer' });
		titleGroup.createDiv({
			cls: 'mermaid-explorer-subtitle',
			text: `${total} diagram${total === 1 ? '' : 's'} indexed`,
		});

		const headerActions = header.createDiv({ cls: 'mermaid-explorer-header-actions' });
		const modeGroup = headerActions.createDiv({ cls: 'mermaid-explorer-segmented' });
		this.createModeButton(modeGroup, 'viewer', 'Viewer');
		this.createModeButton(modeGroup, 'editor', 'Editor');
		this.createModeButton(modeGroup, 'dashboard', 'Dashboard');
		createTextButton(headerActions, 'Refresh now', 'refresh-cw', async () => this.plugin.refreshIndex(true));

		if (snapshot.progress.isIndexing) {
			this.renderIndexProgress(header, snapshot.progress);
		}
	}

	private renderIndexProgress(parent: HTMLElement, progress: MermaidIndexProgress): void {
		const totalFiles = Math.max(progress.totalFiles, 0);
		const completedFiles = Math.min(Math.max(progress.completedFiles, 0), totalFiles);
		const percent = totalFiles > 0 ? Math.round((completedFiles / totalFiles) * 100) : 0;
		const progressEl = parent.createDiv({ cls: 'mermaid-explorer-index-progress' });

		progressEl.createDiv({
			cls: 'mermaid-explorer-index-progress-label',
			text:
				totalFiles > 0
					? `Scanning diagrams ${completedFiles}/${totalFiles} (${percent}%)`
					: 'Scanning diagrams',
		});

		const track = progressEl.createDiv({ cls: 'mermaid-explorer-progress-track' });
		track.setAttr('role', 'progressbar');
		track.setAttr('aria-label', 'Diagram scan progress');
		track.setAttr('aria-valuemin', '0');
		track.setAttr('aria-valuemax', String(Math.max(totalFiles, 1)));
		track.setAttr('aria-valuenow', String(completedFiles));

		const fill = track.createDiv({ cls: 'mermaid-explorer-progress-fill' });
		fill.setAttr('style', `width: ${percent}%;`);

		if (progress.currentPath) {
			progressEl.createDiv({
				cls: 'mermaid-explorer-index-progress-path',
				text: progress.currentPath,
			});
		}
	}

	private renderSidebar(
		parent: HTMLElement,
		allDiagrams: MermaidDiagram[],
		filtered: MermaidDiagram[],
		selected: MermaidDiagram | null,
	): void {
		const sidebar = parent.createDiv({ cls: 'mermaid-explorer-sidebar' });
		const search = sidebar.createEl('input', {
			cls: 'mermaid-explorer-search',
			attr: {
				type: 'search',
				placeholder: 'Search diagrams',
				value: this.filters.query,
			},
		});
		search.addEventListener('input', () => {
			this.filters.query = search.value;
			this.render();
		});

		const filters = sidebar.createDiv({ cls: 'mermaid-explorer-filters' });
		this.renderSelect(filters, 'Folder', this.filters.folder, [
			['', 'All folders'],
			...uniqueSorted(allDiagrams.map((d) => d.folder)).map((folder) => [folder, folder] as [string, string]),
		], (value) => {
			this.filters.folder = value;
		});
		this.renderSelect(filters, 'Note', this.filters.note, [
			['', 'All notes'],
			...uniqueSorted(allDiagrams.map((d) => d.filePath)).map((path) => [path, path] as [string, string]),
		], (value) => {
			this.filters.note = value;
		});
		this.renderSelect(filters, 'Type', this.filters.type, [
			['', 'All types'],
			...uniqueSorted(allDiagrams.map((d) => d.type)).map((type) => [type, type] as [string, string]),
		], (value) => {
			this.filters.type = value;
		});
		this.renderSelect(filters, 'Tag', this.filters.tag, [
			['', 'All tags'],
			...uniqueSorted(allDiagrams.flatMap((d) => d.tags)).map((tag) => [tag, tag] as [string, string]),
		], (value) => {
			this.filters.tag = value;
		});
		this.renderSelect(filters, 'Sort', this.filters.sortBy, [
			['modified', 'Modified'],
			['title', 'Title'],
			['path', 'Path'],
			['type', 'Type'],
		], (value) => {
			this.filters.sortBy = value as DiagramFilters['sortBy'];
		});

		const listHeader = sidebar.createDiv({ cls: 'mermaid-explorer-list-header' });
		listHeader.createSpan({ text: `${filtered.length} result${filtered.length === 1 ? '' : 's'}` });
		createIconButton(listHeader, 'arrow-up-down', 'Reverse sort', () => {
			this.filters.sortDirection = this.filters.sortDirection === 'asc' ? 'desc' : 'asc';
			this.render();
		});

		const list = sidebar.createDiv({ cls: 'mermaid-explorer-list' });
		for (const [index, diagram] of filtered.slice(0, MAX_LIST_ITEMS).entries()) {
			this.renderListItem(list, diagram, selected?.id === diagram.id, index < MAX_RENDERED_THUMBNAILS);
		}

		if (filtered.length > MAX_LIST_ITEMS) {
			list.createDiv({
				cls: 'mermaid-explorer-list-limit',
				text: `Showing the first ${MAX_LIST_ITEMS} results. Narrow the search to see more.`,
			});
		}
	}

	private renderWorkspace(
		parent: HTMLElement,
		allDiagrams: MermaidDiagram[],
		filtered: MermaidDiagram[],
		selected: MermaidDiagram | null,
	): void {
		const workspace = parent.createDiv({ cls: 'mermaid-explorer-workspace' });

		if (this.mode === 'dashboard') {
			renderDashboard(workspace, allDiagrams, (diagram) => this.plugin.synchronizer.openSource(diagram));
			return;
		}

		if (!selected) {
			workspace.createDiv({
				cls: 'mermaid-explorer-empty',
				text: 'No Mermaid diagram selected.',
			});
			return;
		}

		this.renderActionBar(workspace, filtered, selected);
		if (this.mode === 'editor') {
			this.renderEditor(workspace, selected);
			return;
		}
		this.renderViewer(workspace, selected);
	}

	private renderListItem(
		parent: HTMLElement,
		diagram: MermaidDiagram,
		selected: boolean,
		renderThumbnail: boolean,
	): void {
		const item = parent.createDiv({
			cls: [
				'mermaid-explorer-list-item',
				selected ? 'is-selected' : '',
				this.plugin.settings.generateThumbnails ? '' : 'has-no-thumbnail',
			]
				.filter(Boolean)
				.join(' '),
		});
		item.addEventListener('click', () => this.selectDiagram(diagram.id));

		if (this.plugin.settings.generateThumbnails) {
			const thumbnail = item.createDiv({ cls: 'mermaid-explorer-thumbnail' });
			if (renderThumbnail) {
				void renderMermaid(thumbnail, diagram.code, { zoom: 0.35 });
			} else {
				thumbnail.addClass('is-deferred');
			}
		}

		const content = item.createDiv({ cls: 'mermaid-explorer-list-content' });
		content.createDiv({ cls: 'mermaid-explorer-list-title', text: diagram.noteTitle });
		content.createDiv({ cls: 'mermaid-explorer-list-path', text: diagram.filePath });
		createBadge(content, diagram.type);
	}

	private renderActionBar(
		parent: HTMLElement,
		filtered: MermaidDiagram[],
		diagram: MermaidDiagram,
	): void {
		const bar = parent.createDiv({ cls: 'mermaid-explorer-action-bar' });
		createIconButton(bar, 'chevron-left', 'Previous diagram', () => this.moveSelection(filtered, -1));
		createIconButton(bar, 'chevron-right', 'Next diagram', () => this.moveSelection(filtered, 1));
		createTextButton(bar, 'Open source note', 'file-text', () => this.plugin.synchronizer.openSource(diagram));
		createIconButton(bar, 'folder-open', 'Reveal in file explorer', () => {
			this.plugin.synchronizer.revealInFileExplorer(diagram.file);
		});
		createIconButton(bar, 'copy', 'Copy diagram code', async () => {
			await copyText(diagram.code, 'Diagram code copied.');
		});
		createIconButton(bar, 'image', 'Copy rendered image', async () => {
			await copyRenderedImage(
				this.currentSvg,
				this.plugin.settings.exportScale,
				this.plugin.settings.exportBackground,
			);
		});
		createIconButton(bar, 'file-code-2', 'Export SVG', () => {
			downloadSvg(this.currentSvg, getExportBaseName(diagram));
		});
		createIconButton(bar, 'file-image', 'Export PNG', async () => {
			await downloadPng(
				this.currentSvg,
				getExportBaseName(diagram),
				this.plugin.settings.exportScale,
				this.plugin.settings.exportBackground,
			);
		});
	}

	private renderViewer(parent: HTMLElement, diagram: MermaidDiagram): void {
		const detail = parent.createDiv({ cls: 'mermaid-explorer-detail' });
		const previewColumn = detail.createDiv({ cls: 'mermaid-explorer-preview-column' });
		const previewTools = previewColumn.createDiv({ cls: 'mermaid-explorer-preview-tools' });
		createIconButton(previewTools, 'zoom-in', 'Zoom in', () => this.updateZoom(0.1));
		createIconButton(previewTools, 'zoom-out', 'Zoom out', () => this.updateZoom(-0.1));

		const previewFrame = previewColumn.createDiv({ cls: 'mermaid-explorer-preview-frame' });
		createIconButton(previewTools, 'maximize', 'Fullscreen', async () => {
			await previewFrame.requestFullscreen?.();
		});
		void renderMermaid(previewFrame, diagram.code, { zoom: this.zoom }).then((result) => {
			if (this.selectedDiagramId === diagram.id) {
				this.currentSvg = result.svg;
			}
		});

		this.renderMetadata(detail.createDiv({ cls: 'mermaid-explorer-metadata' }), diagram);
	}

	private renderEditor(parent: HTMLElement, diagram: MermaidDiagram): void {
		if (!this.editorValue || this.selectedDiagramId !== diagram.id) {
			this.editorValue = diagram.code;
			this.editorHistory = [diagram.code];
			this.editorHistoryIndex = 0;
		}

		const editor = parent.createDiv({ cls: 'mermaid-explorer-editor' });
		const sourcePane = editor.createDiv({ cls: 'mermaid-explorer-source-pane' });
		const editorTools = sourcePane.createDiv({ cls: 'mermaid-explorer-editor-tools' });
		createIconButton(editorTools, 'undo-2', 'Undo', () => this.restoreEditorHistory(-1));
		createIconButton(editorTools, 'redo-2', 'Redo', () => this.restoreEditorHistory(1));

		const shell = sourcePane.createDiv({ cls: 'mermaid-explorer-code-shell' });
		const highlight = shell.createEl('pre', { cls: 'mermaid-explorer-highlight' });
		const textarea = shell.createEl('textarea', {
			cls: 'mermaid-explorer-code-editor',
			text: this.editorValue,
			attr: {
				spellcheck: 'false',
				'aria-label': 'Mermaid source code',
			},
		});
		this.updateHighlight(highlight, this.editorValue);

		const previewPane = editor.createDiv({ cls: 'mermaid-explorer-live-preview' });
		const errorEl = sourcePane.createDiv({ cls: 'mermaid-explorer-editor-error' });
		const renderPreview = () => {
			void renderMermaid(previewPane, textarea.value, { zoom: 1 }).then((result) => {
				errorEl.setText(result.error ?? '');
				this.currentSvg = result.svg;
			});
		};

		textarea.addEventListener('scroll', () => {
			highlight.scrollTop = textarea.scrollTop;
			highlight.scrollLeft = textarea.scrollLeft;
		});
		textarea.addEventListener('input', () => {
			this.editorValue = textarea.value;
			this.pushEditorHistory(textarea.value);
			this.updateHighlight(highlight, textarea.value);
			this.scheduleEditorRender(renderPreview);
			this.scheduleSourceSync(diagram, textarea.value);
		});

		renderPreview();
	}

	private renderMetadata(parent: HTMLElement, diagram: MermaidDiagram): void {
		parent.createEl('h3', { text: 'Source' });
		this.renderMetadataRow(parent, 'Note', diagram.noteTitle);
		this.renderMetadataRow(parent, 'Path', diagram.filePath);
		this.renderMetadataRow(parent, 'Folder', diagram.folder);
		this.renderMetadataRow(parent, 'Type', diagram.type);
		this.renderMetadataRow(parent, 'Created', formatDate(diagram.createdAt));
		this.renderMetadataRow(parent, 'Modified', formatDate(diagram.updatedAt));
		this.renderMetadataRow(parent, 'Block', `Lines ${diagram.startLine + 1}-${diagram.endLine + 1}`);

		if (diagram.tags.length > 0) {
			const tags = parent.createDiv({ cls: 'mermaid-explorer-metadata-tags' });
			for (const tag of diagram.tags) {
				createBadge(tags, tag);
			}
		}
	}

	private renderMetadataRow(parent: HTMLElement, label: string, value: string): void {
		const row = parent.createDiv({ cls: 'mermaid-explorer-metadata-row' });
		row.createSpan({ text: label });
		row.createSpan({ text: value });
	}

	private renderSelect(
		parent: HTMLElement,
		label: string,
		value: string,
		options: Array<[string, string]>,
		onChange: (value: string) => void,
	): void {
		const wrapper = parent.createDiv({ cls: 'mermaid-explorer-select' });
		wrapper.createSpan({ text: label });
		const select = wrapper.createEl('select');
		for (const [optionValue, optionLabel] of options) {
			select.createEl('option', {
				text: optionLabel,
				value: optionValue,
			});
		}
		select.value = value;
		select.addEventListener('change', () => {
			onChange(select.value);
			this.render();
		});
	}

	private createModeButton(parent: HTMLElement, mode: typeof this.mode, label: string): void {
		const button = parent.createEl('button', {
			text: label,
			cls: this.mode === mode ? 'is-active' : '',
			attr: {
				type: 'button',
				'aria-pressed': String(this.mode === mode),
			},
		});
		button.addEventListener('click', () => {
			this.mode = mode;
			this.render();
		});
	}

	private getSelectedDiagram(diagrams: MermaidDiagram[]): MermaidDiagram | null {
		const selected = diagrams.find((diagram) => diagram.id === this.selectedDiagramId);
		if (selected) {
			return selected;
		}

		const first = diagrams[0] ?? null;
		this.selectedDiagramId = first?.id ?? null;
		if (first && !this.editorValue) {
			this.editorValue = first.code;
		}
		return first;
	}

	private moveSelection(diagrams: MermaidDiagram[], direction: -1 | 1): void {
		if (diagrams.length === 0) {
			return;
		}

		const currentIndex = diagrams.findIndex((diagram) => diagram.id === this.selectedDiagramId);
		const nextIndex = currentIndex < 0 ? 0 : (currentIndex + direction + diagrams.length) % diagrams.length;
		const next = diagrams[nextIndex];
		if (next) {
			this.selectDiagram(next.id);
		}
	}

	private updateZoom(delta: number): void {
		this.zoom = Math.min(3, Math.max(0.25, this.zoom + delta));
		this.render();
	}

	private scheduleEditorRender(renderPreview: () => void): void {
		if (this.renderTimer !== null) {
			window.clearTimeout(this.renderTimer);
		}
		this.renderTimer = window.setTimeout(renderPreview, 250);
	}

	private scheduleSourceSync(diagram: MermaidDiagram, code: string): void {
		if (!this.plugin.settings.liveSynchronization) {
			return;
		}

		if (this.syncTimer !== null) {
			window.clearTimeout(this.syncTimer);
		}

		this.syncTimer = window.setTimeout(() => {
			void this.plugin.synchronizer.updateDiagramCode(diagram, code).then((updated) => {
				if (updated) {
					this.selectedDiagramId = updated.id;
				}
			});
		}, 700);
	}

	private pushEditorHistory(value: string): void {
		if (this.editorHistory[this.editorHistoryIndex] === value) {
			return;
		}

		this.editorHistory = this.editorHistory.slice(0, this.editorHistoryIndex + 1);
		this.editorHistory.push(value);
		this.editorHistoryIndex = this.editorHistory.length - 1;
	}

	private restoreEditorHistory(direction: -1 | 1): void {
		const nextIndex = this.editorHistoryIndex + direction;
		const nextValue = this.editorHistory[nextIndex];
		if (nextValue === undefined) {
			return;
		}
		this.editorHistoryIndex = nextIndex;
		this.editorValue = nextValue;
		this.render();
	}

	private updateHighlight(pre: HTMLPreElement, code: string): void {
		pre.empty();
		for (const line of code.split('\n')) {
			const lineEl = pre.createDiv({ cls: 'mermaid-explorer-highlight-line' });
			const trimmed = line.trimStart();
			const cls = getHighlightClass(trimmed);
			lineEl.createSpan({ cls, text: line || ' ' });
		}
	}

	private handleKeydown(event: KeyboardEvent): void {
		if (event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLInputElement) {
			return;
		}

		const diagrams = applyFilters(this.plugin.indexer.getDiagrams(), this.filters);
		if (event.key === 'ArrowDown' || event.key === 'j') {
			event.preventDefault();
			this.moveSelection(diagrams, 1);
		}
		if (event.key === 'ArrowUp' || event.key === 'k') {
			event.preventDefault();
			this.moveSelection(diagrams, -1);
		}
		if (event.key === 'e') {
			this.mode = 'editor';
			this.render();
		}
		if (event.key === 'v') {
			this.mode = 'viewer';
			this.render();
		}
	}

	private clearTimers(): void {
		if (this.renderTimer !== null) {
			window.clearTimeout(this.renderTimer);
			this.renderTimer = null;
		}
		if (this.syncTimer !== null) {
			window.clearTimeout(this.syncTimer);
			this.syncTimer = null;
		}
	}
}

function getHighlightClass(trimmedLine: string): string {
	if (trimmedLine.startsWith('%%')) return 'token-comment';
	if (/^(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|erDiagram|journey|gantt|mindmap|timeline|gitGraph)/i.test(trimmedLine)) {
		return 'token-keyword';
	}
	if (/-->|---|-.->|==>/.test(trimmedLine)) return 'token-edge';
	if (/^(participant|actor|class|state|section|title|accTitle|accDescr)\b/i.test(trimmedLine)) {
		return 'token-declaration';
	}
	return 'token-text';
}
