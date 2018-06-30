
const Electron = require("electron");
const app = Electron.remote.app;
const BrowserWindow = Electron.remote.BrowserWindow;
const dialog = Electron.remote.dialog;
const ipcRenderer = Electron.ipcRenderer;
const ElectronMenu = Electron.remote.Menu;
const appName = app.getName();

const utils = require("./menu-utils");
const config = require("../config");
const msfEditor = require("./msf-editor");
const Postprocessor = require("./postprocessor-view");
const Preferences = require("./preferences");
const SetupView = require("./setup-view");
const Visualizer = require("./visualizer");

let menu;
let menuOffsets = null;

let aboutWindow = null;

function displayAboutWindow() {
    if (aboutWindow) {
        aboutWindow.focus();
        return;
    }
    aboutWindow = new BrowserWindow({
        width: 450,
        height: 380,
        useContentSize: true,
        resizable: false,
        maximizable: false,
        fullscreen: false,
        fullscreenable: false,
        title: "",
        show: false
    });
    aboutWindow.setMenu(null);
    aboutWindow.on("closed", function () {
        aboutWindow = null;
    });
    aboutWindow.loadURL("file://" + __dirname + "/../windows/about.html");
    aboutWindow.once("ready-to-show", function () {
        aboutWindow.show();
    })
}

function reloadApp(window) {
    if (window.id === 2) {
        window.setTitle("Chroma");
        if (process.platform === "darwin") {
            window.setRepresentedFilename("");
        }
        window.setProgressBar(-1);
    }
    window.reload();
}

function initialize() {
    let isMacOS = process.platform === "darwin";
    menuOffsets = {
        file: (isMacOS ? 1 : 0),
        edit: (isMacOS ? 2 : 1),
        profiles: (isMacOS ? 3 : 2),
        visualizer: (isMacOS ? 4 : 3),
        tools: (isMacOS ? 5 : 4)
    };
    if (isMacOS) {
        menuOffsets.macAppMenu = 0;
    }
    if (global.env.dev) {
        menuOffsets.develop = (isMacOS ? 6 : 5);
        menuOffsets.window = (isMacOS ? 7 : 6);
        menuOffsets.help = (isMacOS ? 8 : 7);
    } else {
        menuOffsets.window = (isMacOS ? 6 : 5);
        menuOffsets.help = (isMacOS ? 7 : 6);
    }
    updateApplicationMenu();
}

