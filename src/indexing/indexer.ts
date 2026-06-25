import { App, EventRef, Notice, Plugin, TAbstractFile, TFile } from 'obsidian';
import {
	MermaidDiagram,
	MermaidIndexCache,
	MermaidIndexProgress,
	MermaidIndexSnapshot,
	SerializedMermaidDiagram,
} from '../types';
import { hashText } from '../utils/hash';
import { extractMermaidBlocks, getTagsFromCache } from './parser';

type IndexChangeListener = (snapshot: MermaidIndexSnapshot) => void;
type IndexCacheChangeListener = () => void;
type ReindexResult = 'completed' | 'busy' | 'failed';
export interface CacheLoadResult {
	loadedDiagrams: number;
	skippedDiagrams: number;
	indexedFiles: number;
}

export class MermaidIndexer {
	private readonly app: App;
	private readonly plugin: Plugin;
	private readonly diagramsByFile = new Map<string, MermaidDiagram[]>();
	private readonly indexedMtimes = new Map<string, number>();
	private readonly listeners = new Set<IndexChangeListener>();
	private readonly cacheListeners = new Set<IndexCacheChangeListener>();
	private readonly pendingTimers = new Map<string, number>();
	private isIndexing = false;
	private lastIndexedAt = 0;
	private indexProgress: MermaidIndexProgress = createIdleProgress();
	private lastProgressEmittedAt = 0;

	constructor(app: App, plugin: Plugin) {
		this.app = app;
		this.plugin = plugin;
	}

	registerVaultEvents(): void {
		this.registerEvent(
			this.app.vault.on('rename', (file, oldPath) => {
				this.removeFile(oldPath);
				this.queueFileIndex(file);
			}),
		);

		this.registerEvent(
			this.app.vault.on('delete', (file) => {
				this.removeFile(file.path);
			}),
		);

		this.plugin.register(() => {
			for (const timer of this.pendingTimers.values()) {
				window.clearTimeout(timer);
			}
			this.pendingTimers.clear();
		});
	}

	loadCache(cache: MermaidIndexCache | undefined): CacheLoadResult {
		if (!cache) {
			return {
				loadedDiagrams: 0,
				skippedDiagrams: 0,
				indexedFiles: this.indexedMtimes.size,
			};
		}

		const nextDiagramsByFile = new Map<string, MermaidDiagram[]>();
		const nextIndexedMtimes = new Map<string, number>();
		let loadedDiagrams = 0;
		let skippedDiagrams = 0;

		for (const stat of cache.indexedFileStats) {
			const file = this.app.vault.getAbstractFileByPath(stat.path);
			if (file instanceof TFile) {
				nextIndexedMtimes.set(stat.path, stat.mtime);
			}
		}

		for (const serialized of cache.diagrams) {
			const file = this.app.vault.getAbstractFileByPath(serialized.filePath);
			if (!(file instanceof TFile)) {
				skippedDiagrams += 1;
				continue;
			}

			const diagram = this.deserializeDiagram(serialized, file);
			const diagrams = nextDiagramsByFile.get(file.path) ?? [];
			diagrams.push(diagram);
			nextDiagramsByFile.set(file.path, diagrams);
			nextIndexedMtimes.set(file.path, serialized.updatedAt);
			loadedDiagrams += 1;
		}

		if (cache.diagrams.length > 0 && loadedDiagrams === 0) {
			return {
				loadedDiagrams,
				skippedDiagrams,
				indexedFiles: this.indexedMtimes.size,
			};
		}

		this.diagramsByFile.clear();
		for (const [path, diagrams] of nextDiagramsByFile) {
			this.diagramsByFile.set(path, diagrams);
		}

		this.indexedMtimes.clear();
		for (const [path, mtime] of nextIndexedMtimes) {
			this.indexedMtimes.set(path, mtime);
		}

		this.lastIndexedAt = cache.lastIndexedAt;
		this.emitChange();
		return {
			loadedDiagrams,
			skippedDiagrams,
			indexedFiles: this.indexedMtimes.size,
		};
	}

