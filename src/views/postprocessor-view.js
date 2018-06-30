
const m = require("mithril");
const fs = require("fs");
const path = require("path");
const Raft = require("raft-js");

const Electron = require("electron");
const BrowserWindow = Electron.remote.BrowserWindow;
const dialog = Electron.remote.dialog;

const config = require("../config");
const dataCollection = require("../models/data-collection");
const FormValidation = require("./form-validation");
const GPX = require("./gpx");
const MSF = require("../models/msf");
const Print = require("../models/print");
const profiles = require("../models/printer-profiles");
const PrinterPresets = require("../models/printer-presets");
const LoadingView = require("./loading-view");
const MaterialMatrix = require("../models/material-matrix");
const FileImages = require("../models/file-images");
const menu = require("./menu");
const menuUtils = require("./menu-utils");
const modalUtils = require("./modal-utils");
const PrinterProfileView = require("./printer-profile-view");
const SetupView = require("./setup-view");
const Visualizer = require("./visualizer");
const utils = require("../utils");

const TRANSITION_TOWER = require("../models/common").TRANSITION_TOWER;
const SIDE_TRANSITIONS = require("../models/common").SIDE_TRANSITIONS;
const NO_TRANSITIONS = require("../models/common").NO_TRANSITIONS;

const defaultDriveColors = ["#4325C6", "#FF7C13", "#0EB7B1", "#FFD213"];
let selectedDriveColors = [1, 1, 1, 1];
let materials = [null, null, null, null];


let openDialogOpen = false;
let saveDialogOpen = false;

function displayWarningDialog(err) {
    let message = err.message;
    let detail = err.detail;
    if (err instanceof Raft.InstructionSyntaxError) {
        message = "Syntax error encountered";
        detail = "Line " + err.lineNumber + ": " + err.message;
    }
    dialog.showMessageBox(BrowserWindow.fromId(2), {
        type: "warning",
        message: message,
        detail: detail,
        buttons: ["OK"],
        defaultId: 0
    }, function () {});
}

function shouldInvalidateTower(drive, driveColor) {
    if (global.print && global.print._tower
        && global.print._printerProfile.transitionSettings.purgeLength > global.print._printerProfile.transitionSettings.minPurgeLength) {
        if (!global.print._tower.driveColorStrengths) {
            if (MSF.colorInfo[driveColor].strength !== 1) {
                return true;
            }
        } else if (global.print._tower.driveColorStrengths[drive] !== MSF.colorInfo[driveColor].strength) {
            return true;
        }
    }
    return false;
}

