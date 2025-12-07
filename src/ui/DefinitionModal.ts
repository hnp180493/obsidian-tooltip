import { App, Modal, Setting, Notice, TFile } from 'obsidian';

export class DefinitionModal extends Modal {
	phrase: string;
	aliases: string;
	content: string;
	selectedFile: string;
	availableFiles: TFile[];
	onSubmit: (phrase: string, aliases: string[], content: string, targetFile: string) => void;
	onDelete?: () => void;

	constructor(
		app: App,
		phrase: string = '',
		aliases: string[] = [],
		content: string = '',
		availableFiles: TFile[] = [],
		defaultFile: string = '',
		onSubmit: (phrase: string, aliases: string[], content: string, targetFile: string) => void,
		onDelete?: () => void
	) {
		super(app);
		this.phrase = phrase;
		this.aliases = aliases.join(', ');
		this.content = content;
		this.availableFiles = availableFiles;
		this.selectedFile = defaultFile || (availableFiles.length > 0 ? availableFiles[0].path : '');
		this.onSubmit = onSubmit;
		this.onDelete = onDelete;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		const isEditing = this.onDelete !== undefined;
		contentEl.createEl('h2', { text: isEditing ? 'Edit Definition' : 'Add Definition' });

		// File selector (only show if there are multiple files)
		if (this.availableFiles.length > 0) {
			new Setting(contentEl)
				.setName('Target File')
				.setDesc('Choose which file to add this definition to')
				.addDropdown(dropdown => {
					// Add options for each available file
					this.availableFiles.forEach(file => {
						dropdown.addOption(file.path, file.basename);
					});
					
					// Set the selected value
					if (this.selectedFile) {
						dropdown.setValue(this.selectedFile);
					}
					
					dropdown.onChange(value => {
						this.selectedFile = value;
					});
				});
		}

		// Phrase input
		let phraseInput: HTMLInputElement | undefined;
		new Setting(contentEl)
			.setName('Word/Phrase')
			.setDesc('The word or phrase to define')
			.addText(text => {
				phraseInput = text.inputEl;
				text
					.setPlaceholder('Enter word or phrase')
					.setValue(this.phrase)
					.onChange(value => {
						this.phrase = value;
					});
				
				// Add Ctrl+Enter keyboard shortcut to phrase input
				text.inputEl.addEventListener('keydown', (e: KeyboardEvent) => {
					if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
						e.preventDefault();
						this.submit();
					}
				});
			});

		// Aliases input
		let aliasInput: HTMLInputElement | undefined;
		new Setting(contentEl)
			.setName('Aliases (optional)')
			.setDesc('Comma-separated alternative terms')
			.addText(text => {
				aliasInput = text.inputEl;
				text
					.setPlaceholder('alias1, alias2')
					.setValue(this.aliases)
					.onChange(value => {
						this.aliases = value;
					});
				
				// Add Ctrl+Enter keyboard shortcut to aliases input
				text.inputEl.addEventListener('keydown', (e: KeyboardEvent) => {
					if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
						e.preventDefault();
						this.submit();
					}
				});
			});

		// Content textarea
		const contentSetting = new Setting(contentEl)
			.setName('Definition')
			.setDesc('The definition content (markdown supported)');

		const textArea = contentEl.createEl('textarea', {
			attr: {
				placeholder: 'Enter definition...',
				rows: '10',
				style: 'width: 100%; margin-top: 10px; padding: 8px; font-family: var(--font-text); resize: vertical;'
			}
		});
		textArea.value = this.content;
		textArea.addEventListener('input', () => {
			this.content = textArea.value;
		});

		// Add Ctrl+Enter keyboard shortcut to submit
		textArea.addEventListener('keydown', (e: KeyboardEvent) => {
			if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
				e.preventDefault();
				this.submit();
			}
		});

		// Auto-focus the textarea after a short delay to ensure modal is fully rendered
		setTimeout(() => {
			textArea.focus();
		}, 50);

		// Add global modal keydown listener as fallback
		contentEl.addEventListener('keydown', (e: KeyboardEvent) => {
			if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
				// Only trigger if the event hasn't been handled by specific input listeners
				if (!e.defaultPrevented) {
					e.preventDefault();
					this.submit();
				}
			}
		});

		// Submit and Delete buttons
		const buttonSetting = new Setting(contentEl)
			.addButton(btn => btn
				.setButtonText('Add Definition')
				.setCta()
				.onClick(() => {
					this.submit();
				}));
		
		// Only add delete button when editing
		if (this.onDelete) {
			buttonSetting.addButton(btn => btn
				.setButtonText('Delete')
				.setWarning()
				.onClick(() => {
					this.delete();
				}));
		}
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}

	submit() {
		// Validate inputs
		if (!this.phrase.trim()) {
			new Notice('Please enter a word or phrase');
			return;
		}

		if (!this.content.trim()) {
			new Notice('Please enter a definition');
			return;
		}

		if (this.availableFiles.length > 0 && !this.selectedFile) {
			new Notice('Please select a target file');
			return;
		}

		// Parse aliases
		const aliasArray = this.aliases
			.split(',')
			.map(a => a.trim())
			.filter(a => a.length > 0);

		// Call the submit callback
		this.onSubmit(this.phrase.trim(), aliasArray, this.content.trim(), this.selectedFile);
		this.close();
	}

	delete() {
		if (this.onDelete) {
			this.onDelete();
			this.close();
		}
	}
}
