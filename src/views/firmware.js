const fs = require("fs");
const m = require("mithril");
const Avrgirl = require("avrgirl-arduino");
const SerialPort = require("serialport");

const Electron = require("electron");
const BrowserWindow = Electron.remote.BrowserWindow;
const dialog = Electron.remote.dialog;

const config = require("../config");
const dataCollection = require("../models/data-collection");
const modalUtils = require("./modal-utils");
const PaletteDataString = require("../models/palette-data-string");

const portScanDebug = false;    // verbose console output for debugging
const portScanLog = false;      // logging of verbose output to file

let portScanLogFile = null;
let log = console.log;
if (portScanLog) {
    portScanLogFile = require("path").join(Electron.remote.app.getPath("desktop"), "chromafw.log.txt");
    if (!fs.existsSync(portScanLogFile)) {
        fs.writeFileSync(portScanLogFile, "");
    }
    log = function () {
        if (portScanDebug) {
            console.log(arguments[0]);
        }
        fs.appendFile(portScanLogFile, JSON.stringify(arguments[0]) + "\n", function () {});
    }
}

let dialogOpen = false;
let altHeld = 0;

function onKeyDown(event) {
    if (event.keyCode === 18) { // if Alt/Option is pressed
        altHeld++;
        if (altHeld > 2) altHeld = 2;
        let latestButtons = document.getElementsByClassName("installLatest");
        for (let i = 0; i < latestButtons.length; i++) {
            if (latestButtons[i].id !== "manualInstallLatest") {
                latestButtons[i].innerText = "Select Version";
            }
        }
    }
}

function onKeyUp(event) {
    if (event.keyCode === 18) { // if Alt/Option is released
        altHeld--;
        if (altHeld <= 0) {
            altHeld = 0;
            let latestButtons = document.getElementsByClassName("installLatest");
            for (let i = 0; i < latestButtons.length; i++) {
                if (latestButtons[i].id !== "manualInstallLatest") {
                    latestButtons[i].innerText = "Install Latest";
                }
            }
        }
    }
}