function initialize() {
    let profileDropdown = getProfileDropdown();
    m.render(document.getElementById("content"), [
        m("div#profileSetupWindow"),
        m("div#loadingView", [
            m("div#loadingMessage", [
                m("svg", {
                    height: 400,
                    width: 500
                }, [
                    m("polygon", {
                        points: "239,23 299,209 255,230 213,106",
                        style: "fill: #a700ff; stroke: #a700ff; stroke-width: 1"
                    }),
                    m("polygon", {
                        points: "212,108 155,276 255,230",
                        style: "fill: #fede00; stroke: #fede00; stroke-width: 1"
                    }),
                    m("polygon", {
                        points: "110,297 255,230 294,353 93,354",
                        style: "fill: #00eec9; stroke: #00eec9; stroke-width: 1"
                    })
                ])
            ])
        ]),
        m("div#vizBox"),
        m("div.topbar", [
            m("div#tutorial"),
            m("div.leftTools", [

                m("div.printerSelect", [
                    m("select#mainPrinterSelect", {
                        tabindex: -1,
                        config: function (el) {
                            if (profiles.getProfileCount() === 0) {
                                el.style.display = "none";
                            }
                        },
                        onchange: async function (event) {
                            event.target.blur();
                            let index = event.target.selectedIndex;
                            profiles.setActiveProfileIndex(index);
                            config.writeConfigFile();
                            Visualizer.drawPrintBed(profiles.getActiveProfile());
                            if (index > 0 && global.print !== null) {
                                global.print.printer = profiles.getActiveProfile();
                                await updateCurrentPrint();
                            }
                        }
                    }, profileDropdown),
                    m("button#editActivePrinter", {
                        style: {
                            "margin-left": "10px"
                        },
                        title: "Edit Printer Profile",
                        tabindex: -1,
                        config: function (el) {
                            if (profiles.getProfileCount() === 0) {
                                el.style.display = "none";
                            }
                        },
                        onclick: function (e) {
                            PrinterProfileView.editPrinterModal(profiles.getActiveProfile(), function () {
                                PrinterProfileView.closeModal();
                            });
                            e.target.blur();
                        }
                    })
                ]),

                m("div.divider"),

                m("div#loadCodeWrapper", [
                    m("button#loadCode", {
                        tabindex: -1,
                        onclick: function (e) {
                            e.target.blur();
                            selectFile();
                        }
                    }, "Load Print")
                ]),

                m("div.divider"),

                m("datalist#colorStrengthSteps", [
                    m("option", "0"),
                    m("option", "1"),
                    m("option", "2")
                ]),

                [0, 1, 2, 3].map(function (drive) {
                    return m("div#drive" + (drive + 1) + ".driveColor", {
                        style: {
                            display: "none"
                        }
                    }, [
                        m("button#drive" + (drive + 1) + "button.driveColorButton", {
                            title: "Click to customize",
                            tabindex: -1,
                            style: {
                                "background-color": "rgba("
                                + parseInt(defaultDriveColors[drive].substr(1, 2), 16)
                                + ","
                                + parseInt(defaultDriveColors[drive].substr(3, 2), 16)
                                + ","
                                + parseInt(defaultDriveColors[drive].substr(5, 2), 16)
                                + ",0.5)",
                                color: "transparent"
                            },
                            onclick: function () {
                                let dropdown = document.getElementById("drive" + (drive + 1) + "options");
                                let colorDropdowns = document.getElementsByClassName("driveOptions");
                                let materialDropdowns = document.getElementsByClassName("driveMaterials");
                                Array.prototype.forEach.call(colorDropdowns, function (el) {
                                    if (el === dropdown) {
                                        if (el.classList.contains("hidden")) {
                                            el.classList.remove("hidden");
                                        } else {
                                            el.classList.add("hidden");
                                        }
                                    } else if (!el.classList.contains("hidden")) {
                                        el.classList.add("hidden");
                                    }
                                });
                                Array.prototype.forEach.call(materialDropdowns, function (el) {
                                    if (!el.classList.contains("hidden")) {
                                        el.classList.add("hidden");
                                    }
                                });
                            }
                        }),
                        m("div#drive" + (drive + 1) + "options.driveOptions.hidden", [
                            MSF.colorInfo.map(function (colorInfo, index) {
                                if (colorInfo.label === "Unused") {
                                    return [];
                                }
                                if (colorInfo.value >= 14 && drive + 14 !== colorInfo.value) {
                                    return [];
                                }
                                let title;
                                if (colorInfo.label === "Default") {
                                    title = "Clear selected color";
                                } else {
                                    title = colorInfo.label;
                                }
                                let style = {};
                                if (colorInfo.label === "Default") {
                                    style.backgroundColor = "#ffffff";
                                } else if (colorInfo.value >= 14) {
                                    style.width = "44px";
                                    style.fontSize = "0.75em";
                                    style.paddingTop = "2px";
                                    style.backgroundColor = "#ffffff";
                                    style.borderColor = "#444444";
                                } if (colorInfo.transparent) {
                                    style.background = "repeating-linear-gradient(135deg, " + colorInfo.color + ", " + colorInfo.color + " 13px, #f00 13px, #f00 15px)";
                                } else {
                                    style.backgroundColor = colorInfo.color;
                                }
                                if (colorInfo.label === "White") {
                                    style.borderColor = "#444444";
                                }
                                if (index > 1 && selectedDriveColors[drive] === index) {
                                    style.boxShadow = "0 0 5px 2px rgb(94, 158, 215)";
                                }
                                let buttonLabel = "";
                                if (colorInfo.buttonLabel) {
                                    buttonLabel = colorInfo.buttonLabel;
                                } else if (colorInfo.label === "Default") {
                                    style.backgroundImage = "url('../assets/visualizer/reset.svg')";
                                    style.backgroundSize = "contain";
                                    style.backgroundPosition = "center";
                                    style.backgroundRepeat = "no-repeat";
                                    style.opacity = 0.75;
                                }
                                return m("div.driveOption#drive" + (drive + 1) + "Option" + index, {
                                    "data-value": index,
                                    title: title,
                                    style: style,
                                    onclick: function (event) {
                                        let value = parseInt(event.target.dataset.value);
                                        if (value < 14) {
                                            for (let i = 1; i < MSF.colorInfo.length; i++) {
                                                if (i >= 14 && drive + 14 !== i) {
                                                    continue;
                                                }
                                                document.getElementById("drive" + (drive + 1) + "Option" + i).style.boxShadow = null;
                                            }
                                            if (value > 1) {
                                                event.target.style.boxShadow = "0 0 5px 2px rgb(94, 158, 215)";
                                            }
                                        }
                                        if (value >= 14) {
                                            setCustomColor(drive, event.target);
                                        } else {
                                            if (global.print !== null && profiles.getActiveProfileIndex() > 0) {
                                                let color;
                                                let slider = document.getElementById("drive" + (drive + 1) + "ColorStrengthSlider");
                                                if (value === 1) {
                                                    color = {
                                                        value: 1,
                                                        label: "Click to customize",
                                                        color: defaultDriveColors[drive]
                                                    };
                                                    slider.value = 1;
                                                    slider.disabled = true;
                                                } else {
                                                    color = MSF.colorInfo[value];
                                                    slider.value = MSF.colorInfo[value].strength;
                                                    slider.disabled = false;
                                                }
                                                changeVisualizerColor(drive, color);
                                                if (shouldInvalidateTower(drive, value)) {
                                                    updateCurrentPrint(false, false);
                                                }
                                            }
                                        }
                                    }
                                }, buttonLabel);
                            }),
                            m("div.range.colorStrengthSlider#drive" + (drive + 1) + "ColorStrengthSliderContainer", {
                                style: {
                                    display: (global.advancedMode && profiles.getActiveProfile()
                                    && (profiles.getActiveProfile().transitionSettings.purgeLength > profiles.getActiveProfile().transitionSettings.minPurgeLength) ? null : "none")
                                }
                            }, [
                                m("input[type='range']#drive" + (drive + 1) + "ColorStrengthSlider", {
                                    list: "colorStrengthSteps",
                                    min: 0,
                                    max: 2,
                                    step: 1,
                                    value: selectedDriveColors[drive].strength,
                                    disabled: selectedDriveColors[drive] <= 1,
                                    oninput: function (event) {
                                        let value = parseInt(event.target.value);
                                        let thisDriveColor = selectedDriveColors[drive];
                                        MSF.colorInfo[thisDriveColor].strength = value;
                                        for (let i = 0; i < 4; i++) {
                                            if (selectedDriveColors[i] === thisDriveColor) {
                                                document.getElementById("drive" + (i + 1) + "ColorStrengthSlider").value = value;
                                            }
                                        }
                                        config.writeConfigFile();
                                        if (shouldInvalidateTower(drive, thisDriveColor)) {
                                            updateCurrentPrint(false, false);
                                        }
                                    }
                                }),
                                m("div.rangeMinLabel", "Weak"),
                                m("div.rangeMaxLabel", "Strong"),
                                m("div.clearfix")
                            ])
                        ]),
                        m("div.driveMaterialSelect#drive" + (drive + 1) + "materialSelect", {
                            title: "Select material",
                            onclick: function () {
                                let dropdown = document.getElementById("drive" + (drive + 1) + "materials");
                                let colorDropdowns = document.getElementsByClassName("driveOptions");
                                let materialDropdowns = document.getElementsByClassName("driveMaterials");
                                Array.prototype.forEach.call(colorDropdowns, function (el) {
                                    if (!el.classList.contains("hidden")) {
                                        el.classList.add("hidden");
                                    }
                                });
                                Array.prototype.forEach.call(materialDropdowns, function (el) {
                                    if (el === dropdown) {
                                        if (el.classList.contains("hidden")) {
                                            el.classList.remove("hidden");
                                        } else {
                                            el.classList.add("hidden");
                                        }
                                    } else if (!el.classList.contains("hidden")) {
                                        el.classList.add("hidden");
                                    }
                                });
                            }
                        }, [
                            m("div.driveMaterials.hidden#drive" + (drive + 1) + "materials", {
                                onclick: function (e) {
                                    e.stopPropagation();
                                }
                            })
                        ], m("div.driveMaterialLabel#drive" + (drive + 1) + "materialLabel", ""))
                    ]);
                })

            ]),

            m("div.rightTools", [

                m("button#processCode", {
                    tabindex: -1,
                    disabled: !global.print,
                    onclick: function (e) {
                        e.target.blur();
                        saveFile()
                    }
                }, "Save for Printer")
            ]),

            m("button.confirm#forceRegenerateTower", {
                tabindex: -1,
                style: {
                    display: "none"
                },
                onclick: function (e) {
                    e.target.blur();
                    for (let i = 0; i < 4; i++) {
                        if (!document.getElementById("drive" + (i + 1) + "options").classList.contains("hidden")) {
                            document.getElementById("drive" + (i + 1) + "options").classList.add("hidden");
                        }
                    }
                    updateCurrentPrint(true);
                    e.target.style.display = "none";
                    if (!global.print.outputPermanentlyDisabled) {
                        enableOutput();
                    }
                }
            }, "Regenerate Tower")

        ]),
        m("div#open-modal"),
        m("div#updateAnimation", [
            m("div#updateAnimationProgressBar", [
                m("div#updateAnimationProgress")
            ]),
            "Update downloading"
        ]),
        m("div#updateNotifications")
    ]);
    updateMaterialDropdowns();
    Visualizer.initialize(document.getElementById("vizBox"));

    if (profiles.getProfileCount() === 0) {
        setTimeout(require("./setup-view").openSetupWindow, 0);
    } else if (global.firstRun) {
        setTimeout(require("./setup-view").startTutorial, 400);
    }

    window.addEventListener("printWarning", function (event) {
        displayWarningDialog(event.detail);
    });

}

