// --- DOCX -> HTML converter ---
// Reads word/document.xml straight out of the .docx (a ZIP) and maps the run
// and paragraph properties to inline CSS. Unlike mammoth, which produces
// semantic HTML and drops direct formatting, this keeps colour, size, font,
// highlight, alignment, indentation and spacing as authored in Word.

// --- Minimal ZIP reader (native DecompressionStream, no library) ---
function zipFindEntry(bytes, wanted) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    // End of central directory: scan back from the end past any comment
    let eocd = -1;
    for (let i = bytes.length - 22; i >= 0 && i > bytes.length - 66000; i--) {
        if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('Sérült DOCX (nincs ZIP index).');

    const count = view.getUint16(eocd + 10, true);
    let p = view.getUint32(eocd + 16, true);

    for (let n = 0; n < count; n++) {
        if (view.getUint32(p, true) !== 0x02014b50) break;
        const method   = view.getUint16(p + 10, true);
        const compSize = view.getUint32(p + 20, true);
        const nameLen  = view.getUint16(p + 28, true);
        const extraLen = view.getUint16(p + 30, true);
        const cmtLen   = view.getUint16(p + 32, true);
        const localAt  = view.getUint32(p + 42, true);
        const name     = new TextDecoder('utf-8').decode(bytes.subarray(p + 46, p + 46 + nameLen));

        if (name === wanted) {
            const lNameLen  = view.getUint16(localAt + 26, true);
            const lExtraLen = view.getUint16(localAt + 28, true);
            const start = localAt + 30 + lNameLen + lExtraLen;
            return { data: bytes.subarray(start, start + compSize), method };
        }
        p += 46 + nameLen + extraLen + cmtLen;
    }
    throw new Error('A DOCX nem tartalmaz word/document.xml fájlt.');
}

