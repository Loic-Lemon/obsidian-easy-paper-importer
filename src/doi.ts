import { requestUrl } from "obsidian";
import { PaperMetadata } from "./types";
import { parseArxivId, fetchArxivMetadata } from "./arxiv";

const CROSSREF_API = "https://api.crossref.org/works/";

/**
 * Normalise a DOI input: accept full URLs or bare DOIs.
 * Returns just the DOI identifier (e.g. "10.1234/example").
 */
export function parseDoi(input: string): string {
	const trimmed = input.trim();
	// Handle full URLs like https://doi.org/10.1234/example
	const urlMatch = trimmed.match(/(?:https?:\/\/)?(?:dx\.)?doi\.org\/(.+)/i);
	if (urlMatch?.[1]) return urlMatch[1];
	// Handle raw DOI like 10.1234/example
	const doiMatch = trimmed.match(/^(10\.\d{4,}(?:\.\d+)*\/.+)$/);
	if (doiMatch?.[1]) return doiMatch[1];
	return trimmed;
}

/**
 * Fetch paper metadata from the CrossRef API using a DOI.
 */
export async function fetchPaperMetadata(doi: string): Promise<PaperMetadata> {
	// If the input looks like an arXiv identifier/URL, delegate to arXiv fetcher.
	const arxivId = parseArxivId(doi);
	if (arxivId) {
		return await fetchArxivMetadata(arxivId);
	}

	const cleanDoi = parseDoi(doi);
	const url = `${CROSSREF_API}${encodeURIComponent(cleanDoi)}`;

	let response;
	try {
		response = await requestUrl({
			url,
			method: "GET",
			headers: {
				Accept: "application/json",
				// CrossRef asks for a polite User-Agent with contact info
				"User-Agent": "ObsidianEasyPaperImporter/0.0.1 (https://github.com)",
			},
		});
	} catch (e: any) {
		const status = e?.status ?? "unknown";
		throw new Error(`DOI metadata request failed: ${url} (status ${status})`);
	}

	if (response.status !== 200) {
		throw new Error(`Failed to fetch DOI metadata: ${url} (HTTP ${response.status})`);
	}

	const data = response.json as Record<string, unknown>;
	const work = data.message as Record<string, unknown>;

	return parseCrossRefResponse(work, cleanDoi);
}

/**
 * Parse the CrossRef API response into our PaperMetadata format.
 */
function parseCrossRefResponse(work: Record<string, unknown>, doi: string): PaperMetadata {
	// Title
	const titleArray = work.title as string[] | undefined;
	const title = titleArray?.[0] ?? "Untitled";

	// Authors
	const authorArray = work.author as Array<{ given?: string; family?: string }> | undefined;
	const authors = (authorArray ?? []).map((a) => {
		const parts = [a.given, a.family].filter(Boolean);
		return parts.join(" ");
	});

	// Abstract – CrossRef sometimes includes JATS XML tags
	const rawAbstract = (work.abstract as string) ?? "";
	const abstract = rawAbstract.replace(/<[^>]+>/g, "").trim();

	// Journal / container title
	const containerTitle = work["container-title"] as string[] | undefined;
	const journal = containerTitle?.[0] ?? "";

	// Volume, issue, pages
	const volume = (work.volume as string) ?? "";
	const issue = (work.issue as string) ?? "";
	const pages = (work.page as string) ?? "";

	// Date
	const datePublished = work["published-print"] as { "date-parts"?: number[][] } | undefined;
	const dateOnline = work["published-online"] as { "date-parts"?: number[][] } | undefined;
	const dateParts = datePublished?.["date-parts"]?.[0] ?? dateOnline?.["date-parts"]?.[0];
	const year = dateParts?.[0] ?? null;
	const month = dateParts?.[1] ?? null;

	// Publisher
	const publisher = (work.publisher as string) ?? "";

	// ISSN
	const issnArray = work.ISSN as string[] | undefined;
	const issn = issnArray ?? [];

	// Subjects
	const subjectArray = work.subject as string[] | undefined;
	const subjects = subjectArray ?? [];

	// PDF link – look for the best open-access or primary link
	const links = work.link as Array<{ URL: string; "content-type"?: string }> | undefined;
	let pdfUrl = "";
	if (links && links.length > 0) {
		const pdfLink = links.find(
			(l) => l["content-type"] === "application/pdf"
		);
		pdfUrl = pdfLink?.URL ?? links[0]?.URL ?? "";
	}
	// Fallback: use the DOI URL itself as the PDF link
	if (!pdfUrl) {
		pdfUrl = `https://doi.org/${doi}`;
	}

	return {
		title,
		authors,
		abstract,
		journal,
		volume,
		issue,
		pages,
		year,
		month,
		doi,
		doiUrl: `https://doi.org/${doi}`,
		pdfUrl,
		publisher,
		issn,
		subjects,
	};
}
