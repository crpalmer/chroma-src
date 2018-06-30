const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");

const app = require("electron").remote.app;
const dialog = require("electron").remote.dialog;
const BrowserWindow = require("electron").remote.BrowserWindow;

const PrinterProfiles = require("./models/printer-profiles");
const materialMatrix = require("./models/material-matrix");
const MSF = require("./models/msf");

const chroma1ConfigFile = path.join(app.getPath("userData"), "app.yml");
const chroma2ConfigFile = path.join(app.getPath("userData"), "chroma-2.yml");
const profileDir = path.join(app.getPath("userData"), "profiles");
const materialFile = path.join(app.getPath("userData"), "materials.yml");

function loadYML(ymlPath) {
    return yaml.load(fs.readFileSync(ymlPath).toString());
}

function dumpYML(yml, ymlPath) {
    fs.writeFileSync(ymlPath, yaml.safeDump(JSON.parse(JSON.stringify(yml))));
}

function checkUUID() {
    if (global.uuid) {
        return false;
    }
    return require("uuid/v4")();
}

function readChroma1ConfigFile() {

    let configContents = yaml.load(fs.readFileSync(chroma1ConfigFile).toString());

    global.uuid = configContents.uuid;
    global.dataCollection = null;
    global.advancedMode = configContents.advancedMode;
    global.firstRun = configContents.firstRun;
    global.exportPlainMSF = configContents.exportOptions.exportPlainMSF;
    global.pingOptions = configContents.pingOptions;
    global.advancedPortScan = true;
    global.displayOriginAxes = false;
    global.ignoreUpdateVersion = false;
    global.latestPaletteFWVersion = false;
    global.latestPalettePlusFWVersion = false;
    global.reduceMemoryUsage = true;
    global.autoRegenerateTowers = true;

    if (configContents.advancedPortScan !== undefined) {
        global.advancedPortScan = configContents.advancedPortScan;
    }

    if (configContents.ignoreUpdateVersion !== undefined) {
        global.ignoreUpdateVersion = configContents.ignoreUpdateVersion;
    }

    if (configContents.latestFirmwareVersion !== undefined) {
        global.latestPaletteFWVersion = configContents.latestFirmwareVersion;
        global.latestPalettePlusFWVersion = configContents.latestFirmwareVersion;
    }

    PrinterProfiles.unserializeProfileList(configContents.printers);

    dialog.showMessageBox(BrowserWindow.fromId(2), {
        type: "warning",
        message: "Chroma 1 profiles imported",
        detail: "Your printer profiles were successfully carried over, but need some additional settings in Chroma 2.\n\nPlease edit your existing profiles, and fill in:\n- Nozzle Diameter\n- Base Model (if available)\n- Firmware\n- Volumetric Extrusion\n- Compatible Files",
        buttons: ["OK"],
        defaultId: 0
    }, function () {});

    PrinterProfiles.setActiveProfileIndex(configContents.activePrinterProfile);

    let uuid = checkUUID();
    if (uuid) {
        global.uuid = uuid;
    }

    writeConfigFile();

}

function readConfigFile() {

    if (!fs.existsSync(chroma2ConfigFile)) {
        if (fs.existsSync(chroma1ConfigFile)) {
            readChroma1ConfigFile();
        } else {
            resetConfigFile();
        }
        return;
    }

    let configContents = yaml.load(fs.readFileSync(chroma2ConfigFile).toString());

    global.uuid = configContents.uuid;
    global.dataCollection = null;
    global.advancedMode = configContents.advancedMode;
    global.betaFeatures = !!configContents.betaFeatures;
    global.firstRun = configContents.firstRun;
    if (configContents.exportOptions) {
        global.exportPlainMSF = configContents.exportOptions.exportPlainMSF;
    } else {
        global.exportPlainMSF = configContents.exportPlainMSF;
    }
    global.exportScreenshot = !!configContents.exportScreenshot;
    global.pingOptions = configContents.pingOptions;
    global.advancedPortScan = true;
    global.displayOriginAxes = false;
    global.ignoreUpdateVersion = false;
    global.latestPaletteFWVersion = false;
    global.latestPalettePlusFWVersion = false;
    global.reduceMemoryUsage = true;
    global.autoRegenerateTowers = true;

    if (configContents.dataCollection !== undefined) {
        global.dataCollection = configContents.dataCollection;
    }

    if (configContents.advancedPortScan !== undefined) {
        global.advancedPortScan = configContents.advancedPortScan;
    }

    if (configContents.displayOriginAxes !== undefined) {
        global.displayOriginAxes = configContents.displayOriginAxes;
    }

    if (configContents.ignoreUpdateVersion !== undefined) {
        global.ignoreUpdateVersion = configContents.ignoreUpdateVersion;
    }

    if (configContents.latestPaletteFWVersion === undefined) {
        if (configContents.latestFirmwareVersion !== undefined) {
            global.latestPaletteFWVersion = configContents.latestFirmwareVersion;
        }
    } else {
        global.latestPaletteFWVersion = configContents.latestPaletteFWVersion;
    }
    if (configContents.latestPalettePlusFWVersion !== undefined) {
        global.latestPaletteFWVersion = configContents.latestPaletteFWVersion;
    }
    if (configContents.reduceMemoryUsage !== undefined) {
        global.reduceMemoryUsage = configContents.reduceMemoryUsage;
    }
    if (configContents.autoRegenerateTowers !== undefined) {
        global.autoRegenerateTowers = configContents.autoRegenerateTowers;
    }
    if (configContents.colorStrengths !== undefined) {
        MSF.unserializeColorStrengths(configContents.colorStrengths);
    }

    PrinterProfiles.setActiveProfileIndex(configContents.activePrinterProfile);

    let uuid = checkUUID();
    if (uuid) {
        global.uuid = uuid;
        writeConfigFile();
    }

}