async function zipReadText(bytes, name) {
    const entry = zipFindEntry(bytes, name);
    if (entry.method === 0) return new TextDecoder('utf-8').decode(entry.data);
    if (entry.method !== 8) throw new Error('Nem támogatott ZIP tömörítés: ' + entry.method);

    if (typeof DecompressionStream === 'undefined') {
        throw new Error('A böngésző nem támogatja a DecompressionStream API-t.');
    }
    const stream = new Blob([entry.data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Response(stream).text();
}

// --- Formatting helpers ---
const DOCX_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

function wEl(parent, name) {
    if (!parent) return null;
    const list = parent.getElementsByTagNameNS(DOCX_NS, name);
    return list.length ? list[0] : null;
}

// A w:b / w:i style toggle is on unless it carries w:val="0" or "false"
function wToggle(props, name) {
    const el = props ? directChild(props, name) : null;
    if (!el) return false;
    const val = el.getAttributeNS(DOCX_NS, 'val');
    return val === null || !['0', 'false', 'off'].includes(val);
}

function directChild(parent, name) {
    for (let i = 0; i < parent.childNodes.length; i++) {
        const c = parent.childNodes[i];
        if (c.nodeType === 1 && c.localName === name) return c;
    }
    return null;
}

function wVal(props, name) {
    const el = props ? directChild(props, name) : null;
    return el ? el.getAttributeNS(DOCX_NS, 'val') : null;
}

function docxEscape(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function runStyle(rPr) {
    if (!rPr) return '';
    const css = [];

    const color = wVal(rPr, 'color');
    if (color && color !== 'auto') css.push('color:#' + color);

    const sz = wVal(rPr, 'sz'); // half-points
    if (sz) css.push('font-size:' + (parseInt(sz, 10) / 2) + 'pt');

    const fonts = directChild(rPr, 'rFonts');
    const face = fonts && (fonts.getAttributeNS(DOCX_NS, 'ascii') || fonts.getAttributeNS(DOCX_NS, 'hAnsi'));
    if (face) css.push("font-family:'" + face + "'");

    // Word rebuilds a highlight from mso-highlight. A plain background alone
    // arrives as character shading, which the highlight button cannot clear —
    // the fill then looks stuck to whoever pastes the text.
    // The highlight names are Word's own; all but this one happen to be CSS
    // colours too, and an unknown name means no fill at all.
    const hl = wVal(rPr, 'highlight');
    if (hl && hl !== 'none') {
        const color = hl === 'darkYellow' ? 'olive' : hl;
        css.push('background:' + color, 'mso-highlight:' + color);
    }

    const shd = directChild(rPr, 'shd');
    const fill = shd && shd.getAttributeNS(DOCX_NS, 'fill');
    if (fill && fill !== 'auto') css.push('background-color:#' + fill);

    const caps = wToggle(rPr, 'caps');
    if (caps) css.push('text-transform:uppercase');

    return css.join(';');
}

// Word reconstructs tab stops (including dash/dot leaders) from this CSS on
// paste. Without it the leader line in front of a right-aligned amount is lost.
const TAB_LEADERS = { hyphen: 'hyphen', dot: 'dotted', underscore: 'single', heavy: 'heavy', middleDot: 'dotted' };
const TAB_ALIGN = { left: '', center: 'center', right: 'right', decimal: 'decimal', bar: 'bar' };

function tabStopsCss(pPr) {
    const tabs = directChild(pPr, 'tabs');
    if (!tabs) return '';

    const stops = [];
    for (let i = 0; i < tabs.childNodes.length; i++) {
        const t = tabs.childNodes[i];
        if (t.nodeType !== 1 || t.localName !== 'tab') continue;
        const pos = t.getAttributeNS(DOCX_NS, 'pos');
        if (!pos) continue;
        const align = TAB_ALIGN[t.getAttributeNS(DOCX_NS, 'val')] || '';
        const leader = TAB_LEADERS[t.getAttributeNS(DOCX_NS, 'leader')] || '';
        stops.push([align, leader, (parseInt(pos, 10) / 20) + 'pt'].filter(Boolean).join(' '));
    }
    return stops.length ? 'mso-tab-stops:' + stops.join(' ') : '';
}

function paragraphStyle(pPr) {
    if (!pPr) return '';
    const css = [];

    const tabs = tabStopsCss(pPr);
    if (tabs) css.push(tabs);

    const jc = wVal(pPr, 'jc');
    const align = { both: 'justify', center: 'center', right: 'right', left: 'left', start: 'left', end: 'right' }[jc];
    if (align) css.push('text-align:' + align);

    const ind = directChild(pPr, 'ind');
    if (ind) {
        const left = ind.getAttributeNS(DOCX_NS, 'left') || ind.getAttributeNS(DOCX_NS, 'start');
        const firstLine = ind.getAttributeNS(DOCX_NS, 'firstLine');
        if (left) css.push('margin-left:' + (parseInt(left, 10) / 1440) + 'in');
        if (firstLine) css.push('text-indent:' + (parseInt(firstLine, 10) / 1440) + 'in');
    }

    const spacing = directChild(pPr, 'spacing');
    if (spacing) {
        const before = spacing.getAttributeNS(DOCX_NS, 'before');
        const after = spacing.getAttributeNS(DOCX_NS, 'after');
        if (before) css.push('margin-top:' + (parseInt(before, 10) / 20) + 'pt');
        if (after) css.push('margin-bottom:' + (parseInt(after, 10) / 20) + 'pt');
    }

    return css.join(';');
}

// --- Conversion ---
function runText(run) {
    let text = '';
    for (let i = 0; i < run.childNodes.length; i++) {
        const node = run.childNodes[i];
        if (node.nodeType !== 1) continue;
        if (node.localName === 't') text += node.textContent;
        else if (node.localName === 'tab') text += '\t';
        else if (node.localName === 'br') text += '\n';
        else if (node.localName === 'noBreakHyphen') text += '‑';
    }
    return text;
}

function emitRun(run, out) {
    const rPr = directChild(run.el, 'rPr');
    const text = run.text;

    if (!text) return;
    out.text += text;

    let html = docxEscape(text)
        .replace(/\n/g, '<br>')
        .replace(/\t/g, '<span style="mso-tab-count:1">\t</span>');

    if (wToggle(rPr, 'strike')) html = '<s>' + html + '</s>';
    if (wToggle(rPr, 'u') || (rPr && directChild(rPr, 'u'))) {
        const u = wVal(rPr, 'u');
        if (u !== 'none') html = '<u>' + html + '</u>';
    }
    if (wToggle(rPr, 'i')) html = '<em>' + html + '</em>';
    if (wToggle(rPr, 'b')) html = '<strong>' + html + '</strong>';

    const vert = wVal(rPr, 'vertAlign');
    if (vert === 'superscript') html = '<sup>' + html + '</sup>';
    else if (vert === 'subscript') html = '<sub>' + html + '</sub>';

    const style = runStyle(rPr);
    if (style) html = '<span style="' + style + '">' + html + '</span>';

    out.html += html;
}

// Word splits a typed ${key} across several runs (rsid / spell-check boundaries).
// Pull each placeholder back into its first run so it survives as one string.
function mergeSplitPlaceholders(runs) {
    const joined = runs.map(r => r.text).join('');
    if (joined.indexOf('${') === -1) return;

    const spans = [];
    const re = /\$\{\w+\}/g;
    let m;
    while ((m = re.exec(joined)) !== null) spans.push({ start: m.index, end: m.index + m[0].length, text: m[0] });
    if (!spans.length) return;

    const bounds = [];
    let off = 0;
    runs.forEach((r, i) => { bounds.push({ i, start: off, end: off + r.text.length }); off += r.text.length; });

    // Back to front, so offsets of earlier placeholders stay valid
    spans.reverse().forEach(span => {
        const touched = bounds.filter(b => b.end > span.start && b.start < span.end);
        if (touched.length <= 1) return;
        touched.forEach((b, k) => {
            const r = runs[b.i];
            const from = Math.max(0, span.start - b.start);
            const to = Math.min(r.text.length, span.end - b.start);
            r.text = r.text.slice(0, from) + (k === 0 ? span.text : '') + r.text.slice(to);
        });
    });
}

function convertParagraph(para) {
    const out = { html: '', text: '' };

    // Runs directly in the paragraph, plus those inside hyperlinks / smart tags
    const runs = [];
    const walk = node => {
        for (let i = 0; i < node.childNodes.length; i++) {
            const c = node.childNodes[i];
            if (c.nodeType !== 1) continue;
            if (c.localName === 'r') runs.push({ el: c, text: runText(c) });
            else if (['hyperlink', 'smartTag', 'sdt', 'sdtContent', 'ins'].includes(c.localName)) walk(c);
        }
    };
    walk(para);

    mergeSplitPlaceholders(runs);
    runs.forEach(r => emitRun(r, out));

    const style = paragraphStyle(directChild(para, 'pPr'));
    const attr = style ? ' style="' + style + '"' : '';
    return { html: '<p' + attr + '>' + (out.html || '&nbsp;') + '</p>', text: out.text };
}

function convertTable(tbl) {
    let html = '<table style="border-collapse:collapse" border="1">';
    let text = '';

    const rows = tbl.getElementsByTagNameNS(DOCX_NS, 'tr');
    for (let r = 0; r < rows.length; r++) {
        if (rows[r].parentNode !== tbl) continue;
        html += '<tr>';
        const cells = rows[r].getElementsByTagNameNS(DOCX_NS, 'tc');
        for (let c = 0; c < cells.length; c++) {
            if (cells[c].parentNode !== rows[r]) continue;
            html += '<td style="border:1px solid #999; padding:4px; vertical-align:top">';
            const paras = cells[c].getElementsByTagNameNS(DOCX_NS, 'p');
            for (let p = 0; p < paras.length; p++) {
                const conv = convertParagraph(paras[p]);
                html += conv.html;
                text += conv.text + ' ';
            }
            html += '</td>';
        }
        html += '</tr>';
        text += '\n';
    }
    return { html: html + '</table>', text };
}

// Body runs usually specify no font — they inherit the default paragraph
// style. Without carrying that over, Word pastes everything in its own
// default (Calibri) instead of the template's font.
async function readDocDefaults(bytes) {
    const defaults = { font: '', sizePt: 0 };
    let xml;
    try {
        xml = await zipReadText(bytes, 'word/styles.xml');
    } catch (err) {
        return defaults;
    }

    const doc = new DOMParser().parseFromString(xml, 'application/xml');

    const styles = doc.getElementsByTagNameNS(DOCX_NS, 'style');
    for (let i = 0; i < styles.length; i++) {
        const s = styles[i];
        if (s.getAttributeNS(DOCX_NS, 'type') !== 'paragraph') continue;
        if (s.getAttributeNS(DOCX_NS, 'default') !== '1') continue;

        const rPr = directChild(s, 'rPr');
        if (rPr) {
            const rf = directChild(rPr, 'rFonts');
            defaults.font = (rf && (rf.getAttributeNS(DOCX_NS, 'ascii') || rf.getAttributeNS(DOCX_NS, 'hAnsi'))) || '';
            const sz = wVal(rPr, 'sz');
            if (sz) defaults.sizePt = parseInt(sz, 10) / 2;
        }
        break;
    }
    return defaults;
}

async function docxToHtml(arrayBuffer) {
    const bytes = new Uint8Array(arrayBuffer);
    const defaults = await readDocDefaults(bytes);
    const xml = await zipReadText(bytes, 'word/document.xml');
    const doc = new DOMParser().parseFromString(xml, 'application/xml');

    if (doc.getElementsByTagName('parsererror').length) {
        throw new Error('A DOCX XML nem olvasható.');
    }

    const body = doc.getElementsByTagNameNS(DOCX_NS, 'body')[0];
    if (!body) throw new Error('A DOCX nem tartalmaz törzset.');

    let html = '';
    const textParts = [];

    for (let i = 0; i < body.childNodes.length; i++) {
        const node = body.childNodes[i];
        if (node.nodeType !== 1) continue;
        if (node.localName === 'p') {
            const conv = convertParagraph(node);
            html += conv.html;
            textParts.push(conv.text);
        } else if (node.localName === 'tbl') {
            const conv = convertTable(node);
            html += conv.html;
            textParts.push(conv.text);
        }
    }

    // The text is Hungarian whatever the template says. A .docx written on a
    // Word set up in English carries en-US as its document default, and Word
    // then proofs the pasted block as English — red underlines all the way
    // through. mso-ansi-language is what Word itself writes for this.
    const base = ['mso-ansi-language:HU'];
    if (defaults.font) base.push("font-family:'" + defaults.font + "',serif");
    if (defaults.sizePt) base.push('font-size:' + defaults.sizePt + 'pt');

    const wrapped = '<div lang="hu-HU" style="' + base.join(';') + '">' + html + '</div>';

    return { html: wrapped, text: textParts.join('\n') };
}