async function drawPrint() {
    if (profiles.getActiveProfileIndex() > 0) {
        await Visualizer.drawPrint(global.print, profiles.getActiveProfile());
    } else {
        await Visualizer.drawPrint(global.print, {
            printBedDimensions: {
                originMiddle: true,
                circular: false,
                x: 250,
                y: 140
            }
        });
    }
}

function setCustomColor(driveNumber, swatchElement) {

    modalUtils.beforeOpenModal();

    let hex = MSF.colorInfo[selectedDriveColors[driveNumber]].color;
    if (selectedDriveColors[driveNumber] === 1) {
        hex = defaultDriveColors[driveNumber];
    }
    let colorName = "";
    if (selectedDriveColors[driveNumber] > 1) {
        colorName = MSF.colorInfo[selectedDriveColors[driveNumber]].label;
    }

    let modalWindow = document.getElementById("open-modal");
    m.render(modalWindow, [
        m("div.container", [
            m("div.save", [
                m("h2", "Select Custom Color"),
                m("span#errorText"),
                m("br"),

                m("table", [
                    m("tbody", [
                        m("tr", [
                            m("th", [
                                m("label[for='colorValue']", "Color")
                            ]),
                            m("td", [
                                m("div#colorValueError.formError", [
                                    m("input#colorValue.formInput.formInputColor", {
                                        type: "color",
                                        value: hex,
                                        onchange: function (event) {
                                            hex = event.target.value;
                                        }
                                    })
                                ])
                            ])
                        ]),
                        m("tr", [
                            m("th", [
                                m("label[for='colorName']", "Name")
                            ]),
                            m("td", [
                                m("div#colorNameError.formError", [
                                    m("input#colorName.formInput", {
                                        maxlength: 12,
                                        value: colorName,
                                        oninput: function (event) {
                                            let name = event.target.value;
                                            if (name.trim() === "") {
                                                FormValidation.showValidationError(event.target.parentElement, "Enter a color name!")
                                            } else if (name.includes(";") || name.includes(":")) {
                                                FormValidation.showValidationError(event.target.parentElement, "Color names cannot contain colons (:) or semicolons (;).")
                                            } else if (name.includes("\\") || name.includes("/")) {
                                                FormValidation.showValidationError(event.target.parentElement, "Color names cannot contain slashes (/ or \\).")
                                            } else {
                                                FormValidation.resetValidationError(event.target.parentElement);
                                                colorName = event.target.value;
                                            }
                                        }
                                    })
                                ])
                            ])
                        ])
                    ])
                ]),
                m("button", {
                    onclick: function (e) {
                        e.target.blur();
                        modalUtils.closeModal();
                    }
                }, "Cancel"),
                m("button.confirm", {
                    style: {
                        float: "right"
                    },
                    onclick: function (e) {
                        e.target.blur();

                        let validationErrorsExist = false;

                        if (colorName === "") {
                            validationErrorsExist = true;
                            FormValidation.showValidationError(document.getElementById("colorNameError"));
                        }

                        if (!validationErrorsExist) {
                            selectedDriveColors[driveNumber] = driveNumber + 14;
                            swatchElement.style.backgroundColor = hex;
                            MSF.colorInfo[driveNumber + 14].color = hex;
                            MSF.colorInfo[driveNumber + 14].label = colorName;
                            for (let i = 2; i < 14; i++) {
                                document.getElementById("drive" + (driveNumber + 1) + "Option" + i).style.boxShadow = null;
                            }
                            let r = parseInt(hex.substr(1, 2), 16);
                            let g = parseInt(hex.substr(3, 2), 16);
                            let b = parseInt(hex.substr(5, 2), 16);
                            let labelWhite = utils.contrastColorUseWhite(r, g, b);
                            let thisCustomSwatch = document.getElementById("drive" + (driveNumber + 1) + "Option" + (driveNumber + 14));
                            thisCustomSwatch.style.boxShadow = "0 0 5px 2px rgb(94, 158, 215)";
                            thisCustomSwatch.style.color = (labelWhite ? "#fff" : "#000");
                            if (global.advancedMode) {
                                document.getElementById("drive" + (driveNumber + 1) + "ColorStrengthSlider").disabled = false;
                            }
                            changeVisualizerColor(driveNumber, {
                                value: driveNumber + 14,
                                color: hex,
                                label: colorName,
                                transparent: false
                            });
                            modalUtils.closeModal();
                        }

                    }
                }, "Save")
            ])
        ])
    ]);

    modalUtils.afterOpenModal();

}

