import { Editor, MarkdownView, Menu, Notice, TFile } from 'obsidian';
import type NoteDefinitionsPlugin from '../main';
import { DefinitionModal } from '../ui/DefinitionModal';
import { Definition } from '../types';

export class UIManager {
	private plugin: NoteDefinitionsPlugin;

	constructor(plugin: NoteDefinitionsPlugin) {
		this.plugin = plugin;
	}

	/**
	 * Show add definition modal (or edit if definition already exists)
	 */
	async showAddDefinitionModal(editor: Editor, view: MarkdownView) {
		// Get selected text if any
		const selectedText = editor.getSelection();
		
		// Get context files for definition lookup
		const cache = view.file ? this.plugin.app.metadataCache.getFileCache(view.file) : null;
		const contextFiles = cache?.frontmatter?.['def-context'];

		let textToCheck = selectedText;
		
		// If no text is selected, check if cursor is on a definition word
		if (!selectedText) {
			const phraseAtCursor = this.plugin.editorManager.getDefinitionAtCursor(editor);
			if (phraseAtCursor) {
				textToCheck = phraseAtCursor;
			}
		}

		// Check if a definition already exists for the text
		if (textToCheck) {
			const existingDefinition = this.plugin.definitionManager.getDefinition(textToCheck, contextFiles);

			if (existingDefinition) {
				// Definition exists, show edit modal
				const modal = new DefinitionModal(
					this.plugin.app,
					existingDefinition.phrase,
					existingDefinition.aliases,
					existingDefinition.content,
					[], // No file selection for editing
					'',
					async (newPhrase, newAliases, newContent) => {
						await this.updateDefinition(existingDefinition, newPhrase, newAliases, newContent);
					},
					async () => {
						await this.deleteDefinition(existingDefinition);
					}
				);

				modal.open();
				return;
			}
		}

		// No definition exists or no text found, show add modal
		await this.showNewDefinitionModal(editor, view, selectedText || '');
	}

	/**
	 * Show new definition modal
	 */
	private async showNewDefinitionModal(editor: Editor, view: MarkdownView, selectedText: string) {
		// Get available definition files
		const availableFiles = await this.getAvailableDefinitionFiles();

		// Get last selected file or default
		const defaultFile = this.plugin.settings.lastSelectedDefinitionFile || 
			(availableFiles.length > 0 ? availableFiles[0].path : '');

		const modal = new DefinitionModal(
			this.plugin.app,
			selectedText,
			[],
			'',
			availableFiles,
			defaultFile,
			async (phrase, aliases, content, targetFile) => {
				await this.addDefinition(phrase, aliases, content, targetFile);
			}
		);

		modal.open();
	}

	/**
	 * Get available definition files from the definition folder
	 */
	private async getAvailableDefinitionFiles(): Promise<TFile[]> {
		if (!this.plugin.settings.definitionFolder) {
			return [];
		}

		const folder = this.plugin.app.vault.getAbstractFileByPath(this.plugin.settings.definitionFolder);
		
		if (!folder || !('children' in folder)) {
			return [];
		}

		const files: TFile[] = [];
		
		// Recursively collect all markdown files
		const collectFiles = (folder: any) => {
			for (const child of folder.children) {
				if ('extension' in child && child.extension === 'md') {
					files.push(child);
				} else if ('children' in child) {
					collectFiles(child);
				}
			}
		};

		collectFiles(folder);
		return files;
	}

	/**
	 * Add a new definition
	 */
	private async addDefinition(phrase: string, aliases: string[], content: string, targetFile?: string): Promise<void> {
		if (!this.plugin.settings.definitionFolder) {
			new Notice('Please set a definition folder first');
			return;
		}

		// Use specified target file or get/create default
		let defFile = targetFile;
		
		if (!defFile) {
			defFile = await this.getOrCreateDefinitionFile();
			if (!defFile) {
				new Notice('Failed to create definition file');
				return;
			}
		}

		// Save the selected file for next time
		this.plugin.settings.lastSelectedDefinitionFile = defFile;
		await this.plugin.saveSettings();

		// Add definition to file
		await this.appendToConsolidatedFile(defFile, phrase, aliases, content);
		
		// Refresh definitions
		await this.plugin.definitionManager.refreshDefinitions();
		
		new Notice(`Definition added: ${phrase}`);
	}

