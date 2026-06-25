export function hashText(input: string): string {
	let hash = 5381;

	for (let index = 0; index < input.length; index += 1) {
		hash = (hash * 33) ^ input.charCodeAt(index);
	}

	return (hash >>> 0).toString(36);
}
