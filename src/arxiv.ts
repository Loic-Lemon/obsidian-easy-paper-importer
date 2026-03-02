import { requestUrl } from "obsidian";
import { PaperMetadata } from "./types";

/**
 * Parse an arXiv identifier or URL and return the canonical id (e.g. "2101.01234v2").
 */
export function parseArxivId(input: string): string | null {
  const t = (input || "").trim();
  if (!t) return null;

  // URLs like https://arxiv.org/abs/2101.01234 or https://arxiv.org/pdf/2101.01234.pdf
  const urlMatch = t.match(/(?:https?:\/\/)?(?:www\.)?arxiv\.org\/(?:abs|pdf)\/(.+?)(?:\.pdf)?(?:[#?].*)?$/i);
  if (urlMatch?.[1]) return urlMatch[1];

  // Prefix like arXiv:2101.01234v2
  const prefixMatch = t.match(/^arxiv:\s*(.+)$/i);
  if (prefixMatch?.[1]) return prefixMatch[1];

  // Bare arXiv id formats: modern 4-digit prefix or legacy cs/0101010 style
  const idMatch = t.match(/^(\d{4}\.\d{4,5}(?:v\d+)?|[a-z\-]+\/[0-9]{7}(?:v\d+)?)$/i);
  if (idMatch?.[1]) return idMatch[1];

  // Some DOIs embed arXiv IDs, e.g. 10.48550/arXiv.2410.05491 — detect and extract
  const doiArxivMatch = t.match(/arxiv[.:\/](\d{4}\.\d{4,5}(?:v\d+)?|[a-z\-]+\/[0-9]{7}(?:v\d+)?)/i);
  if (doiArxivMatch?.[1]) return doiArxivMatch[1];

  return null;
}

/**
 * Fetch arXiv metadata using the export.arxiv.org API and convert to PaperMetadata.
 */
export async function fetchArxivMetadata(input: string): Promise<PaperMetadata> {
  const id = parseArxivId(input);
  if (!id) throw new Error("Not a valid arXiv identifier");

  const url = `https://export.arxiv.org/api/query?id_list=${encodeURIComponent(id)}`;
  let response;
  try {
    response = await requestUrl({
      url,
      method: "GET",
      headers: {
        "User-Agent": "ObsidianEasyPaperImporter/0.0.1 (https://github.com)",
        Accept: "application/atom+xml, application/xml, text/xml",
      },
    });
  } catch (e: any) {
    const status = e?.status ?? "unknown";
    throw new Error(`arXiv metadata request failed: ${url} (status ${status})`);
  }

  if (response.status !== 200) {
    throw new Error(`Failed to fetch arXiv metadata: ${url} (HTTP ${response.status})`);
  }

  const xml = response.text || "";
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, "application/xml");
  const entry = doc.querySelector("entry");
  if (!entry) throw new Error("arXiv entry not found in response");

  const title = (entry.querySelector("title")?.textContent || "").replace(/\s+/g, " ").trim();
  const authors = Array.from(entry.querySelectorAll("author > name")).map((n) => (n.textContent || "").trim()).filter(Boolean);
  const summary = (entry.querySelector("summary")?.textContent || "").trim();
  const published = entry.querySelector("published")?.textContent || "";
  const year = published ? parseInt(published.slice(0, 4)) : null;

  // Find a PDF link in the <link> elements; fall back to the predictable PDF URL
  let pdfUrl = "";
  const links = Array.from(entry.querySelectorAll("link"));
  for (const l of links) {
    const type = l.getAttribute("type") || "";
    const titleAttr = (l.getAttribute("title") || "").toLowerCase();
    const href = l.getAttribute("href") || "";
    if (type === "application/pdf" || titleAttr === "pdf" || href.includes("/pdf/")) {
      pdfUrl = href;
      break;
    }
  }
  if (!pdfUrl) pdfUrl = `https://arxiv.org/pdf/${id}.pdf`;

  // Try to find a DOI inside the arXiv entry (may be missing).
  // Prefer a simple querySelector (works for both <doi> and namespaced <arxiv:doi> in most feeds).
  let doi = "";
  const doiNode = entry.querySelector("doi") || entry.querySelector("arxiv\\:doi");
  if (doiNode && typeof doiNode.textContent === "string") doi = doiNode.textContent.trim();

  const doiUrl = doi ? `https://doi.org/${doi}` : `https://arxiv.org/abs/${id}`;

  return {
    title,
    authors,
    abstract: summary,
    journal: "",
    volume: "",
    issue: "",
    pages: "",
    year,
    month: null,
    doi,
    doiUrl,
    pdfUrl,
    publisher: "arXiv",
    issn: [],
    subjects: [],
  } as PaperMetadata;
}
