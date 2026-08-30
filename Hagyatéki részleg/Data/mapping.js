// --- Field mapping ---
// Every wording the app has to recognise or show, and nowhere else:
//
//   FIELD_NAMES   what each property is called on screen
//   PDF_LABELS    which line of the document fills which property, keyed by
//                 property, so the two stand next to each other
//
// What the properties are — which ones make up a Vehicle or an Account — is in
// models.js. Editing this file is enough to teach the app a new wording; no
// parser change.

// --- Names ---
// What each property is called on screen and in the field list.

const FIELD_NAMES = {
    // jármű
    rendszam: 'Rendszám',
    fajta: 'Fajta',
    gyarto: 'Gyártmány',
    tipus: 'Típus',
    kereskedelminev: 'Kereskedelmi név',
    alvazszam: 'Alvázszám',
    forgalmiszam: 'Aktuális, utolsó forgalmi engedélyének száma',
    torzskonyvszam: 'Törzskönyv száma',
    gyartasiev: 'Gyártási év',
    jarmuertek: 'Jármű értéke (Ft)',

    // számla és értékpapírszámla
    _type: 'Számla fajtája',
    banknev: 'A pénzintézet megnevezése',
    eszkozTipus: 'Pénzügyi eszköz típusa',
    azonosito: 'Azonosító',
    jogosultsag: 'Az örökhagyó jogosultságának mértéke',
    halalpiEgyenleg: 'Egyenleg az örökhagyó halálának napján',
    valasznapiEgyenleg: 'Egyenleg a válaszadás napján',
    orokresz: 'Halálkori egyenleg örökhagyóra eső része',
    ertekpapirNev: 'Az értékpapír megnevezése',
    darabszam: 'Halálkori darabszám',
    forgalmiErtek: 'Halálkori forgalmi érték x Halálkori darabszám',

    // ingatlan
    cim: 'Cím',
    megnevezes: 'Megnevezés',
    ingatlanertek: 'Ingatlan értéke (Ft)',
    sorszamlista: 'A látható tételek sorszámai',
    osszhanyad: 'A látható tételek hányadainak összege',

    // ingatlan tulajdoni tétel
    sorszam: 'Sorszám',
    jogallas: 'Jogállás',
    tulajdoniHanyad: 'Tulajdoni hányad',
    nev: 'Név'
};

// --- PDF wordings ---
// Which line of the document fills which property: the property on the left,
// the text the PDF writes on the right. More than one wording means the
// document may word it either way — they all fill the same property.
//
// A property missing from here is not read off a label: it is typed in by
// hand, calculated, read by position, or kept by the app for itself.

const PDF_LABELS = {
    // jármű
    rendszam: ['Rendszám'],
    fajta: ['Fajta'],
    gyarto: ['Gyártmány'],
    tipus: ['Típus'],
    kereskedelminev: ['Kereskedelmi név'],
    alvazszam: ['Alvázszám'],
    forgalmiszam: ['Aktuális, utolsó forgalmi engedélyének száma'],
    torzskonyvszam: [
        'Törzskönyv száma',
        'Tözskönyv száma'          // the authority's own typo, missing r
    ],
    gyartasiev: ['Gyártási év'],

    // számla és értékpapírszámla
    banknev: ['A pénzintézet megnevezése'],
    eszkozTipus: ['Pénzügyi eszköz típusa'],
    azonosito: ['Azonosító'],
    jogosultsag: ['Az örökhagyó jogosultságának mértéke'],
    halalpiEgyenleg: ['Egyenleg az örökhagyó halálának napján'],
    valasznapiEgyenleg: ['Egyenleg a válaszadás napján'],
    orokresz: ['Halálkori egyenleg örökhagyóra eső része'],
    ertekpapirNev: ['Az értékpapír megnevezése'],
    darabszam: ['Halálkori darabszám'],
    forgalmiErtek: ['Halálkori forgalmi érték x Halálkori darabszám']

    // Az ingatlan tulajdoni lapját nem felirat, hanem elhelyezkedés alapján
    // olvassuk, ezért annak a tételeihez itt nincs bejegyzés.
};

// --- PDF kinds ---
// Which field sets belong to one kind of document. An institution's reply
// carries plain accounts and securities accounts alike, so both are listed.

const PDF_TYPES = {
    accounts: ['szamla', 'ertekpapir'],
    realEstate: ['ingatlan'],
    vehicles: ['jarmu']
};

// --- Template placeholder names ---
// A ${name} a template writes on the left, the key it stands for on the right.
// The key itself always works; these are the extra spellings. A name is only
// looked up among the fields of the document at hand, so the same name may
// mean different things for different document types.

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