function checkValidMaterialCombination(driveNumber, newMaterial, existingMaterials) {
    let materials = existingMaterials.slice();
    materials[driveNumber] = newMaterial;
    let conflicts = [];
    let emptyAlgorithms = [];
    for (let z in global.print.transitionInfo) {
        if (global.print.transitionInfo.hasOwnProperty(z)) {
            for (let transition of global.print.transitionInfo[z]) {
                let ingoing = materials[transition.to];
                let outgoing = materials[transition.from];
                if (ingoing !== null && outgoing !== null) {
                    let spliceSettings = MaterialMatrix.matrix.matrix[ingoing].combinations[outgoing];
                    if (spliceSettings === null) {
                        if (newMaterial === ingoing) {
                            if (conflicts.indexOf(outgoing) < 0) {
                                conflicts.push(outgoing);
                            }
                        } else {
                            if (conflicts.indexOf(ingoing) < 0) {
                                conflicts.push(ingoing);
                            }
                        }
                    } else if (spliceSettings.heatFactor === 0 || spliceSettings.compressionFactor === 0) {
                        let emptyAlgCombo = ingoing + " to " + outgoing;
                        if (emptyAlgorithms.indexOf(emptyAlgCombo) < 0) {
                            emptyAlgorithms.push(emptyAlgCombo);
                        }
                    }
                }
            }
        }
    }
    return {
        conflicts: conflicts,
        emptyAlgorithms: emptyAlgorithms
    };
}

function changeVisualizerColor(driveNumber, colorInfo) {
    let driveButton = document.getElementById("drive" + (driveNumber + 1) + "button");
    if (colorInfo.transparent) {
        driveButton.style.backgroundColor = "";
        driveButton.style.background = "repeating-linear-gradient(135deg, " + colorInfo.color + ", " + colorInfo.color + " 13px, #f00 13px, #f00 15px)";
    } else {
        driveButton.style.background = "";
        if (colorInfo.value === 1) {
            driveButton.style.backgroundColor = "rgba("
                + parseInt(colorInfo.color.substr(1, 2), 16)
                + ","
                + parseInt(colorInfo.color.substr(3, 2), 16)
                + ","
                + parseInt(colorInfo.color.substr(5, 2), 16)
                + ",0.5)";
        } else {
            driveButton.style.backgroundColor = colorInfo.color;
        }
    }
    driveButton.title = colorInfo.label;
    selectedDriveColors[driveNumber] = colorInfo.value;
    Visualizer.changeDriveColor(driveNumber, colorInfo);
}

function updateColorStrengthSliders() {
    if (global.advancedMode && profiles.getActiveProfile()
        && (profiles.getActiveProfile().transitionSettings.purgeLength > profiles.getActiveProfile().transitionSettings.minPurgeLength)) {
        for (let i = 0; i < 4; i++) {
            document.getElementById("drive" + (i + 1) + "ColorStrengthSliderContainer").style.display = null;
        }
    } else {
        for (let i = 0; i < 4; i++) {
            document.getElementById("drive" + (i + 1) + "ColorStrengthSliderContainer").style.display = "none";
        }
    }
}

