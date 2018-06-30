const Patterns = require("../models/patterns");

function showValidationError(errorEl, message) {
    errorEl.classList.add("invalid");
    if (message !== undefined) {
        if (message) {
            errorEl.dataset.error = message;
        } else {
            delete errorEl.dataset.error;
        }
    }
}

function resetValidationError(errorEl) {
    errorEl.classList.remove("invalid");
    delete errorEl.dataset.error;
}

function _validateNumberInput(value, errorValue, min, gte, max, lte, displayBounds, errorEl, label, valueUnits, shouldBeInt) {
    if (!Patterns.isNumber(value)) {
        if (value.trim() === "") {
            showValidationError(errorEl, "");
        } else {
            showValidationError(errorEl, label + " is not a number.");
        }
        return errorValue;
    }
    let parsedValue = (shouldBeInt ? parseInt(value) : parseFloat(value));
    if (parsedValue.toString() !== value) {
        showValidationError(errorEl, label + " is not " + (shouldBeInt ? "an integer" : "a number") + ".");
        return errorValue;
    }
    value = parsedValue;
    if (min !== false) {
        if (gte) {
            if (value < min) {
                if (displayBounds) {
                    if (valueUnits) {
                        showValidationError(errorEl, label + " must be at least " + min + " " + valueUnits + ".");
                    } else {
                        showValidationError(errorEl, label + " must be at least " + min + ".");
                    }
                } else {
                    showValidationError(errorEl, label + " is too low.");
                }
                return errorValue;
            }
        } else {
            if (value <= min) {
                if (displayBounds) {
                    if (valueUnits) {
                        showValidationError(errorEl, label + " must be greater than " + min + " " + valueUnits + ".");
                    } else {
                        showValidationError(errorEl, label + " must be greater than " + min + ".");
                    }
                } else {
                    showValidationError(errorEl, label + " is too low.");
                }
                return errorValue;
            }
        }
    }
    if (max !== false) {
        if (lte) {
            if (value > max) {
                if (displayBounds) {
                    if (valueUnits) {
                        showValidationError(errorEl, label + " must be at most " + max + " " + valueUnits + ".");
                    } else {
                        showValidationError(errorEl, label + " must be at most " + max + ".");
                    }
                } else {
                    showValidationError(errorEl, label + " is too high.");
                }
                return errorValue;
            }
        } else {
            if (value <= max) {
                if (displayBounds) {
                    if (valueUnits) {
                        showValidationError(errorEl, label + " must be less than " + max + " " + valueUnits + ".");
                    } else {
                        showValidationError(errorEl, label + " must be less than " + max + ".");
                    }
                } else {
                    showValidationError(errorEl, label + " is too high.");
                }
                return errorValue;
            }
        }
    }
    resetValidationError(errorEl);
    return value;
}

function validateNumberInput(value, errorValue, min, gte, max, lte, displayBounds, errorEl, label, valueUnits) {
    return _validateNumberInput(value, errorValue, min, gte, max, lte, displayBounds, errorEl, label, valueUnits, false);
}

function validateIntegerInput(value, errorValue, min, gte, max, lte, displayBounds, errorEl, label, valueUnits) {
    return _validateNumberInput(value, errorValue, min, gte, max, lte, displayBounds, errorEl, label, valueUnits, true);
}

exports.showValidationError = showValidationError;
exports.resetValidationError = resetValidationError;
exports.isInt = Patterns.isInt;
exports.isNumber = Patterns.isNumber;
exports.validateNumberInput = validateNumberInput;
exports.validateIntegerInput = validateIntegerInput;
