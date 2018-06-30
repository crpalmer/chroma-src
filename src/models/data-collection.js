
const fs = require("fs");
const path = require("path");

const app = require("electron").remote.app;

const config = require("../config");
const MSF = require("./msf");

const dcFile = path.join(app.getPath("userData"), "data-collection.yml");

const UpdateTypes = Object.freeze({
    CRASH: 0,
    PREFERENCES: 1,
    CHROMA_UPDATE: 2,

    PRINTER_PROFILE_ADD: 10,
    PRINTER_PROFILE_EDIT: 11,
    PRINTER_PROFILE_IMPORT: 12,
    PRINTER_PROFILE_DELETE: 13,
    MATERIAL_PROFILE_ADD: 14,
    MATERIAL_PROFILE_EDIT: 15,
    MATERIAL_PROFILE_IMPORT: 16,
    MATERIAL_PROFILE_DELETE: 17,

    PRINT_SUCCESS: 20,
    PRINT_ERROR: 21,

    PALETTE_DATA: 30
});

const dcDataBlank = {
    sent: [],
    unsent: [],
    lastLoggedChromaVersion: app.getVersion(),
    palettes: {}
};

let dcData = JSON.parse(JSON.stringify(dcDataBlank));

function readFile() {
    dcData = config.loadYML(dcFile);
}

function writeFile() {
    config.dumpYML(dcData, dcFile);
}

function initialize() {
    if (!fs.existsSync(dcFile)) {
        writeFile();
    }
    readFile();
    let appVersion = require("../package.json").version;
    if (dcData.lastLoggedChromaVersion !== appVersion) {
        dcData.lastLoggedChromaVersion = appVersion;
        logChromaUpdate(appVersion);
    }
}

function getFileSize(filepath) {
    let stats = fs.statSync(filepath);
    return stats.size;
}

function serializePrinterNonIdentifying(printerProfile) {
    if (printerProfile === null) {
        return null;
    }
    let serialized = printerProfile.serialize();
    delete serialized.name;
    return serialized;
}

function shouldLog() {
    return (global.dataCollection && !global.env.dev && !global.env.oem && global.env.name !== "beta");
}

function logGeneric(type, data = {}) {
    if (!shouldLog()) {
        return;
    }
    dcData.unsent.push({
        type: type,
        uuid: global.uuid,
        timestamp: new Date(),
        data: data
    });
    writeFile();
    process.nextTick(postUnsent);
}

function logCrash(printerProfile) {
    logGeneric(UpdateTypes.CRASH, {
        printer: serializePrinterNonIdentifying(printerProfile),
        preferences: config.serializePreferences()
    });
}

function logPreferences() {
    logGeneric(UpdateTypes.PREFERENCES, {
        preferences: config.serializePreferences()
    });
}

function logChromaUpdate(version) {
    logGeneric(UpdateTypes.CHROMA_UPDATE, {
        version: version
    });
}

function logPrinterProfileCreation(printerProfile) {
    logGeneric(UpdateTypes.PRINTER_PROFILE_ADD, {
        printer: serializePrinterNonIdentifying(printerProfile)
    });
}

function logPrinterProfileEdit(printerProfile) {
    logGeneric(UpdateTypes.PRINTER_PROFILE_EDIT, {
        printer: serializePrinterNonIdentifying(printerProfile)
    });
}

function logPrinterProfileImport(printerProfile) {
    logGeneric(UpdateTypes.PRINTER_PROFILE_IMPORT, {
        printer: serializePrinterNonIdentifying(printerProfile)
    });
}

function logPrinterProfileDelete(uuid) {
    logGeneric(UpdateTypes.PRINTER_PROFILE_DELETE, {
        uuid: uuid
    });
}

function logMaterialProfileCreation(materialMatrix) {
    logGeneric(UpdateTypes.MATERIAL_PROFILE_ADD, {
        matrix: materialMatrix.serializeForDataCollection()
    });
}

