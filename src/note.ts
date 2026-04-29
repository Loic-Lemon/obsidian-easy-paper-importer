import { App, TFolder, normalizePath, TFile } from "obsidian";
import { PaperMetadata, normalizePaper } from "./types";
import { EasyPaperSettings } from "./settings";

// ── Helpers ─────────────────────────────────────────────────────────

/**
 * Sanitise a string for use as a filename.
 * Removes characters not allowed in filenames on most OSes.
 */
function sanitiseFilename(name: string): string {
	return (name ?? "")
		.replace(/[\\/:*?"<>|]/g, "")
		.replace(/\s+/g, " ")
		.trim()
		.replace(/\.+$/, "") // Windows doesn't like trailing dots
		.slice(0, 200); // Cap length for filesystem limits
}

/**
 * Return the surname (last token) for a given author string.
 */
function getAuthorSurname(name: string): string {
	if (!name) return "";
	const parts = name.trim().split(/\s+/);
	const last = parts[parts.length - 1] ?? "";
	return last.replace(/[.,;]$/g, "");
}

/**
 * Render a filename from a template using paper metadata tokens.
 * Supported tokens: {{title}}, {{year}}, {{doi}}, {{authors}}, {{first_authors}}, {{first_author}}
 * - {{authors}} / {{first_authors}} -> "Surname" or "Surname et al." if multiple authors
 */
function renderFilenameTemplate(template: string, paper: PaperMetadata): string {
	if (!template) return "";
	return template.replace(/{{\s*(\w+)\s*}}/g, (_m: string, token: string) => {
		switch (token) {
			case "title":
				return paper.title || "";
			case "year":
				return paper.year != null ? String(paper.year) : "";
			case "doi":
				return paper.doi || "";
			case "authors": {
				if (!paper.authors || paper.authors.length === 0) return "";
				if (paper.authors.length <= 3) {
					return paper.authors.map(a => getAuthorSurname(a)).join(", ");
				}
				return `${getAuthorSurname(paper.authors[0] ?? "")} et al.`;
			}
			case "first_authors":
			case "first_author": {
				if (!paper.authors || paper.authors.length === 0) return "";
				return getAuthorSurname(paper.authors[0] ?? "");
			}
			default:
				return "";
		}
	});
}

/** Escape double-quotes inside a YAML string value. */
function yamlStr(value: string): string {
	return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** Render a YAML list (returns empty string if array is empty). */
function yamlList(key: string, items: string[], quote = true): string {
	if (items.length === 0) return "";
	const entries = items.map((v) => `  - ${quote ? yamlStr(v) : v}`);
	return `${key}:\n${entries.join("\n")}`;
}

// ── Frontmatter ─────────────────────────────────────────────────────

/**
 * Build a plain object containing only the metadata fields the user
 * has selected, skipping any that are empty/missing.  Then serialise
 * to a YAML frontmatter string.
 */
function buildFrontmatter(paper: PaperMetadata, settings: EasyPaperSettings): string {
	const lines: string[] = ["---"];

	/**
	 * Each renderer checks for presence internally, so missing data
	 * is silently skipped.  The `paper` object is already normalised
	 * (strings default to "", arrays default to []).
	 */
	const fieldRenderers: Record<string, () => string | null> = {
		title: () =>
			paper.title ? `title: ${yamlStr(paper.title)}` : null,
		authors: () =>
			yamlList("authors", paper.authors) || null,
		journal: () =>
			paper.journal ? `journal: ${yamlStr(paper.journal)}` : null,
		year: () =>
			paper.year != null ? `year: ${paper.year}` : null,
		volume: () =>
			paper.volume ? `volume: ${yamlStr(paper.volume)}` : null,
		issue: () =>
			paper.issue ? `issue: ${yamlStr(paper.issue)}` : null,
		pages: () =>
			paper.pages ? `pages: ${yamlStr(paper.pages)}` : null,
		publisher: () =>
			paper.publisher ? `publisher: ${yamlStr(paper.publisher)}` : null,
		doi: () =>
			paper.doi ? `doi: ${yamlStr(paper.doi)}` : null,
		url: () =>
			paper.doiUrl ? `url: ${yamlStr(paper.doiUrl)}` : null,
		pdf: () =>
			paper.pdfUrl ? `pdf: ${yamlStr(paper.pdfUrl)}` : null,
		issn: () =>
			yamlList("issn", paper.issn) || null,
		tags: () => {
			const tags = paper.subjects.map((s) =>
				s.toLowerCase().replace(/\s+/g, "-"),
			);
			return yamlList("tags", tags, false) || null;
		},
	};

	for (const field of settings.metadataFields) {
		const render = fieldRenderers[field];
		if (!render) continue; // unknown key → skip
		const result = render();
		if (result) lines.push(result);
	}

	if (settings.includeImportDate) {
		lines.push(`date_imported: "${new Date().toISOString().split("T")[0]}"`);
	}

	// Append user-defined custom properties as empty fields
	for (const prop of settings.customProperties ?? []) {
		const key = prop.trim();
		if (key) lines.push(`${key}: `);
	}

	lines.push("---");
	return lines.join("\n");
}

// ── Body ────────────────────────────────────────────────────────────

/**
 * Render a template string by replacing known tokens with paper metadata.
 */
function renderTemplate(template: string, paper: PaperMetadata, settings: EasyPaperSettings): string {
	return template.replace(/{{\s*(\w+)\s*}}/g, (_m: string, token: string) => {
		const t = token.toLowerCase();
		switch (t) {
			case "title":
				return paper.title || "";
			case "year":
				return paper.year != null ? String(paper.year) : "";
			case "doi":
				return paper.doi || "";
			case "doiurl":
			case "doi_url":
				return paper.doiUrl || "";
			case "pdf":
			case "pdfurl":
			case "pdf_url":
				return paper.pdfUrl || "";
			case "journal":
				return paper.journal || "";
			case "volume":
				return paper.volume || "";
			case "issue":
				return paper.issue || "";
			case "pages":
				return paper.pages || "";
			case "publisher":
				return paper.publisher || "";
			case "abstract":
				return paper.abstract || "";
			case "authors":
				return (paper.authors || []).join(", ");
			case "first_authors":
			case "first_author": {
				if (!paper.authors || paper.authors.length === 0) return "";
				const surname = getAuthorSurname(paper.authors[0] ?? '');
				return paper.authors.length > 1 ? `${surname} et al.` : surname;
			}
			case "subjects":
				return (paper.subjects || []).join(", ");
			default:
				return "";
		}
	});
}

/**
 * Build the body content of the paper note.
 * If a template file path is configured, load it from the vault and substitute tokens.
 * Falls back to a small autogenerated body when no template is set or if loading fails.
 */
async function buildBody(app: App, paper: PaperMetadata, settings: EasyPaperSettings): Promise<string> {
	// Try to load template if configured
	const templatePath = (settings.templateFilePath || "").trim();
	if (templatePath) {
		const normalised = normalizePath(templatePath);
		// Try exact path first, then with .md appended
		const candidates = [normalised];
		if (!normalised.endsWith(".md")) candidates.push(normalised + ".md");

		let templateFile: TFile | null = null;
		for (const candidate of candidates) {
			const f = app.vault.getAbstractFileByPath(candidate);
			if (f && f instanceof TFile) {
				templateFile = f;
				break;
			}
		}

		if (templateFile) {
			try {
				const tpl = await app.vault.read(templateFile);
				return renderTemplate(tpl, paper, settings);
			} catch (e) {
				console.warn("Easy Paper Importer: failed to read template", templateFile.path, e);
			}
		} else {
			console.warn("Easy Paper Importer: template not found:", normalised);
		}
	}

	// Fallback autogenerated body
	const sections: string[] = [];
	// if (paper.abstract) sections.push(`## Abstract\n\n${paper.abstract}`);
	// if (paper.subjects && paper.subjects.length) sections.push(`## Keywords\n\n${paper.subjects.join(", ")}`);
	// sections.push("## Notes\n\n");
	// if (settings.includePdfField && paper.pdfUrl) sections.push(`PDF: ${paper.pdfUrl}`);

	return sections.join("\n\n");
}

/**
 * Ensure a folder exists in the vault, creating it if needed.
 */
async function ensureFolder(app: App, folderPath: string): Promise<void> {
	const normalised = normalizePath(folderPath);
	const existing = app.vault.getAbstractFileByPath(normalised);
	if (!existing) {
		await app.vault.createFolder(normalised);
	} else if (!(existing instanceof TFolder)) {
		throw new Error(`"${normalised}" exists but is not a folder.`);
	}
}

/**
 * Create a markdown note for a paper in the vault.
 *
 * The incoming `paper` is normalised first so every field is
 * guaranteed to have a safe default value.
 *
 * Returns the path of the created file.
 */
export async function createPaperNote(
	app: App,
	paper: PaperMetadata,
	settings: EasyPaperSettings,
): Promise<string> {
	// Normalise once — all downstream code can trust the shape
	const safe = normalizePaper(paper);

	await ensureFolder(app, settings.paperFolder);

	const rawName = renderFilenameTemplate(settings.noteTitleFormat, safe) || safe.title;
	const filename = sanitiseFilename(rawName) || sanitiseFilename(safe.title) || "Untitled Paper";
	let filePath = normalizePath(`${settings.paperFolder}/${filename}.md`);

	// Avoid overwriting: add suffix if file already exists
	let counter = 1;
	while (app.vault.getAbstractFileByPath(filePath)) {
		filePath = normalizePath(`${settings.paperFolder}/${filename} (${counter}).md`);
		counter++;
	}

	const content = buildFrontmatter(safe, settings) + "\n\n" + await buildBody(app, safe, settings);
	await app.vault.create(filePath, content);

	return filePath;
}
