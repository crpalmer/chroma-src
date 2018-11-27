
const ieee754 = require("ieee754");

const MaterialMatrix = require("./material-matrix");

const EOL = "\r\n";
const MSF2_CHAR_LIMIT = 32;

const colorInfo = [
    {
        value: 0,
        label: "Unused",
        strength: 1,
        firmwareLabel: "",
        color: ""
    },
    {
        value: 1,
        label: "Default",
        strength: 1,
        firmwareLabel: "Filament",
        color: ""
    },
    {
        value: 2,
        label: "Red",
        strength: 1,
        firmwareLabel: "Red",
        color: "#e03c3c"
    },
    {
        value: 3,
        label: "Orange",
        strength: 1,
        firmwareLabel: "Orange",
        color: "#ff9500"
    },
    {
        value: 4,
        label: "Yellow",
        strength: 1,
        firmwareLabel: "Yellow",
        color: "#ffd213"
    },
    {
        value: 5,
        label: "Green",
        strength: 1,
        firmwareLabel: "Green",
        color: "#30cc3a"
    },
    {
        value: 6,
        label: "Blue",
        strength: 1,
        firmwareLabel: "Blue",
        color: "#4325c6"
    },
    {
        value: 7,
        label: "Pink",
        strength: 1,
        firmwareLabel: "Pink",
        color: "#e490b7"
    },
    {
        value: 8,
        label: "Purple",
        strength: 1,
        firmwareLabel: "Purple",
        color: "#9c25ce"
    },
    {
        value: 9,
        label: "Brown",
        strength: 1,
        firmwareLabel: "Brown",
        color: "#844b24"
    },
    {
        value: 10,
        label: "Transparent",
        strength: 1,
        firmwareLabel: "Transparent",
        color: "#dddddd",
        transparent: true
    },
    {
        value: 11,
        label: "White",
        strength: 1,
        firmwareLabel: "White",
        color: "#f6f6f6"
    },
    {
        value: 12,
        label: "Grey",
        strength: 1,
        firmwareLabel: "Grey",
        color: "#7d7d7d"
    },
    {
        value: 13,
        label: "Black",
        strength: 1,
        firmwareLabel: "Black",
        color: "#111111"
    },
    {
        value: 14, // Drive 1 custom
        label: "Custom color",
        strength: 1,
        buttonLabel: "Custom",
        firmwareLabel: "",
        color: ""
    },
    {
        value: 15, // Drive 2 custom
        label: "Custom color",
        strength: 1,
        buttonLabel: "Custom",
        firmwareLabel: "",
        color: ""
    },
    {
        value: 16, // Drive 3 custom
        label: "Custom color",
        strength: 1,
        buttonLabel: "Custom",
        firmwareLabel: "",
        color: ""
    },
    {
        value: 17, // Drive 4 custom
        label: "Custom color",
        strength: 1,
        buttonLabel: "Custom",
        firmwareLabel: "",
        color: ""
    }
];

function serializeColorStrengths() {
    let strengths = [];
    for (let i = 2; i < 14; i++) {
        strengths.push(colorInfo[i].strength);
    }
    return strengths;
}
function unserializeColorStrengths(strengthsList) {
    for (let i = 2; i < 14; i++) {
        colorInfo[i].strength = strengthsList[i - 2];
    }
}
function resetColorStrengths() {
    for (let i = 2; i < 14; i++) {
        colorInfo[i].strength = 1;
    }
}

function intToHexString(int, minHexDigits) {
    return ("0".repeat(minHexDigits) + int.toString(16)).substr(-minHexDigits);
}
function int16ToHexString(int) {
    const buf = Buffer.alloc(2);
    buf.writeInt16BE(int, 0);
    return buf.toString('hex');
}
function floatToHexString(float) {
    let buffer = Buffer.alloc(4);
    let output = "";
    ieee754.write(buffer, float, 0, false, 23, 4);
    for (let i = 0; i < buffer.length; i++) {
        output += ("00" + buffer[i].toString(16)).substr(-2);
    }
    return output;
}
function hexStringToInt(hexString) {
    return parseInt(hexString, 16);
}
function hexStringToInt16(hexString) {
    const rawUnsignedVal = parseInt(hexString, 16);
    const buf = Buffer.alloc(2);
    buf.writeUInt16BE(rawUnsignedVal, 0);
    return buf.readInt16BE(0);
}
function hexStringToFloat(hexString) {
    return Buffer(hexString, "hex").readFloatBE(0);
}

function getColorsUsedHex(colorsUsed) {
    return colorsUsed.map(function (color) {
        return intToHexString(color, 1);
    });
}

