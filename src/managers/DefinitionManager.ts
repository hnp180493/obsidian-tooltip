import { TFile, TFolder, Notice, parseYaml, MarkdownView } from 'obsidian';
import type NoteDefinitionsPlugin from '../main';
import { Definition, DefinitionCache, DefinitionError } from '../types';
import { ConsolidatedParser } from '../parsers/ConsolidatedParser';
import { AtomicParser } from '../parsers/AtomicParser';

export class DefinitionManager {
	private plugin: NoteDefinitionsPlugin;
	private cache: DefinitionCache;
	private consolidatedParser: ConsolidatedParser;
	private atomicParser: AtomicParser;
	private fileWatcherDebounceTimer: NodeJS.Timeout | null = null;

	constructor(plugin: NoteDefinitionsPlugin) {
		this.plugin = plugin;
		this.cache = {
			definitions: new Map(),
			fileIndex: new Map(),
			lastUpdate: 0
		};
		this.consolidatedParser = new ConsolidatedParser(plugin.settings.dividerPattern);
		this.atomicParser = new AtomicParser();
	}

	/**
	 * Get definition cache
	 */
	getCache(): DefinitionCache {
		return this.cache;
	}

	/**
	 * Clear the cache
	 */
	clearCache() {
		this.cache.definitions.clear();
		this.cache.fileIndex.clear();
		this.cache.lastUpdate = Date.now();
	}

	/**
	 * Add definition to cache
	 */
	private addToCache(definition: Definition) {
		const normalizedPhrase = definition.phrase.toLowerCase();
		
		// Add by phrase
		if (!this.cache.definitions.has(normalizedPhrase)) {
			this.cache.definitions.set(normalizedPhrase, []);
		}
		this.cache.definitions.get(normalizedPhrase)!.push(definition);

		// Add by aliases
		for (const alias of definition.aliases) {
			const normalizedAlias = alias.toLowerCase();
			if (!this.cache.definitions.has(normalizedAlias)) {
				this.cache.definitions.set(normalizedAlias, []);
			}
			this.cache.definitions.get(normalizedAlias)!.push(definition);
		}

		// Update file index
		if (!this.cache.fileIndex.has(definition.sourceFile)) {
			this.cache.fileIndex.set(definition.sourceFile, []);
		}
		this.cache.fileIndex.get(definition.sourceFile)!.push(definition.phrase);
	}

	/**
	 * Remove definitions from a specific file from cache
	 */
	private removeFromCache(filePath: string) {
		const phrases = this.cache.fileIndex.get(filePath);
		if (!phrases) return;

		// Remove all definitions from this file
		for (const [key, defs] of this.cache.definitions.entries()) {
			this.cache.definitions.set(
				key,
				defs.filter(d => d.sourceFile !== filePath)
			);
		}

		// Clean up empty entries
		for (const [key, defs] of this.cache.definitions.entries()) {
			if (defs.length === 0) {
				this.cache.definitions.delete(key);
			}
		}

		// Remove from file index
		this.cache.fileIndex.delete(filePath);
	}

	/**
	 * Load all definitions from the definition folder
	 */
	async loadDefinitions(): Promise<void> {
		if (!this.plugin.settings.definitionFolder) {
			return;
		}

		this.clearCache();

		const folder = this.plugin.app.vault.getAbstractFileByPath(this.plugin.settings.definitionFolder);
		
		if (!folder) {
			// Folder not found
			new Notice(`Definition folder "${this.plugin.settings.definitionFolder}" not found!`);
			return;
		}
		
		if (!(folder instanceof TFolder)) {
			// Path is not a folder
			new Notice(`"${this.plugin.settings.definitionFolder}" is not a folder!`);
			return;
		}

		await this.loadDefinitionsFromFolder(folder);
		this.cache.lastUpdate = Date.now();
		
		// Update file highlights after loading
		this.updateFileHighlights();
	}

	/**
	 * Recursively load definitions from a folder
	 */
	private async loadDefinitionsFromFolder(folder: TFolder): Promise<void> {
		for (const child of folder.children) {
			if (child instanceof TFile && child.extension === 'md') {
				await this.loadDefinitionFile(child);
			} else if (child instanceof TFolder) {
				await this.loadDefinitionsFromFolder(child);
			}
		}
	}

	/**
	 * Load a single definition file
	 */
	private async loadDefinitionFile(file: TFile): Promise<void> {
		try {
			const content = await this.plugin.app.vault.read(file);
			const defType = this.getDefinitionType(content);

			let definitions: Definition[] = [];

			if (defType === 'consolidated') {
				definitions = this.consolidatedParser.parse(content, file.path);
			} else if (defType === 'atomic') {
				const definition = this.atomicParser.parse(file, content);
				definitions = [definition];
			}

			// Add all definitions to cache
			for (const def of definitions) {
				this.addToCache(def);
			}
		} catch (error) {
			// Failed to load definition file
		}
	}