async function openModal(onClose) {

    if (global.env.dev) {
        window.addEventListener("keydown", onKeyDown);
        window.addEventListener("keyup", onKeyUp);
        modalUtils.beforeOpenModal(function () {
            window.removeEventListener("keydown", onKeyDown);
            window.removeEventListener("keyup", onKeyUp);
            dialogOpen = false;
            if (typeof onClose === "function") {
                onClose();
            }
        });
    } else {
        modalUtils.beforeOpenModal(function () {
            dialogOpen = false;
            if (typeof onClose === "function") {
                onClose();
            }
        });
    }
    dialogOpen = true;

    let modalWindow = document.getElementById("open-modal");
    m.render(modalWindow, [
        m("div.container", [
            m("div#firmwareView", [
                m("button#closeButton.closeButton", {
                    style: {
                        float: "right"
                    },
                    onclick: modalUtils.closeModal
                }, [
                    m("svg", {
                        height: 20,
                        width: 20
                    }, [
                        m("line", {
                            x1: 1,
                            y1: 1,
                            x2: 19,
                            y2: 19,
                            stroke: "#000",
                            "stroke-width": 2
                        }),
                        m("line", {
                            x1: 1,
                            y1: 19,
                            x2: 19,
                            y2: 1,
                            stroke: "#000",
                            "stroke-width": 2
                        })
                    ])
                ]),
                m("h2", "Update Palette Firmware"),

                m("div.checkboxGroup#portScanMode", [
                    m("input[type='checkbox']#useAdvancedPortScan", {
                        checked: global.advancedPortScan,
                        onclick: async function (e) {
                            global.advancedPortScan = e.target.checked;
                            document.getElementById("manualFirmwareUpdate").style.display = (global.advancedPortScan ? "none" : "");
                            document.getElementById("automaticFirmwareUpdate").style.display = (global.advancedPortScan ? "" : "none");
                            if (global.advancedPortScan) {
                                await scanPorts();
                            } else {
                                dialog.showMessageBox(BrowserWindow.fromId(2), {
                                    type: "question",
                                    message: "Auto-Detect Disabled",
                                    detail: "If you have issues flashing even after disabling auto-detect, you may need to quit and re-launch Chroma.",
                                    buttons: ["OK"]
                                }, function () {});
                            }
                            config.writeConfigFile();
                        }
                    }),
                    m("label[for='useAdvancedPortScan'].tooltip", {
                        "data-tooltip": "Chroma can detect connected Palettes and their firmware versions, as well as allow firmware to be flashed to a specific device port. Chroma provides a legacy flashing method for environments with compatibility issues, but device or port information is unavailable.",
                        tabindex: -1
                    }, "Auto-detect connected devices")
                ]),

                m("div#manualFirmwareUpdate", {
                    style: {
                        display: (global.advancedPortScan ? "none" : "")
                    }
                }, [
                    m("p.firmwareWarning", [
                        m("strong", "Important:"),
                        " Ensure your Palette is disconnected from power before connecting it to your computer via USB."
                    ]),
                    m("p.firmwareWarning", "Disconnect any 3D printers or Arduinos from your computer before flashing firmware."),
                    m("br"),
                    m("div.buttonList", [
                        m("div.left", [
                            m("button.confirm.installLatest#manualInstallLatest", {
                                onclick: function (e) {
                                    e.target.blur();
                                    dialog.showMessageBox(BrowserWindow.fromId(2), {
                                        type: "question",
                                        message: "Select device type",
                                        detail: "Which type of device would you like to flash?",
                                        buttons: ["Cancel", "Palette", "Palette+"],
                                        defaultId: 0,
                                        cancelId: 0
                                    }, function (choice) {
                                        if (choice === 0) {
                                            return;
                                        }
                                        let isPalettePlus = (choice === 2);
                                        let deviceString = (isPalettePlus ? "Palette+" : "Palette");
                                        const Updater = require("./updater");
                                        disableButtons();
                                        let progress = document.getElementById("firmwareUpdateSpinner");
                                        progress.innerText = "";
                                        progress.style.display = "block";

                                        progress.innerText = "Downloading";
                                        Updater.getLatestFirmwareHex(isPalettePlus, function (err, path) {
                                            if (err) {
                                                progress.style.display = "";
                                                enableButtons();
                                                dialog.showMessageBox(BrowserWindow.fromId(2), {
                                                    type: "warning",
                                                    message: err.message,
                                                    detail: err.detail,
                                                    buttons: ["OK"]
                                                }, function () {});
                                            } else {
                                                progress.innerText = "Flashing";
                                                let avrgirl = new Avrgirl({
                                                    board: "mega",
                                                    debug: portScanDebug
                                                });
                                                avrgirl.flash(path, function (err) {
                                                    progress.style.display = "none";
                                                    enableButtons();
                                                    if (err) {
                                                        dialog.showMessageBox(BrowserWindow.fromId(2), {
                                                            type: "warning",
                                                            message: "Unable to flash firmware",
                                                            detail: err.toString(),
                                                            buttons: ["OK"]
                                                        }, function () {});
                                                    } else {
                                                        dialog.showMessageBox(BrowserWindow.fromId(2), {
                                                            type: "info",
                                                            message: "Successfully flashed " + deviceString + " firmware",
                                                            buttons: ["OK"]
                                                        }, function () {});
                                                    }
                                                });
                                            }
                                        });
                                    });
                                }
                            }, "Flash Latest Firmware to Palette"),
                            m("button.loadHexFile", {
                                onclick: function (e) {
                                    e.target.blur();
                                    dialog.showOpenDialog(BrowserWindow.fromId(2), {
                                        filters: [{
                                            name: "Hex file",
                                            extensions: ["hex"]
                                        }]
                                    }, function (filenames) {
                                        if (filenames === undefined) {
                                            return;
                                        }
                                        let progress = document.getElementById("firmwareUpdateSpinner");
                                        progress.innerText = "Flashing";
                                        progress.style.display = "block";
                                        disableButtons();
                                        let avrgirl = new Avrgirl({
                                            board: "mega",
                                            debug: portScanDebug
                                        });
                                        avrgirl.flash(filenames[0], function (err) {
                                            progress.style.display = "none";
                                            enableButtons();
                                            if (err) {
                                                dialog.showMessageBox(BrowserWindow.fromId(2), {
                                                    type: "warning",
                                                    message: "Unable to flash firmware",
                                                    detail: err.toString(),
                                                    buttons: ["OK"]
                                                }, function () {});
                                            } else {
                                                dialog.showMessageBox(BrowserWindow.fromId(2), {
                                                    type: "info",
                                                    message: "Successfully flashed Palette firmware",
                                                    buttons: ["OK"]
                                                }, function () {});
                                            }
                                        });
                                    });
                                }
                            }, "Flash Hex File...")
                        ])
                    ])
                ]),
                m("div#automaticFirmwareUpdate", {
                    style: {
                        display: (global.advancedPortScan ? "" : "none")
                    }
                }, [
                    m("p.firmwareWarning", [
                        m("strong", "Important:"),
                        " Ensure your Palette is disconnected from power before connecting it to your computer via USB."
                    ]),
                    m("p#scanningProgress", "Scanning for Palettes..."),
                    m("ul#portList"),
                    m("br"),
                    m("div.buttonList", [])
                ]),
                m("br"),
                m("div#firmwareUpdateSpinner")
            ])
        ])
    ]);

    if (global.advancedPortScan) {
        scanPorts();
    }

    modalUtils.afterOpenModal();

}

