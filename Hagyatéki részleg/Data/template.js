// --- Template filling ---
// A .docx or .txt template with ${key} placeholders, filled from one parsed
// entry. Which keys exist and what they are worth is models.js; this file is
// only the substitution.

// A ${key} typed in Word can end up split across formatting tags. Strip the
// tags inside such a run so the placeholder matches again.
function repairPlaceholders(html) {
    return html.replace(/\$\s*(?:<[^>]+>\s*)*\{[\s\S]{0,300}?\}/g, match => {
        const stripped = match.replace(/<[^>]+>/g, '');
        return /^\$\{\w+\}$/.test(stripped) ? stripped : match;
    });
}

// A known field the PDF simply did not contain becomes "nem ismert".
// An unknown key is left visible, so a typo in the template is noticeable
// instead of silently turning into a false statement.
function fillTemplate(templateText, data, docType) {
    const known = new Map();
    offeredFields(getFieldsForType(docType)).forEach(f => {
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