function getColorsUsedLabels(colorsUsed) {
    let colorsUsedLabels = [];
    let customColorUsed = false;
    let i;
    for (i = 0; i < 4; i++) {
        if (colorsUsed[i] > 1) {
            customColorUsed = true;
            break;
        }
    }
    for (i = 0; i < 4; i++) {
        if (customColorUsed) {
            colorsUsedLabels.push(colorInfo[colorsUsed[i]].label);
        } else {
            colorsUsedLabels.push(colorsUsed[i] === 1 ? "Used" : "Unused");
        }
    }
    return colorsUsedLabels;
}

function getColorsUsedLabels1_4(materials) {
    return [
        materials[0].name,
        materials[1].name,
        materials[2].name,
        materials[3].name
    ];
}

function getMaterialsUsedLabels1_4(materials) {
    let labels = ["", "", "", ""];
    for (let i = 0; i < 4; i++) {
        if (materials[i].index === 0) {
            labels[i] = "Unused";
        } else if (materials[i].name === "") {
            labels[i] = "Default";
        } else {
            labels[i] = materials[i].name;
        }
    }
    return labels;
}

function getTotalFilamentLength(spliceList) {
    if (spliceList.length === 0) {
        return 0;
    }
    return spliceList[spliceList.length - 1][1];
}

function getFilamentLengthsByDrive(spliceList) {
    let filamentLengths = [0, 0, 0, 0];
    let totalLength = 0;
    if (spliceList.length === 0) {
        return filamentLengths;
    }
    spliceList.forEach(function (splice) {
        filamentLengths[splice[0]] += splice[1] - totalLength;
        totalLength = splice[1];
    });
    return filamentLengths;
}

function msfVersionToO21(major, minor) {
    const version = (major * 10) + minor;
    return "O21 D" + intToHexString(version, 4) + EOL;
}

function replaceSpaces(input) {
    return input.replace(/ /g, "_");
}

function truncate(input, length) {
    return input.substr(0, length);
}

const msf1_2Functions = {
    createMSF: function () {
        let colorsUsed = getColorsUsedHex(this.colorsUsed);
        let msfOutput = "MSF1.2" + EOL;
        msfOutput += "cu:" + colorsUsed[0] + colorsUsed[1] + colorsUsed[2] + colorsUsed[3] + EOL;       // drives used
        msfOutput += "ppm:" + floatToHexString(this.pulsesPerMM) + EOL;             // pulses per MM
        msfOutput += "lo:" + intToHexString(this.loadingOffset, 4) + EOL;           // loading offset
        msfOutput += "ns:" + intToHexString(this.spliceList.length, 4) + EOL;       // number of splices
        msfOutput += "np:" + intToHexString(this.pingList.length, 4) + EOL;         // number of pings
        // create the output splice list (splices in the list are of the form [drive#, lengthInMM])
        this.spliceList.forEach(function (splice) {
            msfOutput += "(" + intToHexString(splice[0], 2) + "," + floatToHexString(splice[1]) + ")" + EOL;
        });
        // create the output ping list (pings in the list are of the form [startLength, endLength])
        this.pingList.forEach(function (ping) {
            msfOutput += "(64," + floatToHexString(ping[0]) + ")" + EOL;
        });
        return msfOutput;
    },
    createPlainMSF: function () {
        let colorsUsed = getColorsUsedLabels(this.colorsUsed);
        let msfOutput = "MSF1.2" + EOL + EOL;

        if (this.printerProfile) {
            msfOutput += "Printer Profile:  " + this.printerProfile.profileName + EOL;
        }
        msfOutput += "Drives Used:      " + colorsUsed[0] + ", " + colorsUsed[1] + ", "
            + colorsUsed[2] + ", " + colorsUsed[3] + EOL;
        msfOutput += "Pulses Per MM:    " + this.pulsesPerMM + EOL;
        msfOutput += "Loading Offset:   " + this.loadingOffset + EOL;
        msfOutput += "Splice Count:     " + this.spliceList.length + EOL;
        msfOutput += "Ping Count:       " + this.pingList.length + EOL;

        // create the output splice list (splices in the list are of the form [drive#, lengthInMM])
        if (this.spliceList.length > 0) {
            msfOutput += EOL;
            let filamentLengths = getFilamentLengthsByDrive(this.spliceList);
            let totalLength = getTotalFilamentLength(this.spliceList);
            msfOutput += "Filament Used" + EOL;
            if (this.colorsUsed[0]) {
                msfOutput += "Drive 1:          " + (filamentLengths[0] / 1000).toFixed(2) + " m" + EOL;
            }
            if (this.colorsUsed[1]) {
                msfOutput += "Drive 2:          " + (filamentLengths[1] / 1000).toFixed(2) + " m" + EOL;
            }
            if (this.colorsUsed[2]) {
                msfOutput += "Drive 3:          " + (filamentLengths[2] / 1000).toFixed(2) + " m" + EOL;
            }
            if (this.colorsUsed[3]) {
                msfOutput += "Drive 4:          " + (filamentLengths[3] / 1000).toFixed(2) + " m" + EOL;
            }
            msfOutput += "Total:            " + (totalLength / 1000).toFixed(2) + " m" + EOL;
            msfOutput += EOL;
            this.spliceList.forEach(function (splice) {
                msfOutput += "(" + splice[0] + ", " + splice[1] + ")" + EOL;
            });
        }

        // create the output ping list (pings in the list are of the form [startLength, endLength])
        if (this.pingList.length > 0) {
            msfOutput += EOL;
            this.pingList.forEach(function (ping) {
                if (ping[1] === undefined) {
                    msfOutput += "(PING, " + ping[0] + ")" + EOL;
                } else {
                    msfOutput += "(PING, " + ping[0] + " - " + (ping[1] - ping[0]) + " mm)" + EOL;
                }
            });
        }

        return msfOutput;
    }
};

