import { Notice, Plugin, TFile, WorkspaceLeaf } from 'obsidian';
import { registerCommands } from './commands';
import { MermaidIndexer } from './indexing/indexer';
import { createPluginData, readPluginData } from './pluginData';
import { DEFAULT_SETTINGS, MermaidExplorerSettingTab } from './settings';
import { MermaidSynchronizer } from './sync/synchronizer';
import type { CacheLoadResult } from './indexing/indexer';
import type { MermaidExplorerSettings, MermaidIndexCache } from './types';
import { VIEW_TYPE_MERMAID_EXPLORER } from './types';
import { MermaidExplorerView } from './ui/MermaidExplorerView';

export default class MermaidExplorerPlugin extends Plugin {
	settings!: MermaidExplorerSettings;
	indexer!: MermaidIndexer;
	synchronizer!: MermaidSynchronizer;
	private indexCache: MermaidIndexCache | undefined;
	private refreshIntervalId: number | null = null;
	private cacheSaveTimer: number | null = null;
	private cacheHydrationTimer: number | null = null;
	private cacheHydrationAttempts = 0;
	private indexCacheHydrated = false;
	private vaultEventsRegistered = false;

	async onload(): Promise<void> {
		await this.loadSettings();

		this.indexer = new MermaidIndexer(this.app, this);
		this.hydrateIndexCache(false);
		this.synchronizer = new MermaidSynchronizer(this.app, this.indexer);

		this.registerView(
			VIEW_TYPE_MERMAID_EXPLORER,
			(leaf: WorkspaceLeaf) => new MermaidExplorerView(leaf, this),
		);

		this.addRibbonIcon('workflow', 'Open Mermaid explorer', () => {
			void this.activateView();
		});

		registerCommands(this);
		this.addSettingTab(new MermaidExplorerSettingTab(this.app, this));
		this.register(this.indexer.onCacheChange(() => this.queueIndexCacheSave()));
		this.scheduleAutomaticRefresh();
		this.app.workspace.onLayoutReady(() => {
			this.hydrateIndexCache(false);
			this.registerIndexerVaultEvents();
		});
		this.registerEvent(this.app.metadataCache.on('resolved', () => this.hydrateIndexCache(false)));

		this.register(() => this.clearRefreshInterval());
		this.register(() => this.clearCacheSaveTimer());
		this.register(() => this.clearCacheHydrationTimer());
	}

	onunload(): void {}

	async activateView(): Promise<void> {
		let leaf = this.getRootExplorerLeaf();
		this.detachNonRootExplorerLeaves(leaf);

		if (!leaf) {
			leaf = this.app.workspace.getLeaf('tab');
		}

		await leaf.setViewState({
			type: VIEW_TYPE_MERMAID_EXPLORER,
			active: true,
		});
		await this.app.workspace.revealLeaf(leaf);
		void this.app.workspace.requestSaveLayout();
	}

	private getRootExplorerLeaf(): WorkspaceLeaf | null {
		let explorerLeaf: WorkspaceLeaf | null = null;
		this.app.workspace.iterateRootLeaves((leaf) => {
			if (!explorerLeaf && leaf.getViewState().type === VIEW_TYPE_MERMAID_EXPLORER) {
				explorerLeaf = leaf;
			}
		});

		return explorerLeaf;
	}

