
const fs = require("fs");
const path = require("path");

global.env = JSON.parse(fs.readFileSync(path.join(__dirname, "env.json")).toString());

if (global.env.dev && global.env.type !== "prebuilt" && process.argv.length > 2) {
    require("./main-process/cli");
} else {

    const Electron = require("electron");
    const app = Electron.app;
    const BrowserWindow = Electron.BrowserWindow;
    const ipcMain = Electron.ipcMain;

    const updateEvents = require("./main-process/update-events");

    let freeMemory = require("os").freemem();  // in bytes
    let appMemory = Math.floor(0.75 * freeMemory / (1024 * 1024));

    app.commandLine.appendSwitch("js-flags", "--max-old-space-size=" + appMemory);

    // Store a reference to the window for the duration of the application life
    let mainWindow = null;

    const shouldQuit = app.makeSingleInstance(function (argv, workingDirectory) {
        // Attempted to run a second instance -- focus the single instance instead
        if (mainWindow) {
            if (mainWindow.isMinimized()) {
                mainWindow.restore();
            }
            mainWindow.focus();
            if (global.env.type !== "prebuilt" && process.platform !== "darwin" && argv.length > 1) {
                mainWindow.webContents.send("open-file-dock", argv[1]);
            }
        }
    });

    if (shouldQuit) {
        app.quit();
    }

    // Quit the application when all windows are closed
    app.on("window-all-closed", app.quit);

    let appReady = false;
    let fileOpenQueued = false;
    app.on("open-file", function (event, path) {
        event.preventDefault();
        if (appReady) {
            mainWindow.webContents.send("open-file-dock", path);
        } else {
            fileOpenQueued = path;
        }
    });

    // Create the main window when Electron has finished initializing
    app.on("ready", function() {
        appReady = true;
        let splashWindow = new BrowserWindow({
            width: 600,
            height: 340,
            useContentSize: true,
            resizable: false,
            movable: false,
            minimizable: false,
            maximizable: false,
            closable: false,
            fullscreen: false,
            fullscreenable: false,
            skipTaskbar: true,
            title: "",
            frame: false,
            transparent: true,
            thickFrame: false,
            show: false
        });
        splashWindow.loadURL("file://" + __dirname + "/windows/splash.html");
        splashWindow.once("ready-to-show", function () {
            splashWindow.show();
        });

        mainWindow = new BrowserWindow({
            width: 1000,
            height: 700,
            minWidth: 1000,
            minHeight: 600,
            title: "Chroma",
            icon: "img/mosaic-app-icon.png",
            show: false
        });
        mainWindow.webContents.on("will-navigate", function(e, url) {
            e.preventDefault();
            Electron.shell.openExternal(url);
        });
        mainWindow.webContents.on("new-window", function (e, url) {
            e.preventDefault();
            Electron.shell.openExternal(url);
        });
        mainWindow.loadURL("file://" + __dirname + "/windows/index.html");
        mainWindow.once("ready-to-show", function () {
            splashWindow.destroy();
            splashWindow = null;
            mainWindow.show();
            if (fileOpenQueued) {
                mainWindow.webContents.send("open-file-dock", fileOpenQueued);
            } else if (global.env.type !== "prebuilt" && process.platform !== "darwin" && process.argv.length > 1) {
                mainWindow.webContents.send("open-file-dock", process.argv[1]);
            }
        });
        mainWindow.webContents.once("did-frame-finish-load", function () {
            if (!global.env.dev && process.platform !== "linux") {
                updateEvents.checkForUpdates(mainWindow, false);
            }
        });
        mainWindow.webContents.on("crashed", function (event, killed) {
            if (!killed) {
                Electron.dialog.showErrorBox("Uh Oh! Out of Memory 🤕", "Chroma ran out of available memory on your system.\n\nTo reduce the file size of your print, try increasing the layer height or reducing the amount of infill. You can also try quitting some apps or rebooting, then restarting Chroma.\n\nFor other strategies, reach out to us at support@mosaicmanufacturing.com.");
                mainWindow.loadURL("file://" + __dirname + "/windows/index.html");
                if (process.platform === "darwin") {
                    mainWindow.setRepresentedFilename("");
                }
                mainWindow.setProgressBar(-1);
                mainWindow.once("ready-to-show", function () {
                    mainWindow.webContents.send("log-crash");
                });
            }
        });
        ipcMain.on("check-for-updates", function () {
            updateEvents.checkForUpdates(mainWindow, true);
        });
        ipcMain.on("do-update", function () {
            updateEvents.downloadAndPrompt(mainWindow);
        });
        ipcMain.on("preferences-changed", function (event, prefList) {
            for (let pref of prefList) {
                global[pref[0]] = pref[1];
            }
        });

        // Dereference the window object on close
        // (usually you would store windows in an array if your app supports multiple windows.
        // This is the time when you should delete the corresponding element.)
        mainWindow.on("closed", function() {
            mainWindow = null;
            app.quit();
        });
    });

}