const msf1_3Functions = {
    createMSF: function () {
        let colorsUsed = getColorsUsedHex(this.colorsUsed);
        let msfOutput = "MSF1.3" + EOL;
        msfOutput += "cu:" + colorsUsed[0] + colorsUsed[1] + colorsUsed[2] + colorsUsed[3] + EOL;       // drives used
        msfOutput += "ppm:" + floatToHexString(this.pulsesPerMM) + EOL;             // pulses per MM
        msfOutput += "lo:" + intToHexString(this.loadingOffset, 4) + EOL;           // loading offset
        msfOutput += "hf:" + intToHexString(this.heatFactor, 4) + EOL;              // loading offset
        msfOutput += "ns:" + intToHexString(this.spliceList.length, 4) + EOL;       // number of splices
        msfOutput += "np:" + intToHexString(this.pingList.length, 4) + EOL;         // number of pings
        msfOutput += "nh:" + intToHexString(0, 4) + EOL;                             // number of hot swaps (0 for now)
        // create the output splice list (splices in the list are of the form [drive#, lengthInMM])
        this.spliceList.forEach(function (splice) {
            msfOutput += "(" + intToHexString(splice[0], 2) + "," + floatToHexString(splice[1]) + ")" + EOL;
        });
        // create the output ping list (pings in the list are of the form [startLength, endLength])
        this.pingList.forEach(function (ping) {
            msfOutput += "(64," + floatToHexString(ping[0]) + ")" + EOL;
        });

        return msfOutput;
    },
    createPlainMSF: function () {
        let colorsUsed = getColorsUsedLabels(this.colorsUsed);
        let msfOutput = "MSF1.3" + EOL + EOL;

        if (this.printerProfile) {
            msfOutput += "Printer Profile:  " + this.printerProfile.profileName + EOL;
        }
        msfOutput += "Drives Used:      " + colorsUsed[0] + ", " + colorsUsed[1] + ", "
            + colorsUsed[2] + ", " + colorsUsed[3] + EOL;
        msfOutput += "Pulses Per MM:    " + this.pulsesPerMM + EOL;
        msfOutput += "Loading Offset:   " + this.loadingOffset + EOL;
        msfOutput += "Heating Factor:   " + this.heatFactor + EOL;
        msfOutput += "Splice Count:     " + this.spliceList.length + EOL;
        msfOutput += "Ping Count:       " + this.pingList.length + EOL;
        msfOutput += "Hot Swap Count:   " + this.hotSwapList.length + EOL;

        // create the output splice list (splices in the list are of the form [drive#, lengthInMM])
        if (this.spliceList.length > 0) {
            msfOutput += EOL;
            let filamentLengths = getFilamentLengthsByDrive(this.spliceList);
            let totalLength = getTotalFilamentLength(this.spliceList);
            msfOutput += "Filament Used" + EOL;
            if (this.colorsUsed[0]) {
                msfOutput += "Drive 1:          " + (filamentLengths[0] / 1000).toFixed(2) + " m" + EOL;
            }
            if (this.colorsUsed[1]) {
                msfOutput += "Drive 2:          " + (filamentLengths[1] / 1000).toFixed(2) + " m" + EOL;
            }
            if (this.colorsUsed[2]) {
                msfOutput += "Drive 3:          " + (filamentLengths[2] / 1000).toFixed(2) + " m" + EOL;
            }
            if (this.colorsUsed[3]) {
                msfOutput += "Drive 4:          " + (filamentLengths[3] / 1000).toFixed(2) + " m" + EOL;
            }
            msfOutput += "Total:            " + (totalLength / 1000).toFixed(2) + " m" + EOL;
            msfOutput += EOL;
            this.spliceList.forEach(function (splice) {
                msfOutput += "(" + splice[0] + ", " + splice[1] + ")" + EOL;
            });
        }

        // create the output ping list (pings in the list are of the form [startLength, endLength])
        if (this.pingList.length > 0) {
            msfOutput += EOL;
            this.pingList.forEach(function (ping) {
                if (ping[1] === undefined) {
                    msfOutput += "(PING, " + ping[0] + ")" + EOL;
                } else {
                    msfOutput += "(PING, " + ping[0] + " - " + (ping[1] - ping[0]) + " mm)" + EOL;
                }
            });
        }

        return msfOutput;
    }
};

