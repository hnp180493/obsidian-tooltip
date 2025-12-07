import { MarkdownRenderer, MarkdownView, TFile } from 'obsidian';
import { Definition } from '../types';
import type NoteDefinitionsPlugin from '../main';

export class DefinitionPopover {
	private plugin: NoteDefinitionsPlugin;
	private popoverEl: HTMLElement | null = null;

	constructor(plugin: NoteDefinitionsPlugin) {
		this.plugin = plugin;
	}

	/**
	 * Show popover with definition
	 */
	async show(definition: Definition, position: { x: number; y: number }): Promise<void> {
		// Hide any existing popover
		this.hide();

		// Create popover element
		this.popoverEl = document.body.createDiv('definition-popover');
		
		// Add phrase header
		const header = this.popoverEl.createDiv('definition-popover-header');
		header.createEl('strong', { text: definition.phrase });

		// Add aliases if present
		if (definition.aliases.length > 0) {
			const aliasEl = this.popoverEl.createDiv('definition-popover-aliases');
			aliasEl.createEl('em', { text: `(${definition.aliases.join(', ')})` });
		}

		// Add content
		const contentEl = this.popoverEl.createDiv('definition-popover-content');
		await MarkdownRenderer.renderMarkdown(
			definition.content,
			contentEl,
			'',
			this.plugin
		);

		// Position the popover
		this.positionPopover(position);

		// Add click outside listener to close
		setTimeout(() => {
			document.addEventListener('click', this.handleClickOutside);
		}, 100);
	}

	/**
	 * Show popover with usages of a phrase
	 */
	async showUsages(phrase: string, position: { x: number; y: number }): Promise<void> {
		// Hide any existing popover
		this.hide();

		// Create popover element
		this.popoverEl = document.body.createDiv('definition-popover definition-popover-usages');
		
		// Add header
		const header = this.popoverEl.createDiv('definition-popover-header');
		header.createEl('strong', { text: `Usages of "${phrase}"` });

		// Add loading message
		const contentEl = this.popoverEl.createDiv('definition-popover-content');
		contentEl.createEl('div', { text: 'Loading usages...', cls: 'definition-popover-loading' });

		// Position the popover
		this.positionPopover(position);

		// Add click outside listener to close
		setTimeout(() => {
			document.addEventListener('click', this.handleClickOutside);
		}, 100);

		// Find usages asynchronously
		const usages = await this.plugin.definitionManager.findUsages(phrase);

		// Update content with usages
		contentEl.empty();

		if (usages.length === 0) {
			contentEl.createEl('div', { 
				text: 'No usages found in non-definition files', 
				cls: 'definition-popover-no-usages' 
			});
		} else {
			const usageList = contentEl.createEl('div', { cls: 'definition-popover-usage-list' });
			
			for (const usage of usages) {
				const usageItem = usageList.createEl('div', { cls: 'definition-popover-usage-item' });
				
				// File name (clickable)
				const fileLink = usageItem.createEl('a', { 
					cls: 'definition-popover-usage-file',
					href: '#'
				});
				fileLink.textContent = `${usage.file}:${usage.line}`;
				
				// Handle click to open file
				fileLink.addEventListener('click', async (e) => {
					e.preventDefault();
					const file = this.plugin.app.vault.getAbstractFileByPath(usage.file);
					if (file instanceof this.plugin.app.vault.adapter.constructor) {
						return;
					}
					await this.plugin.app.workspace.openLinkText(usage.file, '', false);
					
					// Jump to line
					const view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
					if (view) {
						const editor = view.editor;
						editor.setCursor({ line: usage.line - 1, ch: 0 });
						editor.scrollIntoView({ from: { line: usage.line - 1, ch: 0 }, to: { line: usage.line - 1, ch: 0 } }, true);
					}
					
					this.hide();
				});
				
				// Preview text with markdown rendering
				const previewEl = usageItem.createEl('div', { cls: 'definition-popover-usage-text' });
				await MarkdownRenderer.renderMarkdown(
					usage.text,
					previewEl,
					usage.file,
					this.plugin
				);
			}
		}
	}

	/**
	 * Hide popover
	 */
	hide(): void {
		if (this.popoverEl) {
			this.popoverEl.remove();
			this.popoverEl = null;
			document.removeEventListener('click', this.handleClickOutside);
		}
	}

	/**
	 * Position popover near the cursor
	 */
	private positionPopover(position: { x: number; y: number }): void {
		if (!this.popoverEl) return;

		const popover = this.popoverEl;
		const padding = 10;
		
		// Initial position
		let left = position.x;
		let top = position.y + 20; // Below cursor

		// Get popover dimensions
		const rect = popover.getBoundingClientRect();
		const width = rect.width;
		const height = rect.height;

		// Adjust if too far right
		if (left + width > window.innerWidth - padding) {
			left = window.innerWidth - width - padding;
		}

		// Adjust if too far left
		if (left < padding) {
			left = padding;
		}

		// Adjust if too far down
		if (top + height > window.innerHeight - padding) {
			top = position.y - height - 10; // Above cursor
		}

		// Adjust if too far up
		if (top < padding) {
			top = padding;
		}

		popover.style.left = `${left}px`;
		popover.style.top = `${top}px`;
	}

	/**
	 * Handle click outside popover
	 */
	private handleClickOutside = (event: MouseEvent): void => {
		if (this.popoverEl && !this.popoverEl.contains(event.target as Node)) {
			this.hide();
		}
	};

	/**
	 * Check if popover is visible
	 */
	isVisible(): boolean {
		return this.popoverEl !== null;
	}
}