function selectFile() {
    if (openDialogOpen || saveDialogOpen) {
        return;
    }
    openDialogOpen = true;
    let allFormats = [];
    let filters = [];
    let currentProfileParsers = profiles.getActiveProfile().inputParsers;
    currentProfileParsers.forEach(function (id) {
        let info = PrinterPresets.getParserInfo(id);
        allFormats.push(info.id);
        filters.push({
            name: info.displayName,
            extensions: [info.id]
        });
    });
    filters.unshift({
        name: "Print files",
        extensions: allFormats
    });
    dialog.showOpenDialog(BrowserWindow.fromId(2), {
        filters: filters
    }, function (filenames) {
        openDialogOpen = false;
        if (filenames === undefined) {
            return;
        }
        openFile(filenames[0]);
    });
}

function closeFile() {
    global.print = null;
    disableOutput();
    let mainWindow = BrowserWindow.fromId(2);
    mainWindow.setTitle("Chroma");
    if (process.platform === "darwin") {
        mainWindow.setRepresentedFilename("");
    }
    document.getElementById("mainPrinterSelect").disabled = false;
    Visualizer.undrawPrint();
    updateDriveIcons();
    updateMaterialDropdowns();
    m.render(document.getElementById("loadCodeWrapper"), [
        m("button#loadCode", {
            tabindex: -1,
            onclick: function (e) {
                e.target.blur();
                selectFile();
            }
        }, "Load Print")
    ]);
}

function updateDriveIcons() {
    for (let i = 0; i < 4; i++) {
        if (global.print === null || !global.print.drivesUsed[i]) {
            document.getElementById("drive" + (i + 1)).style.display = "none";
        } else {
            document.getElementById("drive" + (i + 1)).style.display = "";
        }
    }
}

function enableOutput() {
    document.getElementById("processCode").disabled = false;
    menu.enableSave();
}

function disableOutput() {
    document.getElementById("processCode").disabled = true;
    menu.disableSave();
}

async function openFile(filepath) {
    materials = [null, null, null, null];
    for (let i = 1; i <= 4; i++) {
        document.getElementById("drive" + i + "materialLabel").innerText = "";
        document.getElementById("drive" + i + "materials").classList.add("hidden");
        document.getElementById("drive" + i + "materialNone").style.display = "none";
    }

    let activeProfile = profiles.getActiveProfile();
    if (activeProfile === null) {
        displayWarningDialog({
            message: "No profile selected",
            detail: "To process files, you must first select a printer profile from the dropdown."
        });
        return;
    }
    if (activeProfile.nozzleDiameter === 0) {
        PrinterProfileView.editPrinterModal(activeProfile, function () {
            PrinterProfileView.closeModal();
        }, 0);
        displayWarningDialog({
            message: "Incomplete profile settings",
            detail: "Your printer profile needs some additional settings filled in, under the Printer tab:\n- Base Model (if available)\n- Firmware\n- Nozzle Diameter\n- Compatible Files"
        });
        return;
    }

    document.getElementById("mainPrinterSelect").disabled = true;
    updateMaterialDropdowns();

    let basename = path.basename(filepath.substr(0, filepath.lastIndexOf(".")));
    let mainWindow = BrowserWindow.fromId(2);
    mainWindow.setTitle((basename.length > 80 ? basename.substr(0, 80) + "..." : basename) + " — Chroma");
    if (process.platform === "darwin") {
        mainWindow.setRepresentedFilename(filepath);
    }
    window.dispatchEvent(new Event("input-load-start"));
    menu.disableModalActions();
    // create a new print
    await LoadingView.start(12, "Breaking down your print");
    await LoadingView.increment("Breaking down your print");
    try {
        let printExtruder = 0;
        if (global.advancedMode && profiles.getActiveProfile().extruderCount > 1) {
            if (profiles.getActiveProfile().printExtruder === false) {
                let buttons = [];
                let extruderCount = profiles.getActiveProfile().extruderCount;
                for (let i = 0; i < extruderCount; i++) {
                    if (process.platform === "darwin") {
                        buttons.unshift("T" + i);
                    } else {
                        buttons.push("T" + i);
                    }
                }
                let choice = dialog.showMessageBox(BrowserWindow.fromId(2), {
                    type: "question",
                    message: "Select Extruder for Print",
                    detail: "Which extruder would you like to print with?\n\n(You can set a default for this by editing your printer profile under Printer > Printing Extruder.)",
                    buttons: buttons,
                    defaultId: (process.platform === "darwin" ? extruderCount - 1 : 0)
                });
                if (process.platform === "darwin") {
                    printExtruder = extruderCount - 1 - choice;
                } else {
                    printExtruder = choice;
                }
            } else {
                printExtruder = profiles.getActiveProfile().printExtruder;
            }
        }
        global.print = new Print(filepath, profiles.getActiveProfile(), printExtruder);
        if (global.env.dev) {
            console.log(global.print);
        }
        await global.print.runPreFlight(false, LoadingView);
        await updateCurrentPrint(true);
        m.render(document.getElementById("loadCodeWrapper"), [
            m("button#loadCode", {
                tabindex: -1,
                onclick: function (e) {
                    e.target.blur();
                    dialog.showMessageBox(BrowserWindow.fromId(2), {
                        type: "question",
                        message: "Close file",
                        detail: "Are you sure you want to close the loaded print?",
                        buttons: ["Close", "Cancel"],
                        defaultId: 0,
                        cancelId: 1
                    }, function (choice) {
                        if (choice === 0) {
                            closeFile();
                        }
                    });
                }
            }, "Close Print"),
        ]);
    } catch (err) {
        if (global.env.dev) {
            console.error(err);
        }
        closeFile();
        menu.enableModalActions();
        LoadingView.done();
        setTimeout(function () {
            displayWarningDialog(err);
        }, 100);
    }
}

function getDriveColorStrengths(driveColors) {
    return driveColors.map((colorIndex) => MSF.colorInfo[colorIndex].strength);
}

