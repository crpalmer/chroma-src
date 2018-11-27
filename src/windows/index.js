(function () {

    const fs = require("fs");
    const path = require("path");

    const Electron = require("electron");
    const ipcRenderer = Electron.ipcRenderer;
    const webFrame = Electron.webFrame;
    webFrame.setZoomFactor(1);
    webFrame.setVisualZoomLevelLimits(1, 1);

    const config = require("../config");
    const dataCollection = require("../models/data-collection");
    const dataCollectionViews = require("../views/data-collection-views");
    const profiles = require("../models/printer-profiles");
    const msfEditor = require("../views/msf-editor");
    const Postprocessor = require("../views/postprocessor-view");
    const SetupView = require("../views/setup-view");
    const Updater = require("../views/updater");

    global.env = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "env.json"), "utf8"));
    config.loadProfiles();
    config.loadMaterials();
    config.readConfigFile();

    // reset invalid activePrinterProfile values
    let profileCount = profiles.getProfileCount();
    let activeIndex = profiles.getActiveProfileIndex();
    if (profileCount > 0 && activeIndex <= 0) {
        profiles.setActiveProfileIndex(1);
    } else if (profileCount === 0 && activeIndex !== 0) {
        profiles.setActiveProfileIndex(0);
    } else if (activeIndex > profileCount) {
        profiles.setActiveProfileIndex(profileCount);
    }
    config.writeConfigFile();
    dataCollection.initialize();

    require("../views/menu").initialize();

    global.print = null;

    Postprocessor.initialize();

    if (!global.env.dev) {
        dataCollectionViews.showDataCollectionDialog(function () {
            if (!dataCollectionViews.dialogIsOpen()) {
                Updater.checkForFirmwareUpdates(function (err, versions) {
                    if (err) {
                        return;
                    }
                    if (versions.palette.length === 0 && versions.palettePlus.length === 0) {
                        return;
                    }
                    if ((versions.palette.length === 0 || (global.latestPaletteFWVersion && global.latestPaletteFWVersion === versions.palette[0].version))
                        && (versions.palettePlus.length === 0 || (global.latestPalettePlusFWVersion && global.latestPalettePlusFWVersion === versions.palettePlus[0].version))) {
                        return;
                    }
                    if (global.firstRun || profiles.getProfileCount() === 0) {
                        global.latestPaletteFWVersion = versions.palette[0].version;
                        global.latestPalettePlusFWVersion = versions.palettePlus[0].version;
                        config.writeConfigFile();
                        return;
                    }
                    Updater.showFirmwareUpdateDialog(versions);
                });
            }
        });
    }

    ipcRenderer.on("update-available", Updater.handleUpdateCheck);
    ipcRenderer.on("update-downloading", Updater.updateAnimationStart);
    ipcRenderer.on("update-download-progress", Updater.updateAnimationProgress);
    ipcRenderer.on("update-ready", function () {
        Updater.updateAnimationStop();
        Updater.handleUpdateReady();
    });
    ipcRenderer.on("update-error", function () {
        Updater.updateAnimationStop();
        Updater.updateErrorDialog();
    });
    ipcRenderer.on("log-crash", function () {
        dataCollection.logCrash(profiles.getActiveProfile());
    });
    ipcRenderer.on("open-file-dock", function (event, filepath) {
        if (document.getElementById("open-modal").style.display === "block") {
            return;
        }
        if (SetupView.setupWindowOpen()) {
            return;
        }
        if (!profiles.getActiveProfile()) {
            return;
        }
        let extension = path.extname(filepath).substr(1).toLowerCase();
        if (extension === "msf" || extension === "csf" || extension === "maf") {
            msfEditor.openEditor(filepath);
        } else if (profiles.getActiveProfile().inputParsers.indexOf(extension) >= 0) {
            Postprocessor.openFile(filepath);
        } else {
            Electron.remote.dialog.showMessageBox(Electron.remote.BrowserWindow.fromId(2), {
                type: "warning",
                message: "Incompatible file type",
                detail: "The current printer profile is incompatible with ." + extension + " files.",
                buttons: ["Dismiss"],
                defaultId: 0
            }, function () {});
        }
    });

    document.ondragover = document.ondrop = function (event) {
        event.preventDefault();
    };

    document.body.ondrop = function (event) {
        event.preventDefault();
        if (document.getElementById("open-modal").style.display === "block") {
            return;
        }
        if (SetupView.setupWindowOpen()) {
            return;
        }
        if (!profiles.getActiveProfile()) {
            return;
        }
        if (event.dataTransfer.files.length === 1) {
            let extension = path.extname(event.dataTransfer.files[0].name).substr(1).toLowerCase();
            if (extension === "msf" || extension === "csf" || extension === "maf") {
                msfEditor.openEditor(event.dataTransfer.files[0].path);
            }
            if (profiles.getActiveProfile().inputParsers.indexOf(extension) >= 0) {
                Postprocessor.openFile(event.dataTransfer.files[0].path);
            }
        }
    };

})();
