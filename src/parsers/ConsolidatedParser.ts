import { Definition, DefinitionError } from '../types';

export class ConsolidatedParser {
	private dividerPattern: 'hyphens' | 'both';

	constructor(dividerPattern: 'hyphens' | 'both' = 'hyphens') {
		this.dividerPattern = dividerPattern;
	}

	/**
	 * Parse a consolidated definition file
	 */
	parse(content: string, filePath: string): Definition[] {
		const definitions: Definition[] = [];
		const lines = content.split('\n');
		
		let i = 0;
		while (i < lines.length) {
			// Skip frontmatter
			if (i === 0 && lines[i].trim() === '---') {
				i++;
				while (i < lines.length && lines[i].trim() !== '---') {
					i++;
				}
				i++; // Skip closing ---
				continue;
			}

			// Look for phrase header (# Phrase)
			const line = lines[i].trim();
			if (line.startsWith('# ') && line.length > 2) {
				const result = this.parseBlock(lines, i, filePath);
				if (result.definition) {
					definitions.push(result.definition);
				}
				i = result.endIndex;
			} else {
				i++;
			}
		}

		return definitions;
	}

	/**
	 * Parse a single definition block
	 */
	private parseBlock(lines: string[], startIndex: number, filePath: string): {
		definition: Definition | null;
		endIndex: number;
	} {
		const phraseLine = lines[startIndex].trim();
		const phrase = phraseLine.substring(2).trim(); // Remove "# "
		
		if (!phrase) {
			return { definition: null, endIndex: startIndex + 1 };
		}

		let i = startIndex + 1;
		const aliases: string[] = [];
		const contentLines: string[] = [];

		// Check for aliases (line in asterisks)
		if (i < lines.length) {
			const nextLine = lines[i].trim();
			if (nextLine.startsWith('*') && nextLine.endsWith('*') && nextLine.length > 2) {
				// Extract aliases
				const aliasText = nextLine.substring(1, nextLine.length - 1);
				const parsedAliases = aliasText.split(',').map(a => a.trim()).filter(a => a.length > 0);
				aliases.push(...parsedAliases);
				i++;
			}
		}

		// Parse definition content until divider or end of file
		while (i < lines.length) {
			const line = lines[i];
			
			// Check if this is a divider
			if (this.isDivider(line.trim())) {
				i++; // Move past the divider
				break;
			}

			// Check if this is the start of a new definition
			if (line.trim().startsWith('# ') && line.trim().length > 2) {
				break;
			}

			contentLines.push(line);
			i++;
		}

		// Trim empty lines from start and end of content
		while (contentLines.length > 0 && contentLines[0].trim() === '') {
			contentLines.shift();
		}
		while (contentLines.length > 0 && contentLines[contentLines.length - 1].trim() === '') {
			contentLines.pop();
		}

		const content = contentLines.join('\n');

		const definition: Definition = {
			phrase,
			aliases,
			content,
			sourceFile: filePath,
			sourceType: 'consolidated',
			lineNumber: startIndex + 1 // 1-indexed for editor navigation
		};

		return { definition, endIndex: i };
	}

	/**
	 * Check if a line is a divider
	 */
	private isDivider(line: string): boolean {
		if (line === '---') {
			return true;
		}
		if (this.dividerPattern === 'both' && line === '___') {
			return true;
		}
		return false;
	}

	/**
	 * Update divider pattern
	 */
	setDividerPattern(pattern: 'hyphens' | 'both') {
		this.dividerPattern = pattern;
	}
}