	/**
	 * Determine the type of definition file from its content
	 */
	private getDefinitionType(content: string): 'consolidated' | 'atomic' | null {
		// Extract frontmatter
		const lines = content.split('\n');
		if (lines.length < 2 || lines[0].trim() !== '---') {
			// No frontmatter, default to consolidated
			return 'consolidated';
		}

		let endIndex = -1;
		for (let i = 1; i < lines.length; i++) {
			if (lines[i].trim() === '---') {
				endIndex = i;
				break;
			}
		}

		if (endIndex === -1) {
			return 'consolidated';
		}

		const frontmatterText = lines.slice(1, endIndex).join('\n');
		
		try {
			const frontmatter = parseYaml(frontmatterText);
			if (frontmatter && frontmatter['def-type']) {
				const defType = frontmatter['def-type'];
				if (defType === 'consolidated' || defType === 'atomic') {
					return defType;
				}
			}
		} catch (error) {
			// Failed to parse frontmatter
		}

		// Default to consolidated for backward compatibility
		return 'consolidated';
	}

	/**
	 * Refresh all definitions
	 */
	async refreshDefinitions(): Promise<void> {
		await this.loadDefinitions();
		new Notice('Definitions refreshed');
		
		// Trigger editor refresh
		const activeView = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
		if (activeView) {
			this.plugin.editorManager.refreshEditor(activeView.editor, activeView);
		}
	}

	/**
	 * Register a file as a definition file
	 */
	async registerDefinitionFile(file: TFile | null, type: 'consolidated' | 'atomic'): Promise<void> {
		if (!file) {
			new Notice('No active file');
			return;
		}

		try {
			await this.plugin.app.fileManager.processFrontMatter(file, (frontmatter) => {
				frontmatter['def-type'] = type;
			});

			new Notice(`Registered as ${type} definition file`);
			await this.refreshDefinitions();
		} catch (error) {
			new Notice('Failed to register definition file');
		}
	}

	/**
	 * Get definition by phrase or alias
	 */
	getDefinition(phrase: string, contextFiles?: string[]): Definition | null {
		const normalized = phrase.toLowerCase();
		const definitions = this.cache.definitions.get(normalized);

		if (!definitions || definitions.length === 0) {
			return null;
		}

		// Filter by context if specified
		if (contextFiles && contextFiles.length > 0) {
			const filtered = definitions.filter(d => contextFiles.includes(d.sourceFile));
			return filtered.length > 0 ? filtered[0] : null;
		}

		return definitions[0];
	}

	/**
	 * Get all definitions matching a phrase
	 */
	getDefinitions(phrase: string, contextFiles?: string[]): Definition[] {
		const normalized = phrase.toLowerCase();
		const definitions = this.cache.definitions.get(normalized);

		if (!definitions || definitions.length === 0) {
			return [];
		}

		// Filter by context if specified
		if (contextFiles && contextFiles.length > 0) {
			return definitions.filter(d => contextFiles.includes(d.sourceFile));
		}

		return definitions;
	}

	/**
	 * Get all definitions (optionally filtered by context)
	 */
	getAllDefinitions(contextFiles?: string[]): Definition[] {
		const allDefs: Definition[] = [];
		const seen = new Set<string>();

		for (const defs of this.cache.definitions.values()) {
			for (const def of defs) {
				// Avoid duplicates (same definition might be indexed under phrase and aliases)
				const key = `${def.sourceFile}:${def.phrase}`;
				if (seen.has(key)) continue;
				seen.add(key);

				// Filter by context if specified
				if (contextFiles && contextFiles.length > 0) {
					if (contextFiles.includes(def.sourceFile)) {
						allDefs.push(def);
					}
				} else {
					allDefs.push(def);
				}
			}
		}

		return allDefs;
	}

	/**
	 * Get all phrases (for text decoration)
	 */
	getAllPhrases(contextFiles?: string[]): string[] {
		const definitions = this.getAllDefinitions(contextFiles);
		const phrases = new Set<string>();

		for (const def of definitions) {
			phrases.add(def.phrase);
			for (const alias of def.aliases) {
				phrases.add(alias);
			}
		}

		return Array.from(phrases);
	}

	/**
	 * Check if a file is a definition file
	 */
	isDefinitionFile(filePath: string): boolean {
		return this.cache.fileIndex.has(filePath);
	}

