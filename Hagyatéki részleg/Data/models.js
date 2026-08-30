// --- Models ---
// The domain models, and the field objects the rest of the app works with.
// Nothing here reads a PDF or fills a template: this file answers only "what
// does the data look like".
//
// A field is { key, label, alts, aliases } and may also carry:
//   reads:    the wording the parser looks for, when it differs from the name
//   manual:   typed in by hand, not read off the PDF
//   compute:  a calculated property, worked out from the entry (see fieldValue)
//   internal: part of the model, but not a row on screen and not a placeholder

// --- Domain models ---
// What a Vehicle, an Account or a Real estate entry consists of: the
// properties it has, in the order they are shown. Reading one of these lists
// tells you the shape of the data without having to work it out from the
// parsers or from the document's wordings.
//
// What each property is called, and which line of the PDF fills it, is in
// mapping.js. A property that is only ever typed in by hand is marked
// `manual`, one that is worked out from the entry carries a `compute` (see
// COMPUTED_VALUES), and one the app keeps for itself is `internal`: part of
// the model, but not a row on screen and not a ${placeholder}.

const JARMU_MODEL = [
    { key: 'rendszam' },
    { key: 'fajta' },
    { key: 'gyarto' },
    { key: 'tipus' },
    { key: 'kereskedelminev' },
    { key: 'alvazszam' },
    { key: 'forgalmiszam' },
    { key: 'torzskonyvszam' },
    { key: 'gyartasiev' }
];

const JARMU_MANUAL_MODEL = [
    { key: 'jarmuertek', manual: true, placeholder: 'pl. 1.200.000' }
];

const SZAMLA_MODEL = [
    { key: '_type', internal: true },
    { key: 'banknev' },
    { key: 'eszkozTipus' },
    { key: 'azonosito' },
    { key: 'jogosultsag' },
    { key: 'halalpiEgyenleg' },
    { key: 'valasznapiEgyenleg' },
    { key: 'orokresz' }
];

// A securities account is an account plus these three
const ERTEKPAPIR_MODEL = SZAMLA_MODEL.concat([
    { key: 'ertekpapirNev' },
    { key: 'darabszam' },
    { key: 'forgalmiErtek' }
]);

const INGATLAN_MODEL = [
    { key: 'cim' },
    { key: 'megnevezes' }
];

const INGATLAN_MANUAL_MODEL = [
    { key: 'ingatlanertek', manual: true, placeholder: 'pl. 64.900.000' }
];

const INGATLAN_COMPUTED_MODEL = [
    { key: 'sorszamlista', compute: true },
    { key: 'osszhanyad', compute: true }
];

// One ownership entry on the tulajdoni lap
const INGATLAN_TETEL_MODEL = [
    { key: 'sorszam' },
    { key: 'tipus' },
    { key: 'jogallas' },
    { key: 'tulajdoniHanyad' },
    { key: 'nev' }
];

// --- Fields ---
// One entry of a model plus its wording from mapping.js makes one field.

// Every ${placeholder} name that stands for this key
function aliasesForKey(key) {
    return Object.keys(PLACEHOLDER_ALIASES).filter(name => PLACEHOLDER_ALIASES[name] === key);
}

// A calculated property is a field with a `compute`; see fieldValue.
const COMPUTED_VALUES = {
    sorszamlista: data => formatSorszamLista(data._sorszamok),
    osszhanyad: data => formatFraction(sumFractions(data._hanyadok))
};

// One entry of a model becomes one field: the name it is shown under, the
// wordings the PDF may use for it, and whatever the model said about it.
// `label` is the first wording when there is one, so a document that words a
// property two ways still displays it one way.
function buildFields(model) {
    return model.map(entry => {
        const wordings = PDF_LABELS[entry.key] || [];
        const field = {
            key: entry.key,
            label: FIELD_NAMES[entry.key] || entry.key,
            alts: wordings.slice(1),
            aliases: aliasesForKey(entry.key)
        };
        if (entry.manual) field.manual = true;
        if (entry.placeholder) field.placeholder = entry.placeholder;
        if (entry.internal) field.internal = true;
        if (entry.compute) field.compute = COMPUTED_VALUES[entry.key];
        // The parser matches on the document's wording; where the two differ,
        // the first wording is what to look for and the name is only shown.
        if (wordings.length) field.reads = wordings[0];
        return field;
    });
}

const JARMU_FIELDS = buildFields(JARMU_MODEL);
const JARMU_MANUAL_FIELDS = buildFields(JARMU_MANUAL_MODEL);
const SZAMLA_FIELDS = buildFields(SZAMLA_MODEL);
const ERTEKPAPIR_FIELDS = buildFields(ERTEKPAPIR_MODEL);
const INGATLAN_FIELDS = buildFields(INGATLAN_MODEL);
const INGATLAN_MANUAL_FIELDS = buildFields(INGATLAN_MANUAL_MODEL);
const INGATLAN_COMPUTED_FIELDS = buildFields(INGATLAN_COMPUTED_MODEL);
const INGATLAN_TETEL_FIELDS = buildFields(INGATLAN_TETEL_MODEL);

const DOC_TYPES = {
    jarmu: { label: 'Jármű', fields: JARMU_FIELDS },
    szamla: { label: 'Számla', fields: SZAMLA_FIELDS },
    ertekpapir: { label: 'Értékpapírszámla', fields: ERTEKPAPIR_FIELDS },
    ingatlan: { label: 'Ingatlan', fields: INGATLAN_FIELDS, itemFields: INGATLAN_TETEL_FIELDS }
};

// --- Reading a field ---

// What the parser looks for: the document's own wordings. A field with no
// wording of its own is matched on its name — that is how the tulajdoni lap's
// entries read, where the name and the document's word are the same thing.
function wordingsOf(field) {
    return (field.reads ? [field.reads] : [field.label]).concat(field.alts || []);
}

function labelToKey(label, fields) {
    const field = fields.find(f => wordingsOf(f).includes(label));
    return field ? field.key : null;
}

function buildLabelMap(fields) {
    const map = {};
    fields.forEach(f => wordingsOf(f).forEach(word => { map[word] = f.key; }));
    return map;
}

// The value behind one field for one entry. A field with a `compute` is a
// calculated property: it is worked out from the entry rather than read off
// the PDF, but it is a key like any other — fillable and listed in the hint.
function fieldValue(field, data) {
    const value = field.compute ? field.compute(data) : data[field.key];
    if (value === undefined || value === null) return '';
    // A fraction is stored as two numbers; on screen and in a template it is
    // the text the document wrote.
    return isFraction(value) ? value.textVersion : value;
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

// A property the app keeps for itself is part of the model, but not something
// to show as a row, offer as a ${placeholder}, or fill one with.
function offeredFields(fields) {
    return fields.filter(f => !f.internal);
}

function getAvailableKeys(docType) {
    return offeredFields(getFieldsForType(docType)).map(f => '${' + f.key + '}');
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
