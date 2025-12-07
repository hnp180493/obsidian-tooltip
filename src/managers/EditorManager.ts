import { Editor, MarkdownView, editorLivePreviewField } from 'obsidian';
import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate } from '@codemirror/view';
import { RangeSetBuilder, StateEffect, StateField } from '@codemirror/state';
import type NoteDefinitionsPlugin from '../main';
import { DefinitionPopover } from '../ui/DefinitionPopover';

// State effect to force decoration refresh
const forceRefreshEffect = StateEffect.define<null>();

export class EditorManager {
	private plugin: NoteDefinitionsPlugin;
	private decorationCache: Map<string, string[]> = new Map();
	private popover: DefinitionPopover;
	private hoverTimeout: NodeJS.Timeout | null = null;

	constructor(plugin: NoteDefinitionsPlugin) {
		this.plugin = plugin;
		this.popover = new DefinitionPopover(plugin);
		this.registerEditorExtension();
		this.registerHoverHandler();
	}

	/**
	 * Register CodeMirror 6 extension for decorations
	 */
	private registerEditorExtension() {
		const plugin = this.plugin;

		this.plugin.registerEditorExtension([
			ViewPlugin.fromClass(class {
				decorations: DecorationSet;

				constructor(view: EditorView) {
					this.decorations = this.buildDecorations(view);
				}

				update(update: ViewUpdate) {
					// Rebuild decorations if document changed, viewport changed, or force refresh triggered
					const hasForceRefresh = update.transactions.some((tr: any) => 
						tr.effects.some((e: any) => e.is(forceRefreshEffect))
					);
					
					if (update.docChanged || update.viewportChanged || hasForceRefresh) {
						this.decorations = this.buildDecorations(update.view);
					}
				}

				buildDecorations(view: EditorView): DecorationSet {
					const builder = new RangeSetBuilder<Decoration>();
					const text = view.state.doc.toString();
					
					// Get context files for current note
					const contextFiles = plugin.editorManager.getContextFiles(view);
					
					// Get all phrases to highlight
					const phrases = plugin.definitionManager.getAllPhrases(contextFiles);
					
					if (phrases.length === 0) {
						return builder.finish();
					}

					// Find all occurrences of phrases
					const matches = plugin.editorManager.findPhrases(text, phrases);
					
					// Add decorations
					for (const match of matches) {
						const deco = Decoration.mark({
							class: 'definition-underline',
							attributes: {
								'data-phrase': match.phrase
							}
						});
						builder.add(match.from, match.to, deco);
					}

					return builder.finish();
				}
			}, {
				decorations: (v: any) => v.decorations
			})
		]);
	}

	/**
	 * Find all phrase occurrences in text
	 */
	findPhrases(text: string, phrases: string[]): Array<{ phrase: string; from: number; to: number }> {
		const matches: Array<{ phrase: string; from: number; to: number }> = [];
		
		// Sort phrases by length (longest first) to handle overlapping matches
		const sortedPhrases = [...phrases].sort((a, b) => b.length - a.length);
		
		for (const phrase of sortedPhrases) {
			// Create regex with word boundaries
			const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
			const regex = new RegExp(`\\b${escaped}\\b`, 'gi');
			
			let match;
			while ((match = regex.exec(text)) !== null) {
				const from = match.index;
				const to = from + match[0].length;
				
				// Check if this position is already covered by a longer phrase
				const overlaps = matches.some(m => 
					(from >= m.from && from < m.to) || 
					(to > m.from && to <= m.to)
				);
				
				if (!overlaps) {
					matches.push({ phrase: match[0], from, to });
				}
			}
		}
		
		// Sort by position
		return matches.sort((a, b) => a.from - b.from);
	}

	/**
	 * Get context files for current note
	 */
	getContextFiles(view: EditorView): string[] | undefined {
		// Get the active markdown view to access the file
		const activeView = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
		
		if (!activeView || !activeView.file) {
			return undefined;
		}

		// Get frontmatter
		const cache = this.plugin.app.metadataCache.getFileCache(activeView.file);
		if (!cache || !cache.frontmatter) {
			return undefined;
		}

		const defContext = cache.frontmatter['def-context'];
		if (!defContext) {
			return undefined;
		}

		if (Array.isArray(defContext)) {
			return defContext;
		}

		return [defContext];
	}

	/**
	 * Handle editor change
	 */
	onEditorChange(editor: Editor, view: MarkdownView) {
		// Decorations are handled automatically by CodeMirror extension
	}

	/**
	 * Handle active leaf change
	 */
	onActiveLeafChange(leaf: any) {
		// Decorations are handled automatically by CodeMirror extension
	}

