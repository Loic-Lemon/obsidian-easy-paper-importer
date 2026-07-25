import { Plugin, Notice, TFile } from "obsidian";
import { DEFAULT_SETTINGS, EasyPaperSettings, EasyPaperSettingTab } from "./settings";
import { DoiInputModal } from "./ui/doi-modal";
import { PaperIndex } from "./indexer";
import { doiToBibtex } from "./bibtex";

export default class EasyPaperImporter extends Plugin {
	settings: EasyPaperSettings;
	paperIndex: PaperIndex;

	async onload() {
		await this.loadSettings();

		// Initialize paper index
		this.paperIndex = new PaperIndex(this);
		await this.paperIndex.load();

		// Keep index in sync with vault changes
		this.registerEvent(this.app.vault.on("create", (f) => {
			if (f instanceof TFile) void this.paperIndex.updateIndexForFile(f);
		}));
		this.registerEvent(this.app.vault.on("delete", (f) => {
			void this.paperIndex.removeFromIndex(f);
		}));
		this.registerEvent(this.app.vault.on("rename", (file, oldPath) => {
			if (typeof oldPath === "string") {
				void this.paperIndex.removeFromIndex({ path: oldPath });
			} else {
				void this.paperIndex.removeFromIndex(oldPath);
			}
			if (file instanceof TFile) void this.paperIndex.updateIndexForFile(file);
		}));

		// Ribbon icon to quickly import a paper
		this.addRibbonIcon("quote-glyph", "Import paper from DOI", () => {
			this.openDoiModal();
		});

		// Command palette entry
		this.addCommand({
			id: "import-paper-from-doi",
			name: "Import paper from DOI",
			callback: () => this.openDoiModal(),
		});

		// Rebuild paper index command
		this.addCommand({
			id: "rebuild-paper-index",
			name: "Rebuild paper index",
			callback: async () => {
				await this.paperIndex.rebuild();
				new Notice("Paper index rebuilt.");
			},
		});

		// Copy BibTeX from DOI command
		this.addCommand({
			id: "copy-bibtex-from-doi",
			name: "Copy BibTeX from DOI",
			callback: async () => {
				const file = this.app.workspace.getActiveFile();
				if (!file) {
					new Notice("no DOI");
					return;
				}
				const cache = this.app.metadataCache.getFileCache(file);
				const doiKey = this.settings.bibtexDoiField || "doi";
				const doi = cache?.frontmatter?.[doiKey] as string | undefined;
				if (!doi) {
					new Notice("no DOI");
					return;
				}
				try {
					const bibtex = await doiToBibtex(doi);
					await navigator.clipboard.writeText(bibtex);
					new Notice("copied!");
				} catch (e: unknown) {
					const msg = e instanceof Error ? e.message : "Unknown error";
					new Notice(`Error: ${msg}`);
				}
			},
		});

		// Settings tab
		this.addSettingTab(new EasyPaperSettingTab(this.app, this));
	}

	onunload() {}

	/**
	 * Open the DOI input modal and handle the result.
	 */
	private openDoiModal(): void {
		new DoiInputModal(this.app, this.settings, this, (filePath) => {
			// Open the newly created note
			const file = this.app.vault.getAbstractFileByPath(filePath);
			if (file) {
				void this.app.workspace.openLinkText(filePath, "", true);
			}
		}).open();
	}

	async loadSettings() {
		const data = (await this.loadData()) as Record<string, unknown> | null ?? {};
		// Strip internal keys so they don't leak into settings
		const rest = { ...data };
		delete rest.index;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, rest as Partial<EasyPaperSettings>);
	}

	async saveSettings() {
		// Preserve other keys (e.g. index) already in data.json
		const existing = (await this.loadData()) as Record<string, unknown> | null ?? {};
		await this.saveData({ ...existing, ...this.settings });
	}
}