async function closePortPromise(port) {
    return new Promise(function (resolve, reject) {
        if (!port.isOpen) {
            resolve();
            return;
        }
        port.close(function (err) {
            if (err) {
                reject(err)
            } else {
                resolve();
            }
        });
    });
}

async function resetPortList() {
    for (let port in activePorts) {
        if (activePorts.hasOwnProperty(port)) {
            await closePortPromise(activePorts[port].serialPort);
        }
    }
    activePorts = {};
    let spinner = document.getElementById("scanningProgress");
    spinner.innerText = "Scanning for Palettes...";
    spinner.style.display = "";
    m.render(document.getElementById("portList"), []);
}

function disableButtons() {
    document.getElementById("closeButton").disabled = true;
    let latestButtons = document.getElementsByClassName("installLatest");
    let fileButtons = document.getElementsByClassName("loadHexFile");
    for (let i = 0; i < latestButtons.length; i++) {
        latestButtons[i].disabled = true;
    }
    for (let i = 0; i < fileButtons.length; i++) {
        fileButtons[i].disabled = true;
    }
    window.removeEventListener("keydown", modalUtils.closeModalHandler);
}

function enableButtons() {
    document.getElementById("closeButton").disabled = false;
    let latestButtons = document.getElementsByClassName("installLatest");
    let fileButtons = document.getElementsByClassName("loadHexFile");
    for (let i = 0; i < latestButtons.length; i++) {
        latestButtons[i].disabled = false;
    }
    for (let i = 0; i < fileButtons.length; i++) {
        fileButtons[i].disabled = false;
    }
    window.addEventListener("keydown", modalUtils.closeModalHandler);
}

function updateFromServer(isPalettePlus, port) {
    const Updater = require("./updater");
    disableButtons();
    let progress = document.getElementById("firmwareUpdateSpinner");
    progress.innerText = "";
    progress.style.display = "block";

    progress.innerText = "Downloading";
    Updater.getLatestFirmwareHex(isPalettePlus, function (err, path) {
        if (err) {
            progress.style.display = "";
            enableButtons();
            dialog.showMessageBox(BrowserWindow.fromId(2), {
                type: "warning",
                message: err.message,
                detail: err.detail,
                buttons: ["OK"]
            }, function () {});
        } else {
            progress.innerText = "Flashing";
            queuedFlashPort = port;
            queuedFlashPath = path;
            queuedFlashDeviceType = (isPalettePlus ? "Palette+" : "Palette");
        }
    });
}