	/**
	 * Get or create a consolidated definition file
	 */
	private async getOrCreateDefinitionFile(): Promise<string> {
		const folder = this.plugin.settings.definitionFolder;
		const fileName = 'definitions.md';
		const filePath = `${folder}/${fileName}`;

		// Check if file exists
		const existingFile = this.plugin.app.vault.getAbstractFileByPath(filePath);
		
		if (existingFile) {
			return filePath;
		}

		// Create the file with frontmatter
		const content = '---\ndef-type: consolidated\n---\n\n';
		
		try {
			await this.plugin.app.vault.create(filePath, content);
			return filePath;
		} catch (error) {
			// Failed to create definition file
			return '';
		}
	}

	/**
	 * Append definition to consolidated file
	 */
	private async appendToConsolidatedFile(
		filePath: string,
		phrase: string,
		aliases: string[],
		content: string
	): Promise<void> {
		const file = this.plugin.app.vault.getAbstractFileByPath(filePath);
		
		if (!file || 'children' in file) {
			throw new Error('File not found');
		}

		const existingContent = await this.plugin.app.vault.read(file as any);
		
		// Build the new definition block
		let newBlock = `\n# ${phrase}\n`;
		
		if (aliases.length > 0) {
			newBlock += `\n*${aliases.join(', ')}*\n`;
		}
		
		newBlock += `\n${content}\n\n---\n`;

		// Append to file
		await this.plugin.app.vault.modify(file as any, existingContent + newBlock);
	}

	/**
	 * Preview definition at cursor
	 */
	async previewDefinitionAtCursor(editor: Editor, view: MarkdownView) {
		const phrase = this.plugin.editorManager.getDefinitionAtCursor(editor);
		
		if (!phrase) {
			new Notice('No definition found at cursor');
			return;
		}

		// Get context files
		const cache = view.file ? this.plugin.app.metadataCache.getFileCache(view.file) : null;
		const contextFiles = cache?.frontmatter?.['def-context'];

		// Get definition
		const definition = this.plugin.definitionManager.getDefinition(phrase, contextFiles);
		
		if (!definition) {
			new Notice(`No definition found for: ${phrase}`);
			return;
		}

		// Get cursor position on screen
		const cursor = editor.getCursor();
		const coords = (editor as any).coordsAtPos?.(cursor);
		
		if (coords) {
			await this.plugin.editorManager['popover'].show(definition, { 
				x: coords.left, 
				y: coords.bottom 
			});
		}
	}

	/**
	 * Go to definition at cursor
	 */
	async goToDefinitionAtCursor(editor: Editor, view: MarkdownView) {
		const phrase = this.plugin.editorManager.getDefinitionAtCursor(editor);
		
		if (!phrase) {
			new Notice('No definition found at cursor');
			return;
		}

		// Get context files
		const cache = view.file ? this.plugin.app.metadataCache.getFileCache(view.file) : null;
		const contextFiles = cache?.frontmatter?.['def-context'];

		// Get definition
		const definition = this.plugin.definitionManager.getDefinition(phrase, contextFiles);
		
		if (!definition) {
			new Notice(`No definition found for: ${phrase}`);
			return;
		}

		await this.navigateToDefinition(definition);
	}

	/**
	 * Navigate to definition source
	 */
	async navigateToDefinition(definition: Definition) {
		const file = this.plugin.app.vault.getAbstractFileByPath(definition.sourceFile);
		
		if (!file || 'children' in file) {
			new Notice('Definition file not found');
			return;
		}

		// Open the file
		const leaf = this.plugin.app.workspace.getLeaf(false);
		await leaf.openFile(file as any);

		// Navigate to specific line for consolidated files
		if (definition.sourceType === 'consolidated' && definition.lineNumber) {
			const view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
			if (view) {
				const editor = view.editor;
				const line = definition.lineNumber - 1; // Convert to 0-indexed
				
				// Set cursor position
				editor.setCursor({ line, ch: 0 });
				
				// Scroll to line
				editor.scrollIntoView({ from: { line, ch: 0 }, to: { line, ch: 0 } }, true);
			}
		}
	}

	/**
	 * Show add context modal
	 */
	showAddContextModal(view: MarkdownView) {
		if (!this.plugin.settings.definitionFolder) {
			new Notice('Please set a definition folder first');
			return;
		}

		const modal = new (require('../ui/ContextSelectorModal').ContextSelectorModal)(
			this.plugin.app,
			this.plugin,
			async (file: any) => {
				await this.addContextToNote(view.file, file.path);
			}
		);

		modal.open();
	}

