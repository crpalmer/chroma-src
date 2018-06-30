const fs = require("fs");
const temp = require("temp").track();
const url = require("url");
const http = require("http");
const https = require("https");
const marked = require("marked");
const m = require("mithril");

const Electron = require("electron");
const BrowserWindow = Electron.remote.BrowserWindow;
const dialog = Electron.remote.dialog;
const app = Electron.remote.app;

const utils = require("../utils");
const config = require("../config");
const Firmware = require("./firmware");
const dataCollectionViews = require("./data-collection-views");

const currentVersion = app.getVersion();
let updateDialogOpen = false;

function checkForFirmwareUpdates(callback) {
    utils.checkInternetConnection(function (isConnected) {
        if (isConnected) {
            let paletteChecked = false;
            let palettePlusChecked = false;
            let versions = {
                palette: [],
                palettePlus: []
            };

            // check for Palette firmware updates
            http.request({
                host: "emerald.mosaicmanufacturing.com",
                path: "/palette/latest/" + (global.latestPaletteFWVersion ? global.latestPaletteFWVersion : "1.0.0")
            }, function (response) {
                let contents = "";
                response.on("data", function (chunk) {
                    contents += chunk;
                });
                response.on("end", function () {
                    if (response.statusCode === 200) {
                        paletteChecked = true;
                        versions.palette = JSON.parse(contents).versions;
                        if (paletteChecked && palettePlusChecked) {
                            callback(false, versions);
                        }
                    } else {
                        callback({
                            message: "Could not check for updates",
                            detail: "An error occurred trying to communicate with the update server."
                        });
                    }
                })
            }).end();

            // check for Palette+ firmware updates
            http.request({
                host: "emerald.mosaicmanufacturing.com",
                path: "/palette-plus/latest/" + (global.latestPalettePlusFWVersion ? global.latestPalettePlusFWVersion : "1.0.0")
            }, function (response) {
                let contents = "";
                response.on("data", function (chunk) {
                    contents += chunk;
                });
                response.on("end", function () {
                    if (response.statusCode === 200) {
                        palettePlusChecked = true;
                        versions.palettePlus = JSON.parse(contents).versions;
                        if (paletteChecked && palettePlusChecked) {
                            callback(false, versions);
                        }
                    } else {
                        callback({
                            message: "Could not check for updates",
                            detail: "An error occurred trying to communicate with the update server."
                        });
                    }
                })
            }).end();

        } else {
            callback(utils.noInternetConnectionMessage);
        }
    });
}

function getLatestFirmwareVersion(isPalettePlus, callback) {
    utils.checkInternetConnection(function (isConnected) {
        if (isConnected) {
            http.request({
                host: "emerald.mosaicmanufacturing.com",
                path: "/" + (isPalettePlus ? "palette-plus" : "palette") + "/latest"
            }, function (response) {
                let contents = "";
                response.on("data", function (chunk) {
                    contents += chunk;
                });
                response.on("end", function () {
                    if (response.statusCode === 200) {
                        callback(false, JSON.parse(contents));
                    } else {
                        callback({
                            message: "Could not get firmware",
                            detail: "An error occurred trying to communicate with the update server."
                        });
                    }
                })
            }).end();
        } else {
            callback(utils.noInternetConnectionMessage);
        }
    });
}

function getAllFirmwareVersions(isPalettePlus, callback) {
    utils.checkInternetConnection(function (isConnected) {
        if (isConnected) {
            http.request({
                host: "emerald.mosaicmanufacturing.com",
                path: "/" + (isPalettePlus ? "palette-plus" : "palette") + "/latest/0.0.0"
            }, function (response) {
                let contents = "";
                response.on("data", function (chunk) {
                    contents += chunk;
                });
                response.on("end", function () {
                    if (response.statusCode === 200) {
                        let versions = JSON.parse(contents).versions.map(function (entry) {
                            return {
                                version: entry.version,
                                downloadURL: entry.downloadURL
                            };
                        });
                        callback(false, versions);
                    } else {
                        callback({
                            message: "Could not get firmware",
                            detail: "An error occurred trying to communicate with the update server."
                        });
                    }
                })
            }).end();
        } else {
            callback(utils.noInternetConnectionMessage);
        }
    });
}

function getLatestFirmwareHex(isPalettePlus, callback) {
    getLatestFirmwareVersion(isPalettePlus, function (err, response) {
        if (err) {
            callback(err);
        } else {
            getFirmwareHex(response.versions[0], callback);
        }
    });
}

