# Mermaid Explorer

Mermaid Explorer is an Obsidian community plugin that lets you discover, browse, preview, edit, and export every Mermaid diagram in your vault. It indexes Mermaid code blocks across your Markdown notes and provides a dedicated workspace to manage your diagrams seamlessly.

## Features

- Vault-wide discovery: Automatically discover and index Mermaid diagrams across your entire vault with incremental updates for note modifications.
- Dedicated view: Browse all your diagrams in a single view with powerful search, sorting, and filtering options by folder, note, diagram type, or tags.
- Interactive previews: Zoom, fit, view fullscreen, and copy rendered diagram images or source code directly from the preview panel.
- Versatile exports: Export any Mermaid diagram as an SVG or PNG image.
- Built-in live editor: Edit Mermaid code with syntax highlighting, live rendering, error diagnostics, undo/redo, and code search.
- Two-way synchronization: Save changes from the editor back to the original Markdown note block without modifying the surrounding note content.
- Dashboard statistics: View quick vault analytics including total diagrams, unique folders, diagram types, and recently modified items.

## Usage

- Opening the explorer: Select the ribbon icon or run **Open Mermaid Explorer** from the Command Palette.
- Indexing diagrams: Indexing happens automatically in the background, or you can manually trigger **Refresh Mermaid diagram index** from the Command Palette.
- Viewing note diagrams: Run **Show diagrams in current note** to quickly inspect all diagrams contained in your active document.
- Editing a diagram: Select any diagram in the explorer view to open it in the built-in editor, modify the code, and save changes directly to your source file.
- Exporting diagrams: Select the export buttons in the diagram preview to save diagrams as PNG or SVG files.
- Configuring settings: Navigate to **Settings → Community plugins → Mermaid Explorer** to configure auto indexing, live synchronization, thumbnail generation, and export preferences.

## Privacy

Mermaid Explorer operates completely locally and offline. It indexes and reads your Markdown files strictly inside your Obsidian vault to discover diagram code blocks. No data or note content is ever transmitted to external servers or third-party cloud services.