function updateApplicationMenu() {

    let template = [
        {
            label: "File",
            submenu: [
                {
                    label: "Load Print...",
                    accelerator: "CmdOrCtrl+O",
                    click: Postprocessor.selectFile
                },
                {
                    label: "Close Print",
                    enabled: false,
                    click: function () {
                        dialog.showMessageBox(BrowserWindow.fromId(2), {
                            type: "question",
                            message: "Close file",
                            detail: "Are you sure you want to close the loaded print?",
                            buttons: ["Close", "Cancel"],
                            defaultId: 0,
                            cancelId: 1
                        }, function (choice) {
                            if (choice === 0) {
                                Postprocessor.closeFile();
                            }
                        });

                    }
                },
                {
                    label: "Save for Printer...",
                    accelerator: "CmdOrCtrl+S",
                    enabled: false,
                    click: Postprocessor.saveFile
                },
                {
                    type: "separator"
                },
                {
                    label: "View MSF...",
                    accelerator: "CmdOrCtrl+Shift+O",
                    click: msfEditor.selectMSF
                },
            ]
        },
        {
            label: "Edit",
            submenu: [
                {
                    label: "Undo",
                    accelerator: "CmdOrCtrl+Z",
                    role: "undo"
                },
                {
                    label: "Redo",
                    accelerator: "Shift+CmdOrCtrl+Z",
                    role: "redo"
                },
                {
                    type: "separator"
                },
                {
                    label: "Cut",
                    accelerator: "CmdOrCtrl+X",
                    role: "cut"
                },
                {
                    label: "Copy",
                    accelerator: "CmdOrCtrl+C",
                    role: "copy"
                },
                {
                    label: "Paste",
                    accelerator: "CmdOrCtrl+V",
                    role: "paste"
                },
                {
                    label: "Select All",
                    accelerator: "CmdOrCtrl+A",
                    role: "selectall"
                }
            ]
        },
        {
            label: "Profiles",
            submenu: [
                {
                    label: "Printer Profiles...",
                    accelerator: "CmdOrCtrl+P",
                    click: function () {
                        if (SetupView.setupWindowOpen()) {
                            SetupView.closeSetupWindow();
                        }
                        require("./printer-profile-view").openModal();
                    }
                },
                {
                    label: "Material Profiles...",
                    accelerator: "CmdOrCtrl+Shift+P",
                    click: function () {
                        if (SetupView.setupWindowOpen()) {
                            SetupView.closeSetupWindow();
                        }
                        require("./material-profile-view").openModal();
                    }
                }
            ]
        },
        {
            label: "Visualizer",
            submenu: [
                {
                    label: "Display Origin Axes",
                    type: "checkbox",
                    checked: global.displayOriginAxes,
                    click: function (menuItem) {
                        require("./visualizer").toggleOriginAxes(menuItem.checked, true);
                        global.displayOriginAxes = menuItem.checked;
                        config.writeConfigFile();
                    }
                },
                {
                    label: "Reset Camera Position",
                    click: require("./visualizer").resetCameraPosition
                },
                {
                    label: "Save Bed Preview...",
                    click: utils.saveBedPreview
                }
            ]
        },
        {
            label: "Tools",
            submenu: [
                {
                    label: "Update Palette Firmware...",
                    accelerator: "CmdOrCtrl+Shift+F",
                    click: require("./firmware").openModal
                },
                {
                    label: "Generate Palette Config File...",
                    click: utils.generateCFGModal
                },
                {
                    type: "separator"
                },
                {
                    label: "Convert MSF to Plain...",
                    click: utils.convertToPlainMSF
                },
                {
                    label: "Generate Custom MSF...",
                    click: utils.generateCustomMSFModal
                }
            ]
        },
        {
            label: "Window",
            role: "window",
            submenu: [
                {
                    label: "Minimize",
                    accelerator: "CmdOrCtrl+M",
                    role: "minimize"
                },
                {
                    label: "Close",
                    accelerator: "CmdOrCtrl+W",
                    role: "close"
                }
            ]
        },
        {
            label: "Help",
            role: "help",
            submenu: [
                {
                    label: "Chroma Tutorial",
                    accelerator: "F1",
                    click: function () {
                        SetupView.startTutorial();
                    }
                },
                {
                    type: "separator"
                },
                {
                    label: "Palette Setup Guide",
                    click: function () {
                        Electron.shell.openExternal("http://mm3d.co/setup");
                    }
                },
                {
                    label: "Quick Start Guide (PDF)",
                    click: function () {
                        Electron.shell.openExternal("http://mm3d.co/quick-start-guide-pdf");
                    }
                },
                {
                    label: "Quick Start Guide (Video)",
                    click: function () {
                        Electron.shell.openExternal("http://mm3d.co/quick-start-guide-video");
                    }
                },
                {
                    label: "Additional Resources",
                    click: function () {
                        Electron.shell.openExternal("http://mm3d.co/resources");
                    }
                },
                {
                    type: "separator"
                },
                {
                    label: "Learn More About Mosaic",
                    click: function () {
                        Electron.shell.openExternal("https://www.mosaicmanufacturing.com");
                    }
                },
                {
                    label: "Find Something to Print",
                    click: function () {
                        Electron.shell.openExternal("http://mm3d.co/stuff-to-print");
                    }
                }
            ]
        }
    ];

    if (global.env.dev) {

        template.splice(5, 0, {
            label: "Develop",
            submenu: [
                {
                    label: "Reload App",
                    accelerator: "CmdOrCtrl+R",
                    click: function (menuItem, focusedWindow) {
                        if (focusedWindow) {
                            reloadApp(focusedWindow);
                        }
                    }
                },
                {
                    label: "Developer Tools",
                    accelerator: (process.platform === "darwin" ? "Alt+Command+I" : "Ctrl+Shift+I"),
                    click: function (menuItem, focusedWindow) {
                        if (focusedWindow) {
                            focusedWindow.openDevTools({
                                mode: "detach"
                            });
                        }
                    }
                },
                {
                    type: "separator"
                },
                {
                    label: "Ping Options",
                    enabled: false
                },
                {
                    label: "No Pings",
                    type: "radio",
                    checked: !global.pingOptions.usePings,
                    click: function () {
                        global.pingOptions.usePings = false;
                        global.pingOptions.useMechanicalPings = false;
                        config.writeConfigFile();
                    }
                },
                {
                    label: "Mechanical Pings",
                    type: "radio",
                    checked: global.pingOptions.usePings && global.pingOptions.useMechanicalPings,
                    click: function () {
                        global.pingOptions.usePings = true;
                        global.pingOptions.useMechanicalPings = true;
                        config.writeConfigFile();
                    }
                },
                {
                    label: "Extrusion Pings",
                    type: "radio",
                    checked: global.pingOptions.usePings && !global.pingOptions.useMechanicalPings,
                    click: function () {
                        global.pingOptions.usePings = true;
                        global.pingOptions.useMechanicalPings = false;
                        config.writeConfigFile();
                    }
                },
                {
                    type: "separator"
                },
                {
                    label: "Toggle Z Plane",
                    click: function () {
                        Visualizer.toggleZPlane(global.print);
                    }
                }
            ]
        })

    }

    if (process.platform === "darwin") {
        // on macOS there is a menu with the name of the app
        template.unshift({
            label: appName,
            submenu: [
                {
                    label: "About " + appName,
                    click: displayAboutWindow
                },
                {
                    type: "separator"
                },
                {
                    label: "Preferences...",
                    accelerator: "Command+,",
                    click: Preferences.openPreferencesModal
                },
                {
                    type: "separator"
                },
                {
                    label: "Services",
                    role: "services",
                    submenu: []
                },
                {
                    type: "separator"
                },
                {
                    label: "Hide " + appName,
                    accelerator: "Command+H",
                    role: "hide"
                },
                {
                    label: "Hide Others",
                    accelerator: "Command+Shift+H",
                    role: "hideothers"
                },
                {
                    label: "Show All",
                    role: "unhide"
                },
                {
                    type: "separator"
                },
                {
                    label: "Quit " + appName,
                    accelerator: "Command+Q",
                    click: app.quit
                }
            ]
        });
    } else {
        template[menuOffsets.help].submenu.push({
            type: "separator"
        });
        template[menuOffsets.help].submenu.push({
            label: "About " + appName,
            click: displayAboutWindow
        });
        template[menuOffsets.tools].submenu.push({
            type: "separator"
        });
        template[menuOffsets.tools].submenu.push({
            label: "Preferences...",
            accelerator: "Ctrl+,",
            click: Preferences.openPreferencesModal
        });
        template[menuOffsets.file].submenu.push({
            type: "separator"
        });
        template[menuOffsets.file].submenu.push({
            label: "Quit " + appName,
            accelerator: "Alt+F4",
            click: app.quit
        });
    }

    if (!global.env.dev && process.platform !== "linux") {

        template[menuOffsets.help].submenu.unshift({
            type: "separator"
        });

        template[menuOffsets.help].submenu.unshift({
            label: "Check for Updates",
            click: function () {
                ipcRenderer.send("check-for-updates");
            }
        });

    }

    menu = ElectronMenu.buildFromTemplate(template);
    ElectronMenu.setApplicationMenu(menu);
}