function getFirmwareHex(version, callback) {
    let protocol = url.parse(version.downloadURL).protocol;
    let protocolToUse = (protocol === "http:" ? http : https);
    protocolToUse.request(version.downloadURL, function (response) {
        let body = "";
        let errorObj = {
            message: "Download failed",
            detail: "The firmware file could not be downloaded."
        };
        response.on("data", function (chunk) {
            body += chunk;
        });
        response.on("end", function () {
            temp.open({
                suffix: ".hex"
            }, function (err, info) {
                if (err) {
                    callback(errorObj);
                } else {
                    fs.write(info.fd, body, function (err) {
                        if (err) {
                            callback(errorObj);
                        } else {
                            fs.close(info.fd, function (err) {
                                if (err) {
                                    callback(errorObj);
                                } else {
                                    callback(null, info.path);
                                }
                            });
                        }
                    });
                }
            });
        });
    }).end();
}

function showUpdateDialog(versions) {
    if (updateDialogOpen) {
        return;
    }
    updateDialogOpen = true;
    let container = document.getElementById("updateNotifications");
    m.render(container, [
        m("dialog#updateDialog", [
            m("h2", "A newer version of Chroma is available!"),
            m("p", [
                "Chroma version " + versions[0].version + " is available—you're currently running "+ currentVersion + ".",
                m("br"),
                "You can continue to use Chroma while the update is downloading."]
            ),
            m("div#updateChangelog", [
                versions.map(function (version) {
                    return m("div.release", [
                        m("h4", "Released " + version.releaseDate),
                        m("h3", "Chroma " + version.version),
                        m("div.releaseNotes", m.trust(marked(version.changelog)))
                    ]);
                })
            ]),
            m("div.buttonList", [
                m("div.left", [
                    m("button", {
                        onclick: function () {
                            // skip this version
                            global.ignoreUpdateVersion = versions[0].version;
                            config.writeConfigFile();
                            closeUpdateDialog();
                        }
                    }, "Skip this version")
                ]),
                m("div.right", [
                    m("button", {
                        onclick: function () {
                            // remind me later
                            global.ignoreUpdateVersion = false;
                            config.writeConfigFile();
                            closeUpdateDialog();
                        }
                    }, "Remind me later"),
                    m("button.confirm", {
                        onclick: function () {
                            // download
                            global.ignoreUpdateVersion = false;
                            config.writeConfigFile();
                            Electron.ipcRenderer.send("do-update");
                            closeUpdateDialog();
                        }
                    }, "Update")
                ])
            ])
        ])
    ]);
    if (!container.style.display) {
        container.style.display = "block";
        document.getElementById("updateDialog").showModal();
        let closeModal = function (event) {
            event = event || window.event;
            if (event.keyCode === 27) {
                window.removeEventListener("keydown", closeModal);
                closeUpdateDialog();
            }
        };
        window.addEventListener("keydown", closeModal);
    }
}

function showFirmwareUpdateDialog(versions) {
    if (updateDialogOpen) {
        return;
    }
    updateDialogOpen = true;
    let deviceLabels = "";
    let deviceVersionLabels = "";
    if (versions.palette.length > 0 && versions.palettePlus.length > 0) {
        deviceLabels = "Palette/Palette+";
        if (versions.palette[0].version === versions.palettePlus[0].version) {
            deviceVersionLabels = "Palette/Palette+ firmware version " + versions.palette[0].version + " is now available.";
        } else {
            deviceVersionLabels = "Palette firmware version " + versions.palette[0].version
                + " and Palette+ firmware version " + versions.palettePlus[0].version + " are now available.";
        }
    } else if (versions.palettePlus.length > 0) {
        deviceLabels = "Palette+";
        deviceVersionLabels = "Palette+ firmware version " + versions.palettePlus[0].version + " is now available.";
    } else {
        deviceLabels = "Palette";
        deviceVersionLabels = "Palette firmware version " + versions.palette[0].version + " is now available.";
    }

    function versionSort(a, b) {
        let aDate = new Date(a.releaseDate);
        let bDate = new Date(b.releaseDate);
        if (aDate > bDate) return -1;
        if (aDate < bDate) return 1;
        if (a.forPalettePlus) return -1;
        if (b.forPalettePlus) return 1;
        return 0;
    }
    let mergedVersions = [];
    for (let paletteVersion of versions.palette) {
        paletteVersion.forPalette = true;
        mergedVersions.push(paletteVersion);
    }
    for (let palettePlusVersion of versions.palettePlus) {
        let sameVersionInfo = false;
        for (let paletteVersion of versions.palette) {
            if (paletteVersion.version === palettePlusVersion.version
                && paletteVersion.releaseDate === palettePlusVersion.releaseDate
                && paletteVersion.changelog === palettePlusVersion.changelog) {
                paletteVersion.forPalettePlus = true;
                sameVersionInfo = true;
                break;
            }
        }
        if (!sameVersionInfo) {
            palettePlusVersion.forPalettePlus = true;
            mergedVersions.push(palettePlusVersion);
        }
    }
    mergedVersions.sort(versionSort);

    let container = document.getElementById("updateNotifications");
    m.render(container, [
        m("dialog#updateDialog", [
            m("h2", "New " + deviceLabels + " firmware is available!"),
            m("p", deviceVersionLabels),
            m("div#updateChangelog", [
                mergedVersions.map(function (version) {
                    let title = "";
                    if (version.forPalettePlus && version.forPalette) {
                        title = "Palette/Palette+ firmware " + version.version;
                    } else if (version.forPalettePlus) {
                        title = "Palette+ firmware " + version.version;
                    } else {
                        title = "Palette firmware " + version.version;
                    }
                    return m("div.release", [
                        m("h4", "Released " + version.releaseDate),
                        m("h3", title),
                        m("div.releaseNotes", m.trust(marked(version.changelog)))
                    ]);
                })
            ]),
            m("div.buttonList", [
                m("div.left", [
                    m("button", {
                        onclick: function () {
                            // remind me later
                            closeUpdateDialog();
                        }
                    }, "Remind me later")
                ]),
                m("div.right", [
                    m("button.confirm", {
                        onclick: function () {
                            // update
                            if (versions.palette.length > 0) {
                                global.latestPaletteFWVersion = versions.palette[0].version;
                            }
                            if (versions.palettePlus.length > 0) {
                                global.latestPalettePlusFWVersion = versions.palettePlus[0].version;
                            }
                            config.writeConfigFile();
                            closeUpdateDialog();
                            Firmware.openModal();
                        }
                    }, "Update")
                ])
            ])
        ])
    ]);
    if (!container.style.display) {
        container.style.display = "block";
        document.getElementById("updateDialog").showModal();
        let closeModal = function (event) {
            event = event || window.event;
            if (event.keyCode === 27) {
                window.removeEventListener("keydown", closeModal);
                closeUpdateDialog();
            }
        };
        window.addEventListener("keydown", closeModal);
    }
}