async function updateCurrentPrint(forceRegenerateTower = false, allowRegenerateTowers = true) {
    if (global.print.outputPermanentlyDisabled) {
        return;
    }
    let towerWillRegenerate = (
        (!global.advancedMode || profiles.getActiveProfile().transitionSettings.type === TRANSITION_TOWER)
        && ((global.autoRegenerateTowers && allowRegenerateTowers) || forceRegenerateTower)
    );
    Visualizer.undrawTransitionTower();
    if (!LoadingView.inProgress() && towerWillRegenerate) {
        menu.disableModalActions();
        await LoadingView.start(5, "");
    }
    if (profiles.getProfileCount() > 0 && profiles.getActiveProfileIndex() > 0
        && (!global.advancedMode || profiles.getActiveProfile().transitionSettings.type === TRANSITION_TOWER)) {
        if (allowRegenerateTowers && (global.autoRegenerateTowers || forceRegenerateTower)) {
            let driveColorStrengths = null;
            if (global.advancedMode && (profiles.getActiveProfile().transitionSettings.purgeLength > profiles.getActiveProfile().transitionSettings.minPurgeLength)) {
                driveColorStrengths = getDriveColorStrengths(selectedDriveColors);
            }
            document.getElementById("forceRegenerateTower").style.display = "none";
            try {
                if (global.print._tower) {
                    delete global.print._tower;
                }
                await global.print.addTowers(LoadingView, driveColorStrengths);
                await drawPrint();
                updateDriveIcons();
                menu.enableModalActions();
                enableOutput();
                if (LoadingView.inProgress()) {
                    LoadingView.done();
                }
                window.dispatchEvent(new Event("input-load-end"));
            } catch (err) {
                if (global.env.dev) {
                    console.error(err);
                }
                LoadingView.done();
                await drawPrint();
                menu.enableModalActions();
                disableOutput();
                displayWarningDialog(err);
            }
        } else {
            disableOutput();
            if (global.print._tower) {
                delete global.print._tower;
            }
            updateDriveIcons();
            document.getElementById("forceRegenerateTower").style.display = null;
            menu.enableModalActions();
            disableOutput();
            if (LoadingView.inProgress()) {
                LoadingView.done();
            }
        }
    } else if (profiles.getProfileCount() > 0 && profiles.getActiveProfileIndex() > 0
        && global.advancedMode && profiles.getActiveProfile().transitionSettings.type === SIDE_TRANSITIONS) {
        await LoadingView.increment("Generating side transitions");
        if (global.print._tower) {
            delete global.print._tower;
        }
        document.getElementById("forceRegenerateTower").style.display = "none";
        await drawPrint();
        updateDriveIcons();
        menu.enableModalActions();
        enableOutput();
        LoadingView.done();
        window.dispatchEvent(new Event("input-load-end"));
    } else if (profiles.getProfileCount() > 0 && profiles.getActiveProfileIndex() > 0
        && global.advancedMode && profiles.getActiveProfile().transitionSettings.type === NO_TRANSITIONS) {
        if (global.print._tower) {
            delete global.print._tower;
        }
        document.getElementById("forceRegenerateTower").style.display = "none";
        await drawPrint();
        updateDriveIcons();
        menu.enableModalActions();
        enableOutput();
        LoadingView.done();
        window.dispatchEvent(new Event("input-load-end"));
    } else {
        menu.enableModalActions();
        disableOutput();
        await drawPrint();
        updateDriveIcons();
        LoadingView.done();
    }
}

