
const ieee754 = require("ieee754");

const MaterialMatrix = require("./material-matrix");

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

let msf1_2Functions = {
    createMSF: function () {
        let colorsUsed = getColorsUsedHex(this.colorsUsed);
        let msfOutput = "MSF1.2\r\n";
        msfOutput += "cu:" + colorsUsed[0] + colorsUsed[1] + colorsUsed[2] + colorsUsed[3] + "\r\n";       // drives used
        msfOutput += "ppm:" + floatToHexString(this.pulsesPerMM) + "\r\n";             // pulses per MM
        msfOutput += "lo:" + intToHexString(this.loadingOffset, 4) + "\r\n";           // loading offset
        msfOutput += "ns:" + intToHexString(this.spliceList.length, 4) + "\r\n";       // number of splices
        msfOutput += "np:" + intToHexString(this.pingList.length, 4) + "\r\n";         // number of pings
        // create the output splice list (splices in the list are of the form [drive#, lengthInMM])
        this.spliceList.forEach(function (splice) {
            msfOutput += "(" + intToHexString(splice[0], 2) + "," + floatToHexString(splice[1]) + ")\r\n";
        });
        // create the output ping list (pings in the list are of the form [startLength, endLength])
        this.pingList.forEach(function (ping) {
            msfOutput += "(64," + floatToHexString(ping[0]) + ")\r\n";
        });
        return msfOutput;
    },
    createPlainMSF: function () {
        let colorsUsed = getColorsUsedLabels(this.colorsUsed);
        let msfOutput = "MSF1.2\r\n\r\n";

        if (this.printerProfile) {
            msfOutput += "Printer Profile:  " + this.printerProfile + "\r\n";
        }
        msfOutput += "Drives Used:      " + colorsUsed[0] + ", " + colorsUsed[1] + ", "
            + colorsUsed[2] + ", " + colorsUsed[3] + "\r\n";
        msfOutput += "Pulses Per MM:    " + this.pulsesPerMM + "\r\n";
        msfOutput += "Loading Offset:   " + this.loadingOffset + "\r\n";
        msfOutput += "Splice Count:     " + this.spliceList.length + "\r\n";
        msfOutput += "Ping Count:       " + this.pingList.length + "\r\n";

        // create the output splice list (splices in the list are of the form [drive#, lengthInMM])
        if (this.spliceList.length > 0) {
            msfOutput += "\r\n";
            let filamentLengths = getFilamentLengthsByDrive(this.spliceList);
            let totalLength = getTotalFilamentLength(this.spliceList);
            msfOutput += "Filament Used\r\n";
            if (this.colorsUsed[0]) {
                msfOutput += "Drive 1:          " + (filamentLengths[0] / 1000).toFixed(2) + " m\r\n";
            }
            if (this.colorsUsed[1]) {
                msfOutput += "Drive 2:          " + (filamentLengths[1] / 1000).toFixed(2) + " m\r\n";
            }
            if (this.colorsUsed[2]) {
                msfOutput += "Drive 3:          " + (filamentLengths[2] / 1000).toFixed(2) + " m\r\n";
            }
            if (this.colorsUsed[3]) {
                msfOutput += "Drive 4:          " + (filamentLengths[3] / 1000).toFixed(2) + " m\r\n";
            }
            msfOutput += "Total:            " + (totalLength / 1000).toFixed(2) + " m\r\n";
            msfOutput += "\r\n";
            this.spliceList.forEach(function (splice) {
                msfOutput += "(" + splice[0] + ", " + splice[1] + ")\r\n";
            });
        }

        // create the output ping list (pings in the list are of the form [startLength, endLength])
        if (this.pingList.length > 0) {
            msfOutput += "\r\n";
            this.pingList.forEach(function (ping) {
                if (ping[1] === undefined) {
                    msfOutput += "(PING, " + ping[0] + ")\r\n";
                } else {
                    msfOutput += "(PING, " + ping[0] + " - " + (ping[1] - ping[0]) + " mm)\r\n";
                }
            });
        }

        return msfOutput;
    }
};

