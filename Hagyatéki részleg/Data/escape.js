// --- Escaping ---
// Values read off a PDF are written into the page as markup, so they have to
// carry a quote, an ampersand or an apostrophe without ending the attribute
// they sit in. Two different places need two different escapes.

// A value inside a " quoted HTML attribute.
function escAttr(str) {
    return (str === undefined || str === null ? '' : String(str))
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// A value inside a JS string quoted ', itself inside a " quoted attribute
// (onclick="copyField(this, '...')"). The JS escapes go on first, so that the
// backslashes they add are not escaped a second time. A line break ends a
// string literal, so it is written out as \n — and so is a carriage return,
// which the HTML parser turns into a line break inside an attribute. A CRLF
// pair is one break, not two.
function escJsAttr(str) {
    return escAttr((str === undefined || str === null ? '' : String(str))
        .replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\r\n|[\r\n]/g, '\\n'));
}