const msf1_4Functions = {
    createMSF: function () {
        let colorsUsed = getColorsUsedLabels1_4(this.materials);
        let msfOutput = "MSF1.4" + EOL;
        msfOutput += "cu:" + this.materials[0].index + colorsUsed[0] + ";"
            + this.materials[1].index + colorsUsed[1] + ";"
            + this.materials[2].index + colorsUsed[2] + ";"
            + this.materials[3].index + colorsUsed[3] + ";" + EOL;       // drives used
        msfOutput += "ppm:" + floatToHexString(this.pulsesPerMM) + EOL;             // pulses per MM
        msfOutput += "lo:" + intToHexString(this.loadingOffset, 4) + EOL;           // loading offset
        msfOutput += "ns:" + intToHexString(this.spliceList.length, 4) + EOL;       // number of splices
        msfOutput += "np:" + intToHexString(this.pingList.length, 4) + EOL;         // number of pings
        msfOutput += "nh:" + intToHexString(0, 4) + EOL;                            // number of hot swaps (0 for now)
        msfOutput += "na:" + intToHexString(this.algorithmsList.length, 4) + EOL;   // number of algorithms
        // create the output splice list (splices in the list are of the form [drive#, lengthInMM])
        this.spliceList.forEach(function (splice) {
            msfOutput += "(" + intToHexString(splice[0], 2) + "," + floatToHexString(splice[1]) + ")" + EOL;
        });
        // create the output ping list (pings in the list are of the form [startLength, endLength])
        this.pingList.forEach(function (ping) {
            msfOutput += "(64," + floatToHexString(ping[0]) + ")" + EOL;
        });
        // create the algorithms list (algorithms in this list are objects)
        this.algorithmsList.forEach(function (alg) {
            msfOutput += "(" + alg.ingoing + alg.outgoing + "," + floatToHexString(alg.heatFactor) + ","
                + floatToHexString(alg.compressionFactor) + "," + (alg.reverse ? 1 : 0) + ")" + EOL;
        });

        return msfOutput;
    },
    createPlainMSF: function () {
        let materialsUsed = getMaterialsUsedLabels1_4(this.materials);
        let msfOutput = "MSF1.4" + EOL + EOL;

        if (this.printerProfile) {
            msfOutput += "Printer Profile:  " + this.printerProfile.profileName + EOL;
        }
        msfOutput += "Materials Used:   " + materialsUsed[0].trim() + ", " + materialsUsed[1].trim() + ", "
            + materialsUsed[2].trim() + ", " + materialsUsed[3].trim() + EOL;
        msfOutput += "Pulses Per MM:    " + this.pulsesPerMM + EOL;
        msfOutput += "Loading Offset:   " + this.loadingOffset + EOL;
        msfOutput += "Splice Count:     " + this.spliceList.length + EOL;
        msfOutput += "Ping Count:       " + this.pingList.length + EOL;
        msfOutput += "Hot Swap Count:   " + this.hotSwapList.length + EOL;
        msfOutput += "Algorithm Count:  " + this.algorithmsList.length + EOL;

        // create the output splice list (splices in the list are of the form [drive#, lengthInMM])
        if (this.spliceList.length > 0) {
            msfOutput += EOL;
            let filamentLengths = getFilamentLengthsByDrive(this.spliceList);
            let totalLength = getTotalFilamentLength(this.spliceList);
            msfOutput += "Filament Used" + EOL;
            if (this.colorsUsed[0]) {
                msfOutput += "Drive 1:          " + (filamentLengths[0] / 1000).toFixed(2) + " m" + EOL;
            }
            if (this.colorsUsed[1]) {
                msfOutput += "Drive 2:          " + (filamentLengths[1] / 1000).toFixed(2) + " m" + EOL;
            }
            if (this.colorsUsed[2]) {
                msfOutput += "Drive 3:          " + (filamentLengths[2] / 1000).toFixed(2) + " m" + EOL;
            }
            if (this.colorsUsed[3]) {
                msfOutput += "Drive 4:          " + (filamentLengths[3] / 1000).toFixed(2) + " m" + EOL;
            }
            msfOutput += "Total:            " + (totalLength / 1000).toFixed(2) + " m" + EOL;
            msfOutput += EOL;
            this.spliceList.forEach(function (splice) {
                msfOutput += "(" + splice[0] + ", " + splice[1] + ")" + EOL;
            });
        }

        // create the output ping list (pings in the list are of the form [startLength, endLength])
        if (this.pingList.length > 0) {
            msfOutput += EOL;
            this.pingList.forEach(function (ping) {
                if (ping[1] === undefined) {
                    msfOutput += "(PING, " + ping[0] + ")" + EOL;
                } else {
                    msfOutput += "(PING, " + ping[0] + " - " + (ping[1] - ping[0]) + " mm)" + EOL;
                }
            });
        }
        // create the output ping list (pings in the list are of the form [startLength, endLength])
        if (this.algorithmsList.length > 0) {
            msfOutput += EOL;
            this.algorithmsList.forEach(function (alg) {
                msfOutput += "(" + alg.ingoing + "-" + alg.outgoing + ", heat="
                    + alg.heatFactor + ", compression=" + alg.compressionFactor + ", direction="
                    + (alg.reverse ? "reverse" : "forward") + ")" + EOL;
            });
        }

        return msfOutput;
    }
};