	private detachNonRootExplorerLeaves(rootLeaf: WorkspaceLeaf | null): void {
		for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_MERMAID_EXPLORER)) {
			if (leaf !== rootLeaf) {
				leaf.detach();
			}
		}
	}

	async openDiagramForFile(filePath: string): Promise<void> {
		await this.activateView();
		const file = this.app.vault.getAbstractFileByPath(filePath);
		if (file instanceof TFile) {
			await this.indexer.indexFile(file);
		}

		const diagram = this.indexer.getDiagrams().find((item) => item.filePath === filePath);
		const leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_MERMAID_EXPLORER)[0];
		const view = leaf?.view;

		if (diagram && view instanceof MermaidExplorerView) {
			view.selectDiagram(diagram.id);
			return;
		}

		new Notice('No Mermaid diagrams found in the current note.');
	}

	async refreshIndex(userInitiated = false): Promise<void> {
		const result = await this.indexer.reindexVault();
		if (result === 'busy') {
			if (userInitiated) {
				new Notice('Mermaid diagram refresh is already running.');
			}
			return;
		}

		if (result === 'failed') {
			return;
		}

		await this.saveIndexCache(true);
		this.indexCacheHydrated = true;
		this.cacheHydrationAttempts = 0;
		if (userInitiated) {
			new Notice('Mermaid diagram index refreshed.');
		}
	}

	refreshExplorerViews(): void {
		for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_MERMAID_EXPLORER)) {
			if (leaf.view instanceof MermaidExplorerView) {
				leaf.view.refresh();
			}
		}
	}

	async loadSettings(): Promise<void> {
		const data = readPluginData(await this.loadData());
		this.settings = Object.assign({}, DEFAULT_SETTINGS, data.settings);
		this.indexCache = data.indexCache;
	}

	async saveSettings(): Promise<void> {
		await this.savePluginData();
		this.scheduleAutomaticRefresh();
	}

	private scheduleAutomaticRefresh(): void {
		this.clearRefreshInterval();
		if (!this.settings.autoIndexing || this.settings.refreshIntervalMinutes <= 0) {
			return;
		}

		const intervalMs = this.settings.refreshIntervalMinutes * 60 * 1000;
		this.refreshIntervalId = window.setInterval(() => {
			void this.refreshIndex(false);
		}, intervalMs);
	}

	private registerIndexerVaultEvents(): void {
		if (this.vaultEventsRegistered) {
			return;
		}

		this.vaultEventsRegistered = true;
		this.indexer.registerVaultEvents();
	}

	private hydrateIndexCache(finalAttempt: boolean): void {
		if (!this.indexCache || this.indexCacheHydrated) {
			return;
		}

		this.clearCacheHydrationTimer();
		this.cacheHydrationAttempts += 1;
		const result = this.indexer.loadCache(this.indexCache);
		if (this.shouldFinishCacheHydration(result, finalAttempt)) {
			this.indexCacheHydrated = true;
		} else {
			this.scheduleCacheHydrationRetry();
		}

		if (result.loadedDiagrams > 0) {
			this.refreshExplorerViews();
		}
	}

	private shouldFinishCacheHydration(result: CacheLoadResult, finalAttempt: boolean): boolean {
		const cachedDiagrams = this.indexCache?.diagrams.length ?? 0;
		return (
			cachedDiagrams === 0 ||
			result.skippedDiagrams === 0 ||
			finalAttempt ||
			this.cacheHydrationAttempts >= 10
		);
	}

	private scheduleCacheHydrationRetry(): void {
		this.cacheHydrationTimer = window.setTimeout(() => {
			this.hydrateIndexCache(false);
		}, 750);
	}

	private queueIndexCacheSave(): void {
		this.clearCacheSaveTimer();
		this.cacheSaveTimer = window.setTimeout(() => {
			void this.saveIndexCache(false);
		}, 1000);
	}

	private async saveIndexCache(force = false): Promise<void> {
		this.clearCacheSaveTimer();
		const nextCache = this.indexer.toCache();
		if (!force && this.shouldKeepExistingIndexCache(nextCache)) {
			return;
		}

		this.indexCache = nextCache;
		await this.savePluginData();
	}

	private shouldKeepExistingIndexCache(nextCache: MermaidIndexCache): boolean {
		const existingDiagrams = this.indexCache?.diagrams.length ?? 0;
		return !this.indexCacheHydrated && existingDiagrams > 0 && nextCache.diagrams.length === 0;
	}

	private async savePluginData(): Promise<void> {
		await this.saveData(createPluginData(this.settings, this.indexCache));
	}

	private clearRefreshInterval(): void {
		if (this.refreshIntervalId !== null) {
			window.clearInterval(this.refreshIntervalId);
			this.refreshIntervalId = null;
		}
	}

	private clearCacheSaveTimer(): void {
		if (this.cacheSaveTimer !== null) {
			window.clearTimeout(this.cacheSaveTimer);
			this.cacheSaveTimer = null;
		}
	}

	private clearCacheHydrationTimer(): void {
		if (this.cacheHydrationTimer !== null) {
			window.clearTimeout(this.cacheHydrationTimer);
			this.cacheHydrationTimer = null;
		}
	}
}
