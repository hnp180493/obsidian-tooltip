import { Definition } from '../types';
import { TFile } from 'obsidian';
import { parseYaml } from 'obsidian';

export class AtomicParser {
	/**
	 * Parse an atomic definition file
	 */
	parse(file: TFile, content: string): Definition {
		// Extract phrase from filename (without extension)
		const phrase = file.basename;

		// Parse frontmatter to extract aliases
		const aliases = this.extractAliases(content);

		// Extract definition content (everything after frontmatter)
		const definitionContent = this.extractContent(content);

		const definition: Definition = {
			phrase,
			aliases,
			content: definitionContent,
			sourceFile: file.path,
			sourceType: 'atomic'
		};

		return definition;
	}

	/**
	 * Extract aliases from frontmatter
	 */
	private extractAliases(content: string): string[] {
		const frontmatter = this.extractFrontmatter(content);
		
		if (!frontmatter) {
			return [];
		}

		try {
			const parsed = parseYaml(frontmatter);
			
			if (parsed && parsed.aliases) {
				if (Array.isArray(parsed.aliases)) {
					return parsed.aliases.map((a: any) => String(a).trim()).filter((a: string) => a.length > 0);
				} else if (typeof parsed.aliases === 'string') {
					// Handle single alias as string
					return [parsed.aliases.trim()];
				}
			}
		} catch (error) {
			// Failed to parse frontmatter aliases
		}

		return [];
	}

	/**
	 * Extract frontmatter from content
	 */
	private extractFrontmatter(content: string): string | null {
		const lines = content.split('\n');
		
		if (lines.length < 2 || lines[0].trim() !== '---') {
			return null;
		}

		let endIndex = -1;
		for (let i = 1; i < lines.length; i++) {
			if (lines[i].trim() === '---') {
				endIndex = i;
				break;
			}
		}

		if (endIndex === -1) {
			return null;
		}

		return lines.slice(1, endIndex).join('\n');
	}

	/**
	 * Extract definition content (excluding frontmatter)
	 */
	private extractContent(content: string): string {
		const lines = content.split('\n');
		
		// Check if there's frontmatter
		if (lines.length < 2 || lines[0].trim() !== '---') {
			return content.trim();
		}

		// Find end of frontmatter
		let endIndex = -1;
		for (let i = 1; i < lines.length; i++) {
			if (lines[i].trim() === '---') {
				endIndex = i;
				break;
			}
		}

		if (endIndex === -1) {
			return content.trim();
		}

		// Return everything after frontmatter
		const contentLines = lines.slice(endIndex + 1);
		
		// Trim empty lines from start
		while (contentLines.length > 0 && contentLines[0].trim() === '') {
			contentLines.shift();
		}

		return contentLines.join('\n').trim();
	}
}
