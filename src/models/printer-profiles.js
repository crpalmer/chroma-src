
const path = require("path");
const uuid = require("uuid/v4");

const Printer = require("./printer");
const config = require("../config");
const dataCollection = require("./data-collection");

let activePrinterProfile = 0;
let profiles = [];

function unserialize(name, contents) {
    addProfileToList(Printer.unserialize(name, contents));
}

function serialize(profile) {
    return profile.serialize();
}

function addProfileToList(profile) {
    profiles.push(profile);
    sortProfileListAlphabetically();
    if (!profile.uuid) {
        profile.uuid = uuid();
        config.saveProfile(profile);
    }
}

function removeProfileFromList(profile) {
    let index = profiles.indexOf(profile);
    if (index < 0) {
        return;
    }
    removeProfileFromListAtIndex(index + 1);
}

function removeProfileFromListAtIndex(index) {
    profiles.splice(index - 1, 1);
}

function getProfileCount() {
    return profiles.length;
}

function clearProfileList() {
    profiles = [];
}

function sortProfileListAlphabetically() {
    let activeProfile;
    if (activePrinterProfile > 0) {
        activeProfile = profiles[activePrinterProfile - 1];
    }
    profiles.sort(function (a, b) {
        let aName = a.profileName.toLowerCase();
        let bName = b.profileName.toLowerCase();
        return (aName < bName) ? -1 : (aName > bName);
    });
    if (activePrinterProfile > 0) {
        activePrinterProfile = profiles.indexOf(activeProfile) + 1;
    }
}

function importProfile(filepath) {
    let originalName = path.basename(filepath, ".yml");
    let profile = Printer.unserialize(originalName, config.loadYML(filepath));
    let nameTaken = true;
    let nameCounter = 2;
    while (nameTaken) {
        nameTaken = false;
        for (let i = 0; i < profiles.length; i++) {
            if (profile.profileName.toLowerCase() === profiles[i].profileName.toLowerCase()) {
                nameTaken = true;
                break;
            }
        }
        if (nameTaken) {
            profile.profileName = originalName + " " + nameCounter.toString();
            nameCounter++;
        }
    }
    if (profile.version === 1) {
        return profile;
    }
    if (!profile.uuid) {
        profile.uuid = uuid();
    }
    let activePrinter = getActiveProfile();
    addProfileToList(profile);
    config.saveProfile(profile);
    setActiveProfileIndex(profiles.indexOf(activePrinter) + 1);
    dataCollection.logPrinterProfileImport(profile);
    config.writeConfigFile();
    return null;
}

function exportProfile(profile, path) {
    let yml = (profile instanceof Printer) ? profile.serialize() : null;
    config.dumpYML(yml, path);
}

function exportProfileAtIndex(index, path) {
    let profile = getProfileAtIndex(index);
    exportProfile(profile, path);
}

function unserializeProfileList(configList) {
    configList.forEach(function (profile) {
        let unserialized = Printer.unserialize(profile);
        addProfileToList(unserialized);
        config.saveProfile(unserialized);
    });
}

// returns a 1-indexed value
function getActiveProfileIndex() {
    return activePrinterProfile;
}

// takes a 1-indexed value
function setActiveProfileIndex(index) {
    activePrinterProfile = index;
}

// returns a Printer
function getActiveProfile() {
    if (activePrinterProfile > 0) {
        return profiles[activePrinterProfile - 1];
    }
    return null;
}

// takes a 1-indexed value
// returns a Printer
function getProfileAtIndex(index) {
    return profiles[index - 1];
}

// takes a Printer
// returns a 1-indexed value
// if profile not in list, returns -1
function getProfileIndex(profile) {
    let index = profiles.indexOf(profile);
    if (index < 0) {
        return -1;
    }
    return index + 1;
}

module.exports.unserialize = unserialize;
module.exports.serialize = serialize;

module.exports.addProfile = addProfileToList;
module.exports.removeProfile = removeProfileFromList;
module.exports.removeProfileAtIndex = removeProfileFromListAtIndex;
module.exports.getProfileList = function () {
    return profiles.slice();
};
module.exports.getProfileCount = getProfileCount;
module.exports.clearProfileList = clearProfileList;
module.exports.sortAlphabetically = sortProfileListAlphabetically;
module.exports.importProfile = importProfile;
module.exports.exportProfile = exportProfile;
module.exports.exportProfileAtIndex = exportProfileAtIndex;
module.exports.unserializeProfileList = unserializeProfileList;

module.exports.getActiveProfile = getActiveProfile;
module.exports.getActiveProfileIndex = getActiveProfileIndex;
module.exports.setActiveProfileIndex = setActiveProfileIndex;
module.exports.getProfileAtIndex = getProfileAtIndex;
module.exports.getProfileIndex = getProfileIndex;
