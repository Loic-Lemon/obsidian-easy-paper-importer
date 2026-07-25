import { App, FuzzySuggestModal, PluginSettingTab, Setting, TFile, TFolder, TextComponent } from "obsidian";
import EasyPaperImporter from "./main";

export interface EasyPaperSettings {
	/** Folder in the vault where paper notes are saved. */
	paperFolder: string;
	noteTitleFormat: string;
	metadataFields: string[];
	includeImportDate: boolean;
	includePdfField: boolean;
	templateFilePath?: string;
	confirmDuplicateImports: boolean;
	customProperties: string[];
	bibtexDoiField: string;
}

export const DEFAULT_SETTINGS: EasyPaperSettings = {
	paperFolder: "Papers",
	noteTitleFormat: "{{first_authors}}_{{year}}",
	metadataFields: ['title', 'authors', 'year', 'doi'],
	includeImportDate: true,
	includePdfField: true,
	templateFilePath: "",
	confirmDuplicateImports: true,
	customProperties: [],
	bibtexDoiField: "doi",
};

class FolderSuggestModal extends FuzzySuggestModal<TFolder> {
	private onChoose: (folder: TFolder) => void;

	constructor(app: App, onChoose: (folder: TFolder) => void) {
		super(app);
		this.onChoose = onChoose;
	}

	getItems(): TFolder[] {
		const folders: TFolder[] = [];
		const root = this.app.vault.getRoot();
		const recurse = (folder: TFolder) => {
			folders.push(folder);
			for (const child of folder.children) {
				if (child instanceof TFolder) recurse(child);
			}
		};
		recurse(root);
		return folders;
	}

	getItemText(item: TFolder): string {
		return item.path || '/';
	}

	onChooseItem(item: TFolder): void {
		this.onChoose(item);
	}
}

class FileSuggestModal extends FuzzySuggestModal<TFile> {
	private onChoose: (file: TFile) => void;

	constructor(app: App, onChoose: (file: TFile) => void) {
		super(app);
		this.onChoose = onChoose;
	}

	getItems(): TFile[] {
		return this.app.vault.getFiles().filter(f => f.extension === 'md');
	}

	getItemText(item: TFile): string {
		return item.path;
	}

	onChooseItem(item: TFile): void {
		this.onChoose(item);
	}
}

export class EasyPaperSettingTab extends PluginSettingTab {
	plugin: EasyPaperImporter;

	constructor(app: App, plugin: EasyPaperImporter) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl).setName("Setup basics").setHeading();
		containerEl.createEl("p", {
			text: "Pick where to import your papers and how to name them."
		});

		let folderInput: TextComponent;
		new Setting(containerEl)
			.setName("Folder path")
			.setDesc("Folder where imported paper notes will be created.")
			.addText(t => {
				folderInput = t;
				t.setPlaceholder('Papers')
					.setValue(this.plugin.settings.paperFolder)
					.setDisabled(true);
			})
			.addButton(b => b
				.setButtonText('Browse')
				.onClick(() => {
					new FolderSuggestModal(this.app, (folder) => {
						this.plugin.settings.paperFolder = folder.path;
						void this.plugin.saveSettings();
						folderInput.setValue(folder.path);
					}).open();
				})
			)
			.addButton(b => b
				.setButtonText('Clear')
				.onClick(() => {
					this.plugin.settings.paperFolder = '';
					void this.plugin.saveSettings();
					folderInput.setValue('');
				})
			);
		
		new Setting(containerEl)
			.setName("Note title")
			.setDesc("Define the note title format using metadata keys in double curly braces. E.g. {{title}} - {{authors}} ({{year}}).")
			.addText((text) => text
					.setPlaceholder("{{first_authors}}_{{year}}")
					.setValue(this.plugin.settings.noteTitleFormat)
					.onChange(async (value) => {
						this.plugin.settings.noteTitleFormat = value.trim() || "{{first_authors}}_{{year}}";
						await this.plugin.saveSettings();
					}));

		new Setting(containerEl).setName("Metadata").setHeading();
		containerEl.createEl("p", {
			text: "It is important to decide on which metadata you want early to avoid any unnecessary hassle later."
		});

		new Setting(containerEl)
			.setName('Note metadata fields')
			.setDesc('Comma-separated list of metadata keys to include. Incorrect metadata keys will be ignored.')
			.addText(t => t
				.setPlaceholder('Title, authors, DOI, year')
				.setValue(this.plugin.settings.metadataFields.join(', '))
				.onChange(async v => {
				this.plugin.settings.metadataFields = v.split(',').map(s => s.trim()).filter(Boolean);
				await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Include import date')
			.setDesc('Toggle including the date when the paper was imported as part of the note metadata.')
			.addToggle(t => t
				.setValue(this.plugin.settings.includeImportDate)
				.onChange(async v => {
					this.plugin.settings.includeImportDate = v;
					await this.plugin.saveSettings();
			}));

		new Setting(containerEl)
			.setName('Include PDF field')
			.setDesc('Toggle including a field ready to be linked to the PDF of the paper.')
			.addToggle(t => t
				.setValue(this.plugin.settings.includePdfField)
				.onChange(async v => {
					this.plugin.settings.includePdfField = v;
					await this.plugin.saveSettings();
			}));

		new Setting(containerEl).setName("Note body").setHeading();
		containerEl.createEl("p", {
			text: "Allow for custom automated note body content on file creation."
		});

		let templateInput: TextComponent;
		new Setting(containerEl)
			.setName('Template file path')
			.setDesc('Set the path to a Markdown file in your vault to use as a template.')
			.addText(t => {
				templateInput = t;
				t.setPlaceholder('No template selected')
					.setValue(this.plugin.settings.templateFilePath || '')
					.setDisabled(true);
			})
			.addButton(b => b
				.setButtonText('Browse')
				.onClick(() => {
					new FileSuggestModal(this.app, (file) => {
						this.plugin.settings.templateFilePath = file.path;
						void this.plugin.saveSettings();
						templateInput.setValue(file.path);
					}).open();
				})
			)
			.addButton(b => b
				.setButtonText('Clear')
				.onClick(() => {
					this.plugin.settings.templateFilePath = '';
					void this.plugin.saveSettings();
					templateInput.setValue('');
				})
			);

		new Setting(containerEl)
			.setName('Custom properties')
			.setDesc('Comma-separated list of custom frontmatter properties to include in new notes (e.g. "tags, comment").')
			.addText(t => t
				.setPlaceholder('Tags, comment')
				.setValue(this.plugin.settings.customProperties.join(', '))
				.onChange(async v => {
					this.plugin.settings.customProperties = v.split(',').map(s => s.trim()).filter(Boolean);
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl).setName("Extras").setHeading();
		containerEl.createEl("p", {
			text: "More functionality."
		});

		new Setting(containerEl)
			.setName('Duplicate check')
			.setDesc('Enable a confirmation prompt when importing a paper that already exists.')
			.addToggle(t => t
				.setValue(this.plugin.settings.confirmDuplicateImports)
				.onChange(async v => {
					this.plugin.settings.confirmDuplicateImports = v;
					await this.plugin.saveSettings();
			}));

		new Setting(containerEl)
			.setName('BibTeX DOI field')
			.setDesc('Frontmatter property key used to read the DOI for BibTeX export.')
			.addText(t => t
				.setPlaceholder('doi')
				.setValue(this.plugin.settings.bibtexDoiField)
				.onChange(async v => {
					this.plugin.settings.bibtexDoiField = v.trim() || 'doi';
					await this.plugin.saveSettings();
				}));
	}
}
