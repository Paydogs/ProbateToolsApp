// --- Parsers ---
// Turning the text of a PDF into the models. What a model consists of is in
// models.js, what its properties are called and which line fills them is in
// mapping.js; this file is only the reading.

// --- Auto-Detection ---

function detectDocumentType(text) {
    if (text.includes('Rendszám :') || text.includes('Rendszám:')) return 'jarmu';
    if (text.includes('Pénzügyi eszköz típusa:')) return 'szamla';
    if (text.includes('I. RÉSZ') || text.includes('II. RÉSZ')) return 'ingatlan';
    return null;
}

// Numbers arrive as "1101940 HUF" or "2061130.29 Ft"; templates write ",- Ft"
// after them, and quantities read better grouped too
const SZAMLA_NUMERIC_FIELDS = [
    'halalpiEgyenleg', 'valasznapiEgyenleg', 'orokresz', 'darabszam', 'forgalmiErtek'
];

// Each vehicle the answer reports is written as a block of its own, opened by
// "1. jármű adatai" and closed by the next such heading. Only what stands
// inside a block is vehicle data: an answer to a lookup by chassis number
// begins by echoing back the rendszám and alvázszám that were asked about, and
// that echo is not a car.
const JARMU_BLOCK = /^\d+\.\s*jármű adatai/i;

function parseVehicleData(text) {
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
    const labelMap = buildLabelMap(JARMU_FIELDS);
    const vehicles = [];
    let current = null;

    lines.forEach(line => {
        if (JARMU_BLOCK.test(line)) {
            if (current) vehicles.push(current);
            current = {};
            return;
        }

        if (!current || !line.includes(' : ')) return;
        const parts = line.split(' : ');
        const label = parts[0].trim();
        const value = parts.slice(1).join(' : ').trim();

        if (labelMap[label]) current[labelMap[label]] = value || '';
    });

    if (current) vehicles.push(current);
    return vehicles;
}

// "1101940 HUF" -> "1.101.940", "2061130.29 Ft" -> "2.061.130,29". The template
// writes ",- Ft" after the number, so the forint marker is dropped but any other
// currency is kept — an amount that is not forint then reads wrong instead of
// looking correct. Anything that is not a plain number is left untouched.
const AMOUNT = /^(-?)\s*(\d[\d\s]*)(?:[.,](\d+))?\s*([A-Za-zÁÉÍÓÖŐÚÜŰáéíóöőúüű]*)$/;

function formatAmount(raw) {
    const value = String(raw || '').trim();
    const match = value.match(AMOUNT);
    if (!match) return value;

    const grouped = match[1] +
        match[2].replace(/\s/g, '').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    const number = match[3] ? grouped + ',' + match[3] : grouped;
    const currency = match[4];
    return !currency || /^(HUF|Ft)$/i.test(currency) ? number : number + ' ' + currency;
}

// One PDF is the answer of one institution, so its name is read once and
// carried on every account it reports.
function parseBankName(lines) {
    const line = lines.find(l => l.replace(/^\*/, '').startsWith('A pénzintézet megnevezése:'));
    if (!line) return '';
    return line.substring(line.indexOf(':') + 1).trim();
}

function parseAccountData(text) {
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
    const banknev = parseBankName(lines);
    const accounts = [];
    let current = null;
    let isSecurities = false;
    let capturingMultiLine = false;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        if (line.startsWith('Pénzügyi eszköz típusa: ')) {
            if (current) accounts.push(current);
            const value = line.split('Pénzügyi eszköz típusa: ')[1].trim();
            isSecurities = value === 'Értékpapírszámla';
            current = { _type: isSecurities ? 'ertekpapir' : 'szamla', banknev: banknev };
            current.eszkozTipus = value;
            capturingMultiLine = false;
            continue;
        }

        if (!current) continue;

        if (line.includes('Halálkori forgalmi érték x Halálkori darabszám =')) {
            const val = line.split('=')[1].trim();
            current.forgalmiErtek = val || '';
            accounts.push(current);
            current = null;
            capturingMultiLine = false;
            continue;
        }

        if (line.startsWith('Halálkori egyenleg örökhagyóra eső része: ')) {
            current.orokresz = line.substring('Halálkori egyenleg örökhagyóra eső része: '.length).trim();
            if (!isSecurities) {
                accounts.push(current);
                current = null;
            }
            continue;
        }

        if (line.startsWith('Az értékpapír megnevezése: ')) {
            current.ertekpapirNev = line.substring('Az értékpapír megnevezése: '.length).trim();
            capturingMultiLine = true;
            continue;
        }

        if (capturingMultiLine) {
            const isPageNumber = /(Oldal\s)?\d+\s*\/\s*\d+/.test(line) || /^\d+\s*\/\s*\d+$/.test(line);
            if (line.startsWith('Halálkori darabszám:') || line.startsWith('Szerződés típus:') || isPageNumber) {
                capturingMultiLine = false;
                if (isPageNumber) continue;
            } else {
                current.ertekpapirNev += ' ' + line;
                continue;
            }
        }

        const sepIdx = line.indexOf(': ');
        if (sepIdx !== -1) {
            const label = line.substring(0, sepIdx).trim();
            const val = line.substring(sepIdx + 2).trim();
            const fields = isSecurities ? ERTEKPAPIR_FIELDS : SZAMLA_FIELDS;
            const key = labelToKey(label, fields);
            if (key && key !== 'forgalmiErtek') {
                current[key] = val || '';
            }
        }
    }

    if (current) accounts.push(current);
    accounts.forEach(a => {
        SZAMLA_NUMERIC_FIELDS.forEach(key => {
            if (a[key]) a[key] = formatAmount(a[key]);
        });
        // The share of the estate is a fraction, so it is read as one. Text
        // that is not a fraction is left alone rather than dropped — an
        // unexpected wording should stay visible, not disappear.
        const share = parseFraction(a.jogosultsag);
        if (share) a.jogosultsag = share;
    });
    return accounts;
}

