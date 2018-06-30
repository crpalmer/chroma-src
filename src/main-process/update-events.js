
const app = require("electron").app;

const utils = require("../utils");

function checkForUpdates(browserWindow, alwaysNotify) {
    utils.checkInternetConnection(function (isConnected) {
        if (isConnected) {
            const http = require("http");
            const version = app.getVersion();
            let request = http.request({
                host: "emerald.mosaicmanufacturing.com",
                path: "/chroma/latest/" + version
            }, function (response) {
                let contents = "";
                response.on("data", function (chunk) {
                    contents += chunk;
                });
                response.on("end", function () {
                    if (response.statusCode === 200) {
                        browserWindow.webContents.send("update-available", alwaysNotify, false, JSON.parse(contents), version);
                    } else {
                        browserWindow.webContents.send("update-available", alwaysNotify, {
                            message: "Could not check for updates",
                            detail: "An error occurred trying to communicate with the update server."
                        });
                    }
                })
            });
            request.on("error", function (/* e */) {
                browserWindow.webContents.send("update-available", alwaysNotify, {
                    message: "Unable to connect",
                    detail: "An error occurred trying to communicate with the update server."
                });
            });
            request.end();
        } else {
            browserWindow.webContents.send("update-available", alwaysNotify, utils.noInternetConnectionMessage);
        }
    });
}

function downloadAndPrompt(browserWindow) {
    if (process.platform === "linux") {
        return;
    }
    const autoUpdater = require("electron-updater").autoUpdater;
    autoUpdater.on("error", function (error) {
        browserWindow.send("update-error", error);
    });
    autoUpdater.on("update-available", function (/* info */) {
        browserWindow.webContents.send("update-downloading");
    });
    autoUpdater.on("download-progress", function (progressInfo) {
        browserWindow.webContents.send("update-download-progress", progressInfo);
    });
    autoUpdater.on("update-downloaded", function () {
        browserWindow.webContents.send("update-ready");
    });
    try {
        autoUpdater.checkForUpdates();
    } catch (e) {
        browserWindow.webContents.send("update-error", e);
    }
}

exports.checkForUpdates = checkForUpdates;
exports.downloadAndPrompt = downloadAndPrompt;
