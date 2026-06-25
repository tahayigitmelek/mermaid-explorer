import type MermaidExplorerPlugin from '../main';

export function registerCommands(plugin: MermaidExplorerPlugin): void {
	plugin.addCommand({
		id: 'open-explorer',
		name: 'Open explorer',
		callback: () => {
			void plugin.activateView();
		},
	});

	plugin.addCommand({
		id: 'refresh-index',
		name: 'Refresh diagram index',
		callback: async () => {
			await plugin.refreshIndex(true);
		},
	});

	plugin.addCommand({
		id: 'open-current-note-diagrams',
		name: 'Show diagrams in current note',
		checkCallback: (checking) => {
			const file = plugin.app.workspace.getActiveFile();
			if (!file || file.extension !== 'md') {
				return false;
			}

			if (!checking) {
				void plugin.openDiagramForFile(file.path);
			}

			return true;
		},
	});
}
