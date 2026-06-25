import type { CachedMetadata } from 'obsidian';
import type { DiagramType, MermaidBlock } from '../types';

const MERMAID_LANG_PATTERN = /^mermaid(?:\s|$)/i;
const FLOWCHART_PATTERN = /^(?:graph|flowchart)\s+/i;

export function extractMermaidBlocks(markdown: string): MermaidBlock[] {
	const blocks: MermaidBlock[] = [];
	const lines = markdown.split(/(\n)/);
	let offset = 0;
	let lineNumber = 0;
	let index = 0;

	while (index < lines.length) {
		const line = lines[index] ?? '';
		const lineBreak = lines[index + 1] === '\n' ? '\n' : '';
		const fullLine = line + lineBreak;
		const opening = getFence(line);

		if (!opening || !MERMAID_LANG_PATTERN.test(opening.info)) {
			offset += fullLine.length;
			lineNumber += lineBreak ? 1 : 0;
			index += lineBreak ? 2 : 1;
			continue;
		}

		const startLine = lineNumber;
		const startOffset = offset;
		const codeStartOffset = offset + fullLine.length;
		let cursorIndex = index + (lineBreak ? 2 : 1);
		let cursorOffset = codeStartOffset;
		let cursorLine = lineNumber + (lineBreak ? 1 : 0);
		let codeEndOffset = markdown.length;
		let closingFence = opening.raw;
		let endOffset = markdown.length;
		let endLine = cursorLine;
		let foundClosingFence = false;

		while (cursorIndex < lines.length) {
			const bodyLine = lines[cursorIndex] ?? '';
			const bodyBreak = lines[cursorIndex + 1] === '\n' ? '\n' : '';
			const bodyFullLine = bodyLine + bodyBreak;
			const closing = getFence(bodyLine);

			if (closing && closing.marker === opening.marker && closing.length >= opening.length) {
				codeEndOffset = cursorOffset;
				closingFence = bodyLine;
				endOffset = cursorOffset + bodyFullLine.length;
				endLine = cursorLine;
				foundClosingFence = true;
				break;
			}

			cursorOffset += bodyFullLine.length;
			cursorLine += bodyBreak ? 1 : 0;
			cursorIndex += bodyBreak ? 2 : 1;
		}

		const code = markdown.slice(codeStartOffset, codeEndOffset).replace(/\n$/, '');

		blocks.push({
			blockIndex: blocks.length,
			code,
			openingFence: line,
			closingFence,
			startLine,
			endLine,
			startOffset,
			endOffset,
			codeStartOffset,
			codeEndOffset,
			type: detectDiagramType(code),
		});

		if (!foundClosingFence) {
			break;
		}

		offset = endOffset;
		lineNumber = endLine + (markdown[endOffset - 1] === '\n' ? 1 : 0);
		index = cursorIndex + (lines[cursorIndex + 1] === '\n' ? 2 : 1);
	}

	return blocks;
}

export function detectDiagramType(code: string): DiagramType {
	const firstMeaningfulLine = code
		.split('\n')
		.map((line) => line.trim())
		.find((line) => line.length > 0 && !line.startsWith('%%'));

	if (!firstMeaningfulLine) {
		return 'Unknown';
	}

	const normalized = firstMeaningfulLine.toLowerCase();

	if (FLOWCHART_PATTERN.test(firstMeaningfulLine)) return 'Flowchart';
	if (normalized.startsWith('sequencediagram')) return 'Sequence diagram';
	if (normalized.startsWith('classdiagram')) return 'Class diagram';
	if (normalized.startsWith('statediagram')) return 'State diagram';
	if (normalized.startsWith('erdiagram')) return 'ER diagram';
	if (normalized.startsWith('journey')) return 'Journey';
	if (normalized.startsWith('gantt')) return 'Gantt';
	if (normalized.startsWith('mindmap')) return 'Mindmap';
	if (normalized.startsWith('timeline')) return 'Timeline';
	if (normalized.startsWith('gitgraph')) return 'Git graph';
	if (normalized.startsWith('sankey')) return 'Sankey';
	if (normalized.startsWith('requirementdiagram')) return 'Requirement diagram';
	if (normalized.startsWith('c4context')) return 'C4 diagram';
	if (normalized.startsWith('c4container')) return 'C4 diagram';
	if (normalized.startsWith('c4component')) return 'C4 diagram';
	if (normalized.startsWith('c4dynamic')) return 'C4 diagram';
	if (normalized.startsWith('pie')) return 'Pie chart';
	if (normalized.startsWith('quadrantchart')) return 'Quadrant chart';
	if (normalized.startsWith('xychart')) return 'XY chart';
	if (normalized.startsWith('block-beta')) return 'Block diagram';
	if (normalized.startsWith('packet-beta')) return 'Packet diagram';
	if (normalized.startsWith('architecture-beta')) return 'Architecture diagram';

	return 'Unknown';
}

export function getTagsFromCache(cache: CachedMetadata | null): string[] {
	const tagSet = new Set<string>();

	for (const tag of cache?.tags ?? []) {
		tagSet.add(tag.tag);
	}

	const frontmatterTags: unknown = cache?.frontmatter?.tags;
	if (typeof frontmatterTags === 'string') {
		frontmatterTags
			.split(/[,\s]+/)
			.map((tag) => tag.trim())
			.filter(Boolean)
			.forEach((tag) => tagSet.add(tag.startsWith('#') ? tag : `#${tag}`));
	}

	if (Array.isArray(frontmatterTags)) {
		frontmatterTags
			.filter((tag): tag is string => typeof tag === 'string')
			.forEach((tag) => tagSet.add(tag.startsWith('#') ? tag : `#${tag}`));
	}

	return [...tagSet].sort((a, b) => a.localeCompare(b));
}

function getFence(line: string):
	| {
			raw: string;
			marker: '`' | '~';
			length: number;
			info: string;
	  }
	| null {
	const match = /^(\s*)(`{3,}|~{3,})(.*)$/.exec(line);
	if (!match) {
		return null;
	}

	const fence = match[2];
	if (!fence) {
		return null;
	}

	return {
		raw: line,
		marker: fence[0] === '`' ? '`' : '~',
		length: fence.length,
		info: (match[3] ?? '').trim(),
	};
}