function serializePreferences() {
    return {
        uuid: global.uuid,
        dataCollection: global.dataCollection,
        reduceMemoryUsage: global.reduceMemoryUsage,
        advancedMode: global.advancedMode,
        betaFeatures: global.betaFeatures,
        firstRun: global.firstRun,
        displayOriginAxes: global.displayOriginAxes,
        ignoreUpdateVersion: global.ignoreUpdateVersion,
        latestPaletteFWVersion: global.latestPaletteFWVersion,
        latestPalettePlusFWVersion: global.latestPalettePlusFWVersion,
        advancedPortScan: global.advancedPortScan,
        exportPlainMSF: global.exportPlainMSF,
        exportScreenshot: global.exportScreenshot,
        pingOptions: global.pingOptions,
        activePrinterProfile: PrinterProfiles.getActiveProfileIndex(),
        autoRegenerateTowers: global.autoRegenerateTowers,
        colorStrengths: MSF.serializeColorStrengths()
    };
}

function writeConfigFile() {
    let configContents = serializePreferences();
    fs.writeFileSync(chroma2ConfigFile, yaml.safeDump(JSON.parse(JSON.stringify(configContents))));
}

function resetConfigFile() {

    global.dataCollection = null;
    global.advancedMode = false;
    global.betaFeatures = false;
    global.firstRun = true;
    global.ignoreUpdateVersion = false;
    global.latestPaletteFWVersion = false;
    global.latestPalettePlusFWVersion = false;
    global.advancedPortScan = true;
    global.exportPlainMSF = false;
    global.exportScreenshot = false;
    global.pingOptions = {
        usePings: true,
        useMechanicalPings: false
    };
    global.displayOriginAxes = false;
    global.reduceMemoryUsage = true;
    global.autoRegenerateTowers = true;
    MSF.resetColorStrengths();
    PrinterProfiles.clearProfileList();
    let files = fs.readdirSync(profileDir);
    files.forEach(function (file) {
        if (file[0] === "." || file.slice(-4) !== ".yml") {
            return;
        }
        let filepath = path.join(profileDir, file);
        fs.unlinkSync(filepath);
    });
    PrinterProfiles.setActiveProfileIndex(0);
    writeConfigFile();
    materialMatrix.matrix = materialMatrix.getDefault();
    saveMaterials();

}

function loadProfiles() {
    if (!fs.existsSync(profileDir)) {
        fs.mkdirSync(profileDir);
    }
    let files = fs.readdirSync(profileDir);
    let filepath;
    files.forEach(function (file) {
        if (file[0] === "." || file.slice(-4) !== ".yml") {
            return;
        }
        filepath = path.join(profileDir, file);
        PrinterProfiles.unserialize(path.basename(file, ".yml"), yaml.load(fs.readFileSync(filepath).toString()));
    });
}

function loadMaterials() {
    if (!fs.existsSync(materialFile)) {
        saveMaterials();
        return;
    }
    materialMatrix.matrix = materialMatrix.unserialize(yaml.load(fs.readFileSync(materialFile).toString()));
    if (materialMatrix.matrix.needsSaveForUUIDs) {
        saveMaterials();
    }
}

function getFilenameForProfile(profile) {
    return profile.profileName.replace(/[^[:alnum:]_]/, "") + ".yml";
}

function saveProfile(profile) {
    let filename = getFilenameForProfile(profile);
    let filepath = path.join(profileDir, filename);
    let yml = PrinterProfiles.serialize(profile);
    fs.writeFileSync(filepath, yaml.safeDump(JSON.parse(JSON.stringify(yml))));
}

function saveMaterials() {
    let yml = materialMatrix.matrix.serialize();
    fs.writeFileSync(materialFile, yaml.safeDump(JSON.parse(JSON.stringify(yml))));
}

function importMaterials(inpath) {
    return materialMatrix.unserialize(yaml.load(fs.readFileSync(inpath).toString()), false);
}

function exportMaterials(matrix, outpath) {
    let yml = matrix.serialize();
    fs.writeFileSync(outpath, yaml.safeDump(JSON.parse(JSON.stringify(yml))));
}

function deleteProfile(profile) {
    let filename = getFilenameForProfile(profile);
    let filepath = path.join(profileDir, filename);
    if (fs.existsSync(filepath)) {
        fs.unlinkSync(filepath);
    }
}

exports.loadYML = loadYML;
exports.dumpYML = dumpYML;
exports.getConfigFilePath = function () {
    return chroma2ConfigFile;
};
exports.serializePreferences = serializePreferences;
exports.readConfigFile = readConfigFile;
exports.writeConfigFile = writeConfigFile;
exports.resetConfigFile = resetConfigFile;
exports.importProfile = function (profilePath) {
    PrinterProfiles.importProfile(profilePath);
};
exports.loadProfiles = loadProfiles;
exports.loadMaterials = loadMaterials;
exports.saveProfile = saveProfile;
exports.saveMaterials = saveMaterials;
exports.importMaterials = importMaterials;
exports.exportMaterials = exportMaterials;
exports.deleteProfile = deleteProfile;
