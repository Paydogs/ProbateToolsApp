// --- Field mapping ---
// Everything the app has to recognise by wording lives here, and nowhere else.
// Each entry reads: "the string as it appears": theKeyItFeeds
// Editing this file is enough to teach the app a new wording — no parser change.

// --- PDF labels ---
// The label on the left is what the document writes; the key on the right is
// the property it fills. Order matters: fields are shown in the order listed.
// Listing a second label for a key makes it an alternative spelling — the
// first one stays the one displayed.

const JARMU_LABELS = {
    'Rendszám': 'rendszam',
    'Fajta': 'fajta',
    'Gyártmány': 'gyarto',
    'Típus': 'tipus',
    'Kereskedelmi név': 'kereskedelminev',
    'Alvázszám': 'alvazszam',
    'Aktuális, utolsó forgalmi engedélyének száma': 'forgalmiszam',
    'Törzskönyv száma': 'torzskonyvszam',
    'Tözskönyv száma': 'torzskonyvszam',   // the authority's own typo, missing r
    'Gyártási év': 'gyartasiev'
};

// Not in the PDF — the appraised value is typed in by hand
const JARMU_MANUAL_LABELS = {
    'Jármű értéke (Ft)': 'jarmuertek'
};

const SZAMLA_LABELS = {
    'A pénzintézet megnevezése': 'banknev',
    'Pénzügyi eszköz típusa': 'eszkozTipus',
    'Azonosító': 'azonosito',
    'Az örökhagyó jogosultságának mértéke': 'jogosultsag',
    'Egyenleg az örökhagyó halálának napján': 'halalpiEgyenleg',
    'Egyenleg a válaszadás napján': 'valasznapiEgyenleg',
    'Halálkori egyenleg örökhagyóra eső része': 'orokresz'
};

// A securities account carries everything an account does, and these as well
const ERTEKPAPIR_LABELS = {
    'Az értékpapír megnevezése': 'ertekpapirNev',
    'Halálkori darabszám': 'darabszam',
    'Halálkori forgalmi érték x Halálkori darabszám': 'forgalmiErtek'
};

// Real estate is read by position rather than by label, so these are the
// names shown in the UI
const INGATLAN_LABELS = {
    'Cím': 'cim',
    'Megnevezés': 'megnevezes'
};

const INGATLAN_MANUAL_LABELS = {
    'Ingatlan értéke (Ft)': 'ingatlanertek'
};

// Calculated properties — worked out from the entries, not read off the PDF
const INGATLAN_COMPUTED_LABELS = {
    'A látható tételek sorszámai': 'sorszamlista',
    'A látható tételek hányadainak összege': 'osszhanyad'
};

const INGATLAN_TETEL_LABELS = {
    'Sorszám': 'sorszam',
    'Típus': 'tipus',
    'Jogállás': 'jogallas',
    'Tulajdoni hányad': 'tulajdoniHanyad',
    'Név': 'nev'
};

// A ${name} a template writes on the left, the key it stands for on the right.
// The key itself always works; these are the extra spellings. A name is only
// looked up among the fields of the document at hand, so the same name may
// mean different things for different document types.

// --- PDF kinds ---
// Which field sets belong to one kind of document. An institution's reply
// carries plain accounts and securities accounts alike, so both are listed.

const PDF_TYPES = {
    accounts: ['szamla', 'ertekpapir'],
    realEstate: ['ingatlan'],
    vehicles: ['jarmu']
};

// --- Template placeholder names ---
const PLACEHOLDER_ALIASES = {
    szamlatipus: 'eszkozTipus',
    szamlaszam: 'azonosito',
    nev: 'ertekpapirNev',
    darab: 'darabszam',
    osszeg: 'forgalmiErtek',
    ingatlantipus: 'megnevezes',
    ingatlanertekertek: 'ingatlanertek',
    ertek: 'ingatlanertek',
    hanyad: 'tulajdoniHanyad',
    hatvany: 'tulajdoniHanyad'
};