	/**
	 * Add context to note
	 */
	private async addContextToNote(noteFile: any, contextPath: string): Promise<void> {
		if (!noteFile) {
			new Notice('No active file');
			return;
		}

		try {
			await this.plugin.app.fileManager.processFrontMatter(noteFile, (frontmatter) => {
				if (!frontmatter['def-context']) {
					frontmatter['def-context'] = [];
				}

				if (!Array.isArray(frontmatter['def-context'])) {
					frontmatter['def-context'] = [frontmatter['def-context']];
				}

				if (!frontmatter['def-context'].includes(contextPath)) {
					frontmatter['def-context'].push(contextPath);
				}
			});

			new Notice(`Added context: ${contextPath}`);

			// Refresh editor
			const activeView = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
			if (activeView) {
				this.plugin.editorManager.refreshEditor(activeView.editor, activeView);
			}
		} catch (error) {
			new Notice('Failed to add context');
		}
	}

	/**
	 * Add editor menu items
	 */
	addEditorMenuItems(menu: Menu, editor: Editor, view: MarkdownView) {
		const phrase = this.plugin.editorManager.getDefinitionAtCursor(editor);
		const selectedText = editor.getSelection();

		// Add "Go to definition" if cursor is on a definition
		if (phrase) {
			menu.addItem((item) => {
				item
					.setTitle('Go to definition')
					.setIcon('link')
					.onClick(async () => {
						await this.goToDefinitionAtCursor(editor, view);
					});
			});

			// Add "Edit definition" if cursor is on a definition
			menu.addItem((item) => {
				item
					.setTitle('Edit definition')
					.setIcon('pencil')
					.onClick(async () => {
						await this.editDefinitionAtCursor(editor, view);
					});
			});
		}

		// Add "Add definition" if text is selected
		if (selectedText) {
			menu.addItem((item) => {
				item
					.setTitle('Add definition')
					.setIcon('plus')
					.onClick(() => {
						this.showAddDefinitionModal(editor, view);
					});
			});
		}
	}

	/**
	 * Edit definition at cursor
	 */
	async editDefinitionAtCursor(editor: Editor, view: MarkdownView) {
		const phrase = this.plugin.editorManager.getDefinitionAtCursor(editor);
		
		if (!phrase) {
			new Notice('No definition found at cursor');
			return;
		}

		// Get context files
		const cache = view.file ? this.plugin.app.metadataCache.getFileCache(view.file) : null;
		const contextFiles = cache?.frontmatter?.['def-context'];

		// Get definition
		const definition = this.plugin.definitionManager.getDefinition(phrase, contextFiles);
		
		if (!definition) {
			new Notice(`No definition found for: ${phrase}`);
			return;
		}

		// Show edit modal (no file selector for editing)
		const modal = new DefinitionModal(
			this.plugin.app,
			definition.phrase,
			definition.aliases,
			definition.content,
			[], // No file selection for editing
			'',
			async (newPhrase, newAliases, newContent) => {
				await this.updateDefinition(definition, newPhrase, newAliases, newContent);
			},
			async () => {
				await this.deleteDefinition(definition);
			}
		);

		modal.open();
	}

	/**
	 * Update an existing definition
	 */
	private async updateDefinition(
		definition: Definition,
		newPhrase: string,
		newAliases: string[],
		newContent: string
	): Promise<void> {
		const file = this.plugin.app.vault.getAbstractFileByPath(definition.sourceFile);
		
		if (!file || 'children' in file) {
			new Notice('Definition file not found');
			return;
		}

		try {
			if (definition.sourceType === 'consolidated') {
				await this.updateConsolidatedDefinition(file, definition, newPhrase, newAliases, newContent);
			} else {
				await this.updateAtomicDefinition(file, definition, newPhrase, newAliases, newContent);
			}

			// Refresh definitions
			await this.plugin.definitionManager.refreshDefinitions();
			
			new Notice('Definition updated');
		} catch (error) {
			new Notice('Failed to update definition');
		}
	}