	/**
	 * Refresh editor decorations
	 */
	refreshEditor(editor: Editor, view: MarkdownView) {
		// Force a refresh by dispatching the force refresh effect
		const cm = (editor as any).cm;
		if (cm) {
			cm.dispatch({
				effects: [forceRefreshEffect.of(null)]
			});
		}
	}

	/**
	 * Cleanup
	 */
	cleanup() {
		this.decorationCache.clear();
	}

	/**
	 * Register hover handler
	 */
	private registerHoverHandler() {
		this.plugin.registerDomEvent(document, 'mouseover', (event: MouseEvent) => {
			if (!this.plugin.settings.enableHoverPreview) {
				return;
			}

			const target = event.target as HTMLElement;
			
			// Check if hovering over a definition underline
			if (target.classList.contains('definition-underline')) {
				const phrase = target.getAttribute('data-phrase');
				
				if (phrase) {
					this.schedulePopover(phrase, event);
				}
			} else {
				// Clear hover timeout if not hovering over definition
				this.clearHoverTimeout();
				
				// Hide popover if setting is enabled and not hovering over popover itself
				if (this.plugin.settings.hidePopoverOnMouseOut && 
					!target.closest('.definition-popover')) {
					this.popover.hide();
				}
			}
		});

		this.plugin.registerDomEvent(document, 'mouseout', (event: MouseEvent) => {
			const target = event.target as HTMLElement;
			
			if (target.classList.contains('definition-underline')) {
				this.clearHoverTimeout();
				
				// Hide popover when mouse leaves the highlighted word
				if (this.plugin.settings.hidePopoverOnMouseOut) {
					// Small delay to allow moving to popover
					setTimeout(() => {
						const hoveredElement = document.elementFromPoint(event.clientX, event.clientY);
						if (!hoveredElement?.closest('.definition-popover')) {
							this.popover.hide();
						}
					}, 50);
				}
			}
		});
	}

	/**
	 * Schedule popover display with delay
	 */
	private schedulePopover(phrase: string, event: MouseEvent) {
		this.clearHoverTimeout();

		this.hoverTimeout = setTimeout(async () => {
			await this.showPopoverForPhrase(phrase, event);
		}, this.plugin.settings.popoverDelay);
	}

	/**
	 * Clear hover timeout
	 */
	private clearHoverTimeout() {
		if (this.hoverTimeout) {
			clearTimeout(this.hoverTimeout);
			this.hoverTimeout = null;
		}
	}

	/**
	 * Show popover for a phrase
	 */
	private async showPopoverForPhrase(phrase: string, event: MouseEvent) {
		// Get context files
		const activeView = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
		let contextFiles: string[] | undefined;
		
		if (activeView && activeView.file) {
			// Check if we're in a definition file
			const isDefFile = this.plugin.definitionManager.isDefinitionFile(activeView.file.path);
			
			if (isDefFile) {
				// Show usages instead of definition
				await this.popover.showUsages(phrase, { x: event.clientX, y: event.clientY });
				return;
			}
			
			const cache = this.plugin.app.metadataCache.getFileCache(activeView.file);
			if (cache?.frontmatter?.['def-context']) {
				contextFiles = cache.frontmatter['def-context'];
			}
		}

		// Get definition
		const definition = this.plugin.definitionManager.getDefinition(phrase, contextFiles);
		
		if (definition) {
			await this.popover.show(definition, { x: event.clientX, y: event.clientY });
		}
	}

	/**
	 * Get definition at cursor position
	 */
	getDefinitionAtCursor(editor: Editor): string | null {
		const cursor = editor.getCursor();
		const line = editor.getLine(cursor.line);
		const pos = cursor.ch;

		// Get all phrases
		const contextFiles = this.getContextFilesFromEditor(editor);
		const phrases = this.plugin.definitionManager.getAllPhrases(contextFiles);

		// Find phrase at cursor position
		for (const phrase of phrases) {
			const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
			const regex = new RegExp(`\\b${escaped}\\b`, 'gi');
			
			let match;
			while ((match = regex.exec(line)) !== null) {
				const start = match.index;
				const end = start + match[0].length;
				
				if (pos >= start && pos <= end) {
					return match[0];
				}
			}
		}

		return null;
	}

	/**
	 * Get context files from editor
	 */
	private getContextFilesFromEditor(editor: Editor): string[] | undefined {
		const activeView = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
		
		if (!activeView || !activeView.file) {
			return undefined;
		}

		const cache = this.plugin.app.metadataCache.getFileCache(activeView.file);
		if (!cache?.frontmatter?.['def-context']) {
			return undefined;
		}

		return cache.frontmatter['def-context'];
	}
}