function closeUpdateDialog() {
    let dialog = document.getElementById("updateDialog");
    if (dialog.open) {
        dialog.close();
    }
    updateDialogOpen = false;
    document.getElementById("updateNotifications").style.display = "";
}

function handleUpdateCheck(event, notifyUser, error, response, currentVersion) {
    if (!dataCollectionViews.dialogIsOpen()) {
        if (error) {
            if (notifyUser) {
                dialog.showMessageBox(BrowserWindow.fromId(2), {
                    type: "info",
                    message: error.message,
                    detail: error.detail,
                    buttons: ["OK"],
                    defaultId: 0
                }, function () {});
            }
        } else {
            if (response && response.versions && response.versions.length > 0) {
                showUpdateDialog(response.versions);
            } else if (notifyUser) {
                dialog.showMessageBox(BrowserWindow.fromId(2), {
                    type: "info",
                    message: "Chroma is up to date!",
                    detail: "Your current version of Chroma (" + currentVersion + ") is the latest version.",
                    buttons: ["OK"],
                    defaultId: 0
                }, function () {});
            }
        }
    }
}

function updateAnimationStart() {
    let animation = document.getElementById("updateAnimation");
    animation.style.display = "block";
}

function updateAnimationProgress(event, progressInfo) {
    let loadingBar = document.getElementById("updateAnimationProgress");
    loadingBar.style.width = Math.round(progressInfo.percent) + "%";
}

function updateAnimationStop() {
    let animation = document.getElementById("updateAnimation");
    animation.style.display = "";
}

function handleUpdateReady() {
    dialog.showMessageBox(BrowserWindow.fromId(2), {
        type: "info",
        message: "Chroma is ready to update",
        detail: "The update has been downloaded and will be installed the next time you quit Chroma.",
        buttons: ["Quit and Install", "Dismiss"],
        defaultId: 0
    }, function (choice) {
        if (choice === 0) {
            app.quit();
        }
    });
}

function updateErrorDialog() {
    dialog.showMessageBox(BrowserWindow.fromId(2), {
        type: "info",
        message: "Update error",
        detail: "An unexpected error occurred downloading the update.",
        buttons: ["Dismiss"],
        defaultId: 0
    }, function () {});
}

exports.getCurrentVersion = function () {
    return currentVersion;
};
exports.showUpdateDialog = showUpdateDialog;
exports.handleUpdateCheck = handleUpdateCheck;
exports.updateAnimationStart = updateAnimationStart;
exports.updateAnimationProgress = updateAnimationProgress;
exports.updateAnimationStop = updateAnimationStop;
exports.handleUpdateReady = handleUpdateReady;
exports.checkForFirmwareUpdates = checkForFirmwareUpdates;
exports.showFirmwareUpdateDialog = showFirmwareUpdateDialog;
exports.getLatestFirmwareVersion = getLatestFirmwareVersion;
exports.getAllFirmwareVersions = getAllFirmwareVersions;
exports.getLatestFirmwareHex = getLatestFirmwareHex;
exports.getFirmwareHex = getFirmwareHex;
exports.updateErrorDialog = updateErrorDialog;
