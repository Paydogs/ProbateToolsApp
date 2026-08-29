// --- Ownership fractions ---
// A tulajdoni hányad reaches us as text off the tulajdoni lap: "1/2",
// "2124/30000", and occasionally spaced out as "1 / 1". The spaces go first,
// then the text is read into numbers so shares can be summed or compared.

// Only the spaces are dropped — the fraction is left as the document wrote it,
// unreduced, so the displayed value still matches the tulajdoni lap.
function normalizeFraction(text) {
    return String(text === undefined || text === null ? '' : text).replace(/\s+/g, '');
}

const FRACTION = /^(-?\d+)(?:\/(\d+))?$/;

// Returns null for anything that is not a fraction, so a caller can tell
// "no share given" from a share that happens to be zero.
function parseFraction(text) {
    const cleaned = normalizeFraction(text);
    if (!cleaned) return null;

    const match = cleaned.match(FRACTION);
    if (!match) return null;

    // a bare whole number is a full share: "1" means 1/1
    const numerator = parseInt(match[1], 10);
    const denominator = match[2] === undefined ? 1 : parseInt(match[2], 10);
    if (!denominator) return null;

    return {
        numerator: numerator,
        denominator: denominator,
        value: numerator / denominator
    };
}

// Adds shares without reducing the result: 3/5 + 2/5 is 5/5, not 1/1 — the
// denominator the tulajdoni lap uses is the one the sentence should show.
// Denominators that differ are brought to a common one first.
function greatestCommonDivisor(a, b) {
    a = Math.abs(a);
    b = Math.abs(b);
    while (b) {
        const rest = a % b;
        a = b;
        b = rest;
    }
    return a || 1;
}

function sumFractions(list) {
    const fractions = (list || []).map(parseFraction).filter(Boolean);
    if (!fractions.length) return null;

    const denominator = fractions.reduce(
        (common, f) => common / greatestCommonDivisor(common, f.denominator) * f.denominator, 1);
    const numerator = fractions.reduce(
        (total, f) => total + f.numerator * (denominator / f.denominator), 0);

    return { numerator: numerator, denominator: denominator, value: numerator / denominator };
}

function formatFraction(fraction) {
    return fraction ? fraction.numerator + '/' + fraction.denominator : '';
}

// --- Order numbers ---
// "3., 6., 8. és 10" — a dot closes every number but the last, which is left
// open because the sentence around it writes its own ("... 10. pontja").
function formatSorszamLista(list) {
    const items = (list || []).filter(n => n !== undefined && n !== null && n !== '');
    if (!items.length) return '';

    const last = String(items[items.length - 1]);
    if (items.length === 1) return last;

    return items.slice(0, -1).map(n => n + '.').join(', ') + ' és ' + last;
}