const msf2_0Functions = {
    createMSF: function () {
        let colorsUsed = getColorsUsedLabels1_4(this.materials);
        let msfOutput = msfVersionToO21(2, 0);
        // printer profile identifier
        msfOutput += "O22 D" + this.printerProfile.getMSF2PrinterID() + EOL;

        // style profile identifier
        msfOutput += "O23 D0001" + EOL; // Chroma profiles do not have style identifiers

        // adjusted PPM
        msfOutput += "O24 D0000" + EOL; // Chroma profiles do not have adjusted PPM

        // materials used
        msfOutput += "O25";
        for (let  drive = 0; drive < 4; drive++) {
            const materialIndex = this.materials[drive].index;
            msfOutput += " D";
            msfOutput += intToHexString(materialIndex, 1);
            if (materialIndex > 0) {
                let color = colorInfo[this.colorsUsed[drive]].color;
                if (color) {
                    color = color.slice(1).toLowerCase();
                } else {
                    color = 'ffffff'
                }
                msfOutput += color;
                msfOutput += replaceSpaces(truncate(colorsUsed[drive], MSF2_CHAR_LIMIT));
            }
        }
        msfOutput += EOL;

        // number of splices
        msfOutput += "O26 D" + intToHexString(this.spliceList.length, 4) + EOL;

        // number of pings
        msfOutput += "O27 D" + intToHexString(this.pingList.length, 4) + EOL;

        // number of algorithms
        msfOutput += "O28 D" + intToHexString(this.algorithmsList.length, 4) + EOL;

        // number of hot swaps (0 for now)
        msfOutput += "O29 D0000" + EOL;

        // splice data
        for (let splice of this.spliceList) {
            msfOutput += "O30 D" + intToHexString(splice[0], 1)
                + " D" + floatToHexString(splice[1]) + EOL;
        }

        // ping data
        for (let ping of this.pingList) {
            msfOutput += "O31 D" + floatToHexString(ping[0]);
            if (ping[1]) {
                msfOutput += " D" + floatToHexString(ping[1]);
            }
            msfOutput += EOL;
        }

        // algorithm data
        for (let alg of this.algorithmsList) {
            msfOutput += "O32 D" + intToHexString(alg.ingoing, 1)
                + intToHexString(alg.outgoing, 1)
                + " D" + int16ToHexString(alg.heatFactor)
                + " D" + int16ToHexString(alg.compressionFactor)
                + " D" + int16ToHexString(alg.coolingFactor)
                + EOL;
        }

        // hot swap data (nonexistent for now)

        return msfOutput;
    },
    createPlainMSF: function () {
        let materialsUsed = getMaterialsUsedLabels1_4(this.materials);
        let msfOutput = "MSF2.0" + EOL + EOL;
        // printer profile identifier
        msfOutput += "Printer Profile:  " + this.printerProfile.profileName
            + " (" + this.printerProfile.getMSF2PrinterID() + ")" + EOL;
        msfOutput += "Materials Used:   " + materialsUsed[0].trim() + ", " + materialsUsed[1].trim() + ", "
            + materialsUsed[2].trim() + ", " + materialsUsed[3].trim() + EOL;
        msfOutput += "Splice Count:     " + this.spliceList.length + EOL;
        msfOutput += "Ping Count:       " + this.pingList.length + EOL;
        msfOutput += "Hot Swap Count:   " + this.hotSwapList.length + EOL;
        msfOutput += "Algorithm Count:  " + this.algorithmsList.length + EOL;

        // create the output splice list (splices in the list are of the form [drive#, lengthInMM])
        if (this.spliceList.length > 0) {
            msfOutput += EOL;
            let filamentLengths = getFilamentLengthsByDrive(this.spliceList);
            let totalLength = getTotalFilamentLength(this.spliceList);
            msfOutput += "Filament Used" + EOL;
            if (this.colorsUsed[0]) {
                msfOutput += "Drive 1:          " + (filamentLengths[0] / 1000).toFixed(2) + " m" + EOL;
            }
            if (this.colorsUsed[1]) {
                msfOutput += "Drive 2:          " + (filamentLengths[1] / 1000).toFixed(2) + " m" + EOL;
            }
            if (this.colorsUsed[2]) {
                msfOutput += "Drive 3:          " + (filamentLengths[2] / 1000).toFixed(2) + " m" + EOL;
            }
            if (this.colorsUsed[3]) {
                msfOutput += "Drive 4:          " + (filamentLengths[3] / 1000).toFixed(2) + " m" + EOL;
            }
            msfOutput += "Total:            " + (totalLength / 1000).toFixed(2) + " m" + EOL;
            msfOutput += EOL;
            this.spliceList.forEach(function (splice) {
                msfOutput += "(" + splice[0] + ", " + splice[1] + ")" + EOL;
            });
        }

        // create the output ping list (pings in the list are of the form [startLength, endLength])
        if (this.pingList.length > 0) {
            msfOutput += EOL;
            this.pingList.forEach(function (ping) {
                if (ping[1] === undefined) {
                    msfOutput += "(PING, " + ping[0] + ")" + EOL;
                } else {
                    msfOutput += "(PING, " + ping[0] + " - " + (ping[1] - ping[0]) + " mm)" + EOL;
                }
            });
        }
        // create the output ping list (pings in the list are of the form [startLength, endLength])
        if (this.algorithmsList.length > 0) {
            msfOutput += EOL;
            this.algorithmsList.forEach(function (alg) {
                msfOutput += "(" + alg.ingoing + "-" + alg.outgoing + ", heat="
                    + alg.heatFactor + ", compression=" + alg.compressionFactor + ", cooling="
                    + alg.coolingFactor + ")" + EOL;
            });
        }

        return msfOutput;
    },
    fromLines: function (lines) {
        const msf = new MSF();
        lines.forEach(function (line) {
            const [command, ...params] = line.split(" ");
            switch (command) {
                case "O21":
                    msf.version = hexStringToInt(params[0].slice(1)) / 10;
                    break;
                case "O25":
                    msf.materials = params.map(function (param) {
                        return {
                            index: hexStringToInt(param[1]),
                            name: param.slice(8)
                        };
                    });
                    break;
                case "O30":
                    msf.spliceList.push([
                        hexStringToInt(params[0].slice(1)),
                        hexStringToFloat(params[1].slice(1))
                    ]);
                    break;
                case "O31":
                    msf.pingList.push([
                        hexStringToFloat(params[0].slice(1)),
                        hexStringToFloat(params[1].slice(1))
                    ]);
                    break;
                case "O32":
                    msf.algorithmsList.push({
                        ingoing: hexStringToInt(params[0][1]),
                        outgoing: hexStringToInt(params[0][2]),
                        heatFactor: hexStringToInt16(params[1].slice(1)),
                        compressionFactor: hexStringToInt16(params[2].slice(1)),
                        coolingFactor: hexStringToInt16(params[3].slice(1))
                    });
                    break;
                case "O33":
                    // hot swap command
                    break;
            }
        });
        return msf;
    }
};