function selectVersionAndUpdate(isPalettePlus, port) {
    const Updater = require("./updater");
    Updater.getAllFirmwareVersions(isPalettePlus, function (err, versions) {
        if (err) {
            dialog.showMessageBox(BrowserWindow.fromId(2), {
                type: "warning",
                message: "Unable to flash firmware",
                detail: err.toString(),
                buttons: ["OK"]
            }, function () {});
        } else if (versions.length === 0) {
            dialog.showMessageBox(BrowserWindow.fromId(2), {
                type: "warning",
                message: "Unable to flash firmware",
                detail: "No firmware versions available",
                buttons: ["OK"]
            }, function () {});
        } else {
            let buttons = ["Cancel"];
            versions = versions.slice(0, 5);
            for (let i = 0; i < versions.length; i++) {
                buttons.push(versions[i].version);
            }
            dialog.showMessageBox(BrowserWindow.fromId(2), {
                type: "info",
                message: "Select firmware version",
                cancelId: 0,
                defaultId: 1,
                buttons: buttons
            }, function (choice) {
                if (choice === 0) {
                    return;
                }
                choice--;

                disableButtons();
                let progress = document.getElementById("firmwareUpdateSpinner");
                progress.innerText = "";
                progress.style.display = "block";

                progress.innerText = "Downloading";
                Updater.getFirmwareHex(versions[choice], function (err, path) {
                    if (err) {
                        progress.style.display = "";
                        enableButtons();
                        dialog.showMessageBox(BrowserWindow.fromId(2), {
                            type: "warning",
                            message: err.message,
                            detail: err.detail,
                            buttons: ["OK"]
                        }, function () {});
                    } else {
                        progress.innerText = "Flashing";
                        queuedFlashPort = port;
                        queuedFlashPath = path;
                        queuedFlashDeviceType = (isPalettePlus ? "Palette+" : "Palette");
                    }
                });
            });
        }
    });
}

function selectFile(port) {
    dialog.showOpenDialog(BrowserWindow.fromId(2), {
        filters: [{
            name: "Hex file",
            extensions: ["hex"]
        }]
    }, function (filenames) {
        if (filenames === undefined) {
            return;
        }
        let progress = document.getElementById("firmwareUpdateSpinner");
        progress.innerText = "Flashing";
        progress.style.display = "block";
        disableButtons();
        queuedFlashPort = port;
        queuedFlashPath = filenames[0];
    });
}

function flashFile(port, path, callback) {
    if (portScanDebug) {
        log("PORT " + port + " FLASH BEGIN");
    }
    let avrgirl = new Avrgirl({
        board: "mega",
        port: port,
        debug: portScanDebug
    });
    avrgirl.flash(path, callback);
}

let queuedFlashPort = null;
let queuedFlashPath = null;
let queuedFlashDeviceType = null;
let activePorts = {};
let scanMode;

process.on("warning", function (err) {
    console.error(err);
});

