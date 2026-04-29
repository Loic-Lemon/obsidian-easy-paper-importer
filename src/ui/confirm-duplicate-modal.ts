import { App, Modal, ButtonComponent } from "obsidian";

export class ConfirmDuplicateModal extends Modal {
    private resolve!: (v: boolean) => void;
    public result: Promise<boolean>;

    constructor(app: App, private existingPath: string, private duplicateType: string) {
        super(app);
        this.result = new Promise((res) => (this.resolve = res));
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl("h3", { text: "Duplicate import detected" });
        contentEl.createEl("p", { text: `A paper with matching ${this.duplicateType} already exists: ${this.existingPath}` });
        const btnRow = contentEl.createDiv();
        new ButtonComponent(btnRow)
            .setButtonText("Cancel")
            .onClick(() => {
                this.resolve(false);
                this.close();
            });
        new ButtonComponent(btnRow)
            .setButtonText("Import anyway")
            .setCta()
            .onClick(() => {
                this.resolve(true);
                this.close();
            });
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
        // Resolve with false if closed without clicking "Import anyway"
        this.resolve(false);
    }

    // convenience helper
    openAndWait(): Promise<boolean> {
        this.open();
        return this.result;
    }
}