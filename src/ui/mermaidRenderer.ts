import mermaid from 'mermaid';

export interface MermaidRenderResult {
	svg: string;
	error: string | null;
}

let renderCounter = 0;
let initializedThemeSignature = '';

export async function renderMermaid(
	container: HTMLElement,
	code: string,
	options: { zoom?: number } = {},
): Promise<MermaidRenderResult> {
	initializeMermaid();
	container.empty();
	container.addClass('mermaid-explorer-rendering');

	try {
		await mermaid.parse(code);
		const id = `mermaid-explorer-${Date.now()}-${renderCounter}`;
		renderCounter += 1;
		const result = await mermaid.render(id, code);
		container.removeClass('mermaid-explorer-rendering');
		container.addClass('mermaid-explorer-rendered');
		appendSvg(container, result.svg);
		result.bindFunctions?.(container);
		applySvgZoom(container, options.zoom ?? 1);

		return { svg: result.svg, error: null };
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		container.removeClass('mermaid-explorer-rendering');
		container.addClass('mermaid-explorer-render-error');
		container.createDiv({
			cls: 'mermaid-explorer-error',
			text: message,
		});
		return { svg: '', error: message };
	}
}

export function initializeMermaid(): void {
	const themeConfig = getThemeConfig();
	if (initializedThemeSignature === themeConfig.signature) {
		return;
	}

	mermaid.initialize({
		startOnLoad: false,
		securityLevel: 'strict',
		theme: 'base',
		fontFamily: themeConfig.fontFamily,
		themeVariables: themeConfig.variables,
	});
	initializedThemeSignature = themeConfig.signature;
}

function applySvgZoom(container: HTMLElement, zoom: number): void {
	const svg = container.querySelector('svg');
	if (!svg) {
		return;
	}

	svg.addClass('mermaid-explorer-svg');
	svg.setAttr('style', `--mermaid-explorer-zoom: ${zoom};`);
}

function appendSvg(container: HTMLElement, svgMarkup: string): void {
	const parser = new DOMParser();
	const svgDocument = parser.parseFromString(svgMarkup, 'image/svg+xml');
	const svgElement = svgDocument.documentElement;

	if (svgElement.nodeName.toLowerCase() !== 'svg') {
		throw new Error('Mermaid did not return a valid SVG.');
	}

	container.appendChild(activeDocument.importNode(svgElement, true));
}

function getThemeConfig(): {
	signature: string;
	fontFamily: string;
	variables: Record<string, string>;
} {
	const body = activeDocument.body;
	const styles = getComputedStyle(body);
	const isDark = body.classList.contains('theme-dark');
	const background = readCssColor(styles, '--background-primary', isDark ? '#1e1e1e' : '#ffffff');
	const surface = readCssColor(styles, '--background-secondary', isDark ? '#262626' : '#f6f6f6');
	const border = readCssColor(styles, '--background-modifier-border', isDark ? '#4a4a4a' : '#d9d9d9');
	const text = readCssColor(styles, '--text-normal', isDark ? '#dcddde' : '#222222');
	const muted = readCssColor(styles, '--text-muted', isDark ? '#b3b3b3' : '#666666');
	const accent = readCssColor(styles, '--interactive-accent', isDark ? '#7c9cff' : '#3366cc');
	const error = readCssColor(styles, '--text-error', isDark ? '#ff7b7b' : '#b00020');
	const fontFamily = readCssColor(styles, '--font-interface', 'Arial, sans-serif');

	const variables = {
		background,
		primaryColor: surface,
		primaryTextColor: text,
		primaryBorderColor: border,
		secondaryColor: background,
		secondaryTextColor: text,
		secondaryBorderColor: border,
		tertiaryColor: surface,
		tertiaryTextColor: text,
		tertiaryBorderColor: border,
		mainBkg: surface,
		secondBkg: background,
		lineColor: muted,
		textColor: text,
		nodeTextColor: text,
		labelTextColor: text,
		clusterBkg: background,
		clusterBorder: border,
		edgeLabelBackground: background,
		actorBkg: surface,
		actorBorder: border,
		actorTextColor: text,
		actorLineColor: border,
		signalColor: text,
		signalTextColor: text,
		noteBkgColor: surface,
		noteTextColor: text,
		noteBorderColor: border,
		activationBkgColor: surface,
		activationBorderColor: border,
		sequenceNumberColor: text,
		sectionBkgColor: surface,
		altSectionBkgColor: background,
		gridColor: border,
		c0: accent,
		c1: muted,
		c2: error,
		pie1: accent,
		pie2: muted,
		pie3: error,
		pie4: border,
	};

	return {
		signature: JSON.stringify({ isDark, fontFamily, variables }),
		fontFamily,
		variables,
	};
}

function readCssColor(styles: CSSStyleDeclaration, property: string, fallback: string): string {
	return styles.getPropertyValue(property).trim() || fallback;
}