async function saveFile() {
    if (openDialogOpen || saveDialogOpen) {
        return;
    }
    if (global.print) {
        let someMaterialsSet = false;
        let allMaterialsSet = true;
        global.print.drivesUsed.forEach(function (driveUsed, drive) {
            if (driveUsed) {
                if (materials[drive] === null) {
                    allMaterialsSet = false;
                } else {
                    someMaterialsSet = true;
                }
            }
        });
        if (someMaterialsSet && !allMaterialsSet) {
            dialog.showMessageBox(BrowserWindow.fromId(2), {
                type: "error",
                message: "Select remaining materials",
                detail: "Not all materials have been selected. Please select the remaining materials before continuing.",
                buttons: ["OK"],
                defaultId: 0
            }, function () {});
            return;
        }
        saveDialogOpen = true;
        let saveDialogOptions = {};
        if (global.env.oem) {
            saveDialogOptions = {
                defaultPath: path.join(global.print.inputDir, (global.print.inputName + ".oem" + global.print.inputExt)),
                title: "Save print file",
                filters: [{
                    name: global.print.inputExt,
                    extensions: [global.print.inputExt.substr(1)]
                }]
            };
        } else {
            saveDialogOptions = {
                defaultPath: path.join(global.print.inputDir, (global.print.inputName + ".msf")),
                title: "Save MSF file",
                filters: [{
                    name: "MSF",
                    extensions: ["msf"]
                }]
            };
        }
        let gpxConfigMissing = GPX.checkGPXConfigMissing(global.print._printerProfile);
        if (gpxConfigMissing) {
            saveDialogOpen = false;
            return;
        }
        dialog.showSaveDialog(BrowserWindow.fromId(2), saveDialogOptions, async function (msfPath) {
            if (msfPath === undefined) {
                saveDialogOpen = false;
            } else {
                menu.disableModalActions();
                let basename = path.basename(msfPath);
                if (!global.env.oem && basename.length > 63) {
                    let msfTrim = basename.slice(0, 59) + ".msf";
                    msfPath = msfPath.replace(basename, msfTrim);
                }
                window.dispatchEvent(new Event("output-save-start"));
                await LoadingView.start(global.print.printLayerHeights.length + 4, "Generating output files");
                try {
                    let msfMaterials = materials;
                    if (!someMaterialsSet) {
                        global.print.drivesUsed.forEach(function (driveUsed, drive) {
                            if (driveUsed) {
                                msfMaterials[drive] = "Default PLA";
                            }
                        });
                    }
                    let msf = await global.print.createOutput(selectedDriveColors, msfMaterials, LoadingView, getDriveColorStrengths(selectedDriveColors));
                    await LoadingView.increment("Saving files");
                    if (!global.env.oem) {
                        let msfOut = msf.createMSF();
                        fs.writeFileSync(msfPath, msfOut);                 // output the MSF
                    }
                    await LoadingView.increment("Saving files");
                    if (global.exportPlainMSF) {
                        let msfPlain = msf.createPlainMSF();
                        fs.writeFileSync(msfPath + ".txt", msfPlain);   // output the plain MSF
                    }
                    if (global.exportScreenshot) {
                        let screenshotPath;
                        if (global.env.oem) {
                            screenshotPath = msfPath.replace(".oem" + global.print.inputExt, ".png");
                        } else {
                            screenshotPath = msfPath.replace(".msf", ".png");
                        }
                        let screenshot = Visualizer.getScreenshot();
                        fs.writeFileSync(screenshotPath, screenshot, "base64");
                    }
                    await LoadingView.increment("Saving files");
                    let printFilePath = msfPath + global.print.inputExt;
                    if (global.env.oem) {
                        printFilePath = msfPath;
                    }
                    if (global.print._printerProfile.postprocessing === "makerbot") {
                        printFilePath = msfPath + ".makerbot";
                        let outEngine = new Raft.Makerbot5thGenEngine({
                            skipInvalidInstructions: true,
                            volumetricExtrusion: global.print._printerProfile.volumetric,
                            filamentDiameter: global.print._printerProfile.filamentDiameter,
                            initialXYZCoordinateMode: Raft.CoordinateModes.Absolute,
                            initialExtrusionCoordinateMode: Raft.CoordinateModes.Relative,
                            toolheadCount: 4,
                            initialPrintState: Raft.PrintStates.StartSequence
                        });
                        let outParser = new Raft.MakerbotParser(outEngine);
                        let outRaft = new Raft.RaftWrapper(outParser);
                        outRaft.instructions = global.print._outRaft.instructions;
                        outRaft.parser.metaJson = await global.print.getMakerbot5thGenMeta();
                        FileImages.addMakerbotImages(outRaft, function (err, outRaft) {
                            outRaft.save(printFilePath);
                            if (global.firstRun) {
                                SetupView.openPrintOffboarding(global.print, msf, printFilePath, msfPath);
                            } else {
                                menuUtils.displayPrintSummary(global.print, msf, printFilePath, msfPath);
                            }
                            dataCollection.logPrintSuccess(global.print, msf);
                            delete global.print._outRaft;
                            if (global.reduceMemoryUsage) {
                                closeFile();
                            }
                            menu.enableModalActions();
                            LoadingView.done();
                        });
                    } else if (global.print._printerProfile.postprocessing === "g3drem" || global.print.inputExt === ".g3drem") {
                        global.print._outRaft.parser = new Raft.G3DremParser(global.print._outRaft.getEngine());
                        printFilePath = msfPath.replace(".msf", "_msf") + ".g3drem";
                        let header = await global.print.getDremelHeader();
                        FileImages.addImageToDremelHeader(header, function (err, header) {
                            global.print._outRaft.parser.binaryHeader = header;
                            global.print._outRaft.save(printFilePath);
                            if (global.firstRun) {
                                SetupView.openPrintOffboarding(global.print, msf, printFilePath, msfPath);
                            } else {
                                menuUtils.displayPrintSummary(global.print, msf, printFilePath, msfPath);
                            }
                            dataCollection.logPrintSuccess(global.print, msf);
                            delete global.print._outRaft;
                            if (global.reduceMemoryUsage) {
                                closeFile();
                            }
                            menu.enableModalActions();
                            LoadingView.done();
                        });
                    } else {
                        global.print._outRaft.save(printFilePath);
                        if (global.print._printerProfile.postprocessing === "x3g") {
                            GPX.runGPX(global.print._printerProfile.gpxProfile, global.print._printerProfile.gpxConfigPath, printFilePath, msfPath + ".x3g");
                            printFilePath = msfPath + ".x3g";
                        }
                        if (global.firstRun) {
                            SetupView.openPrintOffboarding(global.print, msf, printFilePath, msfPath);
                        } else {
                            menuUtils.displayPrintSummary(global.print, msf, printFilePath, msfPath);
                        }
                        dataCollection.logPrintSuccess(global.print, msf);
                        delete global.print._outRaft;
                        if (global.reduceMemoryUsage) {
                            closeFile();
                        }
                        menu.enableModalActions();
                        LoadingView.done();
                    }
                } catch (err) {
                    if (global.env.dev) {
                        console.error(err);
                        let contents = global.print._outRaft.parser.toOutput(global.print._outRaft.instructions);
                        fs.writeFileSync(msfPath + global.print.inputExt + "_errorlog.txt", contents);
                    }
                    dataCollection.logPrintError(global.print, ((typeof err === "object") && err.exitCode ? err.exitCode : null));
                    displayWarningDialog(err);
                    if (global.reduceMemoryUsage) {
                        global.print.outputPermanentlyDisabled = true;
                    }
                    menu.enableModalActions();
                    disableOutput();
                    LoadingView.done();
                } finally {
                    saveDialogOpen = false;
                }
            }
        });
    }
}