let msf1_3Functions = {
    createMSF: function () {
        let colorsUsed = getColorsUsedHex(this.colorsUsed);
        let msfOutput = "MSF1.3\r\n";
        msfOutput += "cu:" + colorsUsed[0] + colorsUsed[1] + colorsUsed[2] + colorsUsed[3] + "\r\n";       // drives used
        msfOutput += "ppm:" + floatToHexString(this.pulsesPerMM) + "\r\n";             // pulses per MM
        msfOutput += "lo:" + intToHexString(this.loadingOffset, 4) + "\r\n";           // loading offset
        msfOutput += "hf:" + intToHexString(this.heatFactor, 4) + "\r\n";              // loading offset
        msfOutput += "ns:" + intToHexString(this.spliceList.length, 4) + "\r\n";       // number of splices
        msfOutput += "np:" + intToHexString(this.pingList.length, 4) + "\r\n";         // number of pings
        msfOutput += "nh:" + intToHexString(0, 4) + "\r\n";                             // number of hot swaps (0 for now)
        // create the output splice list (splices in the list are of the form [drive#, lengthInMM])
        this.spliceList.forEach(function (splice) {
            msfOutput += "(" + intToHexString(splice[0], 2) + "," + floatToHexString(splice[1]) + ")\r\n";
        });
        // create the output ping list (pings in the list are of the form [startLength, endLength])
        this.pingList.forEach(function (ping) {
            msfOutput += "(64," + floatToHexString(ping[0]) + ")\r\n";
        });

        return msfOutput;
    },
    createPlainMSF: function () {
        let colorsUsed = getColorsUsedLabels(this.colorsUsed);
        let msfOutput = "MSF1.3\r\n\r\n";

        if (this.printerProfile) {
            msfOutput += "Printer Profile:  " + this.printerProfile + "\r\n";
        }
        msfOutput += "Drives Used:      " + colorsUsed[0] + ", " + colorsUsed[1] + ", "
            + colorsUsed[2] + ", " + colorsUsed[3] + "\r\n";
        msfOutput += "Pulses Per MM:    " + this.pulsesPerMM + "\r\n";
        msfOutput += "Loading Offset:   " + this.loadingOffset + "\r\n";
        msfOutput += "Heating Factor:   " + this.heatFactor + "\r\n";
        msfOutput += "Splice Count:     " + this.spliceList.length + "\r\n";
        msfOutput += "Ping Count:       " + this.pingList.length + "\r\n";
        msfOutput += "Hot Swap Count:   " + this.hotSwapList.length + "\r\n";

        // create the output splice list (splices in the list are of the form [drive#, lengthInMM])
        if (this.spliceList.length > 0) {
            msfOutput += "\r\n";
            let filamentLengths = getFilamentLengthsByDrive(this.spliceList);
            let totalLength = getTotalFilamentLength(this.spliceList);
            msfOutput += "Filament Used\r\n";
            if (this.colorsUsed[0]) {
                msfOutput += "Drive 1:          " + (filamentLengths[0] / 1000).toFixed(2) + " m\r\n";
            }
            if (this.colorsUsed[1]) {
                msfOutput += "Drive 2:          " + (filamentLengths[1] / 1000).toFixed(2) + " m\r\n";
            }
            if (this.colorsUsed[2]) {
                msfOutput += "Drive 3:          " + (filamentLengths[2] / 1000).toFixed(2) + " m\r\n";
            }
            if (this.colorsUsed[3]) {
                msfOutput += "Drive 4:          " + (filamentLengths[3] / 1000).toFixed(2) + " m\r\n";
            }
            msfOutput += "Total:            " + (totalLength / 1000).toFixed(2) + " m\r\n";
            msfOutput += "\r\n";
            this.spliceList.forEach(function (splice) {
                msfOutput += "(" + splice[0] + ", " + splice[1] + ")\r\n";
            });
        }

        // create the output ping list (pings in the list are of the form [startLength, endLength])
        if (this.pingList.length > 0) {
            msfOutput += "\r\n";
            this.pingList.forEach(function (ping) {
                if (ping[1] === undefined) {
                    msfOutput += "(PING, " + ping[0] + ")\r\n";
                } else {
                    msfOutput += "(PING, " + ping[0] + " - " + (ping[1] - ping[0]) + " mm)\r\n";
                }
            });
        }

        return msfOutput;
    }
};