async function updatePortList(scanAfter = false) {
    if (!dialogOpen) {
        await resetPortList();
        return;
    }
    let validPorts = [];
    if (global.env.type === "prebuilt") {
        validPorts.push({
            label: "dummy",
            detail: "Warning: This nonexistent device is listed only for development/testing purposes.",
            comName: null,
            serialPort: {}
        });
    }
    for (let port in activePorts) {
        if (activePorts.hasOwnProperty(port)) {
            validPorts.push(activePorts[port]);
        }
    }
    let portList = document.getElementById("portList");
    let spinner = document.getElementById("scanningProgress");
    if (portList === null || document.getElementById("open-modal").style.display === "none") {
        return;
    }
    if (validPorts.length === 0) {
        spinner.innerText = "No devices detected";
        spinner.style.display = "";
    } else {
        spinner.style.display = "none";
    }
    if (portScanDebug) {
        log("valid ports identified:");
        log(validPorts);
    }
    m.render(portList, [
        m("table", [
            m("tbody", [
                validPorts.map(function (info) {
                    return m("tr.portListItem", {
                        id: "port_" + info.comName
                    }, [
                        m("td", (info.detail ? m("div.tooltip", {
                            "data-tooltip": info.detail
                        }, info.label) : m("div", info.label))),
                        m("td", {
                            style: {
                                width: "1px",
                                "white-space": "nowrap"
                            }
                        }, [
                            m("button.installLatest.confirm", {
                                onclick: function (e) {
                                    e.target.blur();
                                    if (info.deviceType === null) {
                                        dialog.showMessageBox(BrowserWindow.fromId(2), {
                                            type: "question",
                                            message: "Select device type",
                                            detail: "Which type of device would you like to flash?",
                                            buttons: ["Cancel", "Palette", "Palette+"],
                                            defaultId: 0,
                                            cancelId: 0
                                        }, function (choice) {
                                            if (choice === 0) {
                                                return;
                                            }
                                            let isPalettePlus = (choice === 2);
                                            if (altHeld) {
                                                selectVersionAndUpdate(isPalettePlus, info.comName);
                                            } else {
                                                updateFromServer(isPalettePlus, info.comName);
                                            }
                                            altHeld = 0;
                                        });
                                    } else {
                                        let isPalettePlus = info.deviceType === "Palette+";
                                        if (altHeld) {
                                            selectVersionAndUpdate(isPalettePlus, info.comName);
                                        } else {
                                            updateFromServer(isPalettePlus, info.comName);
                                        }
                                        altHeld = 0;
                                    }
                                }
                            }, (altHeld ? "Select Version" : "Install Latest")),
                            m("button.loadHexFile", {
                                onclick: function (e) {
                                    e.target.blur();
                                    selectFile(info.comName);
                                    queuedFlashDeviceType = info.deviceType;
                                }
                            }, "Load Hex File")
                        ])
                    ])
                })
            ])
        ])
    ]);
    if (queuedFlashPort === null) {
        if (scanAfter && global.advancedPortScan) {
            setTimeout(scanPorts, 500);
        }
    } else if (activePorts[queuedFlashPort] !== undefined) {
        let deviceString = activePorts[queuedFlashPort].deviceType;
        if (!deviceString) {
            deviceString = queuedFlashDeviceType;
        }
        activePorts[queuedFlashPort].serialPort.close(function () {
            if (portScanDebug) {
                log("PORT " + queuedFlashPort + " CLOSED FOR FLASH");
            }
            flashFile(queuedFlashPort, queuedFlashPath, async function (err) {
                document.getElementById("firmwareUpdateSpinner").style.display = "";
                enableButtons();
                await resetPortList();
                if (err) {
                    dialog.showMessageBox(BrowserWindow.fromId(2), {
                        type: "warning",
                        message: "Unable to flash firmware",
                        detail: err.toString(),
                        buttons: ["OK"]
                    }, function () {});
                } else {
                    let message = "Successfully flashed firmware";
                    if (deviceString) {
                        message = "Successfully flashed " + deviceString + " firmware";
                    }
                    dialog.showMessageBox(BrowserWindow.fromId(2), {
                        type: "info",
                        message: message,
                        buttons: ["OK"]
                    }, function () {});
                }
                delete activePorts[queuedFlashPort];
                queuedFlashPort = null;
                queuedFlashPath = null;
                queuedFlashDeviceType = null;
                if (scanAfter && global.advancedPortScan) {
                    await scanPorts();
                }
            });
        });
    }
}