	/**
	 * Delete a definition
	 */
	private async deleteDefinition(definition: Definition): Promise<void> {
		const file = this.plugin.app.vault.getAbstractFileByPath(definition.sourceFile);
		
		if (!file || 'children' in file) {
			new Notice('Definition file not found');
			return;
		}

		try {
			if (definition.sourceType === 'consolidated') {
				await this.deleteConsolidatedDefinition(file, definition);
			} else {
				await this.deleteAtomicDefinition(file);
			}

			// Refresh definitions
			await this.plugin.definitionManager.refreshDefinitions();
			
			new Notice('Definition deleted');
		} catch (error) {
			new Notice('Failed to delete definition');
		}
	}

	/**
	 * Delete consolidated definition
	 */
	private async deleteConsolidatedDefinition(file: any, definition: Definition): Promise<void> {
		const content = await this.plugin.app.vault.read(file);
		const lines = content.split('\n');

		if (!definition.lineNumber) {
			throw new Error('Line number not found');
		}

		const startLine = definition.lineNumber - 1; // Convert to 0-indexed
		
		// Find the end of this definition block
		let endLine = startLine + 1;
		while (endLine < lines.length) {
			const line = lines[endLine].trim();
			if (line === '---' || line === '___' || (line.startsWith('# ') && line.length > 2)) {
				break;
			}
			endLine++;
		}

		// Include the divider line if present
		if (endLine < lines.length && (lines[endLine].trim() === '---' || lines[endLine].trim() === '___')) {
			endLine++;
		}

		// Remove the definition block
		const newLines = [
			...lines.slice(0, startLine),
			...lines.slice(endLine)
		];

		await this.plugin.app.vault.modify(file, newLines.join('\n'));
	}

	/**
	 * Delete atomic definition
	 */
	private async deleteAtomicDefinition(file: any): Promise<void> {
		// For atomic files, just delete the entire file
		await this.plugin.app.vault.delete(file);
	}

	/**
	 * Update consolidated definition
	 */
	private async updateConsolidatedDefinition(
		file: any,
		definition: Definition,
		newPhrase: string,
		newAliases: string[],
		newContent: string
	): Promise<void> {
		const content = await this.plugin.app.vault.read(file);
		const lines = content.split('\n');

		if (!definition.lineNumber) {
			throw new Error('Line number not found');
		}

		const startLine = definition.lineNumber - 1; // Convert to 0-indexed
		
		// Find the end of this definition block
		let endLine = startLine + 1;
		while (endLine < lines.length) {
			const line = lines[endLine].trim();
			if (line === '---' || line === '___' || (line.startsWith('# ') && line.length > 2)) {
				break;
			}
			endLine++;
		}

		// Build new definition block
		let newBlock = `# ${newPhrase}`;
		
		if (newAliases.length > 0) {
			newBlock += `\n\n*${newAliases.join(', ')}*`;
		}
		
		newBlock += `\n\n${newContent}`;

		// Replace the definition block
		const newLines = [
			...lines.slice(0, startLine),
			newBlock,
			...lines.slice(endLine)
		];

		await this.plugin.app.vault.modify(file, newLines.join('\n'));
	}

	/**
	 * Update atomic definition
	 */
	private async updateAtomicDefinition(
		file: any,
		definition: Definition,
		newPhrase: string,
		newAliases: string[],
		newContent: string
	): Promise<void> {
		// For atomic files, update frontmatter and content
		await this.plugin.app.fileManager.processFrontMatter(file, (frontmatter) => {
			if (newAliases.length > 0) {
				frontmatter.aliases = newAliases;
			} else {
				delete frontmatter.aliases;
			}
		});

		// Update content
		const content = await this.plugin.app.vault.read(file);
		const lines = content.split('\n');
		
		// Find end of frontmatter
		let contentStart = 0;
		if (lines[0].trim() === '---') {
			for (let i = 1; i < lines.length; i++) {
				if (lines[i].trim() === '---') {
					contentStart = i + 1;
					break;
				}
			}
		}

		// Build new content
		const frontmatterLines = lines.slice(0, contentStart);
		const newLines = [...frontmatterLines, '', newContent];

		await this.plugin.app.vault.modify(file, newLines.join('\n'));

		// Rename file if phrase changed
		if (newPhrase !== definition.phrase) {
			const newPath = file.path.replace(file.name, `${newPhrase}.md`);
			await this.plugin.app.fileManager.renameFile(file, newPath);
		}
	}

	cleanup() {
		// Cleanup if needed
	}
}
