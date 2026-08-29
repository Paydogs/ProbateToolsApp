// --- Minimal RTF -> HTML converter ---
// Covers what Word writes for simple formatted text blocks: paragraphs,
// bold / italic / underline, tabs, and Hungarian accents (both \'xx codepage
// bytes and \uN unicode escapes). Everything else is skipped gracefully.

// Destinations whose whole group carries no body text
const RTF_SKIP_DESTS = new Set([
    'fonttbl', 'colortbl', 'stylesheet', 'info', 'pict', 'object', 'objdata',
    'header', 'headerl', 'headerr', 'headerf', 'footer', 'footerl', 'footerr', 'footerf',
    'footnote', 'endnote', 'annotation', 'filetbl', 'listtable', 'listoverridetable',
    'revtbl', 'rsidtbl', 'generator', 'datastore', 'themedata', 'colorschememapping',
    'latentstyles', 'xmlnstbl', 'upr', 'panose', 'falt', 'bkmkstart', 'bkmkend'
]);

const RTF_CODEPAGES = {
    1250: 'windows-1250', 1251: 'windows-1251', 1252: 'windows-1252',
    1253: 'windows-1253', 1254: 'windows-1254', 1257: 'windows-1257',
    437: 'ibm866', 850: 'windows-1252', 65001: 'utf-8'
};

function rtfEscapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// parts: mix of byte numbers (codepage text) and strings (already-decoded chars)
function rtfDecodeParts(parts, decoder) {
    let out = '';
    let buf = [];
    parts.forEach(p => {
        if (typeof p === 'number') {
            buf.push(p);
        } else {
            if (buf.length) { out += decoder.decode(new Uint8Array(buf)); buf = []; }
            out += p;
        }
    });
    if (buf.length) out += decoder.decode(new Uint8Array(buf));
    return out;
}

function rtfToHtml(arrayBuffer) {
    const bytes = new Uint8Array(arrayBuffer);

    // RTF is 7-bit ASCII with escapes, so read it as latin1 first
    let src = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
        src += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }

    // Codepage is declared in the header, before any body text
    const cpMatch = src.match(/\\ansicpg(\d+)/);
    const cpName = RTF_CODEPAGES[cpMatch ? parseInt(cpMatch[1], 10) : 1252] || 'windows-1252';
    let decoder;
    try { decoder = new TextDecoder(cpName); } catch (e) { decoder = new TextDecoder('windows-1252'); }

    let state = { b: false, i: false, u: false, hidden: false, uc: 1 };
    const stack = [];

    const paragraphs = [];
    let runsHtml = '';        // current paragraph, as HTML
    let runsText = '';        // current paragraph, as plain text
    let parts = [];           // pending literal text of the current run
    let skipDepth = 0;        // >0 while inside a skipped destination
    let groupDepth = 0;
    let skipChars = 0;        // \uN fallback characters still to swallow

    function flushRun() {
        if (!parts.length) return;
        const text = rtfDecodeParts(parts, decoder);
        parts = [];
        if (!text || state.hidden) return;

        runsText += text;

        let html = rtfEscapeHtml(text);
        if (state.u) html = '<u>' + html + '</u>';
        if (state.i) html = '<em>' + html + '</em>';
        if (state.b) html = '<strong>' + html + '</strong>';
        runsHtml += html;
    }

    function endParagraph() {
        flushRun();
        paragraphs.push({ html: runsHtml, text: runsText });
        runsHtml = '';
        runsText = '';
    }

    let p = 0;
    while (p < src.length) {
        const ch = src[p];

        if (ch === '{') {
            p++;
            groupDepth++;
            if (skipDepth) { skipDepth++; continue; }
            flushRun();
            stack.push(Object.assign({}, state));

            // Look ahead: a \* or a known destination means skip the whole group
            const ahead = src.substr(p, 32);
            const dest = ahead.match(/^\\\*|^\\([a-z]+)/);
            if (dest && (dest[0] === '\\*' || RTF_SKIP_DESTS.has(dest[1]))) skipDepth = 1;
            continue;
        }

        if (ch === '}') {
            p++;
            groupDepth--;
            if (skipDepth) { skipDepth--; continue; }
            flushRun();
            if (stack.length) state = stack.pop();
            continue;
        }

        if (ch === '\\') {
            // Escaped literal characters
            const next = src[p + 1];
            if (next === '\\' || next === '{' || next === '}') {
                if (!skipDepth && !skipChars) parts.push(next.charCodeAt(0));
                else if (skipChars) skipChars--;
                p += 2;
                continue;
            }

            // \'hh -> single codepage byte
            if (next === "'") {
                const hex = src.substr(p + 2, 2);
                p += 4;
                if (skipChars) { skipChars--; continue; }
                if (!skipDepth) parts.push(parseInt(hex, 16));
                continue;
            }

            // Control word: \word, optional numeric parameter, optional trailing space
            const m = /^\\([a-zA-Z]+)(-?\d+)? ?/.exec(src.substr(p));
            if (!m) {
                // Standalone symbol such as \~ \- \_ \: \|
                if (!skipDepth && next === '~' && !skipChars) parts.push(' ');
                p += 2;
                continue;
            }

            const word = m[1];
            const param = m[2] !== undefined ? parseInt(m[2], 10) : null;
            p += m[0].length;

            if (word === 'u') {
                // Unicode char, followed by `uc` fallback characters to swallow
                if (skipChars) { skipChars--; }
                else if (!skipDepth) {
                    const code = param < 0 ? param + 65536 : param;
                    parts.push(String.fromCharCode(code));
                }
                skipChars = state.uc;
                continue;
            }

            if (skipDepth) continue;

            switch (word) {
                case 'par': case 'sect':
                    endParagraph(); break;
                case 'line':
                    flushRun(); runsHtml += '<br>'; runsText += '\n'; break;
                case 'tab':
                    parts.push('\t'); break;
                case 'b':  flushRun(); state.b = param !== 0; break;
                case 'i':  flushRun(); state.i = param !== 0; break;
                case 'ul': flushRun(); state.u = param !== 0; break;
                case 'ulnone': flushRun(); state.u = false; break;
                case 'v':  flushRun(); state.hidden = param !== 0; break;
                case 'uc': state.uc = param === null ? 1 : param; break;
                case 'plain':
                    flushRun(); state.b = state.i = state.u = false; break;
                case 'pard':
                    flushRun(); state.b = state.i = state.u = state.hidden = false; break;
                default:
                    break; // font/size/colour/spacing etc. are ignored
            }
            continue;
        }

        // Literal text; CR/LF in the source are formatting, not content
        if (ch !== '\r' && ch !== '\n') {
            if (skipChars) skipChars--;
            else if (!skipDepth) parts.push(ch.charCodeAt(0));
        }
        p++;
    }

    endParagraph();

    const kept = paragraphs.filter(par => par.text.trim() !== '' || par.html.includes('<br>'));
    return {
        html: kept.map(par => '<p>' + (par.html || '&nbsp;') + '</p>').join(''),
        text: kept.map(par => par.text).join('\n')
    };
}