async function readPort(portInfo) {
    return new Promise(function (resolve, reject) {
        // port is already in the list of active ports
        if (activePorts.hasOwnProperty(portInfo.comName)) {
            resolve();
            return;
        }
        // if the port name contains "bluetooth" (Mac/Linux only), ignore it
        if (portInfo.comName.toLowerCase().indexOf("bluetooth") >= 0) {
            resolve();
            return;
        }
        // on Mac, manufacturer should be defined except for Bluetooth devices
        if (portInfo.comName.substr(0, 5) === "/dev/" && portInfo.manufacturer === undefined) {
            resolve();
            return;
        }
        // if manufacturer is defined, use it to ignore non-Arduinos
        if (portInfo.manufacturer !== undefined && portInfo.manufacturer.toLowerCase().indexOf("arduino") < 0) {
            resolve();
        }
        // open a connection to the port, assuming it's a Palette
        let comName = portInfo.comName;
        let port = new SerialPort(comName, {
            baudRate: 9600
        }, function (err) {
            if (err) {
                if (portScanDebug) {
                    log("PORT " + comName + " ERROR (1): " + err.message);
                }
                reject(err);
            }
        });
        let parser = port.pipe(new SerialPort.parsers.Readline({
            encoding: "ascii"
        }));
        let portDataTimeout;
        port.on("open", function () {
            if (portScanDebug) {
                log("PORT " + comName + " OPEN");
            }
            portDataTimeout = setTimeout(function () {
                if (portScanDebug) {
                    log("PORT " + comName + " TIMEOUT");
                }
                activePorts[comName] = {
                    label: comName,
                    deviceType: null,
                    detail: "This device could not be identified. It may be a Palette running pre-1.2 firmware.",
                    comName: comName,
                    serialPort: port
                };
                port.flush(function (err) {
                    if (err) {
                        log("PORT " + comName + " FLUSH ERROR (1): " + err.message);
                        reject(err);
                    } else {
                        resolve();
                    }
                });
            }, 2000);
        });
        port.on("error", function (err) {
            clearTimeout(portDataTimeout);
            if (portScanDebug) {
                log("PORT " + comName + " ERROR (2): " + err.message);
            }
            if (activePorts.hasOwnProperty(comName)) {
                delete activePorts[comName];
            }
            resolve();
        });
        parser.on("data", function (data) {
            clearTimeout(portDataTimeout);
            if (portScanDebug) {
                log("PORT " + comName + " DATA: " + data);
            }
            let index = data.indexOf("Palette FW");
            if (index >= 0) {
                let version = data.substr(index).split(" ")[2];
                let isPalettePlus = version.slice(-1) !== "r";
                if (version.slice(-1) === "r") {
                    version = version.slice(0, -1);
                }
                let deviceType = (isPalettePlus ? "Palette+" : "Palette");
                if (dataCollection.shouldLog()) {
                    let dataString = data.split("Copyright Mosaic Manufacturing Ltd.")[1];
                    if (typeof dataString === "string") {
                        dataString = dataString.trim();
                        if (dataString) {
                            let dataObj = PaletteDataString.fromDataStringBuffer(deviceType, version, dataString);
                            dataCollection.logPaletteStats(dataObj);
                        }
                    }
                }
                activePorts[comName] = {
                    label: deviceType + " (v" + version + ")",
                    deviceType: deviceType,
                    detail: "This device was successfully identified as a " + deviceType + " running firmware version " + version + ".",
                    comName: comName,
                    serialPort: port
                };
            } else {
                activePorts[comName] = {
                    label: comName,
                    deviceType: null,
                    detail: "This device was specifically identified as not being a Palette. However, this can occur falsely in the event of Palette data loss.",
                    comName: comName,
                    serialPort: port
                };
            }
            port.flush(function (err) {
                if (err) {
                    log("PORT " + comName + " FLUSH ERROR (2): " + err.message);
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
        port.on("close", async function (err) {
            clearTimeout(portDataTimeout);
            if (typeof err === "object" && err !== null && err.disconnected) {
                if (portScanDebug) {
                    log("PORT " + comName + " DISCONNECT");
                }
                if (activePorts.hasOwnProperty(comName)) {
                    delete activePorts[comName];
                }
            } else {
                if (portScanDebug) {
                    log("PORT " + comName + " CLOSE");
                }
                resolve();
            }
        });
    });
}

async function scanPorts() {

    if (portScanDebug) {
        log("scanning ports...");
    }

    scanMode = true;
    try {
        let ports = await SerialPort.list();
        if (ports.length === 0) {
            await updatePortList(true);
        } else {
            let portReads = ports.map(function (info) {
                return readPort(info);
            });
            await Promise.all(portReads);
            await updatePortList(true);
        }
    } catch (err) {
        let spinner = document.getElementById("scanningProgress");
        log(err);
        if (spinner !== null) {
            spinner.innerText = "An error occurred scanning for Palettes.";
        }
    }
}



exports.openModal = openModal;