	toCache(): MermaidIndexCache {
		return {
			version: 1,
			diagrams: this.getDiagrams().map(serializeDiagram),
			indexedFileStats: [...this.indexedMtimes.entries()].map(([path, mtime]) => ({ path, mtime })),
			lastIndexedAt: this.lastIndexedAt,
		};
	}

	onChange(listener: IndexChangeListener): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	onCacheChange(listener: IndexCacheChangeListener): () => void {
		this.cacheListeners.add(listener);
		return () => this.cacheListeners.delete(listener);
	}

	getSnapshot(): MermaidIndexSnapshot {
		return {
			diagrams: this.getDiagrams(),
			indexedFiles: this.indexedMtimes.size,
			lastIndexedAt: this.lastIndexedAt,
			progress: { ...this.indexProgress },
		};
	}

	getDiagrams(): MermaidDiagram[] {
		return [...this.diagramsByFile.values()]
			.flat()
			.sort((a, b) => b.updatedAt - a.updatedAt || a.filePath.localeCompare(b.filePath));
	}

	getDiagram(id: string): MermaidDiagram | null {
		return this.getDiagrams().find((diagram) => diagram.id === id) ?? null;
	}

	async reindexVault(): Promise<ReindexResult> {
		if (this.isIndexing) {
			return 'busy';
		}

		this.isIndexing = true;
		try {
			const markdownFiles = this.app.vault.getMarkdownFiles();
			const livePaths = new Set(markdownFiles.map((file) => file.path));
			this.startProgress(markdownFiles.length);

			for (const indexedPath of [...this.diagramsByFile.keys()]) {
				if (!livePaths.has(indexedPath)) {
					this.removeFile(indexedPath, false, false);
				}
			}

			const concurrency = 2;
			for (let index = 0; index < markdownFiles.length; index += concurrency) {
				const batch = markdownFiles.slice(index, index + concurrency);
				this.updateProgress(index, batch[0]?.path ?? '');
				await Promise.all(batch.map((file) => this.indexFile(file, false, false)));
				this.updateProgress(
					Math.min(index + batch.length, markdownFiles.length),
					batch[batch.length - 1]?.path ?? '',
				);
				await sleep(25);
			}

			this.lastIndexedAt = Date.now();
			this.emitCacheChange();
			this.emitChange();
			return 'completed';
		} catch (error) {
			console.error('Mermaid Explorer indexing failed', error);
			new Notice('Mermaid explorer could not finish indexing. Check the console for details.');
			return 'failed';
		} finally {
			this.isIndexing = false;
			this.finishProgress();
		}
	}

	async indexFile(file: TFile, emit = true, persist = true): Promise<void> {
		if (file.extension !== 'md') {
			this.removeFile(file.path, emit, persist);
			return;
		}

		if (this.indexedMtimes.get(file.path) === file.stat.mtime) {
			return;
		}

		const markdown = await this.app.vault.cachedRead(file);
		const blocks = extractMermaidBlocks(markdown);
		const cache = this.app.metadataCache.getFileCache(file);
		const tags = getTagsFromCache(cache);
		const diagrams = blocks.map((block): MermaidDiagram => {
			const id = `${file.path}::${block.blockIndex}`;
			return {
				id,
				file,
				filePath: file.path,
				noteTitle: file.basename,
				folder: file.parent?.path ?? '/',
				blockIndex: block.blockIndex,
				code: block.code,
				openingFence: block.openingFence,
				closingFence: block.closingFence,
				startLine: block.startLine,
				endLine: block.endLine,
				startOffset: block.startOffset,
				endOffset: block.endOffset,
				codeStartOffset: block.codeStartOffset,
				codeEndOffset: block.codeEndOffset,
				type: block.type,
				tags,
				createdAt: file.stat.ctime,
				updatedAt: file.stat.mtime,
				indexedAt: Date.now(),
				contentHash: hashText(block.code),
			};
		});

		if (diagrams.length > 0) {
			this.diagramsByFile.set(file.path, diagrams);
		} else {
			this.diagramsByFile.delete(file.path);
		}

		this.indexedMtimes.set(file.path, file.stat.mtime);
		this.lastIndexedAt = Date.now();

		if (emit) {
			this.emitChange();
		}

		if (persist) {
			this.emitCacheChange();
		}
	}

