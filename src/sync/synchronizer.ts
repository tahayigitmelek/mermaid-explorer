import { App, MarkdownView, Notice, TFile } from 'obsidian';
import { MermaidDiagram } from '../types';
import { extractMermaidBlocks } from '../indexing/parser';
import type { MermaidIndexer } from '../indexing/indexer';

export class MermaidSynchronizer {
	private readonly app: App;
	private readonly indexer: MermaidIndexer;

	constructor(app: App, indexer: MermaidIndexer) {
		this.app = app;
		this.indexer = indexer;
	}

	async updateDiagramCode(diagram: MermaidDiagram, nextCode: string): Promise<MermaidDiagram | null> {
		const currentMarkdown = await this.app.vault.read(diagram.file);
		const blocks = extractMermaidBlocks(currentMarkdown);
		const currentBlock = blocks[diagram.blockIndex];

		if (!currentBlock) {
			new Notice('Mermaid explorer could not find the original diagram block.');
			await this.indexer.indexFile(diagram.file);
			return null;
		}

		const normalizedCode = normalizeCodeForFence(nextCode);
		const updatedMarkdown =
			currentMarkdown.slice(0, currentBlock.codeStartOffset) +
			normalizedCode +
			currentMarkdown.slice(currentBlock.codeEndOffset);

		await this.app.vault.modify(diagram.file, updatedMarkdown);
		await this.indexer.indexFile(diagram.file, false);

		return this.indexer.getDiagram(`${diagram.file.path}::${diagram.blockIndex}`);
	}

	async openSource(diagram: MermaidDiagram): Promise<void> {
		await this.app.workspace.getLeaf(false).openFile(diagram.file, { active: true });
	}

	async openInContext(diagram: MermaidDiagram): Promise<void> {
		await this.openSource(diagram);

		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view) {
			return;
		}

		const editor = view.editor;
		const from = { line: diagram.startLine, ch: 0 };
		const to = { line: diagram.endLine, ch: Number.MAX_SAFE_INTEGER };
		editor.setSelection(from, to);
		editor.scrollIntoView({ from, to }, true);
		editor.focus();
	}

	revealInFileExplorer(file: TFile): void {
		const fileExplorerLeaf = this.app.workspace.getLeavesOfType('file-explorer')[0];
		const fileExplorerView = fileExplorerLeaf?.view as
			| {
					revealInFolder?: (target: TFile) => void;
			  }
			| undefined;

		if (fileExplorerView?.revealInFolder) {
			fileExplorerView.revealInFolder(file);
			return;
		}

		new Notice('File explorer is not available.');
	}
}

function normalizeCodeForFence(code: string): string {
	const trimmedRight = code.replace(/\s+$/, '');
	return `${trimmedRight}\n`;
}