class MSF {

    constructor() {
        this.version = 1.4;
        this.printerProfile = "";
        this.colorsUsed = [0, 0, 0, 0];
        this.materials = [null, null, null, null];
        this.pulsesPerMM = 0;
        this.loadingOffset = 0;
        this.heatFactor = 100;
        this.spliceList = [];
        this.pingList = [];
        this.hotSwapList = [];
        this.algorithmsList = [];
    }

    static forPrintOutput(profile, colorsUsed, materials) {
        let msf = new MSF();
        msf.version = profile.getMSFVersion();
        msf.printerProfile = profile;
        msf.pulsesPerMM = profile.getPulsesPerMM();
        msf.loadingOffset = profile.loadingOffset;
        msf.heatFactor = null;
        msf.setColorsUsed(colorsUsed);
        msf.setMaterials(materials);
        return msf;
    }

    static fromLines(lines) {
        const version = parseFloat(lines[0].substring(3));
        if (!version) {
            return msf2_0Functions.fromLines(lines);
        }
        let msf = new MSF();
        msf.version = version;

        let spliceCount, pingCount, hotSwapCount, algorithmCount;

        switch (msf.version) {
            case 1.1:
                throw {
                    message: "Incompatible MSF version",
                    detail: "MSF 1.1 is now obsolete. MSF 1.1 files cannot be run with Palette or Chroma."
                };
            case 1.2:
                msf.colorsUsed[0] = hexStringToInt(lines[1][3]);
                msf.colorsUsed[1] = hexStringToInt(lines[1][4]);
                msf.colorsUsed[2] = hexStringToInt(lines[1][5]);
                msf.colorsUsed[3] = hexStringToInt(lines[1][6]);
                msf.pulsesPerMM = hexStringToFloat(lines[2].substring(4));
                msf.loadingOffset = hexStringToInt(lines[3].substring(3));
                spliceCount = hexStringToInt(lines[4].substring(3));
                pingCount = hexStringToInt(lines[5].substring(3));
                for (let i = 0; i < spliceCount; i++) {
                    msf.spliceList.push([
                        hexStringToInt(lines[i + 6].substr(1, 2)),
                        hexStringToFloat(lines[i + 6].substr(4, 8))
                    ]);
                }
                for (let i = 0; i < pingCount; i++) {
                    msf.pingList.push([
                        hexStringToFloat(lines[i + spliceCount + 6].substr(4, 8))
                    ]);
                }
                break;
            case 1.3:
                msf.colorsUsed[0] = hexStringToInt(lines[1][3]);
                msf.colorsUsed[1] = hexStringToInt(lines[1][4]);
                msf.colorsUsed[2] = hexStringToInt(lines[1][5]);
                msf.colorsUsed[3] = hexStringToInt(lines[1][6]);
                msf.pulsesPerMM = hexStringToFloat(lines[2].substring(4));
                msf.loadingOffset = hexStringToInt(lines[3].substring(3));
                msf.heatFactor = hexStringToInt(lines[4].substring(3));
                spliceCount = hexStringToInt(lines[5].substring(3));
                pingCount = hexStringToInt(lines[6].substring(3));
                hotSwapCount = hexStringToInt(lines[7].substring(3));
                for (let i = 0; i < spliceCount; i++) {
                    msf.spliceList.push([
                        hexStringToInt(lines[i + 8].substr(1, 2)),
                        hexStringToFloat(lines[i + 8].substr(4, 8))
                    ]);
                }
                for (let i = 0; i < pingCount; i++) {
                    msf.pingList.push([
                        hexStringToFloat(lines[i + spliceCount + 8].substr(4, 8))
                    ]);
                }
                for (let i = 0; i < hotSwapCount; i++) {
                    msf.hotSwapList.push([
                        hexStringToInt(lines[i + spliceCount + pingCount + 8].substr(1, 2)),
                        hexStringToFloat(lines[i + spliceCount + pingCount + 8].substr(4, 8))
                    ]);
                }
                break;
            case 1.4:
            default:
                let colorsUsed = lines[1].substr(3).split(";");
                for (let i = 0; i < 4; i++) {
                    msf.materials[i] = {
                        index: hexStringToInt(colorsUsed[i][0]),
                        name: colorsUsed[i].substr(1)
                    };
                    msf.colorsUsed[i] = (msf.materials[i].index ? 1 : 0);
                }
                msf.pulsesPerMM = hexStringToFloat(lines[2].substring(4));
                msf.loadingOffset = hexStringToInt(lines[3].substring(3));
                spliceCount = hexStringToInt(lines[4].substring(3));
                pingCount = hexStringToInt(lines[5].substring(3));
                hotSwapCount = hexStringToInt(lines[6].substring(3));
                algorithmCount = hexStringToInt(lines[7].substring(3));
                for (let i = 0; i < spliceCount; i++) {
                    msf.spliceList.push([
                        hexStringToInt(lines[i + 8].substr(1, 2)),
                        hexStringToFloat(lines[i + 8].substr(4, 8))
                    ]);
                }
                for (let i = 0; i < pingCount; i++) {
                    msf.pingList.push([
                        hexStringToFloat(lines[i + spliceCount + 8].substr(4, 8))
                    ]);
                }
                for (let i = 0; i < algorithmCount; i++) {
                    msf.algorithmsList.push({
                        ingoing: hexStringToInt(lines[i + spliceCount + pingCount + 8][1]),
                        outgoing: hexStringToInt(lines[i + spliceCount + pingCount + 8][2]),
                        heatFactor: hexStringToFloat(lines[i + spliceCount + pingCount + 8].substr(4, 8)),
                        compressionFactor: hexStringToFloat(lines[i + spliceCount + pingCount + 8].substr(13, 8)),
                        reverse: !!hexStringToInt(lines[i + spliceCount + pingCount + 8][22])
                    });
                }
                break;
        }

        return msf;
    }