function disableSave() {
    menu.items[menuOffsets.file].submenu.items[1].enabled = !!global.print;  // Close Print
    menu.items[menuOffsets.file].submenu.items[2].enabled = false;        // Save for Printer...
}

function enableSave() {
    menu.items[menuOffsets.file].submenu.items[1].enabled = true;         // Close Print
    menu.items[menuOffsets.file].submenu.items[2].enabled = true;         // Save for Printer...
}

let setupViewActionsDisabled = false;

function disableSetupViewActions() {
    menu.items[menuOffsets.file].submenu.items[0].enabled = false;          // Load Print...
    menu.items[menuOffsets.file].submenu.items[1].enabled = false;          // Close Print
    menu.items[menuOffsets.file].submenu.items[2].enabled = false;          // Save for Printer...
    menu.items[menuOffsets.profiles].submenu.items[1].enabled = false;      // Material Profiles...
    menu.items[menuOffsets.visualizer].submenu.items[0].enabled = false;    // Display Origin Axes
    menu.items[menuOffsets.visualizer].submenu.items[1].enabled = false;    // Reset Camera Position
    menu.items[menuOffsets.visualizer].submenu.items[2].enabled = false;    // Save Bed Preview...
    menu.items[menuOffsets.tools].submenu.items[4].enabled = false;         // Generate Custom MSF...
    if (process.platform === "darwin") {
        menu.items[menuOffsets.macAppMenu].submenu.items[2].enabled = false;                     // Preferences...
    } else {
        menu.items[menuOffsets.tools].submenu.items[6].enabled = false;    // Preferences...
    }
    if (global.env.dev) {
        menu.items[menuOffsets.develop].submenu.items[4].enabled = false;   // Ping Options > No Pings
        menu.items[menuOffsets.develop].submenu.items[5].enabled = false;   // Ping Options > Mechanical Pings
        menu.items[menuOffsets.develop].submenu.items[6].enabled = false;   // Ping Options > Extrusion Pings
        menu.items[menuOffsets.help].submenu.items[0].enabled = false;      // Chroma Tutorial
    } else {
        menu.items[menuOffsets.help].submenu.items[2].enabled = false;      // Chroma Tutorial
    }
    setupViewActionsDisabled = true;
}