	/**
	 * Find all usages of a phrase across the vault
	 */
	async findUsages(phrase: string): Promise<Array<{ file: string; line: number; text: string }>> {
		const usages: Array<{ file: string; line: number; text: string }> = [];
		const files = this.plugin.app.vault.getMarkdownFiles();
		
		// Create regex for the phrase
		const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		const regex = new RegExp(`\\b${escaped}\\b`, 'gi');

		for (const file of files) {
			// Skip definition files
			if (this.isDefinitionFile(file.path)) {
				continue;
			}

			try {
				const content = await this.plugin.app.vault.read(file);
				const lines = content.split('\n');

				for (let i = 0; i < lines.length; i++) {
					const line = lines[i];
					if (regex.test(line)) {
						usages.push({
							file: file.path,
							line: i + 1,
							text: line.trim()
						});
					}
					// Reset regex lastIndex for next iteration
					regex.lastIndex = 0;
				}
			} catch (error) {
				// Failed to read file
			}
		}

		return usages;
	}

	/**
	 * Set the definition folder
	 */
	async setDefinitionFolder(folderPath: string): Promise<void> {
		this.plugin.settings.definitionFolder = folderPath;
		await this.plugin.saveSettings();
		await this.refreshDefinitions();
		this.updateFolderHighlight();
		new Notice(`Definition folder set to: ${folderPath}`);
	}

	/**
	 * Update the visual highlight on the definition folder
	 */
	updateFolderHighlight(): void {
		// Remove existing highlights
		document.querySelectorAll('.nav-folder.definition-folder').forEach(el => {
			el.classList.remove('definition-folder');
		});

		// Add highlight to current definition folder
		if (this.plugin.settings.definitionFolder) {
			const folderPath = this.plugin.settings.definitionFolder;
			const folderEl = document.querySelector(
				`.nav-folder[data-path="${folderPath}"]`
			);
			
			if (folderEl) {
				folderEl.classList.add('definition-folder');
			}
		}
	}

	/**
	 * Update the visual highlight on definition files
	 */
	updateFileHighlights(): void {
		// Use setTimeout to ensure DOM is ready
		setTimeout(() => {
			// Remove existing file highlights
			document.querySelectorAll('.nav-file.definition-file').forEach(el => {
				el.classList.remove('definition-file');
			});

			// Add highlights to all definition files
			for (const filePath of this.cache.fileIndex.keys()) {
				// Try multiple selectors to find the file element
				let fileEl = document.querySelector(`.nav-file[data-path="${filePath}"]`);
				
				// If not found, try with escaped path
				if (!fileEl) {
					const escapedPath = filePath.replace(/[\\]/g, '\\\\');
					fileEl = document.querySelector(`.nav-file[data-path="${escapedPath}"]`);
				}
				
				// If still not found, try finding by file name
				if (!fileEl) {
					const fileName = filePath.split(/[/\\]/).pop();
					if (fileName) {
						const allFiles = Array.from(document.querySelectorAll('.nav-file'));
						for (const file of allFiles) {
							const titleEl = file.querySelector('.nav-file-title-content');
							if (titleEl && titleEl.textContent?.trim() === fileName.replace('.md', '')) {
								fileEl = file;
								break;
							}
						}
					}
				}
				
				if (fileEl) {
					fileEl.classList.add('definition-file');
				}
			}
		}, 500); // Increased timeout to ensure DOM is ready
	}

	/**
	 * Handle file changes (debounced)
	 */
	onFileChange(file: TFile): void {
		// Check if file is in definition folder
		if (!this.isInDefinitionFolder(file.path)) {
			return;
		}

		// Debounce the refresh
		if (this.fileWatcherDebounceTimer) {
			clearTimeout(this.fileWatcherDebounceTimer);
		}

		this.fileWatcherDebounceTimer = setTimeout(async () => {
			await this.reloadFile(file);
		}, 500);
	}

	/**
	 * Handle file deletion
	 */
	onFileDelete(file: TFile): void {
		if (!this.isInDefinitionFolder(file.path)) {
			return;
		}

		this.removeFromCache(file.path);
		this.updateFileHighlights();
	}

	/**
	 * Handle file rename
	 */
	async onFileRename(file: TFile, oldPath: string): Promise<void> {
		if (!this.isInDefinitionFolder(oldPath) && !this.isInDefinitionFolder(file.path)) {
			return;
		}

		// Remove old path from cache
		this.removeFromCache(oldPath);

		// Reload if still in definition folder
		if (this.isInDefinitionFolder(file.path)) {
			await this.reloadFile(file);
		}
	}

	/**
	 * Check if a file path is in the definition folder
	 */
	private isInDefinitionFolder(filePath: string): boolean {
		if (!this.plugin.settings.definitionFolder) {
			return false;
		}

		return filePath.startsWith(this.plugin.settings.definitionFolder);
	}

	/**
	 * Reload a single file
	 */
	private async reloadFile(file: TFile): Promise<void> {
		// Remove existing definitions from this file
		this.removeFromCache(file.path);

		// Reload the file
		await this.loadDefinitionFile(file);

		// Update file highlights
		this.updateFileHighlights();

		// Trigger editor refresh
		const activeView = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
		if (activeView) {
			this.plugin.editorManager.refreshEditor(activeView.editor, activeView);
		}
	}
}
