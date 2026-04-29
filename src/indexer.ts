import { TFile } from "obsidian";
import type EasyPaperImporter from "./main";

type IndexData = {
    byDOI: Record<string, string>;
    byTitle: Record<string, string>;
    meta?: { version?: number; lastBuilt?: string };
};

export class PaperIndex {
    plugin: EasyPaperImporter;
    index: IndexData = { byDOI: {}, byTitle: {}, meta: { version: 1, lastBuilt: undefined } };

    constructor(plugin: EasyPaperImporter) {
        this.plugin = plugin;
    }

    private normalise(s?: string) {
        return (s || "").toLowerCase().trim();
    }

    private normaliseDoi(s?: string) {
        if (!s) return "";
        let doi = (s || "").toLowerCase().trim();
        doi = doi.replace(/^https?:\/\/(dx\.)?doi\.org\//, "");
        doi = doi.replace(/^doi:\s*/, "");
        return doi;
    }

    async load() {
        const data = (await this.plugin.loadData()) as Partial<{ index: IndexData }>;
        if (data?.index) this.index = Object.assign(this.index, data.index);
        // If index empty, build from configured folder
        if (Object.keys(this.index.byDOI).length === 0 && Object.keys(this.index.byTitle).length === 0) {
            await this.rebuild();
        }
    }

    async rebuild() {
        this.index = { byDOI: {}, byTitle: {}, meta: { version: 1, lastBuilt: new Date().toISOString() } };
        const folder = (this.plugin.settings?.paperFolder || "Papers").replace(/^\/+/, "");
        const files = this.plugin.app.vault.getFiles().filter((f: TFile) => f.path.startsWith(folder));
        for (const f of files) this.indexFile(f);
        await this.persist();
    }

    private getFileTitle(f: TFile) {
        return f.name.replace(/\.[^/.]+$/, "");
    }

    private indexFile(f: TFile) {
        const cache = this.plugin.app.metadataCache.getFileCache(f);
        const fm = cache?.frontmatter ?? {};
        const doi = this.normaliseDoi(fm.doi as string | undefined);
        const title = this.normalise((fm.title as string | undefined) || this.getFileTitle(f));
        if (doi) this.index.byDOI[doi] = f.path;
        if (title) this.index.byTitle[title] = f.path;
    }

    async updateIndexForFile(f: TFile) {
        this.removePathFromIndex(f.path);
        this.indexFile(f);
        await this.persist();
    }

    async removeFromIndex(f: TFile | { path: string }) {
        this.removePathFromIndex(f.path);
        await this.persist();
    }

    private removePathFromIndex(path: string) {
        for (const k of Object.keys(this.index.byDOI)) {
            if (this.index.byDOI[k] === path) delete this.index.byDOI[k];
        }
        for (const k of Object.keys(this.index.byTitle)) {
            if (this.index.byTitle[k] === path) delete this.index.byTitle[k];
        }
    }

    findDuplicate({ doi, title }: { doi?: string; title?: string }) {
        const d = this.normaliseDoi(doi);
        if (d && this.index.byDOI[d]) return { type: "doi", path: this.index.byDOI[d] };
        const t = this.normalise(title);
        if (t && this.index.byTitle[t]) return { type: "title", path: this.index.byTitle[t] };
        return null;
    }

    async persist() {
        this.index.meta = this.index.meta || {};
        this.index.meta.lastBuilt = new Date().toISOString();
        // Preserve other keys (e.g. settings) already in data.json
        const existing = (await this.plugin.loadData()) as Record<string, unknown> | null ?? {};
        await this.plugin.saveData({ ...existing, index: this.index });
    }
}