	async refreshDiagramSource(diagram: MermaidDiagram): Promise<MermaidDiagram | null> {
		await this.indexFile(diagram.file);
		return this.getDiagram(diagram.id);
	}

	private queueFileIndex(file: TAbstractFile): void {
		if (!(file instanceof TFile)) {
			return;
		}

		if (file.extension !== 'md') {
			return;
		}

		const existingTimer = this.pendingTimers.get(file.path);
		if (existingTimer !== undefined) {
			window.clearTimeout(existingTimer);
		}

		const timer = window.setTimeout(() => {
			this.pendingTimers.delete(file.path);
			void this.indexFile(file);
		}, 250);

		this.pendingTimers.set(file.path, timer);
	}

	private removeFile(path: string, emit = true, persist = true): void {
		this.diagramsByFile.delete(path);
		this.indexedMtimes.delete(path);
		this.lastIndexedAt = Date.now();

		if (emit) {
			this.emitChange();
		}

		if (persist) {
			this.emitCacheChange();
		}
	}

	private registerEvent(eventRef: EventRef): void {
		this.plugin.registerEvent(eventRef);
	}

	private emitChange(): void {
		const snapshot = this.getSnapshot();
		for (const listener of this.listeners) {
			listener(snapshot);
		}
	}

	private emitCacheChange(): void {
		for (const listener of this.cacheListeners) {
			listener();
		}
	}

	private startProgress(totalFiles: number): void {
		this.indexProgress = {
			isIndexing: true,
			completedFiles: 0,
			totalFiles,
			currentPath: '',
			startedAt: Date.now(),
		};
		this.lastProgressEmittedAt = Date.now();
		this.emitChange();
	}

	private updateProgress(completedFiles: number, currentPath: string): void {
		if (!this.indexProgress.isIndexing) {
			return;
		}

		const totalFiles = this.indexProgress.totalFiles;
		this.indexProgress = {
			...this.indexProgress,
			completedFiles: Math.min(completedFiles, totalFiles),
			currentPath,
		};

		const now = Date.now();
		if (completedFiles >= totalFiles || now - this.lastProgressEmittedAt >= 250) {
			this.lastProgressEmittedAt = now;
			this.emitChange();
		}
	}

	private finishProgress(): void {
		this.indexProgress = createIdleProgress();
		this.emitChange();
	}

	private deserializeDiagram(serialized: SerializedMermaidDiagram, file: TFile): MermaidDiagram {
		return {
			...serialized,
			file,
			filePath: file.path,
			noteTitle: file.basename,
			folder: file.parent?.path ?? '/',
		};
	}
}

function createIdleProgress(): MermaidIndexProgress {
	return {
		isIndexing: false,
		completedFiles: 0,
		totalFiles: 0,
		currentPath: '',
		startedAt: 0,
	};
}

function serializeDiagram(diagram: MermaidDiagram): SerializedMermaidDiagram {
	return {
		id: diagram.id,
		filePath: diagram.filePath,
		noteTitle: diagram.noteTitle,
		folder: diagram.folder,
		blockIndex: diagram.blockIndex,
		code: diagram.code,
		openingFence: diagram.openingFence,
		closingFence: diagram.closingFence,
		startLine: diagram.startLine,
		endLine: diagram.endLine,
		startOffset: diagram.startOffset,
		endOffset: diagram.endOffset,
		codeStartOffset: diagram.codeStartOffset,
		codeEndOffset: diagram.codeEndOffset,
		type: diagram.type,
		tags: diagram.tags,
		createdAt: diagram.createdAt,
		updatedAt: diagram.updatedAt,
		indexedAt: diagram.indexedAt,
		contentHash: diagram.contentHash,
	};
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => {
		window.setTimeout(resolve, ms);
	});
}