    clearMaterials() {
        this.materials = [null, null, null, null];
    }

    setMaterials(materials) {
        const spliceCore = this.printerProfile.getSpliceCore();
        let msfMaterials = [null, null, null, null];
        let materialsSoFar = [];
        let algorithms = [];
        for (let i = 0; i < 4; i++) {
            if (this.colorsUsed[i] === 0) {
                msfMaterials[i] = {
                    index: 0,
                    material: null,
                    name: ""
                }
            } else if (materials[i] === null) {
                msfMaterials[i] = {
                    index: 5,
                    material: null,
                    name: (this.colorsUsed[i] <= 1 ? "" : colorInfo[this.colorsUsed[i]].label)
                }
            } else {
                if (materialsSoFar.indexOf(materials[i]) < 0) {
                    materialsSoFar.push(materials[i]);
                }
                let thisMaterialNumber = materialsSoFar.indexOf(materials[i]) + 1;
                let label = "";
                if (this.colorsUsed[i] > 1) {
                    label = colorInfo[this.colorsUsed[i]].label;
                }
                if (this.version >= 2.0) {
                    if (label) {
                        label += " ";
                    }
                    label += MaterialMatrix.globalMatrix.matrix[spliceCore][materials[i]].type;
                } else {
                    label += " " + MaterialMatrix.globalMatrix.matrix[spliceCore][materials[i]].type;
                }
                msfMaterials[i] = {
                    index: thisMaterialNumber,
                    material: materials[i],
                    name: label
                };
            }
        }
        let spliceSettingsAdded = [];
        for (let material1 of msfMaterials) {
            if (material1.material !== null) {
                for (let material2 of msfMaterials) {
                    if (material2.material !== null) {
                        let spliceSettings = MaterialMatrix.globalMatrix.matrix[spliceCore][material1.material].combinations[material2.material];
                        if (spliceSettings !== null && spliceSettingsAdded.indexOf(spliceSettings) < 0) {
                            algorithms.push({
                                ingoing: material1.index,
                                outgoing: material2.index,
                                heatFactor: spliceSettings.heatFactor,
                                compressionFactor: spliceSettings.compressionFactor,
                                coolingFactor: spliceSettings.coolingFactor,
                                reverse: spliceSettings.reverse
                            });
                            spliceSettingsAdded.push(spliceSettings);
                        }
                    }
                }
            }
        }
        this.materials = msfMaterials;
        this.algorithmsList = algorithms;

    }

