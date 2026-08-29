// --- Field Definitions ---
// The wording lives in mapping.js; the field objects are built from it here.
// A field is { key, label, alts, aliases } and may also carry:
//   manual:  typed in by hand, not read off the PDF
//   compute: a calculated property, worked out from the entry (see fieldValue)

// Every ${placeholder} name that stands for this key
function aliasesForKey(key) {
    return Object.keys(PLACEHOLDER_ALIASES).filter(name => PLACEHOLDER_ALIASES[name] === key);
}

// The first label listed for a key is the one displayed; any further label of
// the same key is an alternative spelling a document may use instead.
function buildFields(labels) {
    const fields = [];
    const byKey = {};

    Object.keys(labels).forEach(label => {
        const key = labels[label];
        if (byKey[key]) {
            byKey[key].alts.push(label);
            return;
        }
        byKey[key] = { key: key, label: label, alts: [], aliases: aliasesForKey(key) };
        fields.push(byKey[key]);
    });

    return fields;
}

const JARMU_FIELDS = buildFields(JARMU_LABELS);
const SZAMLA_FIELDS = buildFields(SZAMLA_LABELS);
const ERTEKPAPIR_FIELDS = SZAMLA_FIELDS.concat(buildFields(ERTEKPAPIR_LABELS));
const INGATLAN_FIELDS = buildFields(INGATLAN_LABELS);
const INGATLAN_TETEL_FIELDS = buildFields(INGATLAN_TETEL_LABELS);

// A calculated property is a field with a `compute`; see fieldValue.
const COMPUTED_VALUES = {
    sorszamlista: data => formatSorszamLista(data._sorszamok),
    osszhanyad: data => formatFraction(sumFractions(data._hanyadok))
};

const INGATLAN_COMPUTED_FIELDS = buildFields(INGATLAN_COMPUTED_LABELS).map(f =>
    Object.assign(f, { compute: COMPUTED_VALUES[f.key] }));

// Appraised values are nowhere in the PDFs, they are typed in by hand.
const INGATLAN_MANUAL_FIELDS = buildFields(INGATLAN_MANUAL_LABELS).map(f =>
    Object.assign(f, { manual: true, placeholder: 'pl. 64.900.000' }));

const JARMU_MANUAL_FIELDS = buildFields(JARMU_MANUAL_LABELS).map(f =>
    Object.assign(f, { manual: true, placeholder: 'pl. 1.200.000' }));

// Numbers arrive as "1101940 HUF" or "2061130.29 Ft"; templates write ",- Ft"
// after them, and quantities read better grouped too
const SZAMLA_NUMERIC_FIELDS = [
    'halalpiEgyenleg', 'valasznapiEgyenleg', 'orokresz', 'darabszam', 'forgalmiErtek'
];

const DOC_TYPES = {
    jarmu: { label: 'Jármű', fields: JARMU_FIELDS },
    szamla: { label: 'Számla', fields: SZAMLA_FIELDS },
    ertekpapir: { label: 'Értékpapírszámla', fields: ERTEKPAPIR_FIELDS },
    ingatlan: { label: 'Ingatlan', fields: INGATLAN_FIELDS, itemFields: INGATLAN_TETEL_FIELDS }
};

// --- Helpers ---

function labelToKey(label, fields) {
    const field = fields.find(f => f.label === label || (f.alts && f.alts.includes(label)));
    return field ? field.key : null;
}

function buildLabelMap(fields) {
    const map = {};
    fields.forEach(f => {
        map[f.label] = f.key;
        (f.alts || []).forEach(alt => { map[alt] = f.key; });
    });
    return map;
}

// --- Auto-Detection ---

function detectDocumentType(text) {
    if (text.includes('Rendszám :') || text.includes('Rendszám:')) return 'jarmu';
    if (text.includes('Pénzügyi eszköz típusa:')) return 'szamla';
    if (text.includes('I. RÉSZ') || text.includes('II. RÉSZ')) return 'ingatlan';
    return null;
}

// --- Parsers ---

// A vehicle is one block of the form, opened by its "N. jármű adatai" heading
// and running to the next one. Nothing outside a block is a vehicle: the form
// starts with an echo of what was searched for, and when the search went by
// plate that echo carries a Rendszám of its own.
// The accented letters are written differently by different fonts, so they are
// matched loosely.
const JARMU_HEADING = /^\d+\.\s+j.rm.\s+adatai$/i;

function parseVehicleData(text) {
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
    const labelMap = buildLabelMap(JARMU_FIELDS);
    const vehicles = [];
    let current = null;

    lines.forEach(line => {
        if (JARMU_HEADING.test(line)) {
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

// --- Template Filling ---

// A ${key} typed in Word can end up split across formatting tags. Strip the
// tags inside such a run so the placeholder matches again.
function repairPlaceholders(html) {
    return html.replace(/\$\s*(?:<[^>]+>\s*)*\{[\s\S]{0,300}?\}/g, match => {
        const stripped = match.replace(/<[^>]+>/g, '');
        return /^\$\{\w+\}$/.test(stripped) ? stripped : match;
    });
}

// The value behind one field for one entry. A field with a `compute` is a
// calculated property: it is worked out from the entry rather than read off
// the PDF, but it is a key like any other — fillable and listed in the hint.
function fieldValue(field, data) {
    const value = field.compute ? field.compute(data) : data[field.key];
    return value === undefined || value === null ? '' : value;
}

// A known field the PDF simply did not contain becomes "nem ismert".
// An unknown key is left visible, so a typo in the template is noticeable
// instead of silently turning into a false statement.
function fillTemplate(templateText, data, docType) {
    const known = new Map();
    getFieldsForType(docType).forEach(f => {
        known.set(f.key, f);
        (f.aliases || []).forEach(alias => known.set(alias, f));
    });

    return repairPlaceholders(templateText).replace(/\$\{(\w+)\}/g, (match, key) => {
        const field = known.get(key);
        const value = field ? fieldValue(field, data) : data[key];
        if (value !== undefined && value !== '') return value;
        return field ? 'nem ismert' : match;
    });
}

function getFieldsForType(docType) {
    if (docType === 'jarmu') return JARMU_FIELDS.concat(JARMU_MANUAL_FIELDS);
    if (docType === 'szamla') return SZAMLA_FIELDS;
    if (docType === 'ertekpapir') return ERTEKPAPIR_FIELDS;
    // The address and the hand-entered value belong to the document, but
    // templates reference them from inside a single ownership entry
    if (docType === 'ingatlan') {
        return INGATLAN_FIELDS.concat(
            INGATLAN_MANUAL_FIELDS, INGATLAN_TETEL_FIELDS, INGATLAN_COMPUTED_FIELDS);
    }
    return [];
}

function getAvailableKeys(docType) {
    return getFieldsForType(docType).map(f => '${' + f.key + '}');
}

// The kind of PDF a document type belongs to
function getPdfType(docType) {
    return Object.keys(PDF_TYPES).find(name => PDF_TYPES[name].indexOf(docType) !== -1) || null;
}

// Every key the whole PDF kind offers, deduplicated. An account statement
// holds both kinds of account, so one document type is not the full picture.
function getFieldsForPdfType(docType) {
    const types = PDF_TYPES[getPdfType(docType)] || [docType];
    const seen = {};
    const fields = [];

    types.forEach(type => {
        getFieldsForType(type).forEach(field => {
            if (seen[field.key]) return;
            seen[field.key] = true;
            fields.push(field);
        });
    });

    return fields;
}
