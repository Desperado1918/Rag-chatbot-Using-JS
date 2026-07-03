// ============================================================================
// services/inspectorParser.js — PDF Parser for RAG Pipeline Inspector
// ============================================================================

const fs = require("fs");
const path = require("path");

/**
 * Clean extracted text line by line to filter out math symbols, bibs, etc.
 */
function cleanExtractedText(text) {
    const bibPattern = /^(?:\d{1,2}\.?\s*)?(?:references|bibliography|works\s+cited)\s*$/im;
    const bibMatch = text.match(bibPattern);
    if (bibMatch) {
        text = text.slice(0, bibMatch.index).trim();
    }

    const lines = text.split("\n");
    const cleaned = [];

    for (const rawLine of lines) {
        const line = rawLine.trim();

        if (!line) {
            cleaned.push("");
            continue;
        }

        // Filter out formulas / pure punctuation lines
        if (/^[\d\s\.,;:!?\-–—\+\=\*\/\(\)\[\]\{\}†‡∑∏≈≤≥×÷→←↑↓∈∉⊆⊇∀∃∂∇αβγδεζηθλμνξπρσστυφχψω]+$/.test(line)) {
            continue;
        }

        // Citation lists
        if (/^\[\d[\d,\s]*\]$/.test(line)) {
            continue;
        }

        // Links and DOIs
        if (/^(https?:\/\/|arxiv:|doi:|https:|http:|:\/{2})/.test(line)) {
            continue;
        }

        // Pure numbering section headings
        if (/^\d{1,2}(\.\d{1,2}){0,2}$/.test(line)) {
            continue;
        }

        // Very short lowercase lines
        if (line.length < 20 && !/^[A-Z]/.test(line)) {
            continue;
        }

        cleaned.push(line);
    }

    return cleaned
        .join("\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

/**
 * Layout-aware parsing of PDF.
 * Returns { text, pages: [{ pageNumber, text, charCount }], charCount, pageCount }
 */
async function parsePdf(filePath) {
    const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const absolutePath = path.resolve(filePath);
    if (!fs.existsSync(absolutePath)) {
        throw new Error(`PDF file not found at path: ${absolutePath}`);
    }

    const data = new Uint8Array(fs.readFileSync(absolutePath));
    const loadingTask = pdfjsLib.getDocument({ data });
    const pdfDocument = await loadingTask.promise;

    const totalPages = pdfDocument.numPages;
    const pages = [];
    let totalChars = 0;

    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
        const page = await pdfDocument.getPage(pageNum);
        const textContent = await page.getTextContent();

        const items = textContent.items
            .filter((item) => item.str && item.str.trim())
            .map((item) => ({
                text: item.str,
                x: Math.round(item.transform[4]),
                y: Math.round(item.transform[5]),
                width: item.width || 0,
                height: item.height || 0,
            }));

        if (items.length === 0) {
            pages.push({
                pageNumber: pageNum,
                text: "",
                charCount: 0,
            });
            continue;
        }

        // Sort items into rows based on Y coordinate with tolerance
        const Y_TOLERANCE = 3;
        const rows = [];
        const sortedByY = [...items].sort((a, b) => b.y - a.y);

        let currentRow = [sortedByY[0]];
        let currentY = sortedByY[0].y;

        for (let i = 1; i < sortedByY.length; i++) {
            const item = sortedByY[i];
            if (Math.abs(item.y - currentY) <= Y_TOLERANCE) {
                currentRow.push(item);
            } else {
                rows.push(currentRow);
                currentRow = [item];
                currentY = item.y;
            }
        }
        rows.push(currentRow);

        const viewport = page.getViewport({ scale: 1.0 });
        const pageMiddleX = viewport.width / 2;

        const leftColumnLines = [];
        const rightColumnLines = [];
        const fullWidthLines = [];

        for (const row of rows) {
            const sortedRow = row.sort((a, b) => a.x - b.x);
            const rowText = sortedRow
                .map((item) => item.text)
                .join(" ")
                .trim();

            if (!rowText) continue;

            const minX = sortedRow[0].x;
            const maxX = sortedRow[sortedRow.length - 1].x + (sortedRow[sortedRow.length - 1].width || 0);

            const COLUMN_MARGIN = 50;
            const isFullWidth = minX < pageMiddleX - COLUMN_MARGIN && maxX > pageMiddleX + COLUMN_MARGIN;

            if (isFullWidth) {
                fullWidthLines.push({ text: rowText, y: sortedRow[0].y });
            } else {
                const leftItems = sortedRow.filter((item) => item.x < pageMiddleX);
                const rightItems = sortedRow.filter((item) => item.x >= pageMiddleX);

                if (leftItems.length > 0) {
                    leftColumnLines.push({
                        text: leftItems.map((item) => item.text).join(" ").trim(),
                        y: leftItems[0].y,
                    });
                }

                if (rightItems.length > 0) {
                    rightColumnLines.push({
                        text: rightItems.map((item) => item.text).join(" ").trim(),
                        y: rightItems[0].y,
                    });
                }
            }
        }

        const sortByYDesc = (a, b) => b.y - a.y;
        fullWidthLines.sort(sortByYDesc);
        leftColumnLines.sort(sortByYDesc);
        rightColumnLines.sort(sortByYDesc);

        const pageLines = [];
        const columnTopY = Math.max(
            leftColumnLines.length > 0 ? leftColumnLines[0].y : -Infinity,
            rightColumnLines.length > 0 ? rightColumnLines[0].y : -Infinity
        );

        const topFullWidth = fullWidthLines.filter((line) => line.y >= columnTopY);
        const bottomFullWidth = fullWidthLines.filter((line) => line.y < columnTopY);

        for (const line of topFullWidth) pageLines.push(line.text);
        for (const line of leftColumnLines) pageLines.push(line.text);
        for (const line of rightColumnLines) pageLines.push(line.text);
        for (const line of bottomFullWidth) pageLines.push(line.text);

        const rawPageText = pageLines.join("\n").trim();
        const cleanedPageText = cleanExtractedText(rawPageText);

        pages.push({
            pageNumber: pageNum,
            text: cleanedPageText,
            charCount: cleanedPageText.length,
        });
        totalChars += cleanedPageText.length;
    }

    return {
        text: pages.map((p) => p.text).join("\n\n"),
        pages,
        charCount: totalChars,
        pageCount: totalPages,
    };
}

module.exports = { parsePdf };