function cleanRealEstateText(text) {
    return text.split(/\r?\n/)
        .filter(line => !/^\s*(\/)?\d+\s+Oldal\s+\d+\s*$/i.test(line))
        .join('\n');
}

// The property designation (lakás, garázs, "Kivett / egyéb épület, udvar")
// sits in part I as a table row: a name followed by measurement columns.
// The row appears before or after its header depending on the document, so
// it is found by shape rather than by position.
const INGATLAN_MEGNEVEZES_ROW = /^(.*?[A-Za-zÁÉÍÓÖŐÚÜŰáéíóöőúüű].*?)\s+((?:\d[\d.,\/]*\s+)+\d[\d.,\/]*)$/;
const INGATLAN_MEGNEVEZES_SKIP = /Bejegyző|határozat|érkezési|Oldal|Minőségi|ADATAI|Kataszteri|Rendeltetési|Művelési|helyrajzi/i;

function parseIngatlanMegnevezes(lines, part1Idx, part2Idx) {
    if (part1Idx === -1) return '';
    const end = part2Idx === -1 ? lines.length : part2Idx;

    for (let i = part1Idx + 1; i < end; i++) {
        const match = lines[i].match(INGATLAN_MEGNEVEZES_ROW);
        if (!match) continue;
        const name = match[1].trim();
        if (!name || /^\d+\.$/.test(name)) continue;
        if (INGATLAN_MEGNEVEZES_SKIP.test(name)) continue;
        return name;
    }
    return '';
}

function parseRealEstateData(text) {
    const cleanText = cleanRealEstateText(text);
    const lines = cleanText.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
    const itemLabelMap = buildLabelMap(INGATLAN_TETEL_FIELDS);

    const result = { cim: '', megnevezes: '', items: [] };

    const part1Idx = lines.findIndex(l => l.includes('I. RÉSZ'));
    if (part1Idx > 0) result.cim = lines[part1Idx - 1];

    const part2Idx = lines.findIndex(l => l.includes('II. RÉSZ'));
    result.megnevezes = parseIngatlanMegnevezes(lines, part1Idx, part2Idx);
    const part3Idx = lines.findIndex(l => l.includes('III. RÉSZ'));

    if (part2Idx !== -1 && part3Idx !== -1 && part3Idx > part2Idx) {
        const itemLines = lines.slice(part2Idx + 1, part3Idx);
        let current = null;

        itemLines.forEach(line => {
            const numMatch = line.match(/^(\d+)\.$/);
            if (numMatch) {
                if (current) result.items.push(current);
                current = { sorszam: numMatch[1], _lineIdx: 0 };
            } else if (current) {
                if (current._lineIdx === 0) {
                    current.tipus = line;
                    current._lineIdx++;
                } else {
                    const sepIdx = line.indexOf(': ');
                    if (sepIdx !== -1) {
                        const label = line.substring(0, sepIdx).trim();
                        const val = line.substring(sepIdx + 2).trim();
                        const key = itemLabelMap[label];
                        if (key) current[key] = val;
                    }
                }
            }
        });

        if (current) result.items.push(current);
        result.items.forEach(item => {
            delete item._lineIdx;
            // kept for arithmetic on the shares; _-prefixed so it is neither
            // shown as a row nor reachable as a ${placeholder}
            item.tulajdoniHanyad = normalizeFraction(item.tulajdoniHanyad);
            item._hanyad = parseFraction(item.tulajdoniHanyad);
        });
    }

    return result;
}