    setColorsUsed(colorsUsed) {
        let newColorsUsed = [0, 0, 0, 0];
        for (let i = 0; i < 4; i++) {
            if (colorsUsed[i] === true) {
                newColorsUsed[i] = 1;
            } else if (colorsUsed[i] === false) {
                newColorsUsed[i] = 0;
            } else {
                newColorsUsed[i] = colorsUsed[i];
            }
        }
        this.colorsUsed = newColorsUsed;
    }

    getColorsUsedLabels() {
        switch (this.version) {
            case 1.2:
                return getColorsUsedLabels(this.colorsUsed);
            case 1.3:
                return getColorsUsedLabels(this.colorsUsed);
            case 1.4:
            default:
                return getColorsUsedLabels1_4(this.materials);
        }
    }

    getFilamentLengthsByDrive() {
        return getFilamentLengthsByDrive(this.spliceList);
    };

    createMSF() {
        switch (this.version) {
            case 1.2:
                return msf1_2Functions.createMSF.apply(this);
            case 1.3:
                return msf1_3Functions.createMSF.apply(this);
            case 2.0:
                return msf2_0Functions.createMSF.apply(this);
            case 1.4:
            default:
                return msf1_4Functions.createMSF.apply(this);
        }
    }

    createPlainMSF() {
        switch (this.version) {
            case 1.2:
                return msf1_2Functions.createPlainMSF.apply(this);
            case 1.3:
                return msf1_3Functions.createPlainMSF.apply(this);
            case 2.0:
                return msf2_0Functions.createPlainMSF.apply(this);
            case 1.4:
            default:
                return msf1_4Functions.createPlainMSF.apply(this);
        }
    }

}

module.exports = MSF;
module.exports.MSF2_CHAR_LIMIT = MSF2_CHAR_LIMIT;
module.exports.colorInfo = colorInfo;

module.exports.getTotalFilamentLength = getTotalFilamentLength;
module.exports.getFilamentLengthsByDrive = getFilamentLengthsByDrive;

module.exports.serializeColorStrengths = serializeColorStrengths;
module.exports.unserializeColorStrengths = unserializeColorStrengths;
module.exports.resetColorStrengths = resetColorStrengths;

module.exports.intToHex = intToHexString;
module.exports.floatToHex = floatToHexString;
module.exports.hexToInt = hexStringToInt;
module.exports.hexToFloat = hexStringToFloat;

module.exports.replaceSpaces = replaceSpaces;
module.exports.truncate = truncate;
