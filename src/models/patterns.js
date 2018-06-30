
function isInt(string) {
    return /^-?\d+$/.test(string.trim());
}

function isNumber(string) {
    return /^(?:-?\d+(?:\.\d+)?)|(?:(?:\d+)?\.\d+)$/.test(string.trim());
}

exports.isInt = isInt;
exports.isNumber = isNumber;