function logMaterialProfileEdit(materialMatrix) {
    logGeneric(UpdateTypes.MATERIAL_PROFILE_EDIT, {
        matrix: materialMatrix.serializeForDataCollection()
    });
}

function logMaterialProfileImport(materialMatrix) {
    logGeneric(UpdateTypes.MATERIAL_PROFILE_IMPORT, {
        matrix: materialMatrix.serializeForDataCollection()
    });
}

function logMaterialProfileDelete(materialMatrix) {
    logGeneric(UpdateTypes.MATERIAL_PROFILE_DELETE, {
        matrix: materialMatrix.serializeForDataCollection()
    });
}

function logPrintSuccess(print, msf) {
    logGeneric(UpdateTypes.PRINT_SUCCESS, {
        size: getFileSize(print.getFilePath()),
        printer: serializePrinterNonIdentifying(print._printerProfile),
        algorithms: msf.algorithmsList,
        spliceCount: msf.spliceList.length,
        totalFilament: MSF.getTotalFilamentLength(msf.spliceList),
        filamentByDrive: MSF.getFilamentLengthsByDrive(msf.spliceList)
    });
}

function logPrintError(print, errorCode) {
    logGeneric(UpdateTypes.PRINT_ERROR, {
        size: getFileSize(print.getFilePath()),
        printer: serializePrinterNonIdentifying(print._printerProfile),
        error: errorCode
    });
}

function logPaletteStats(paletteDataString) {
    if (dcData.palettes.hasOwnProperty(paletteDataString.uuid)
        && paletteDataString.equals(dcData.palettes[paletteDataString.uuid])) {
        return;
    }
    dcData.palettes[paletteDataString.uuid] = paletteDataString;
    logGeneric(UpdateTypes.PALETTE_DATA, paletteDataString.serialize());
}

let debug = false;

function postUnsent() {
    let unsent = dcData.unsent;
    if (unsent.length === 0) {
        return;
    }
    if (debug) {
        console.log("SENDING TO SLATE");
    }
    const http = require("http");
    let postData = JSON.stringify(unsent);
    let options = {
        hostname: "159.89.127.50",
        port: 3000,
        path: "/slate/log",
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Content-Length": postData.length
        }
    };
    let error = false;
    let request = http.request(options, function (response) {
        if (debug) {
            console.log("status: " + response.statusCode);
            console.log("headers:");
            console.log(response.headers);
        }
        response.setEncoding("utf8");
        if (debug) {
            response.on("data", function (chunk) {
                console.log(chunk);
            });
        }
        response.on("end", function () {
            if (error) {
                return;
            }
            if (debug) {
                console.log("EOT");
            }
            if (response.statusCode === 200) {
                // move all newly-sent data to sent list
                dcData.sent = dcData.sent.concat(unsent);
                for (let i = 0; i < dcData.unsent.length; i++) {
                    if (unsent.indexOf(dcData.unsent[i]) >= 0) {
                        dcData.unsent.splice(i);
                    }
                }
                writeFile();
            }
        });
    });
    request.on("error", function (err) {
        if (debug) {
            console.error("request error: " + err.message);
        }
        error = true;
    });
    request.write(postData);
    request.end();
}

exports.initialize = initialize;

exports.shouldLog = shouldLog;
exports.logCrash = logCrash;
exports.logPreferences = logPreferences;
exports.logChromaUpdate = logChromaUpdate;
exports.logPrinterProfileCreation = logPrinterProfileCreation;
exports.logPrinterProfileEdit = logPrinterProfileEdit;
exports.logPrinterProfileImport = logPrinterProfileImport;
exports.logPrinterProfileDelete = logPrinterProfileDelete;
exports.logMaterialProfileCreation = logMaterialProfileCreation;
exports.logMaterialProfileEdit = logMaterialProfileEdit;
exports.logMaterialProfileImport = logMaterialProfileImport;
exports.logMaterialProfileDelete = logMaterialProfileDelete;
exports.logPrintSuccess = logPrintSuccess;
exports.logPrintError = logPrintError;
exports.logPaletteStats = logPaletteStats;
