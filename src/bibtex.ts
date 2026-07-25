import { requestUrl } from "obsidian";
import { parseDoi } from "./doi";

const USER_AGENT = "ObsidianEasyPaperImporter/0.0.1 (https://github.com)";
const TRANSFORM_API = "https://api.crossref.org/works/";

export async function doiToBibtex(doi: string): Promise<string> {
    const cleanDoi = parseDoi(doi);
    const url = `${TRANSFORM_API}${encodeURIComponent(cleanDoi)}/transform/application/x-bibtex`;

    const response = await requestUrl({
        url,
        method: "GET",
        headers: {
            Accept: "application/x-bibtex",
            "User-Agent": USER_AGENT,
        },
    });

    if (response.status !== 200) {
        throw new Error(`CrossRef returned HTTP ${response.status}`);
    }

    return response.text.trim();
}