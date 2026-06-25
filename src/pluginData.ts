import { DEFAULT_SETTINGS } from './settings';
import type {
	DiagramType,
	MermaidExplorerPluginData,
	MermaidExplorerSettings,
	MermaidIndexCache,
	SerializedMermaidDiagram,
} from './types';

const MIN_REFRESH_INTERVAL_MINUTES = 0;
const MAX_REFRESH_INTERVAL_MINUTES = 1440;

type RecordValue = Record<string, unknown>;

export function readPluginData(rawData: unknown): MermaidExplorerPluginData {
	const data = asRecord(rawData);
	const settingsSource = asRecord(data?.settings) ?? data;
	const settings = normalizeSettings(settingsSource);
	const indexCache = normalizeIndexCache(data?.indexCache);

	return indexCache ? { settings, indexCache } : { settings };
}

export function createPluginData(
	settings: MermaidExplorerSettings,
	indexCache?: MermaidIndexCache,
): MermaidExplorerPluginData {
	return indexCache ? { settings, indexCache } : { settings };
}

export function normalizeRefreshIntervalMinutes(value: unknown): number {
	const rawNumber = typeof value === 'number' ? value : Number.parseInt(String(value), 10);
	if (!Number.isFinite(rawNumber)) {
		return DEFAULT_SETTINGS.refreshIntervalMinutes;
	}

	return clamp(Math.round(rawNumber), MIN_REFRESH_INTERVAL_MINUTES, MAX_REFRESH_INTERVAL_MINUTES);
}

function normalizeSettings(source: RecordValue | undefined): MermaidExplorerSettings {
	const refreshIntervalMinutes = normalizeRefreshIntervalMinutes(source?.refreshIntervalMinutes);
	const autoIndexing =
		typeof source?.autoIndexing === 'boolean'
			? source.autoIndexing && refreshIntervalMinutes > 0
			: DEFAULT_SETTINGS.autoIndexing;

	return {
		autoIndexing,
		refreshIntervalMinutes,
		liveSynchronization: readBoolean(source?.liveSynchronization, DEFAULT_SETTINGS.liveSynchronization),
		generateThumbnails: readBoolean(source?.generateThumbnails, DEFAULT_SETTINGS.generateThumbnails),
		defaultZoomLevel: clamp(readNumber(source?.defaultZoomLevel, DEFAULT_SETTINGS.defaultZoomLevel), 0.4, 2.5),
		defaultLayout: readLayout(source?.defaultLayout),
		exportScale: clamp(readNumber(source?.exportScale, DEFAULT_SETTINGS.exportScale), 1, 4),
		exportBackground: readString(source?.exportBackground, DEFAULT_SETTINGS.exportBackground),
	};
}

function normalizeIndexCache(value: unknown): MermaidIndexCache | undefined {
	const cache = asRecord(value);
	if (!cache || cache.version !== 1 || !Array.isArray(cache.diagrams)) {
		return undefined;
	}

	const diagrams = cache.diagrams
		.map(readSerializedDiagram)
		.filter((diagram): diagram is SerializedMermaidDiagram => diagram !== null);
	const indexedFileStats = Array.isArray(cache.indexedFileStats)
		? cache.indexedFileStats
				.map(readIndexedFileStat)
				.filter((stat): stat is { path: string; mtime: number } => stat !== null)
		: [];

	return {
		version: 1,
		diagrams,
		indexedFileStats,
		lastIndexedAt: readNumber(cache.lastIndexedAt, 0),
	};
}

function readSerializedDiagram(value: unknown): SerializedMermaidDiagram | null {
	const record = asRecord(value);
	if (!record) {
		return null;
	}

	const id = readRequiredString(record.id);
	const filePath = readRequiredString(record.filePath);
	const noteTitle = readRequiredString(record.noteTitle);
	const folder = readRequiredString(record.folder);
	const code = readRequiredString(record.code);
	const openingFence = readRequiredString(record.openingFence);
	const closingFence = readRequiredString(record.closingFence);
	const type = readRequiredString(record.type);

	if (
		!id ||
		!filePath ||
		!noteTitle ||
		!folder ||
		code === null ||
		!openingFence ||
		!closingFence ||
		!type
	) {
		return null;
	}

	return {
		id,
		filePath,
		noteTitle,
		folder,
		blockIndex: readNumber(record.blockIndex, 0),
		code,
		openingFence,
		closingFence,
		startLine: readNumber(record.startLine, 0),
		endLine: readNumber(record.endLine, 0),
		startOffset: readNumber(record.startOffset, 0),
		endOffset: readNumber(record.endOffset, 0),
		codeStartOffset: readNumber(record.codeStartOffset, 0),
		codeEndOffset: readNumber(record.codeEndOffset, 0),
		type: type as DiagramType,
		tags: readStringArray(record.tags),
		createdAt: readNumber(record.createdAt, 0),
		updatedAt: readNumber(record.updatedAt, 0),
		indexedAt: readNumber(record.indexedAt, 0),
		contentHash: readString(record.contentHash, ''),
	};
}

function readIndexedFileStat(value: unknown): { path: string; mtime: number } | null {
	const record = asRecord(value);
	if (!record) {
		return null;
	}

	const path = readRequiredString(record.path);
	const mtime = readNumber(record.mtime, Number.NaN);
	if (!path || !Number.isFinite(mtime)) {
		return null;
	}

	return { path, mtime };
}

function asRecord(value: unknown): RecordValue | undefined {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		return undefined;
	}

	return value as RecordValue;
}

function readBoolean(value: unknown, fallback: boolean): boolean {
	return typeof value === 'boolean' ? value : fallback;
}

function readNumber(value: unknown, fallback: number): number {
	return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function readRequiredString(value: unknown): string | null {
	return typeof value === 'string' ? value : null;
}

function readString(value: unknown, fallback: string): string {
	return typeof value === 'string' ? value : fallback;
}

function readStringArray(value: unknown): string[] {
	if (!Array.isArray(value)) {
		return [];
	}

	return value.filter((item): item is string => typeof item === 'string');
}

function readLayout(value: unknown): MermaidExplorerSettings['defaultLayout'] {
	if (value === 'viewer' || value === 'editor' || value === 'dashboard') {
		return value;
	}

	return DEFAULT_SETTINGS.defaultLayout;
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}