let msf1_4Functions = {
    createMSF: function () {
        let colorsUsed = getColorsUsedLabels1_4(this.materials);
        let msfOutput = "MSF1.4\r\n";
        msfOutput += "cu:" + this.materials[0].index + colorsUsed[0] + ";"
            + this.materials[1].index + colorsUsed[1] + ";"
            + this.materials[2].index + colorsUsed[2] + ";"
            + this.materials[3].index + colorsUsed[3] + ";" + "\r\n";       // drives used
        msfOutput += "ppm:" + floatToHexString(this.pulsesPerMM) + "\r\n";             // pulses per MM
        msfOutput += "lo:" + intToHexString(this.loadingOffset, 4) + "\r\n";           // loading offset
        msfOutput += "ns:" + intToHexString(this.spliceList.length, 4) + "\r\n";       // number of splices
        msfOutput += "np:" + intToHexString(this.pingList.length, 4) + "\r\n";         // number of pings
        msfOutput += "nh:" + intToHexString(0, 4) + "\r\n";                            // number of hot swaps (0 for now)
        msfOutput += "na:" + intToHexString(this.algorithmsList.length, 4) + "\r\n";   // number of algorithms
        // create the output splice list (splices in the list are of the form [drive#, lengthInMM])
        this.spliceList.forEach(function (splice) {
            msfOutput += "(" + intToHexString(splice[0], 2) + "," + floatToHexString(splice[1]) + ")\r\n";
        });
        // create the output ping list (pings in the list are of the form [startLength, endLength])
        this.pingList.forEach(function (ping) {
            msfOutput += "(64," + floatToHexString(ping[0]) + ")\r\n";
        });
        // create the algorithms list (algorithms in this list are objects)
        this.algorithmsList.forEach(function (alg) {
            msfOutput += "(" + alg.ingoing + alg.outgoing + "," + floatToHexString(alg.heatFactor) + ","
                + floatToHexString(alg.compressionFactor) + "," + (alg.reverse ? 1 : 0) + ")\r\n";
        });

        return msfOutput;
    },
    createPlainMSF: function () {
        let materialsUsed = getMaterialsUsedLabels1_4(this.materials);
        let msfOutput = "MSF1.4\r\n\r\n";

        if (this.printerProfile) {
            msfOutput += "Printer Profile:  " + this.printerProfile + "\r\n";
        }
        msfOutput += "Materials Used:   " + materialsUsed[0].trim() + ", " + materialsUsed[1].trim() + ", "
            + materialsUsed[2].trim() + ", " + materialsUsed[3].trim() + "\r\n";
        msfOutput += "Pulses Per MM:    " + this.pulsesPerMM + "\r\n";
        msfOutput += "Loading Offset:   " + this.loadingOffset + "\r\n";
        msfOutput += "Splice Count:     " + this.spliceList.length + "\r\n";
        msfOutput += "Ping Count:       " + this.pingList.length + "\r\n";
        msfOutput += "Hot Swap Count:   " + this.hotSwapList.length + "\r\n";
        msfOutput += "Algorithm Count:  " + this.algorithmsList.length + "\r\n";

        // create the output splice list (splices in the list are of the form [drive#, lengthInMM])
        if (this.spliceList.length > 0) {
            msfOutput += "\r\n";
            let filamentLengths = getFilamentLengthsByDrive(this.spliceList);
            let totalLength = getTotalFilamentLength(this.spliceList);
            msfOutput += "Filament Used\r\n";
            if (this.colorsUsed[0]) {
                msfOutput += "Drive 1:          " + (filamentLengths[0] / 1000).toFixed(2) + " m\r\n";
            }
            if (this.colorsUsed[1]) {
                msfOutput += "Drive 2:          " + (filamentLengths[1] / 1000).toFixed(2) + " m\r\n";
            }
            if (this.colorsUsed[2]) {
                msfOutput += "Drive 3:          " + (filamentLengths[2] / 1000).toFixed(2) + " m\r\n";
            }
            if (this.colorsUsed[3]) {
                msfOutput += "Drive 4:          " + (filamentLengths[3] / 1000).toFixed(2) + " m\r\n";
            }
            msfOutput += "Total:            " + (totalLength / 1000).toFixed(2) + " m\r\n";
            msfOutput += "\r\n";
            this.spliceList.forEach(function (splice) {
                msfOutput += "(" + splice[0] + ", " + splice[1] + ")\r\n";
            });
        }

        // create the output ping list (pings in the list are of the form [startLength, endLength])
        if (this.pingList.length > 0) {
            msfOutput += "\r\n";
            this.pingList.forEach(function (ping) {
                if (ping[1] === undefined) {
                    msfOutput += "(PING, " + ping[0] + ")\r\n";
                } else {
                    msfOutput += "(PING, " + ping[0] + " - " + (ping[1] - ping[0]) + " mm)\r\n";
                }
            });
        }
        // create the output ping list (pings in the list are of the form [startLength, endLength])
        if (this.algorithmsList.length > 0) {
            msfOutput += "\r\n";
            this.algorithmsList.forEach(function (alg) {
                msfOutput += "(" + alg.ingoing + "-" + alg.outgoing + ", heat="
                    + alg.heatFactor + ", compression=" + alg.compressionFactor + ", direction="
                    + (alg.reverse ? "reverse" : "forward") + ")\r\n";
            });
        }

        return msfOutput;
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
        msf.version = 1.4;
        msf.printerProfile = profile.profileName;
        msf.pulsesPerMM = profile.getPulsesPerMM();
        msf.loadingOffset = profile.loadingOffset;
        msf.heatFactor = null;
        msf.setColorsUsed(colorsUsed);
        msf.setMaterials(materials);
        return msf;
    }

    static fromLines(lines) {
        let msf = new MSF();
        msf.version = parseFloat(lines[0].substring(3));

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

    setMaterials(materials) {
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
                msfMaterials[i] = {
                    index: thisMaterialNumber,
                    material: materials[i],
                    name: label + " " + MaterialMatrix.matrix.matrix[materials[i]].type
                };
            }
        }
        let spliceSettingsAdded = [];
        for (let material1 of msfMaterials) {
            if (material1.material !== null) {
                for (let material2 of msfMaterials) {
                    if (material2.material !== null) {
                        let spliceSettings = MaterialMatrix.matrix.matrix[material1.material].combinations[material2.material];
                        if (spliceSettings !== null && spliceSettingsAdded.indexOf(spliceSettings) < 0) {
                            algorithms.push({
                                ingoing: material1.index,
                                outgoing: material2.index,
                                heatFactor: spliceSettings.heatFactor,
                                compressionFactor: spliceSettings.compressionFactor,
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
            case 1.4:
            default:
                return msf1_4Functions.createPlainMSF.apply(this);
        }
    }

}

module.exports = MSF;
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
