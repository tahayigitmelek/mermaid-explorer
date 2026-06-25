import { App, PluginSettingTab, Setting } from 'obsidian';
import type MermaidExplorerPlugin from './main';
import type { MermaidExplorerSettings } from './types';

export const DEFAULT_SETTINGS: MermaidExplorerSettings = {
	autoIndexing: false,
	refreshIntervalMinutes: 0,
	liveSynchronization: true,
	generateThumbnails: false,
	defaultZoomLevel: 1,
	defaultLayout: 'viewer',
	exportScale: 2,
	exportBackground: '#ffffff',
};

export class MermaidExplorerSettingTab extends PluginSettingTab {
	private readonly plugin: MermaidExplorerPlugin;

	constructor(app: App, plugin: MermaidExplorerPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl).setName('Indexing and previews').setHeading();

		let refreshIntervalInput: HTMLInputElement | null = null;

		new Setting(containerEl)
			.setName('Scheduled refresh')
			.setDesc('Refresh the cached diagram index in the background at the interval below.')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.autoIndexing)
					.onChange(async (value) => {
						this.plugin.settings.autoIndexing = value;
						if (value && this.plugin.settings.refreshIntervalMinutes <= 0) {
							this.plugin.settings.refreshIntervalMinutes = 30;
							if (refreshIntervalInput) {
								refreshIntervalInput.value = '30';
							}
						}
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('Refresh interval')
			.setDesc('Minutes between scheduled refreshes. Set to 0 to disable background refresh.')
			.addText((text) => {
				refreshIntervalInput = text.inputEl;
				text.inputEl.setAttr('type', 'number');
				text.inputEl.setAttr('min', '0');
				text.inputEl.setAttr('max', '1440');
				text.inputEl.setAttr('step', '1');
				text
					.setPlaceholder('30')
					.setValue(String(this.plugin.settings.refreshIntervalMinutes))
					.onChange(async (value) => {
						const interval = normalizeRefreshInterval(value);
						this.plugin.settings.refreshIntervalMinutes = interval;
						this.plugin.settings.autoIndexing = this.plugin.settings.autoIndexing && interval > 0;
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName('Refresh now')
			.setDesc('Scan the vault once, then save the diagram index to the local cache.')
			.addButton((button) =>
				button
					.setButtonText('Refresh now')
					.setCta()
					.onClick(async () => {
						button.setDisabled(true);
						try {
							await this.plugin.refreshIndex(true);
						} finally {
							button.setDisabled(false);
						}
					}),
			);

		new Setting(containerEl)
			.setName('Live synchronization')
			.setDesc('Save edits from Mermaid explorer back to the source note.')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.liveSynchronization)
					.onChange(async (value) => {
						this.plugin.settings.liveSynchronization = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('Thumbnail generation')
			.setDesc('Render small previews in the diagram list.')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.generateThumbnails)
					.onChange(async (value) => {
						this.plugin.settings.generateThumbnails = value;
						await this.plugin.saveSettings();
						this.plugin.refreshExplorerViews();
					}),
			);

		new Setting(containerEl)
			.setName('Default zoom level')
			.setDesc('Set the initial zoom level for diagram previews.')
			.addSlider((slider) =>
				slider
					.setLimits(0.4, 2.5, 0.1)
					.setValue(this.plugin.settings.defaultZoomLevel)
					.onChange(async (value) => {
						this.plugin.settings.defaultZoomLevel = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('Default view')
			.setDesc('Choose the first panel shown when Mermaid explorer opens.')
			.addDropdown((dropdown) =>
				dropdown
					.addOption('viewer', 'Viewer')
					.addOption('editor', 'Editor')
					.addOption('dashboard', 'Dashboard')
					.setValue(this.plugin.settings.defaultLayout)
					.onChange(async (value) => {
						this.plugin.settings.defaultLayout = value as MermaidExplorerSettings['defaultLayout'];
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('PNG export scale')
			.setDesc('Increase exported PNG resolution.')
			.addSlider((slider) =>
				slider
					.setLimits(1, 4, 0.5)
					.setValue(this.plugin.settings.exportScale)
					.onChange(async (value) => {
						this.plugin.settings.exportScale = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('Export background')
			.setDesc('Background color used for PNG exports.')
			.addText((text) =>
				text
					.setValue(this.plugin.settings.exportBackground)
					.onChange(async (value) => {
						this.plugin.settings.exportBackground = value.trim() || '#ffffff';
						await this.plugin.saveSettings();
					}),
			);
	}
}

function normalizeRefreshInterval(value: string): number {
	const parsed = Number.parseInt(value, 10);
	if (!Number.isFinite(parsed)) {
		return 0;
	}

	return Math.min(1440, Math.max(0, parsed));
}