function getProfileDropdown() {

    return [
        m("option", {
            config: function (el) {
                el.disabled = true;
                if (profiles.getActiveProfileIndex() === 0) {
                    el.selected = true;
                }
            }
        }, "Printer Profile"),
        profiles.getProfileList().map(function (printer, index) {
            return m("option", {
                selected: (profiles.getActiveProfileIndex() === index + 1)
            }, (printer.profileName.length > 80) ? printer.profileName.substr(0, 80) + "..." : printer.profileName);
        })
    ];

}

function updateProfileDropdown() {
    let printerSelect = document.getElementById("mainPrinterSelect");
    let printerEdit = document.getElementById("editActivePrinter");
    m.render(printerSelect, getProfileDropdown());
    if (profiles.getProfileCount() > 0) {
        if (profiles.getActiveProfileIndex() === 0) {
            profiles.setActiveProfileIndex(1);
            printerSelect.selectedIndex = 1;
        }
        printerSelect.style.display = "inline";
        printerEdit.style.display = "inline";
    } else {
        printerSelect.style.display = "none";
        printerEdit.style.display = "none";
    }
    Visualizer.drawPrintBed(profiles.getActiveProfile());
}

function updateMaterialDropdowns() {
    materials = [null, null, null, null];
    for (let i = 1; i <= 4; i++) {
        let drive = i - 1;
        document.getElementById("drive" + i + "materialSelect").title = "Select material";
        document.getElementById("drive" + i + "materialLabel").innerText = "";
        let dropdown = document.getElementById("drive" + i + "materials");
        m.render(dropdown, []);
        m.render(dropdown, [
            m("div#drive" + i + "materialNone", {
                style: {
                    display: "none"
                },
                onclick: function (e) {
                    materials[drive] = null;
                    document.getElementById("drive" + i + "materialSelect").title = "Select material";
                    document.getElementById("drive" + i + "materialLabel").innerText = "";
                    document.getElementById("drive" + i + "materials").classList.add("hidden");
                    document.getElementById("drive" + i + "materialNone").style.display = "none";
                    let materialsList = document.getElementById("drive" + i + "materials").children;
                    Array.prototype.forEach.call(materialsList, function (el) {
                        el.dataset.checked = 0;
                    });
                    e.stopPropagation();
                }
            }, "Unset Material"),
            Object.keys(MaterialMatrix.matrix.matrix).map(function (material) {
                return m("div", {
                    onclick: function (e) {
                        let issues = checkValidMaterialCombination(drive, material, materials);
                        if (issues.conflicts.length === 0 && issues.emptyAlgorithms.length === 0) {
                            materials[drive] = material;
                            let displayName = (material.length > 10 ? material.substr(0, 10) + "…" : material);
                            if (MaterialMatrix.isDefaultProfile(material)) {
                                displayName = MaterialMatrix.matrix.matrix[material].type;
                            }
                            document.getElementById("drive" + i + "materialSelect").title = material;
                            document.getElementById("drive" + i + "materialLabel").innerText = displayName;
                            document.getElementById("drive" + i + "materials").classList.add("hidden");
                            document.getElementById("drive" + i + "materialNone").style.display = "";
                            let materialsList = document.getElementById("drive" + i + "materials").children;
                            Array.prototype.forEach.call(materialsList, function (el) {
                                el.dataset.checked = (el.innerText === material ? 1 : 0);
                            });
                            e.stopPropagation();
                        } else if (issues.conflicts.length > 0) {
                            let thisMaterialType = MaterialMatrix.matrix.matrix[material].type;
                            let conflictTypes = issues.conflicts.map(function (material) {
                                return MaterialMatrix.matrix.matrix[material].type;
                            });
                            let conflictMsg = "";
                            if (conflictTypes.length === 1) {
                                conflictMsg = conflictTypes[0];
                            } else if (conflictTypes.length === 2) {
                                conflictMsg = conflictTypes[0] + " or " + conflictTypes[1];
                            } else {
                                for (let i = 0; i < conflictTypes.length - 2; i++) {
                                    conflictMsg += conflictTypes[i] + ",";
                                }
                                conflictMsg += conflictTypes[conflictTypes.length - 2] + ", or " + conflictTypes[conflictTypes.length - 1];
                            }
                            displayWarningDialog({
                                message: "Invalid material combination",
                                detail: thisMaterialType + " cannot be spliced with " + conflictMsg + "."
                            });
                        } else {
                            let emptyAlgs = issues.emptyAlgorithms;
                            let conflictMsg = "";
                            if (emptyAlgs.length === 1) {
                                conflictMsg = " " + emptyAlgs[0] + ".";
                            } else {
                                for (let i = 0; i < emptyAlgs.length; i++) {
                                    conflictMsg += "\n- " + emptyAlgs[i];
                                }
                            }
                            displayWarningDialog({
                                message: "Empty splice settings",
                                detail: "Before using this combination, you must fill in splice settings for" + conflictMsg
                            });
                        }
                    }
                }, material);
            })
        ]);
    }
}

exports.initialize = initialize;
exports.selectFile = selectFile;
exports.openFile = openFile;
exports.closeFile = closeFile;
exports.saveFile = saveFile;
exports.updateCurrentPrint = updateCurrentPrint;
exports.updateProfileDropdown = updateProfileDropdown;
exports.updateMaterialDropdowns = updateMaterialDropdowns;
exports.displayWarningDialog = displayWarningDialog;
exports.updateColorStrengthSliders = updateColorStrengthSliders;
