import { Plugin, MarkdownView } from 'obsidian';
import { PluginSettings, DEFAULT_SETTINGS } from './types';
import { DefinitionManager } from './managers/DefinitionManager';
import { UIManager } from './managers/UIManager';
import { EditorManager } from './managers/EditorManager';
import { SettingsTab } from './ui/SettingsTab';

/**
 * Main plugin class for Note Definitions
 */
export default class NoteDefinitionsPlugin extends Plugin {
	settings: PluginSettings;
	definitionManager: DefinitionManager;
	uiManager: UIManager;
	editorManager: EditorManager;

	async onload() {
		// Load settings
		await this.loadSettings();

		// Apply custom underline color if set
		this.applyUnderlineColor();

		// Initialize managers
		this.definitionManager = new DefinitionManager(this);
		this.uiManager = new UIManager(this);
		this.editorManager = new EditorManager(this);

		// Add settings tab
		this.addSettingTab(new SettingsTab(this.app, this));

		// Register commands
		this.registerCommands();

		// Register event handlers
		this.registerEventHandlers();

		// Wait for layout to be ready before loading definitions
		// This ensures the vault is fully initialized
		this.app.workspace.onLayoutReady(() => {
			this.loadDefinitionsWhenReady();
		});
	}

	async onunload() {
		// Cleanup managers
		if (this.editorManager) {
			this.editorManager.cleanup();
		}
		if (this.uiManager) {
			this.uiManager.cleanup();
		}
	}

	async loadSettings() {
		const data = await this.loadData();
		this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
	}

	async loadDefinitionsWhenReady() {
		// Load definitions after vault is ready
		await this.definitionManager.loadDefinitions();

		// Highlight the definition folder and files in file explorer
		this.definitionManager.updateFolderHighlight();
		this.definitionManager.updateFileHighlights();
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	applyUnderlineColor() {
		if (this.settings.underlineColor) {
			document.body.style.setProperty('--definition-underline-color', this.settings.underlineColor);
		} else {
			document.body.style.removeProperty('--definition-underline-color');
		}
	}

	registerCommands() {
		// Preview definition command
		this.addCommand({
			id: 'preview-definition',
			name: 'Preview definition',
			editorCallback: (editor, view) => {
				this.uiManager.previewDefinitionAtCursor(editor, view as MarkdownView);
			}
		});

		// Go to definition command
		this.addCommand({
			id: 'go-to-definition',
			name: 'Go to definition',
			editorCallback: (editor, view) => {
				this.uiManager.goToDefinitionAtCursor(editor, view as MarkdownView);
			}
		});

		// Add definition command
		this.addCommand({
			id: 'add-definition',
			name: 'Add definition',
			editorCallback: (editor, view) => {
				this.uiManager.showAddDefinitionModal(editor, view as MarkdownView);
			}
		});

		// Add command to refresh file highlights (for debugging)
		this.addCommand({
			id: 'refresh-definition-highlights',
			name: 'Refresh Definition File Highlights',
			callback: () => {
				this.definitionManager.updateFileHighlights();
			}
		});

		// Add definition context command
		this.addCommand({
			id: 'add-definition-context',
			name: 'Add definition context',
			editorCallback: (editor, view) => {
				this.uiManager.showAddContextModal(view as MarkdownView);
			}
		});

		// Register consolidated definition file
		this.addCommand({
			id: 'register-consolidated-file',
			name: 'Register consolidated definition file',
			editorCallback: (editor, view) => {
				this.definitionManager.registerDefinitionFile(view.file, 'consolidated');
			}
		});

		// Register atomic definition file
		this.addCommand({
			id: 'register-atomic-file',
			name: 'Register atomic definition file',
			editorCallback: (editor, view) => {
				this.definitionManager.registerDefinitionFile(view.file, 'atomic');
			}
		});

		// Refresh definitions command
		this.addCommand({
			id: 'refresh-definitions',
			name: 'Refresh definitions',
			callback: async () => {
				await this.definitionManager.refreshDefinitions();
			}
		});

		// Refresh highlights command
		this.addCommand({
			id: 'refresh-highlights',
			name: 'Refresh folder and file highlights',
			callback: () => {
				this.definitionManager.updateFolderHighlight();
				this.definitionManager.updateFileHighlights();
			}
		});
	}

	registerEventHandlers() {
		// Register editor change handler
		this.registerEvent(
			this.app.workspace.on('editor-change', (editor, view) => {
				this.editorManager.onEditorChange(editor, view as MarkdownView);
			})
		);

		// Register active leaf change handler
		this.registerEvent(
			this.app.workspace.on('active-leaf-change', (leaf) => {
				if (leaf?.view?.getViewType() === 'markdown') {
					this.editorManager.onActiveLeafChange(leaf);
				}
			})
		);

		// Register file menu handler for "Set definition folder"
		this.registerEvent(
			this.app.workspace.on('file-menu', (menu, file) => {
				if ('children' in file) { // It's a folder
					menu.addItem((item) => {
						item
							.setTitle('Set definition folder')
							.setIcon('folder')
							.onClick(() => {
								this.definitionManager.setDefinitionFolder(file.path);
							});
					});
				}
			})
		);

		// Register editor menu handler
		this.registerEvent(
			this.app.workspace.on('editor-menu', (menu, editor, view) => {
				this.uiManager.addEditorMenuItems(menu, editor, view as MarkdownView);
			})
		);

		// Watch for workspace layout changes to refresh file highlights
		this.registerEvent(
			this.app.workspace.on('layout-change', () => {
				// Delay to ensure DOM is updated
				setTimeout(() => this.definitionManager.updateFileHighlights(), 1000);
			})
		);

		// Watch for file explorer refresh
		this.registerEvent(
			this.app.workspace.on('file-menu', () => {
				// Refresh highlights when file menu is opened (indicates file explorer activity)
				setTimeout(() => this.definitionManager.updateFileHighlights(), 100);
			})
		);

		// Register file change handlers
		this.registerEvent(
			this.app.vault.on('modify', (file) => {
				if ('extension' in file) {
					this.definitionManager.onFileChange(file as any);
					// Update highlights after a short delay to ensure cache is updated
					setTimeout(() => this.definitionManager.updateFileHighlights(), 200);
				}
			})
		);

		this.registerEvent(
			this.app.vault.on('delete', (file) => {
				if ('extension' in file) {
					this.definitionManager.onFileDelete(file as any);
					// Update highlights after deletion
					setTimeout(() => this.definitionManager.updateFileHighlights(), 200);
				}
			})
		);

		this.registerEvent(
			this.app.vault.on('rename', (file, oldPath) => {
				if ('extension' in file) {
					this.definitionManager.onFileRename(file as any, oldPath);
					// Update highlights after rename
					setTimeout(() => this.definitionManager.updateFileHighlights(), 200);
				}
			})
		);

		this.registerEvent(
			this.app.vault.on('create', (file) => {
				if ('extension' in file) {
					// Check if the new file contains definitions
					setTimeout(() => {
						this.definitionManager.onFileChange(file as any);
						this.definitionManager.updateFileHighlights();
					}, 500);
				}
			})
		);
	}
}