function enableSetupViewActions() {
    menu.items[menuOffsets.file].submenu.items[0].enabled = true;           // Load Print...
    menu.items[menuOffsets.file].submenu.items[1].enabled = (global.print !== null);  // Close Print
    menu.items[menuOffsets.file].submenu.items[2].enabled = (global.print !== null);  // Save for Printer...
    menu.items[menuOffsets.profiles].submenu.items[1].enabled = true;       // Material Profiles...
    menu.items[menuOffsets.visualizer].submenu.items[0].enabled = true;     // Display Origin Axes
    menu.items[menuOffsets.visualizer].submenu.items[1].enabled = true;     // Reset Camera Position
    menu.items[menuOffsets.visualizer].submenu.items[2].enabled = true;     // Save Bed Preview...
    menu.items[menuOffsets.tools].submenu.items[4].enabled = true;          // Generate Custom MSF...
    if (process.platform === "darwin") {
        menu.items[menuOffsets.macAppMenu].submenu.items[2].enabled = true;                      // Preferences...
    } else {
        menu.items[menuOffsets.tools].submenu.items[6].enabled = true;     // Preferences...
    }
    if (global.env.dev) {
        menu.items[menuOffsets.develop].submenu.items[4].enabled = true;    // Ping Options > No Pings
        menu.items[menuOffsets.develop].submenu.items[5].enabled = true;    // Ping Options > Mechanical Pings
        menu.items[menuOffsets.develop].submenu.items[6].enabled = true;    // Ping Options > Extrusion Pings
        menu.items[menuOffsets.help].submenu.items[0].enabled = true;       // Chroma Tutorial
    } else {
        menu.items[menuOffsets.help].submenu.items[2].enabled = true;       // Chroma Tutorial
    }
    setupViewActionsDisabled = false;
}

