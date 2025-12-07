import { App, FuzzySuggestModal, TFile } from 'obsidian';
import type NoteDefinitionsPlugin from '../main';

export class ContextSelectorModal extends FuzzySuggestModal<TFile> {
	private plugin: NoteDefinitionsPlugin;
	private onSelect: (file: TFile) => void;

	constructor(app: App, plugin: NoteDefinitionsPlugin, onSelect: (file: TFile) => void) {
		super(app);
		this.plugin = plugin;
		this.onSelect = onSelect;
		this.setPlaceholder('Select a definition file to add as context');
	}

	getItems(): TFile[] {
		const defFolder = this.plugin.settings.definitionFolder;
		
		if (!defFolder) {
			return [];
		}

		const folder = this.app.vault.getAbstractFileByPath(defFolder);
		
		if (!folder || !('children' in folder)) {
			return [];
		}

		return this.getDefinitionFiles(folder);
	}

	private getDefinitionFiles(folder: any): TFile[] {
		const files: TFile[] = [];

		for (const child of folder.children) {
			if (child instanceof TFile && child.extension === 'md') {
				files.push(child);
			} else if (child.children) {
				files.push(...this.getDefinitionFiles(child));
			}
		}

		return files;
	}

	getItemText(file: TFile): string {
		return file.path;
	}

	onChooseItem(file: TFile, evt: MouseEvent | KeyboardEvent): void {
		this.onSelect(file);
	}
}
