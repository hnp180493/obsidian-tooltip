import { App, PluginSettingTab, Setting } from 'obsidian';
import type NoteDefinitionsPlugin from '../main';

export class SettingsTab extends PluginSettingTab {
	plugin: NoteDefinitionsPlugin;

	constructor(app: App, plugin: NoteDefinitionsPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl('h2', { text: 'Note Definitions Settings' });

		// Definition folder setting
		new Setting(containerEl)
			.setName('Definition folder')
			.setDesc('Folder containing your definition files. You can also right-click a folder and select "Set definition folder".')
			.addText(text => text
				.setPlaceholder('definitions')
				.setValue(this.plugin.settings.definitionFolder)
				.onChange(async (value) => {
					this.plugin.settings.definitionFolder = value;
					await this.plugin.saveSettings();
					await this.plugin.definitionManager.refreshDefinitions();
					this.plugin.definitionManager.updateFolderHighlight();
				}));

		// Divider pattern setting
		new Setting(containerEl)
			.setName('Definition divider')
			.setDesc('Pattern to recognize as dividers in consolidated definition files')
			.addDropdown(dropdown => dropdown
				.addOption('hyphens', 'Hyphens only (---)')
				.addOption('both', 'Both hyphens (---) and underscores (___)')
				.setValue(this.plugin.settings.dividerPattern)
				.onChange(async (value: 'hyphens' | 'both') => {
					this.plugin.settings.dividerPattern = value;
					await this.plugin.saveSettings();
					await this.plugin.definitionManager.refreshDefinitions();
				}));

		// Enable hover preview setting
		new Setting(containerEl)
			.setName('Enable hover preview')
			.setDesc('Show definition preview when hovering over underlined terms')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableHoverPreview)
				.onChange(async (value) => {
					this.plugin.settings.enableHoverPreview = value;
					await this.plugin.saveSettings();
				}));

		// Popover delay setting
		new Setting(containerEl)
			.setName('Hover delay')
			.setDesc('Delay in milliseconds before showing hover preview (default: 300)')
			.addText(text => text
				.setPlaceholder('300')
				.setValue(String(this.plugin.settings.popoverDelay))
				.onChange(async (value) => {
					const delay = parseInt(value);
					if (!isNaN(delay) && delay >= 0) {
						this.plugin.settings.popoverDelay = delay;
						await this.plugin.saveSettings();
					}
				}));

		// Hide popover on mouse out setting
		new Setting(containerEl)
			.setName('Hide popover on mouse out')
			.setDesc('Automatically hide the definition popover when you move your mouse away from the highlighted word')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.hidePopoverOnMouseOut)
				.onChange(async (value) => {
					this.plugin.settings.hidePopoverOnMouseOut = value;
					await this.plugin.saveSettings();
				}));

		// Underline color setting
		new Setting(containerEl)
			.setName('Underline color')
			.setDesc('Custom color for definition underlines (leave empty for theme default). Use hex colors like #ff0000 or CSS color names.')
			.addText(text => text
				.setPlaceholder('e.g., #7c3aed or purple')
				.setValue(this.plugin.settings.underlineColor)
				.onChange(async (value) => {
					this.plugin.settings.underlineColor = value;
					await this.plugin.saveSettings();
					this.updateUnderlineColor(value);
				}));
	}

	private updateUnderlineColor(color: string): void {
		if (color) {
			document.body.style.setProperty('--definition-underline-color', color);
		} else {
			document.body.style.removeProperty('--definition-underline-color');
		}
	}
}