function disableModalActions() {
    menu.items[menuOffsets.file].submenu.items[0].enabled = false;          // Load Print...
    menu.items[menuOffsets.file].submenu.items[1].enabled = false;          // Close Print
    menu.items[menuOffsets.file].submenu.items[2].enabled = false;          // Save for Printer...
    menu.items[menuOffsets.file].submenu.items[4].enabled = false;          // View MSF...
    menu.items[menuOffsets.profiles].submenu.items[0].enabled = false;      // Printer Profiles...
    menu.items[menuOffsets.profiles].submenu.items[1].enabled = false;      // Material Profiles...
    menu.items[menuOffsets.visualizer].submenu.items[0].enabled = false;    // Display Origin Axes
    menu.items[menuOffsets.visualizer].submenu.items[1].enabled = false;    // Reset Camera Position
    menu.items[menuOffsets.visualizer].submenu.items[2].enabled = false;    // Save Bed Preview...
    menu.items[menuOffsets.tools].submenu.items[0].enabled = false;         // Update Palette Firmware...
    menu.items[menuOffsets.tools].submenu.items[1].enabled = false;         // Generate Palette Config File...
    menu.items[menuOffsets.tools].submenu.items[3].enabled = false;         // Convert MSF to Plain...
    menu.items[menuOffsets.tools].submenu.items[4].enabled = false;         // Generate Custom MSF...
    menu.items[menuOffsets.help].submenu.items[0].enabled = false;          // Chroma Tutorial
    if (process.platform === "darwin") {
        menu.items[menuOffsets.macAppMenu].submenu.items[2].enabled = false;                     // Preferences...
    } else {
        menu.items[menuOffsets.tools].submenu.items[6].enabled = false;    // Preferences...
    }
    if (global.env.dev) {
        menu.items[menuOffsets.develop].submenu.items[4].enabled = false;   // Ping Options > No Pings
        menu.items[menuOffsets.develop].submenu.items[5].enabled = false;   // Ping Options > Mechanical Pings
        menu.items[menuOffsets.develop].submenu.items[6].enabled = false;   // Ping Options > Extrusion Pings
    }
}

function enableModalActions() {
    menu.items[menuOffsets.file].submenu.items[0].enabled = true;           // Load Print...
    menu.items[menuOffsets.file].submenu.items[1].enabled = (global.print !== null);  // Close Print
    menu.items[menuOffsets.file].submenu.items[2].enabled = (global.print !== null);  // Save for Printer...
    menu.items[menuOffsets.file].submenu.items[4].enabled = true;           // View MSF...
    menu.items[menuOffsets.profiles].submenu.items[0].enabled = true;       // Printer Profiles...
    menu.items[menuOffsets.profiles].submenu.items[1].enabled = true;       // Material Profiles...
    menu.items[menuOffsets.visualizer].submenu.items[0].enabled = true;     // Display Origin Axes
    menu.items[menuOffsets.visualizer].submenu.items[1].enabled = true;     // Reset Camera Position
    menu.items[menuOffsets.visualizer].submenu.items[2].enabled = true;     // Save Bed Preview...
    menu.items[menuOffsets.tools].submenu.items[0].enabled = true;          // Update Palette Firmware...
    menu.items[menuOffsets.tools].submenu.items[1].enabled = true;          // Generate Palette Config File...
    menu.items[menuOffsets.tools].submenu.items[3].enabled = true;          // Convert MSF to Plain...
    menu.items[menuOffsets.tools].submenu.items[4].enabled = true;          // Generate Custom MSF...
    menu.items[menuOffsets.help].submenu.items[0].enabled = true;           // Chroma Tutorial
    if (process.platform === "darwin") {
        menu.items[menuOffsets.macAppMenu].submenu.items[2].enabled = true;                      // Preferences...
    } else {
        menu.items[menuOffsets.tools].submenu.items[6].enabled = true;     // Preferences...
    }
    if (global.env.dev) {
        menu.items[menuOffsets.develop].submenu.items[4].enabled = true;    // Ping Options > No Pings
        menu.items[menuOffsets.develop].submenu.items[5].enabled = true;    // Ping Options > Mechanical Pings
        menu.items[menuOffsets.develop].submenu.items[6].enabled = true;    // Ping Options > Extrusion Pings
    }
    if (setupViewActionsDisabled) {
        disableSetupViewActions();
    }
}

exports.reloadApp = reloadApp;
exports.initialize = initialize;
exports.enableSave = enableSave;
exports.disableSave = disableSave;
exports.disableModalActions = disableModalActions;
exports.enableModalActions = enableModalActions;
exports.disableSetupViewActions = disableSetupViewActions;
exports.enableSetupViewActions = enableSetupViewActions;
exports.setupViewActionsDisabled = function () {
    return setupViewActionsDisabled;
};
