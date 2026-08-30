// --- PDF text ---
// A PDF holds positioned text runs, not lines. pdf.js hands them back in
// reading order with their coordinates; a run that sits more than a few points
// below the previous one starts a new line. Everything the parsers do is done
// on the text this produces, so it lives in its own file: the tests read their
// example PDFs through the very same function the app does.

const PDF_LINE_GAP = 5;

async function extractTextFromPDF(arrayBuffer) {
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        let lastY = null;
        let line = '';
        content.items.forEach(item => {
            const y = item.transform[5];
            if (lastY !== null && Math.abs(y - lastY) > PDF_LINE_GAP) {
                fullText += line + '\n';
                line = '';
            }
            line += item.str;
            lastY = y;
        });
        if (line) fullText += line + '\n';
        fullText += '\n';
    }
    return fullText;
}
