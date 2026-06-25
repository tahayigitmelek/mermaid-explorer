# Mermaid Explorer

Mermaid Explorer is an Obsidian community plugin for managing Mermaid diagrams across an entire vault. It indexes Mermaid code blocks in Markdown notes, renders previews, exposes searchable metadata, and lets you edit a diagram while saving changes back to the original source block.

## Features

- Vault-wide Mermaid discovery with incremental updates for created, modified, renamed, and deleted notes.
- Dedicated Mermaid Explorer view with search, sorting, and filters for folder, note, diagram type, and tags.
- Interactive preview with zoom, fit, fullscreen, SVG export, PNG export, code copy, and rendered image copy.
- Source metadata for each diagram, including note path, folder, block location, creation time, and modification time.
- Built-in editor with live Mermaid rendering, syntax highlighting, error display, undo/redo, and code search.
- Two-way synchronization that updates only the original Mermaid block while preserving surrounding note content.
- Dashboard statistics for total diagrams, folders, types, active notes, and recently modified diagrams.

## Commands

- **Open Mermaid Explorer**
- **Refresh Mermaid diagram index**
- **Show diagrams in current note**

## Settings

- Auto indexing
- Live synchronization
- Thumbnail generation
- Default zoom level
- Default view
- PNG export scale
- Export background

## Development

Install dependencies:

```bash
npm install
```

Start the development build:

```bash
npm run dev
```

Build a production bundle:

```bash
npm run build
```

Release artifacts are `manifest.json`, `main.js`, and `styles.css` at the plugin root.
