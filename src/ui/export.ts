import { Notice } from 'obsidian';

export function downloadSvg(svg: string, fileName: string): void {
	if (!svg) {
		new Notice('Render the diagram before exporting SVG.');
		return;
	}

	downloadBlob(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }), `${fileName}.svg`);
}

export async function downloadPng(
	svg: string,
	fileName: string,
	scale: number,
	background: string,
): Promise<void> {
	const pngBlob = await svgToPngBlob(svg, scale, background);
	downloadBlob(pngBlob, `${fileName}.png`);
}

export async function copyRenderedImage(
	svg: string,
	scale: number,
	background: string,
): Promise<void> {
	if (!navigator.clipboard || typeof ClipboardItem === 'undefined') {
		new Notice('Image clipboard is not available in this environment.');
		return;
	}

	const pngBlob = await svgToPngBlob(svg, scale, background);
	await navigator.clipboard.write([
		new ClipboardItem({
			'image/png': pngBlob,
		}),
	]);
	new Notice('Rendered image copied.');
}

export async function copyText(text: string, successMessage: string): Promise<void> {
	await navigator.clipboard.writeText(text);
	new Notice(successMessage);
}

async function svgToPngBlob(svg: string, scale: number, background: string): Promise<Blob> {
	if (!svg) {
		throw new Error('No rendered SVG is available.');
	}

	const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
	const url = URL.createObjectURL(svgBlob);

	try {
		const image = await loadImage(url);
		const width = Math.max(1, image.naturalWidth || image.width);
		const height = Math.max(1, image.naturalHeight || image.height);
		const canvas = activeDocument.createElement('canvas');
		canvas.width = Math.ceil(width * scale);
		canvas.height = Math.ceil(height * scale);
		const context = canvas.getContext('2d');

		if (!context) {
			throw new Error('Could not create an export canvas.');
		}

		context.fillStyle = background || '#ffffff';
		context.fillRect(0, 0, canvas.width, canvas.height);
		context.scale(scale, scale);
		context.drawImage(image, 0, 0);

		const blob = await new Promise<Blob>((resolve, reject) => {
			canvas.toBlob((nextBlob) => {
				if (nextBlob) {
					resolve(nextBlob);
					return;
				}
				reject(new Error('Could not export PNG.'));
			}, 'image/png');
		});

		return blob;
	} finally {
		URL.revokeObjectURL(url);
	}
}

function loadImage(url: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const image = new Image();
		image.onload = () => resolve(image);
		image.onerror = () => reject(new Error('Could not load the rendered SVG.'));
		image.src = url;
	});
}

function downloadBlob(blob: Blob, fileName: string): void {
	const url = URL.createObjectURL(blob);
	const anchor = activeDocument.createElement('a');
	anchor.href = url;
	anchor.download = fileName;
	activeDocument.body.appendChild(anchor);
	anchor.click();
	anchor.remove();
	window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
