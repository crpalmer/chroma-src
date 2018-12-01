const fs = require("fs");
const path = require("path");
const m = require("mithril");
const marked = require("marked");
const bodymovin = require("bodymovin");
const Raft = require("raft-js");

const Electron = require("electron");
const app = Electron.remote.app;
const BrowserWindow = Electron.remote.BrowserWindow;
const dialog = Electron.remote.dialog;

const config = require("../config");
const dataCollection = require("../models/data-collection");
const Print = require("../models/print");
const Printer = require("../models/printer");
const PrinterProfiles = require("../models/printer-profiles");
const FormValidation = require("./form-validation");
const menu = require("./menu");
const menuUtils = require("./menu-utils");
const modalUtils = require("./modal-utils");
const Postprocessor = require("./postprocessor-view");
const SetupView = require("./setup-view");
const Visualizer = require("./visualizer");

const PrinterPresets = require("../models/printer-presets");

const SPLICE_MIN_LENGTH = require("../models/common").SPLICE_MIN_LENGTH;

const BOWDEN_NONE = require("../models/common").BOWDEN_NONE;
const BOWDEN_DEFAULT = require("../models/common").BOWDEN_DEFAULT;

const TRANSITION_TOWER = require("../models/common").TRANSITION_TOWER;
const SIDE_TRANSITIONS = require("../models/common").SIDE_TRANSITIONS;
const NO_TRANSITIONS = require("../models/common").NO_TRANSITIONS;

const TRANSITION_MIN_LENGTH = require("../models/common").TRANSITION_MIN_LENGTH;
const TRANSITION_MAX_LENGTH = require("../models/common").TRANSITION_MAX_LENGTH;
const TRANSITION_MIN_LENGTH_ADVANCED = require("../models/common").TRANSITION_MIN_LENGTH_ADVANCED;
const TRANSITION_MAX_LENGTH_ADVANCED = require("../models/common").TRANSITION_MAX_LENGTH_ADVANCED;
const TRANSITION_STEP = 5;

const INFILL_PERIMETER_OVERLAP = require("../models/common").INFILL_PERIMETER_OVERLAP;

function getTransitionLengthTicks() {
    let ticks = [];
    let minLength = (global.advancedMode ? TRANSITION_MIN_LENGTH_ADVANCED : TRANSITION_MIN_LENGTH);
    let maxLength = (global.advancedMode ? TRANSITION_MAX_LENGTH_ADVANCED : TRANSITION_MAX_LENGTH);
    let tickStep = (global.advancedMode ? TRANSITION_STEP * 2 : TRANSITION_STEP);
    for (let i = minLength; i <= maxLength; i += tickStep) {
        ticks.push(m("option", i));
    }
    return ticks;
}

const tooltips = {
    positionGuideTubeClip: "Use the provided Velcro squares to position your guide tube clip in a way that allows for filament to feed smoothly into your extruder.",
    positionScrollWheel: "Position your Scroll Wheel such that it provides the smoothest path to limit resistance on your filament.",
    positionPalette: "This distance is what we refer to as “the buffer”. This allows Palettes to produce filament at slightly different rates than your printer.",
    loadingOffset: "Please ensure that you stop loading once you see any of the next color appear. This helps to provide a precise Loading Offset value.",

    baseProfile: "If your printer model is available in the list, most of the default settings can be used. All you need to do is calibrate your printer (under Palette)!",
    bowdenTube: "The last segment of filament that Palette produces has to be a bit longer for Bowden printers so that the last segment of filament can reach the nozzle. If you're not sure about the length of your printer's Bowden tube, overestimating is better; 1500 mm should be a safe bet in most cases.",
    calibration: "Palette needs to produce the exact required length for each filament, so that splices reach your nozzle at the correct time. However, 3D printers aren't perfectly accurate. Your print file may contain 10 m of filament extrusion instructions, but your printer might only use 9.7 m of filament. These small errors add up over a print, slowly throwing off the alignment of splices. Calibration gives Palette a baseline for the amount of error in your printer's filament consumption, and filament production is adjusted accordingly. This is especially crucial at the start of a print, before Palette's live feedback systems kick in.",
    canvasHub: "Choose Connected mode if printing with CANVAS Hub, and Accessory mode otherwise.",
    extruderStepsPerMM: "For printers with Tiertime firmware, this is the value used as your extrusion multiplier.",
    filamentDiameter: "Palette currently only supports printing with 1.75 mm filament.",
    firmwarePurge: "Some printers include a hard-coded purge when beginning a print. Because this purge is not in the print file, calculated splice lengths will all be incorrectly short by this amount. If your printer has a firmware purge, estimate the amount of filament it uses here.",
    forceTowerBottomPerimeter: "Include a perimeter on the first layer of the transition tower, regardless of the layer's density. This can improve adhesion of the tower to the print bed.",
    independentExtruderAxes: "Some printer firmwares (such as FlashForge) treat each extruder as having its own axis. Chroma needs to know if it should interpret instructions in this way. If unsure, leave this unchecked.",
    infillPerimeterOverlap: "Set the amount of overlap between infill lines and perimeter lines, as a percentage of extrusion width.",
    initialTransitionLength: "The amount of material used when transitioning between filaments during the first 5 m of the print, before Palette's live feedback systems have kicked in. Increasing this length can help reduce error in calibration or from first-layer extrusion.",
    jogPauses: "Some printers have trouble pausing reliably during pings. With a movement pause, the print head is slowly moved back and forth a small distance, appearing to Palette as a pause.",
    maxTowerDensity: "Set the maximum density for transition tower layers. Higher values will take up less space on the bed to purge the same volume, but lower values may help with adhesion.",
    minTowerBottomDensity: "Override the minimum density of the first tower layer if better adhesion is required. Lower values that will work are better!",
    minTowerDensity: "Set the minimum density for sparse transition tower layers (those with no transitions on them). Lower values that will work are better!",
    minTransitionLength: "The transition length that will be used when transitioning away from weak colors.",
    noTransitions: "Leave the filament transition in the print. This adds no extra print time or filament usage, but may not produce defined color changes. This method works best with layered (banded) prints.",
    pingOffTower: "If you experience significant nozzle ooze during ping pauses, pausing off the edge of the tower will help prevent under-extrusion and nozzle collision on the tower.",
    pingRetraction: "During ping sequences, the printer will pause for a few seconds without extruding. By default, the retraction settings found in your print are used before and after a pause ('Auto'). If you experience significant nozzle ooze, you may wish to retract further to alleviate this issue.",
    printBedOrigin: "There are two main types of printers: those whose GCode origin (X0, Y0) is at the bottom-left corner of the print bed, and those whose origin is in the middle. Choosing the correct setting for your printer is critical to ensure that any GCode generated by Chroma is properly positioned!",
    printBedShape: "Chroma needs your print bed's dimensions to determine where to transition between filaments.",
    printExtruder: "Select which extruder you will be printing with. Choosing 'always ask' will have Chroma prompt you to select a tool each time you process a new file. Please note that when printing with Palette, Chroma does not currently support using both extruders in the same print.",
    purgeInPlace: "Some printer firmwares can only extrude a reliable amount of filament by coordinating extrusion with the movement of another axis. Only check this box if you are sure your printer can do this.",
    purgeCoordinates: "For printers that can extrude in place, define an (X,Y) coordinate where side transitions will occur. Make sure this coordinate is not over top of the print bed!",
    purgeEdge: "For printers that cannot extrude in place, side transitions will involve moving the print head back and forth along the selected edge while transitioning filament.",
    purgeEdgeOffset: "The distance from the selected edge that Chroma will use when transitioning filament. Make sure your printer can move this far off the edge of the bed!",
    sideTransitionLocation: "Define areas off the edge of the print bed where side transitions are allowed to occur. You will need to measure how far your printer can move off of at least one side to be able to use side transitions. Zones less than 2 mm thick will not be used to side transition—include them to ensure accurate bed positioning, but at least one zone must be 2 mm thick.",
    sideTransitions: "Transition by extruding off the side of the bed. This can be faster than transition towers and may use less material, but is not compatible with all printers since not all printers can move their extruder beyond the bed.",
    sideTransitionSpeed: "The maximum rate at which your printer can extrude filament. Faster values will save time, but too fast and your extruder may skip or jam!",
    targetPosition: "The target of the actual color change within the transition. Setting this around the middle gives the best chance of maintaining calibration, while a slightly earlier value ensures fuller purging. The default (40%) is recommended unless frequent transition bleed occurs.",
    towerExtrusionWidth: "Set the default spacing between parallel lines in the transition tower.",
    towerPerimeterSpeed: "Transition tower perimeters are printed at lower speeds to ensure better adhesion. The tower's outer perimeter is printed at this fraction of the layer's print speed, while the inner perimeter's speed is halfway between this and the print speed. Raising this multiplier can speed up prints and save print time, but may result in poor-quality towers that affect calibration.",
    towerPrintSpeed: "The print speed of the transition tower is automatically determined from the print, and can account for different material print speeds ('Auto'). However, you can instead provide a desired print speed which will be used for the entire tower, except on the first layer.",
    transitionLength: "The amount of material used when transitioning between filaments. Lower values use less material, but the transition may bleed; higher values ensure well-defined colors. Start at 130 mm and optimize based on print results.",
    transitionMethod: "How should the gradient be handled when transitioning between filaments?",
    transitionTowers: "Transition by printing a small rectangular tower beside the model to purge the previous filament from the nozzle. This is the default method, as it is compatible with all printers.",
    volumetric: "Most printers and firmwares interpret extrusion commands as specifying a distance of filament to push (in mm), while others interpet these as a volume of filament to consume (in mm³). Chroma needs to know how your printer will interpret these commands to handle them properly. If unsure, leave this unchecked.",
    x3g: "Some printers need their instructions converted into a .x3g file, which requires an extra processing step after creating your .gcode file. Check this box if your printer uses .x3g files, and select the GPX profile to use for the conversion."
};

function closeMainModal(event) {
    event = event || window.event;
    if (event.type === "click" || event.keyCode === 27) {
        window.removeEventListener("keydown", closeMainModal);
        closeModal();
    }
}

function returnToMainModal() {
    openModal();
}

function returnToNewModal(event, profile, startingTab) {
    event = event || window.event;
    if (event === true  || event.type === "click" || event.keyCode === 27) {
        printerProfileModal(undefined, profile, false, startingTab);
    }
}

function returnToEditModal(event, referenceProfile, tempProfile, startingTab) {
    event = event || window.event;
    if (event === true || event.type === "click" || event.keyCode === 27) {
        window.removeEventListener("keydown", returnToEditModal);
        printerProfileModal(referenceProfile, tempProfile, false, startingTab);
    }
}

function getWizardProgressBar(numberOfDots, progressBarId, progressId) {
    const dotRadius = 8;
    const dotSpacing = dotRadius * 5;
    const barThickness = 4;
    let dotPositions = [];
    for (let i = 0; i < numberOfDots; i++) {
        dotPositions[i] = (i * dotSpacing) + dotRadius;
    }
    return [
        m("svg", {
            width: 0,
            height: 0
        }, [
            m("defs", [
                m("clipPath#" + progressBarId + "_clipPath", [
                    dotPositions.map(function (xPos) {
                        return m("circle", {
                            cx: xPos,
                            cy: dotRadius,
                            r: dotRadius
                        })
                    }),
                    m("rect", {
                        x: 0,
                        y: dotRadius - (barThickness / 2),
                        width: dotPositions[dotPositions.length - 1],
                        height: barThickness
                    })
                ])
            ])
        ]),
        m("div#" + progressBarId, {
            style: {
                position: "absolute",
                top: "43px",
                right: "25px",
                width: (dotPositions[dotPositions.length - 1] + dotRadius) + "px",
                height: (dotRadius * 2) + "px",
                "clip-path": "url(#" + progressBarId + "_clipPath)",
                "background-color": "#ccc"

            }
        }, [
            m("div#" + progressId, {
                style: {
                    width: 0,
                    height: (dotRadius * 2) + "px",
                    "background-color": "#4db9e7",
                    transition: "width 0.5s"
                }
            })
        ])
    ]
}

function getImageGallery(galleryId, imageWidth, imageHeight, imageURLs) {
    let imageCount = imageURLs.length;
    return [
        m("div.imageGallery#" + galleryId, {
            "data-imageindex": 0
        }, [
            m("div.imageGalleryControl", [
                m("button.imageGalleryPrev#" + galleryId + "_prevBtn", {
                    disabled: true,
                    onclick: function (e) {
                        e.target.blur();
                        let galleryEl = document.getElementById(galleryId);
                        let contentEl = document.getElementById(galleryId + "_content");
                        let newPosition = parseInt(galleryEl.dataset.imageindex) - 1;
                        contentEl.style.left = -(newPosition * imageWidth) + "px";
                        galleryEl.dataset.imageindex = newPosition;
                        e.target.disabled = (newPosition === 0);
                        document.getElementById(galleryId + "_nextBtn").disabled = (newPosition === imageCount - 1);
                    }
                })
            ]),
            m("div.imageGalleryFrame", {
                style: {
                    width: imageWidth + "px",
                    height: imageHeight + "px",
                }
            }, [
                m("div.imageGalleryContent#" + galleryId + "_content", {
                    style: {
                        width: (imageWidth * imageCount) + "px",
                        height: imageHeight + "px",
                        left: 0
                    }
                }, [
                    imageURLs.map(function (url) {
                        return m("img.imageGalleryImage", {
                            src: url,
                            style: {
                                width: imageWidth + "px",
                                height: imageHeight + "px",
                            }
                        })
                    })
                ])
            ]),
            m("div.imageGalleryControl", [
                m("button.imageGalleryNext#" + galleryId + "_nextBtn", {
                    onclick: function (e) {
                        e.target.blur();
                        let galleryEl = document.getElementById(galleryId);
                        let contentEl = document.getElementById(galleryId + "_content");
                        let newPosition = parseInt(galleryEl.dataset.imageindex) + 1;
                        contentEl.style.left = -(newPosition * imageWidth) + "px";
                        galleryEl.dataset.imageindex = newPosition;
                        document.getElementById(galleryId + "_prevBtn").disabled = (newPosition === 0);
                        e.target.disabled = (newPosition === imageCount - 1);
                    }
                })
            ])
        ])
    ];
}

function openModal() {

    menu.disableModalActions();

    // pressing the ESC key will close the modal
    window.addEventListener("keydown", closeMainModal);

    let modalWindow = document.getElementById("open-modal");
    m.render(modalWindow, []);
    m.render(modalWindow, [
        m("div.container", [
            m("div.profileList", [
                m("button.closeButton", {
                    style: {
                        float: "right"
                    },
                    onclick: closeModal
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
                m("h2", "Printer Profiles"),
                m("table#printers.tableHoverHighlight", [
                    PrinterProfiles.getProfileList().map(function (printer) {
                        return m("tr.hoverHighlight", [
                            m("td.colExpand", (PrinterProfiles.getActiveProfile() === printer ? [
                                printer.profileName,
                                m("span", {
                                    style: {
                                        "margin-left": "10px",
                                        "font-size": "0.9em",
                                        "font-weight": "500",
                                        "color": "#999"
                                    }
                                }, "Active")
                            ] : printer.profileName)),
                            m("td", [
                                m("button", {
                                    onclick: function () {
                                        printerProfileModal(printer, undefined, undefined, 3);
                                    }
                                }, "Edit")
                            ]),
                            m("td", [
                                m("button", {
                                    onclick: function () {
                                        dialog.showSaveDialog(BrowserWindow.fromId(2), {
                                            defaultPath: path.join(app.getPath("desktop"), printer.profileName.replace("/", "-")) + ".yml",
                                            title: "Save Printer Profile",
                                            filters: [{
                                                name: "YAML document",
                                                extensions: ["yml"]
                                            }]
                                        }, function (outpath) {
                                            if (outpath !== undefined) {
                                                PrinterProfiles.exportProfile(printer, outpath);
                                            }
                                        });
                                    }
                                }, "Export")
                            ]),
                            m("td", [
                                m("button", {
                                    onclick: function () {
                                        dialog.showMessageBox(BrowserWindow.fromId(2), {
                                            type: "question",
                                            message: "Delete Printer Profile",
                                            detail: "Are you sure you wish to delete the profile “" + printer.profileName + "”?",
                                            buttons: ["Cancel", "Delete"],
                                            defaultId: 0,
                                            cancelId: 0
                                        }, function (choice) {
                                            if (choice === 1) {
                                                deleteProfile(printer);
                                            }
                                        });
                                    }
                                }, "Delete")
                            ])
                        ]);
                    })
                ]),
                m("button", {
                    onclick: function () {
                        printerProfileModal()
                    }
                }, "New Profile"),
                m("button", {
                    style: {
                        float: "right",
                        "margin-right": "5px"
                    },
                    onclick: function () {
                        dialog.showOpenDialog(BrowserWindow.fromId(2), {
                            filters: [{
                                name: "YAML documents",
                                extensions: ["yml"]
                            }],
                            properties: ["openFile"]
                        }, function (filenames) {
                            if (filenames === undefined) {
                                return;
                            }
                            let profile = PrinterProfiles.importProfile(filenames[0]);
                            if (profile !== null) {
                                printerProfileModal(undefined, profile);
                                dialog.showMessageBox(BrowserWindow.fromId(2), {
                                    type: "warning",
                                    message: "Chroma 1 profile import",
                                    detail: "Chroma 2 profiles contain some additional settings.\n\nTo finish importing this profile, please fill in:\n- Nozzle Diameter\n- Base Model (if available)\n- Firmware\n- Volumetric Extrusion\n- Input Files",
                                    buttons: ["OK"],
                                    defaultId: 0
                                }, function () {});
                            } else {
                                Postprocessor.updateProfileDropdown();
                                openModal();
                            }
                        });
                    }
                }, "Import")
            ])
        ])
    ]);

    modalWindow.style.display = "block";
    setTimeout(function () {
        modalWindow.style.opacity = 1;
        modalWindow.style.pointerEvents = "auto";
    }, 10);

}

function closeModal() {
    let modalWindow = document.getElementById("open-modal");
    let errors = document.getElementById("errorText");
    if (errors) {
        m.render(errors, "");
    }
    modalWindow.style.opacity = 0;
    modalWindow.style.pointerEvents = "none";
    window.removeEventListener("keydown", closeMainModal);
    setTimeout(function () {
        menu.enableModalActions();
        modalWindow.style.display = "none";
    }, 500);
    if (PrinterProfiles.getProfileCount() === 0) {
        SetupView.openSetupWindow();
    }
}

let onProfileClose = null;

let profile;
let tempProfile;

function closeProfileModal(event) {
    event = event || window.event;
    if (event === true || event.type === "click" || event.keyCode === 27) {
        // check for unsaved changes
        let modified = false;
        if (profile === undefined) {
            modified = !tempProfile.equals(new Printer());
        } else {
            modified = !profile.equals(tempProfile);
        }
        if (event !== true && modified) {
            modalUtils.confirmUnsavedChangesDialog(function (choice) {
                if (choice === 0) {
                    window.removeEventListener("keydown", closeProfileModal);
                    onProfileClose();
                }
            });
        } else {
            window.removeEventListener("keydown", closeProfileModal);
            onProfileClose();
        }
    }
}

function getBedPreviewRectangular(printBedDimensions) {
    const minWidth = 70;
    const maxWidth = 300;
    const defaultWidth = 250;
    const minHeight = 60;
    const maxHeight = 300;
    const defaultHeight = 200;
    let x = printBedDimensions.x;
    let y = printBedDimensions.y;
    if (x === 0 && y === 0) {
        x = defaultWidth;
        y = defaultHeight;
    } else {
        if (x < minWidth) {
            x = minWidth;
        }
        if (y < minHeight) {
            y = minHeight;
        }
        if (x > maxWidth) {
            y = Math.floor(y * maxWidth / x);
            if (y < minHeight) {
                y = minHeight;
            }
            x = maxWidth;
        }
        if (y > maxHeight) {
            x = Math.floor(x * maxHeight / y);
            if (x < minWidth) {
                x = minWidth;
            }
            y = maxHeight;
        }
    }
    return {
        x: x,
        y: y
    };
}

function getBedPreviewCircular(printBedDimensions) {
    const minDiameter = 100;
    const maxDiameter = 380;
    const defaultDiameter = 200;
    let diameter = printBedDimensions.diameter;
    if (diameter === 0) {
        diameter = defaultDiameter;
    } else if (diameter < minDiameter) {
        diameter = minDiameter;
    } else if (diameter > maxDiameter) {
        diameter = maxDiameter;
    }
    return diameter;
}

function updateBedOriginPreview(printBedDimensions) {
    let originPreview;
    let top;
    let left;
    if (printBedDimensions.circular) {
        originPreview = document.getElementById("printBedPreviewCircularOrigin");
        left = (100 * printBedDimensions.originOffsets.x / printBedDimensions.diameter);
        top = (100 - (100 * tempProfile.printBedDimensions.originOffsets.y / tempProfile.printBedDimensions.diameter));
    } else {
        originPreview = document.getElementById("printBedPreviewRectangularOrigin");
        left = (100 * printBedDimensions.originOffsets.x / printBedDimensions.x);
        top = (100 - (100 * tempProfile.printBedDimensions.originOffsets.y / tempProfile.printBedDimensions.y));
    }
    // set X position
    if (left > 105) {
        left = 105;
        originPreview.style.opacity = 0.3;
    } else if (left < -5) {
        left = -5;
        originPreview.style.opacity = 0.3;
    } else {
        originPreview.style.opacity = 1;
    }
    originPreview.style.left = left + "%";
    // set Y position
    if (top > 105) {
        top = 105;
        originPreview.style.opacity = 0.3;
    } else if (top < -5) {
        top = -5;
        originPreview.style.opacity = 0.3;
    } else {
        originPreview.style.opacity = 1;
    }
    originPreview.style.top = top + "%";
}

function printerProfileModal(p, tP, onClose, startingTab = 0) {

    profile = p;
    tempProfile = tP;

    menu.disableModalActions();

    if (typeof onClose === "function") {
        onProfileClose = onClose;
    } else if (onClose === undefined || onClose === null) {
        if (global.firstRun) {
            onProfileClose = function () {
                closeModal();
                SetupView.startTutorial();
            };
        } else {
            onProfileClose = returnToMainModal;
        }
    }

    // create a temporary clone to hold changes before we save them
    let newProfileWizard = false;
    let guidedSetup = false;
    if (tempProfile === undefined) {
        if (profile) {
            tempProfile = profile.clone();
        } else {
            tempProfile = new Printer();
            newProfileWizard = true;
            if (global.firstRun || PrinterProfiles.getProfileCount() === 0) {
                guidedSetup = true;
            } else {
                let choice = dialog.showMessageBox(BrowserWindow.fromId(2), {
                    type: "question",
                    message: "Guided profile setup",
                    detail: "Would you like to go through a step-by-step guided setup?",
                    buttons: ["Guided Setup", "Manual Setup"],
                    defaultId: 0,
                });
                if (choice === 0) {
                    guidedSetup = true;
                }
            }
        }
    }

    // pressing the ESC key will close the modal
    window.removeEventListener("keydown", closeMainModal);
    window.addEventListener("keydown", closeProfileModal);

    let activeTab = startingTab;

    let modalWindow = document.getElementById("open-modal");
    modalWindow.scrollTop = 0;
    m.render(modalWindow, []);

    function getPrintExtruderOptions() {
        let extruderOptions = [];
        for (let i = 0; i < tempProfile.extruderCount; i++) {
            extruderOptions.push(m("option", {
                value: i,
                selected: tempProfile.printExtruder === i
            }, "T" + i));
        }
        return [
            m("option", {
                value: "always_ask",
                selected: tempProfile.printExtruder === false
            }, "Always ask"),
            extruderOptions
        ];
    }

    function getPrinterTabContent() {
        let profileCustomizeChecked = document.getElementById("profileCustomize") !== null
            && document.getElementById("profileCustomize").checked;
        return [

            ((guidedSetup && !profileCustomizeChecked) ? [
                m("tr", [
                    m("th", [
                        m("label[for='profileName']", "Profile Name")
                    ]),
                    m("td", {
                        colspan: 2
                    }, [
                        m("div.formError#guidedProfileNameError", [
                            m("input.formInput#guidedProfileName", {
                                oninput: function (event) {
                                    let el = event.target.parentElement;
                                    let value = event.target.value.trim();
                                    if (value === "") {
                                        FormValidation.showValidationError(el, "Make sure you name the profile!");
                                        document.getElementById("newProfilePane5Next").disabled = true;
                                    } else {
                                        let uniqueName = true;
                                        PrinterProfiles.getProfileList().forEach(function (printer) {
                                            if (printer.profileName.toLowerCase() === value.toLowerCase()) {
                                                uniqueName = false;
                                            }
                                        });
                                        if (uniqueName) {
                                            tempProfile.profileName = value;
                                            FormValidation.resetValidationError(el);
                                            document.getElementById("newProfilePane5Next").disabled = false;
                                        } else {
                                            FormValidation.showValidationError(el, "A profile with this name already exists.");
                                            document.getElementById("newProfilePane5Next").disabled = true;
                                        }
                                    }
                                }
                            })
                        ])
                    ])
                ]),
                m("tr", {}, [
                    m("th", [
                        m("label[for='paletteType']", "Palette Type")
                    ]),
                    m("td", {
                        colspan: 2,
                        style: {
                            "padding-top": "5px"
                        },
                        onchange: function (event) {
                            tempProfile.paletteType = event.target.value;
                            document.getElementById("integratedRowX").style.display = tempProfile.isPalette2() ? null : "none";
                        }
                    }, [
                        m("select.formSelect#paletteType" + (global.print ? ".formInputDisabled" : ""),
                            Object.keys(Printer.PaletteTypes).map((type) => {
                                return m("option", {
                                    value: Printer.PaletteTypes[type],
                                    selected: tempProfile.paletteType === Printer.PaletteTypes[type]
                                }, Printer.PaletteTypes[type]);
                            }))
                    ])
                ]),

                m("tr#integratedRowX", {
                    style: {
                        display: tempProfile.isPalette2() ? null : "none"
                    }
                }, [
                    m("th", [
                        m("label.tooltip", {
                            'data-tooltip': tooltips.canvasHub,
                        }, "Connection")
                    ]),
                    m("td", [
                        m("div.checkboxGroup", [
                            m("input#integratedAccessoryX[type=radio]", {
                                name: "integrated",
                                checked: !tempProfile.integrated,
                                onclick: function () {
                                    tempProfile.integrated = false;
                                }
                            }),
                            m("label[for='integratedAccessoryX']", "Accessory mode")
                        ]),
                        m("div.checkboxGroup", [
                            m("input#integratedConnectedX[type=radio]", {
                                name: "integrated",
                                checked: tempProfile.integrated,
                                onclick: function () {
                                    tempProfile.integrated = true;
                                }
                            }),
                            m("label[for='integratedConnectedX']", "Connected mode")
                        ])
                    ])
                ])
            ] : []),

            m("tr", [
                m("th", {
                    colspan: 3
                }, [
                    m("h3", {
                        style: {
                            "font-weight": "bold"
                        }
                    }, "Filament and Extruders")
                ])
            ]),

            m("tr", [
                m("th", [
                    m("label[for='nozzleDiameter']", "Nozzle Diameter"),
                    m("button.usePresetDefault#nozzleDiameterDefault", {
                        style: {
                            display: (tempProfile.baseProfile === "custom" || tempProfile.nozzleDiameter === PrinterPresets.getPresetByUID(tempProfile.baseProfile).nozzleDiameter) ? "none" : ""
                        },
                        onclick: function (event) {
                            tempProfile.nozzleDiameter = PrinterPresets.getPresetByUID(tempProfile.baseProfile).nozzleDiameter;
                            document.getElementById("nozzleDiameter").value = tempProfile.nozzleDiameter;
                            event.target.style.display = "none";
                        }
                    })
                ]),
                m("td", {
                    colspan: 2
                }, [
                    m("div.formError#nozzleDiameterError", [
                        m("input#nozzleDiameter.formInput[type='text']", {
                            style: {
                                display: "inline-block",
                                "max-width": "100px"
                            },
                            name: "nozzleDiameter",
                            value: (tempProfile.nozzleDiameter === undefined ? Printer.DEFAULTS.nozzleDiameter : tempProfile.nozzleDiameter),
                            oninput: function (event) {
                                tempProfile.nozzleDiameter = FormValidation.validateNumberInput(
                                    event.target.value,
                                    0,
                                    0, false,
                                    false, true,
                                    true,
                                    event.target.parentElement,
                                    "Nozzle diameter", "mm");
                                if (tempProfile.baseProfile === "custom" || tempProfile.nozzleDiameter === PrinterPresets.getPresetByUID(tempProfile.baseProfile).nozzleDiameter) {
                                    document.getElementById("nozzleDiameterDefault").style.display = "none";
                                } else {
                                    document.getElementById("nozzleDiameterDefault").style.display = "";
                                }
                            }
                        }),
                        m("label[for='nozzleDiameter']", " mm")
                    ])
                ])
            ]),

            m("tr", [
                m("th", [
                    m("label[for='extruderCount']", "Number of Extruders"),
                    m("button.usePresetDefault#extruderCountDefault", {
                        style: {
                            display: (tempProfile.baseProfile === "custom" || tempProfile.extruderCount === PrinterPresets.getPresetByUID(tempProfile.baseProfile).extruderCount) ? "none" : ""
                        },
                        disabled: global.print,
                        onclick: function (event) {
                            tempProfile.extruderCount = PrinterPresets.getPresetByUID(tempProfile.baseProfile).extruderCount;
                            document.getElementById("extruderCount").value = tempProfile.extruderCount;
                            event.target.style.display = "none";
                            if (global.advancedMode) {
                                document.getElementById("printExtruderRow").style.display = (tempProfile.extruderCount === 1 ? "none" : "");
                                if (tempProfile.printExtruder !== false && tempProfile.printExtruder >= tempProfile.extruderCount) {
                                    tempProfile.printExtruder = false;
                                }
                                m.render(document.getElementById("printExtruder"), getPrintExtruderOptions());
                            }
                        }
                    })
                ]),
                m("td", {
                    colspan: 2
                }, [
                    m("div#extruderCountError.formError", [
                        m("input#extruderCount.formInput" + (global.print ? ".formInputDisabled" : "") + "[type='number']", {
                            style: {
                                display: "inline-block",
                                "max-width": "100px"
                            },
                            name: "extruderCount",
                            max: 5,
                            min: 1,
                            step: 1,
                            value: (tempProfile.extruderCount === undefined ? Printer.DEFAULTS.extruderCount : tempProfile.extruderCount),
                            disabled: global.print,
                            oninput: function (event) {
                                if (FormValidation.isInt(event.target.value)) {
                                    tempProfile.extruderCount = FormValidation.validateIntegerInput(
                                        event.target.value,
                                        1,
                                        1, true,
                                        5, true,
                                        true,
                                        event.target.parentElement,
                                        "Extruder count");
                                    if (global.advancedMode) {
                                        document.getElementById("printExtruderRow").style.display = (tempProfile.extruderCount === 1 ? "none" : "");
                                        if (tempProfile.printExtruder !== false && tempProfile.printExtruder >= tempProfile.extruderCount) {
                                            tempProfile.printExtruder = false;
                                        }
                                        m.render(document.getElementById("printExtruder"), getPrintExtruderOptions());
                                    }
                                } else if (event.target.value.trim() === "") {
                                    FormValidation.showValidationError(event.target.parentElement)
                                } else {
                                    FormValidation.showValidationError(
                                        event.target.parentElement,
                                        "Extruder count must be a whole number."
                                    )
                                }
                                if (tempProfile.baseProfile === "custom" || tempProfile.extruderCount === PrinterPresets.getPresetByUID(tempProfile.baseProfile).extruderCount) {
                                    document.getElementById("extruderCountDefault").style.display = "none";
                                } else {
                                    document.getElementById("extruderCountDefault").style.display = "";
                                }
                            }
                        })
                    ])
                ])
            ]),

            (global.advancedMode ? m("tr#printExtruderRow", {
                style: {
                    display: (tempProfile.extruderCount === 1 ? "none" : "")
                }
            }, [
                m("th", [
                    m("label.tooltip[for='printExtruder']", {
                        "data-tooltip": tooltips.printExtruder
                    }, "Printing Extruder")
                ]),
                m("td", {
                    colspan: 2,
                    style: {
                        "padding-top": "5px"
                    }
                }, [
                    m("select#printExtruder.formSelect" + (global.print ? ".formInputDisabled" : ""), {
                        disabled: global.print,
                        onchange: function (event) {
                            if (event.target.value === "always_ask") {
                                tempProfile.printExtruder = false;
                            } else {
                                tempProfile.printExtruder = parseInt(event.target.value);
                            }
                        }
                    }, getPrintExtruderOptions())
                ])
            ]) : []),

            m("tr", [
                m("th", {
                    colspan: 3
                }, [
                    m("h3", {
                        style: {
                            "font-weight": "bold"
                        }
                    }, "Firmware")
                ])
            ]),

            (guidedSetup ? [] : m("tr", [
                m("th", [
                    m("label.tooltip[for='baseProfile']" + (global.print ? ".labelDisabled" : ""), {
                        "data-tooltip": tooltips.baseProfile
                    }, "Base Model")
                ]),
                m("td", {
                    colspan: 2,
                    style: {
                        "padding-top": "5px"
                    }
                }, [
                    m("select#baseProfile.formSelect" + (global.print ? ".formInputDisabled" : ""), {
                        disabled: global.print,
                        onchange: function (event) {
                            tempProfile.baseProfile = event.target.value;
                            if (tempProfile.baseProfile === "custom") {
                                document.getElementById("firmwareDefault").style.display = "none";
                                document.getElementById("volumetricDefault").style.display = "none";
                                document.getElementById("independentExtruderAxesDefault").style.display = "none";
                                document.getElementById("inputParsersDefault").style.display = "none";
                                document.getElementById("postprocessingDefault").style.display = "none";
                                document.getElementById("x3gDefault").style.display = "none";
                                document.getElementById("bedShapeDefault").style.display = "none";
                                document.getElementById("bedOriginDefault").style.display = "none";
                                document.getElementById("extruderCountDefault").style.display = "none";
                                document.getElementById("nozzleDiameterDefault").style.display = "none";
                                document.getElementById("bowdenBufferDefault").style.display = "none";
                                document.getElementById("firmwarePurgeDefault").style.display = "none";
                                document.getElementById("jogPausesDefault").style.display = "none";
                            } else {
                                let baseProfile = PrinterPresets.getPresetByUID(tempProfile.baseProfile);
                                if (tempProfile.engine === baseProfile.engine) {
                                    document.getElementById("firmwareDefault").style.display = "none";
                                } else {
                                    document.getElementById("firmwareDefault").style.display = "";
                                }
                                if (tempProfile.postprocessing === baseProfile.postprocessing) {
                                    document.getElementById("postprocessingDefault").style.display = "none";
                                } else {
                                    document.getElementById("postprocessingDefault").style.display = "";
                                }
                                if (tempProfile.volumetric === baseProfile.volumetric) {
                                    document.getElementById("volumetricDefault").style.display = "none";
                                } else {
                                    document.getElementById("volumetricDefault").style.display = "";
                                }
                                if (tempProfile.independentExtruderAxes === !!baseProfile.independentExtruderAxes) {
                                    document.getElementById("independentExtruderAxesDefault").style.display = "none";
                                } else {
                                    document.getElementById("independentExtruderAxesDefault").style.display = "";
                                }
                                if (tempProfile.gpxProfile === baseProfile.gpxProfile) {
                                    document.getElementById("x3gDefault").style.display = "none";
                                } else {
                                    document.getElementById("x3gDefault").style.display = "";
                                }
                                if (tempProfile.printBedDimensions.circular === baseProfile.printBed.circular) {
                                    if (baseProfile.printBed.circular) {
                                        if (tempProfile.printBedDimensions.diameter === baseProfile.printBed.diameter) {
                                            document.getElementById("bedShapeDefault").style.display = "none";
                                        } else {
                                            document.getElementById("bedShapeDefault").style.display = "";
                                        }
                                    } else {
                                        if (tempProfile.printBedDimensions.x === baseProfile.printBed.x && tempProfile.printBedDimensions.y === baseProfile.printBed.y) {
                                            document.getElementById("bedShapeDefault").style.display = "none";
                                        } else {
                                            document.getElementById("bedShapeDefault").style.display = "";
                                        }
                                    }
                                } else {
                                    document.getElementById("bedShapeDefault").style.display = "";
                                }
                                if (tempProfile.printBedDimensions.origin === baseProfile.printBed.origin) {
                                    if (tempProfile.printBedDimensions.origin === "custom") {
                                        if (tempProfile.printBedDimensions.originOffsets.x === baseProfile.printBed.originOffsets.x && tempProfile.printBedDimensions.originOffsets.x === baseProfile.printBed.originOffsets.x) {
                                            document.getElementById("bedOriginDefault").style.display = "none";
                                        } else {
                                            document.getElementById("bedOriginDefault").style.display = "";
                                        }
                                    } else {
                                        document.getElementById("bedOriginDefault").style.display = "none";
                                    }
                                } else {
                                    document.getElementById("bedOriginDefault").style.display = "";
                                }
                                if (tempProfile.extruderCount === baseProfile.extruderCount) {
                                    document.getElementById("extruderCountDefault").style.display = "none";
                                } else {
                                    document.getElementById("extruderCountDefault").style.display = "";
                                }
                                if (tempProfile.nozzleDiameter === baseProfile.nozzleDiameter) {
                                    document.getElementById("nozzleDiameterDefault").style.display = "none";
                                } else {
                                    document.getElementById("nozzleDiameterDefault").style.display = "";
                                }
                                if (tempProfile.bowdenTube === baseProfile.bowdenTube) {
                                    document.getElementById("bowdenBufferDefault").style.display = "none";
                                } else {
                                    document.getElementById("bowdenBufferDefault").style.display = "";
                                }
                                if (tempProfile.firmwarePurge === (baseProfile.firmwarePurge || 0)) {
                                    document.getElementById("firmwarePurgeDefault").style.display = "none";
                                } else {
                                    document.getElementById("firmwarePurgeDefault").style.display = "";
                                }
                                if (tempProfile.jogPauses === !!baseProfile.jogPauses) {
                                    document.getElementById("jogPausesDefault").style.display = "none";
                                } else {
                                    document.getElementById("jogPausesDefault").style.display = "";
                                }
                            }
                        }
                    }, [
                        PrinterPresets.presets.map(function (maker) {
                            return maker.models.map(function (model) {
                                let modelName = model.name;
                                if (maker.prefixNameToModels) {
                                    if (maker.prefixNameToModels === true) {
                                        modelName = maker.name + " " + modelName;
                                    } else {
                                        modelName = maker.prefixNameToModels + " " + modelName;
                                    }
                                }
                                return m("option", {
                                    "data-name": modelName,
                                    value: model.uid,
                                    selected: (tempProfile.baseProfile === model.uid)
                                }, modelName);
                            });
                        }).reduce(function (prev, curr) {
                            return prev.concat(curr);
                        }).sort(function (modelA, modelB) {
                            return modelA.attrs["data-name"].localeCompare(modelB.attrs["data-name"]);
                        }),
                        m("option", {
                            value: "custom",
                            selected: (tempProfile.baseProfile === "custom")
                        }, "None (custom)")

                    ])
                ])
            ])),

            m("tr", [
                m("th", [
                    m("label[for='engine']" + (global.print ? ".labelDisabled" : ""), "Firmware"),
                    m("button.usePresetDefault#firmwareDefault", {
                        style: {
                            display: tempProfile.baseProfile === "custom" ? "none" : (tempProfile.baseProfile !== "custom" && tempProfile.engine === PrinterPresets.getPresetByUID(tempProfile.baseProfile).engine ? "none" : "")
                        },
                        disabled: global.print,
                        onclick: function (event) {
                            tempProfile.engine = PrinterPresets.getPresetByUID(tempProfile.baseProfile).engine;
                            document.getElementById("engine").selectedIndex = PrinterPresets.getEngineIndex(tempProfile.engine);
                            event.target.style.display = "none";
                            if (tempProfile.engine === "tiertime") {
                                document.getElementById("extruderStepsPerMMRow").style.display = null;
                                document.getElementById("volumetricRow").style.display = "none";
                            } else {
                                document.getElementById("extruderStepsPerMMRow").style.display = "none";
                                document.getElementById("volumetricRow").style.display = null;
                            }
                        }
                    })
                ]),
                m("td", {
                    colspan: 2,
                    style: {
                        "padding-top": "5px"
                    }
                }, [
                    m("select#engine.formSelect" + (global.print ? ".formInputDisabled" : ""), {
                        disabled: global.print,
                        onchange: function (event) {
                            tempProfile.engine = event.target.value;
                            let resetButton = document.getElementById("firmwareDefault");
                            if (tempProfile.baseProfile === "custom" || tempProfile.engine === PrinterPresets.getPresetByUID(tempProfile.baseProfile).engine) {
                                resetButton.style.display = "none";
                            } else {
                                resetButton.style.display = "";
                            }
                            if (tempProfile.engine === "tiertime") {
                                document.getElementById("extruderStepsPerMMRow").style.display = null;
                                document.getElementById("volumetricRow").style.display = "none";
                            } else {
                                document.getElementById("extruderStepsPerMMRow").style.display = "none";
                                document.getElementById("volumetricRow").style.display = null;
                            }
                        }
                    }, [
                        PrinterPresets.engines.map(function (engine) {
                            return m("option", {
                                value: engine[0],
                                selected: tempProfile.engine === engine[0]
                            }, engine[1])
                        })
                    ])
                ])
            ]),

            m("tr#extruderStepsPerMMRow", {
                style: {
                    display: (tempProfile.engine === "tiertime" ? null : "none")
                }
            }, [
                m("th", [
                    m("label.tooltip[for='extruderStepsPerMM']" + (global.print ? ".labelDisabled" : ""), {
                        "data-tooltip": tooltips.extruderStepsPerMM
                    }, "Extruder Steps/MM"),
                    m("button.usePresetDefault#extruderStepsPerMMDefault", {
                        style: {
                            display: (tempProfile.baseProfile === "custom" || PrinterPresets.getPresetByUID(tempProfile.baseProfile).extruderStepsPerMM === undefined || tempProfile.extruderStepsPerMM === PrinterPresets.getPresetByUID(tempProfile.baseProfile).extruderStepsPerMM) ? "none" : ""
                        },
                        disabled: global.print,
                        onclick: function (event) {
                            tempProfile.extruderStepsPerMM = PrinterPresets.getPresetByUID(tempProfile.baseProfile).extruderStepsPerMM || 0;
                            document.getElementById("extruderStepsPerMM").value = tempProfile.extruderStepsPerMM;
                            event.target.style.display = "none";
                        }
                    })
                ]),
                m("td", {
                    colspan: 2
                }, [
                    m("div.formError#extruderStepsPerMMError", [
                        m("input#extruderStepsPerMM.formInput[type='text']" + (global.print ? ".formInputDisabled" : ""), {
                            disabled: global.print,
                            style: {
                                display: "inline-block",
                                "max-width": "100px"
                            },
                            name: "extruderStepsPerMM",
                            value: tempProfile.extruderStepsPerMM || "0",
                            oninput: function (event) {
                                tempProfile.extruderStepsPerMM = FormValidation.validateNumberInput(
                                    event.target.value,
                                    0,
                                    0, false,
                                    false, true,
                                    true,
                                    event.target.parentElement,
                                    "Extruder steps/mm");
                                if (tempProfile.baseProfile === "custom" || PrinterPresets.getPresetByUID(tempProfile.baseProfile).extruderStepsPerMM === undefined || tempProfile.extruderStepsPerMM === PrinterPresets.getPresetByUID(tempProfile.baseProfile).extruderStepsPerMM) {
                                    document.getElementById("extruderStepsPerMMDefault").style.display = "none";
                                } else {
                                    document.getElementById("extruderStepsPerMMDefault").style.display = "";
                                }
                            }
                        }),
                        m("label[for='extruderStepsPerMM']" + (global.print ? ".labelDisabled" : ""), " steps/mm")
                    ])
                ])
            ]),

            m("tr#volumetricRow", {
                style: {
                    display: (tempProfile.engine === "tiertime" ? "none" : null)
                }
            }, [
                m("th", [
                    m("span.tooltip" + (global.print ? ".labelDisabled" : ""), {
                        "data-tooltip": tooltips.volumetric
                    }, "Volumetric Extrusion"),
                    m("button.usePresetDefault#volumetricDefault", {
                        style: {
                            display: (tempProfile.baseProfile === "custom" || tempProfile.volumetric === PrinterPresets.getPresetByUID(tempProfile.baseProfile).volumetric ? "none" : "")
                        },
                        disabled: global.print,
                        onclick: function (event) {
                            tempProfile.volumetric = PrinterPresets.getPresetByUID(tempProfile.baseProfile).volumetric;
                            document.getElementById("volumetric").checked = tempProfile.volumetric;
                            event.target.style.display = "none";
                        }
                    })
                ]),
                m("td", {
                    colspan: 2
                }, [
                    m("div.checkboxGroup", {
                        style: {
                            display: "inline-block"
                        }
                    }, [
                        m("input#volumetric[type='checkbox']", {
                            checked: tempProfile.volumetric,
                            disabled: global.print,
                            onclick: function (event) {
                                tempProfile.volumetric = event.target.checked;
                                let resetButton = document.getElementById("volumetricDefault");
                                if (tempProfile.baseProfile === "custom" || tempProfile.volumetric === PrinterPresets.getPresetByUID(tempProfile.baseProfile).volumetric) {
                                    resetButton.style.display = "none";
                                } else {
                                    resetButton.style.display = "";
                                }
                            }
                        }),
                        m("label[for='volumetric']" + (global.print ? ".labelDisabled" : ""), "Printer uses volumetric extrusion commands")
                    ])
                ])
            ]),

            m("tr", [
                m("th", [
                    m("span.tooltip" + (global.print ? ".labelDisabled" : ""), {
                        "data-tooltip": tooltips.independentExtruderAxes
                    }, "Independent Axes"),
                    m("button.usePresetDefault#independentExtruderAxesDefault", {
                        style: {
                            display: (tempProfile.baseProfile === "custom" || tempProfile.independentExtruderAxes === !!PrinterPresets.getPresetByUID(tempProfile.baseProfile).independentExtruderAxes ? "none" : "")
                        },
                        disabled: global.print,
                        onclick: function (event) {
                            tempProfile.independentExtruderAxes = !!PrinterPresets.getPresetByUID(tempProfile.baseProfile).independentExtruderAxes;
                            document.getElementById("independentExtruderAxes").checked = tempProfile.independentExtruderAxes;
                            event.target.style.display = "none";
                        }
                    })
                ]),
                m("td", {
                    colspan: 2
                }, [
                    m("div.checkboxGroup", {
                        style: {
                            display: "inline-block"
                        }
                    }, [
                        m("input#independentExtruderAxes[type='checkbox']", {
                            checked: tempProfile.independentExtruderAxes,
                            disabled: global.print,
                            onclick: function (event) {
                                tempProfile.independentExtruderAxes = event.target.checked;
                                let resetButton = document.getElementById("independentExtruderAxesDefault");
                                if (tempProfile.baseProfile === "custom" || tempProfile.independentExtruderAxes === !!PrinterPresets.getPresetByUID(tempProfile.baseProfile).independentExtruderAxes) {
                                    resetButton.style.display = "none";
                                } else {
                                    resetButton.style.display = "";
                                }
                            }
                        }),
                        m("label[for='independentExtruderAxes']" + (global.print ? ".labelDisabled" : ""), "Printer uses independent extruder axes")
                    ])
                ])
            ]),

            (global.advancedMode ? m("tr", [
                m("th", [
                    m("label.tooltip[for='firmwarePurge']", {
                        "data-tooltip": tooltips.firmwarePurge
                    }, "Firmware Purge"),
                    m("button.usePresetDefault#firmwarePurgeDefault", {
                        style: {
                            display: (tempProfile.baseProfile === "custom" || PrinterPresets.getPresetByUID(tempProfile.baseProfile).firmwarePurge === undefined || tempProfile.firmwarePurge === PrinterPresets.getPresetByUID(tempProfile.baseProfile).firmwarePurge) ? "none" : ""
                        },
                        onclick: function (event) {
                            tempProfile.firmwarePurge = PrinterPresets.getPresetByUID(tempProfile.baseProfile).firmwarePurge || 0;
                            document.getElementById("firmwarePurge").value = tempProfile.firmwarePurge;
                            event.target.style.display = "none";
                        }
                    })
                ]),
                m("td", {
                    colspan: 2
                }, [
                    m("div.formError#firmwarePurgeError", [
                        m("input#firmwarePurge.formInput[type='text']", {
                            style: {
                                display: "inline-block",
                                "max-width": "100px"
                            },
                            name: "firmwarePurge",
                            value: tempProfile.firmwarePurge || "0",
                            oninput: function (event) {
                                tempProfile.firmwarePurge = FormValidation.validateNumberInput(
                                    event.target.value,
                                    0,
                                    0, true,
                                    false, true,
                                    true,
                                    event.target.parentElement,
                                    "Firmware purge", "mm");
                                if (tempProfile.baseProfile === "custom" || PrinterPresets.getPresetByUID(tempProfile.baseProfile).firmwarePurge === undefined || tempProfile.firmwarePurge === PrinterPresets.getPresetByUID(tempProfile.baseProfile).firmwarePurge) {
                                    document.getElementById("firmwarePurgeDefault").style.display = "none";
                                } else {
                                    document.getElementById("firmwarePurgeDefault").style.display = "";
                                }
                            }
                        }),
                        m("label[for='firmwarePurge']", " mm")
                    ])
                ])
            ]) : []),

            m("tr", [
                m("th", {
                    colspan: 3
                }, [
                    m("h3", {
                        style: {
                            "font-weight": "bold"
                        }
                    }, "File Formats"),
                ])
            ]),

            m("tr", [
                m("th" + (global.print ? ".labelDisabled" : ""), [
                    "Input Files",
                    m("button.usePresetDefault#inputParsersDefault", {
                        style: {
                            display: (tempProfile.baseProfile === "custom" || PrinterPresets.parserListEquals(tempProfile.inputParsers, tempProfile.baseProfile)) ? "none" : ""
                        },
                        disabled: global.print,
                        onclick: function (event) {
                            tempProfile.inputParsers = PrinterPresets.getPresetByUID(tempProfile.baseProfile).inputParsers.slice();
                            PrinterPresets.parsers.forEach(function (parser) {
                                document.getElementById("inputParser_" + parser[0]).checked = tempProfile.inputParsers.indexOf(parser[0]) > -1;
                            });
                            event.target.style.display = "none";
                        }
                    })
                ]),
                m("td", {
                    colspan: 2
                }, [
                    PrinterPresets.parsers.map(function (parser) {
                        return m("div.checkboxGroup", [
                            m("input#inputParser_" + parser[0] + "[type='checkbox']", {
                                style: {
                                    "margin-bottom": 0
                                },
                                disabled: global.print,
                                checked: tempProfile.inputParsers.indexOf(parser[0]) > -1,
                                name: "parser_" + parser[0],
                                value: parser[0],
                                onclick: function (event) {
                                    if (event.target.checked) {
                                        tempProfile.inputParsers.push(parser[0]);
                                    } else {
                                        tempProfile.inputParsers.splice(tempProfile.inputParsers.indexOf(parser[0]), 1);
                                    }
                                    tempProfile.inputParsers.sort((a, b) => a > b);
                                    let resetButton = document.getElementById("inputParsersDefault");
                                    if (tempProfile.baseProfile === "custom" || PrinterPresets.parserListEquals(tempProfile.inputParsers, tempProfile.baseProfile)) {
                                        resetButton.style.display = "none";
                                    } else {
                                        resetButton.style.display = "";
                                    }
                                }
                            }),
                            m("label[for='inputParser_" + parser[0] + "']" + (global.print ? ".labelDisabled" : ""), parser[1])
                        ])
                    })
                ])
            ]),

            m("tr", [
                m("th", [
                    m("label[for='postprocessing']", "Postprocessing"),
                    m("button.usePresetDefault#postprocessingDefault", {
                        style: {
                            display: tempProfile.baseProfile === "custom" ? "none" : (tempProfile.postprocessing === PrinterPresets.getPresetByUID(tempProfile.baseProfile).postprocessing ? "none" : "")
                        },
                        onclick: function (event) {
                            tempProfile.postprocessing = PrinterPresets.getPresetByUID(tempProfile.baseProfile).postprocessing;
                            document.getElementById("postprocessing").selectedIndex = PrinterPresets.getPostprocessorIndex(tempProfile.postprocessing) + 1;
                            event.target.style.display = "none";
                            if (tempProfile.postprocessing === "x3g") {
                                tempProfile.gpxProfile = "r2";
                                tempProfile.gpxConfigPath = "";
                                document.getElementById("x3gRow").style.display = "";
                            } else {
                                tempProfile.gpxProfile = false;
                                tempProfile.gpxConfigPath = "";
                                document.getElementById("x3gRow").style.display = "none";
                            }
                        }
                    })
                ]),
                m("td", {
                    colspan: 2,
                    style: {
                        "padding-top": "5px"
                    }
                }, [
                    m("select#postprocessing.formSelect", {
                        onchange: function (event) {
                            if (event.target.value === "none") {
                                tempProfile.postprocessing = false;
                            } else {
                                tempProfile.postprocessing = event.target.value;
                            }
                            let resetButton = document.getElementById("postprocessingDefault");
                            if (tempProfile.baseProfile === "custom" || tempProfile.postprocessing === PrinterPresets.getPresetByUID(tempProfile.baseProfile).postprocessing) {
                                resetButton.style.display = "none";
                            } else {
                                resetButton.style.display = "";
                            }
                            if (tempProfile.postprocessing === "x3g") {
                                if (tempProfile.gpxProfile === false) {
                                    tempProfile.gpxProfile = "r2";
                                    tempProfile.gpxConfigPath = "";
                                    document.getElementById("gpxProfile").selectedIndex = PrinterPresets.getGPXIndex("r2");
                                }
                                if (tempProfile.gpxProfile === "ini") {
                                    document.getElementById("gpxConfigFileRow").style.display = null;
                                } else {
                                    tempProfile.gpxConfigPath = "";
                                    document.getElementById("gpxConfigFileRow").style.display = "none";
                                }
                                document.getElementById("x3gRow").style.display = "";
                            } else {
                                tempProfile.gpxProfile = false;
                                tempProfile.gpxConfigPath = "";
                                document.getElementById("x3gRow").style.display = "none";
                                document.getElementById("gpxConfigFileRow").style.display = "none";
                            }
                        }
                    }, [
                        m("option", {
                            selected: tempProfile.postprocessing === false,
                            value: "none"
                        }, "None"),
                        PrinterPresets.postprocessors.map(function (postprocessor) {
                            return m("option", {
                                value: postprocessor[0],
                                selected: tempProfile.postprocessing === postprocessor[0]
                            }, postprocessor[1])
                        })
                    ])
                ])
            ]),

            m("tr#x3gRow", {
                style: {
                    display: (tempProfile.postprocessing === "x3g" ? "" : "none")
                }
            }, [
                m("th", [
                    m("label.tooltip[for='gpxProfile']", {
                        "data-tooltip": tooltips.x3g
                    }, "GPX Profile (for X3G)"),
                    m("button.usePresetDefault#x3gDefault", {
                        style: {
                            display: (tempProfile.baseProfile === "custom" || PrinterPresets.getPresetByUID(tempProfile.baseProfile).gpxProfile === false || tempProfile.gpxProfile === PrinterPresets.getPresetByUID(tempProfile.baseProfile).gpxProfile ? "none" : "")
                        },
                        onclick: function (event) {
                            tempProfile.gpxProfile = PrinterPresets.getPresetByUID(tempProfile.baseProfile).gpxProfile;
                            let dropdown = document.getElementById("gpxProfile");
                            if (tempProfile.gpxProfile) {
                                dropdown.selectedIndex = PrinterPresets.getGPXIndex(tempProfile.gpxProfile);
                            } else {
                                tempProfile.gpxProfile = "r2";
                                dropdown.selectedIndex = PrinterPresets.getGPXIndex("r2");
                            }
                            if (tempProfile.gpxProfile !== "ini") {
                                tempProfile.gpxConfigPath = "";
                                document.getElementById("gpxConfigFileRow").style.display = "none";
                            }
                            event.target.style.display = "none";
                        }
                    })
                ]),
                m("td", {
                    colspan: 2,
                    style: {
                        "padding-top": "5px"
                    }
                }, [
                    m("select#gpxProfile.formSelect", {
                        onchange: function (event) {
                            tempProfile.gpxProfile = PrinterPresets.gpxProfiles[event.target.selectedIndex][0];
                            let resetButton = document.getElementById("x3gDefault");
                            if (tempProfile.baseProfile === "custom"
                                || PrinterPresets.getPresetByUID(tempProfile.baseProfile).gpxProfile === false
                                || tempProfile.gpxProfile === PrinterPresets.getPresetByUID(tempProfile.baseProfile).gpxProfile) {
                                resetButton.style.display = "none";
                            } else {
                                resetButton.style.display = "";
                            }
                            if (tempProfile.gpxProfile === "ini") {
                                document.getElementById("gpxConfigFileRow").style.display = null;
                            } else {
                                tempProfile.gpxConfigPath = "";
                                document.getElementById("gpxConfigFileRow").style.display = "none";
                            }
                        }
                    }, [
                        PrinterPresets.gpxProfiles.map(function (profile) {
                            return m("option", {
                                config: function (el) {
                                    if (profile[0] === tempProfile.gpxProfile) {
                                        el.selected = true;
                                    } else if (tempProfile.gpxProfile === false && profile[0] === "r2") {
                                        el.selected = true;
                                    }
                                },
                                value: profile[0]
                            }, profile[1] + " (" + profile[0] + ")");
                        })
                    ])
                ])
            ]),

            m("tr#gpxConfigFileRow", {
                style: {
                    display: (tempProfile.postprocessing === "x3g" && tempProfile.gpxProfile === "ini" ? null : "none")
                }
            }, [
                m("th", "GPX Config File"),
                m("td", {
                    colspan: 2,
                    style: {
                        "padding-top": "5px"
                    }
                }, [
                    m("div", {
                        style: {
                            display: "flex",
                            "flex-direction": "row",
                            "flex-wrap": "nowrap",
                            "align-items": "center"
                        }
                    }, [
                        m("input#gpxConfigPath.formInputDisabled", {
                            style: {
                                "flex-basis": 0,
                                "flex-grow": 1
                            },
                            disabled: true,
                            value: tempProfile.gpxConfigPath
                        }),
                        m("button", {
                            style: {
                                "margin-top": 0,
                                "margin-left": "8px"
                            },
                            onclick: function (e) {
                                e.target.blur();
                                dialog.showOpenDialog(BrowserWindow.fromId(2), {
                                    filters: [{
                                        name: "GPX config files",
                                        extensions: ["ini"]
                                    }],
                                    properties: ["openFile"]
                                }, function (filenames) {
                                    if (filenames === undefined) {
                                        return;
                                    }
                                    tempProfile.gpxConfigPath = filenames[0];
                                    document.getElementById("gpxConfigPath").value = filenames[0];
                                });
                            }
                        }, "Browse...")
                    ]),
                    m("a", {
                        href: "http://mm3d.co/gpx",
                        style: {
                            "font-size": "0.8em"
                        }
                    }, "How do I create a GPX config file?")
                ])
            ])

        ];
    }

    function getDimensionsTabContent() {
        return [

            m("tr", [
                m("th", {
                    colspan: 3
                }, [
                    m("h3", {
                        style: {
                            "font-weight": "bold"
                        }
                    }, "Print Bed")
                ])
            ]),

            m("tr", [
                m("th", {
                    rowspan: 2
                }, [
                    m("span.tooltip", {
                        "data-tooltip": tooltips.printBedShape
                    }, "Print Bed Shape"),
                    m("button.usePresetDefault#bedShapeDefault", {
                        style: {
                            display: (tempProfile.baseProfile === "custom" ||
                                (tempProfile.printBedDimensions.circular ===
                                    PrinterPresets.getPresetByUID(tempProfile.baseProfile).printBed.circular &&
                                    (tempProfile.printBedDimensions.circular ? (tempProfile.printBedDimensions.diameter === PrinterPresets.getPresetByUID(tempProfile.baseProfile).printBed.diameter) : (tempProfile.printBedDimensions.x === PrinterPresets.getPresetByUID(tempProfile.baseProfile).printBed.x && tempProfile.printBedDimensions.y === PrinterPresets.getPresetByUID(tempProfile.baseProfile).printBed.y)))) ? "none" : ""
                        },
                        onclick: function (event) {
                            let baseProfile = PrinterPresets.getPresetByUID(tempProfile.baseProfile);
                            let evt = document.createEvent("HTMLEvents");
                            evt.initEvent("input", false, true);
                            if (baseProfile.printBed.circular) {
                                tempProfile.printBedDimensions.diameter = baseProfile.printBed.diameter;
                                document.getElementById("printBedDiameter").value = baseProfile.printBed.diameter;
                                document.getElementById("printBedCircular").click();
                                document.getElementById("printBedDiameter").dispatchEvent(evt);

                            } else {
                                tempProfile.printBedDimensions.x = baseProfile.printBed.x;
                                tempProfile.printBedDimensions.y = baseProfile.printBed.y;
                                document.getElementById("printBedX").value = baseProfile.printBed.x;
                                document.getElementById("printBedY").value = baseProfile.printBed.y;
                                document.getElementById("printBedRectangular").click();
                                document.getElementById("printBedX").dispatchEvent(evt);
                                document.getElementById("printBedY").dispatchEvent(evt);
                            }
                            updateBedOriginPreview(tempProfile.printBedDimensions);
                            event.target.style.display = "none";
                        }
                    })
                ]),
                m("td", [
                    m("div.checkboxGroup", [
                        m("input#printBedRectangular[type='radio']", {
                            name: "printBedShape",
                            checked: !tempProfile.printBedDimensions.circular,
                            onclick: function () {
                                if (tempProfile.printBedDimensions.circular) {
                                    tempProfile.printBedDimensions.circular = false;
                                    if (tempProfile.printBedDimensions.x === 0) {
                                        tempProfile.printBedDimensions.x = tempProfile.printBedDimensions.diameter;
                                    }
                                    if (tempProfile.printBedDimensions.y === 0) {
                                        tempProfile.printBedDimensions.y = tempProfile.printBedDimensions.diameter;
                                    }
                                    tempProfile.printBedDimensions.diameter = 0;
                                    let printBedXInput = document.getElementById("printBedX");
                                    let printBedYInput = document.getElementById("printBedY");
                                    let printBedDiameterInput = document.getElementById("printBedDiameter");
                                    document.getElementById("printBedPreviewRectangular").style.display = "block";
                                    document.getElementById("printBedPreviewCircular").style.display = "none";
                                    let bedPreview = document.getElementById("printBedPreviewRectangularBed");
                                    let dimensions = getBedPreviewRectangular(tempProfile.printBedDimensions);
                                    bedPreview.style.width = dimensions.x + "px";
                                    bedPreview.style.height = dimensions.y + "px";
                                    printBedXInput.disabled = false;
                                    printBedYInput.disabled = false;
                                    printBedDiameterInput.disabled = true;
                                    printBedXInput.value = tempProfile.printBedDimensions.x;
                                    printBedYInput.value = tempProfile.printBedDimensions.y;
                                    updateBedOriginPreview(tempProfile.printBedDimensions);
                                    FormValidation.resetValidationError(printBedDiameterInput.parentElement);
                                }
                                let baseProfile = PrinterPresets.getPresetByUID(tempProfile.baseProfile);
                                if (tempProfile.baseProfile === "custom" || (tempProfile.printBedDimensions.circular === baseProfile.printBed.circular && tempProfile.printBedDimensions.x === baseProfile.printBed.x && tempProfile.printBedDimensions.y === baseProfile.printBed.y)) {
                                    document.getElementById("bedShapeDefault").style.display = "none";
                                } else {
                                    document.getElementById("bedShapeDefault").style.display = "";
                                }
                                if (guidedSetup) {
                                    if (tempProfile.printBedDimensions.x > 0 && tempProfile.printBedDimensions.y > 0) {
                                        document.getElementById("newProfilePane6Next").disabled = false;
                                    } else {
                                        document.getElementById("newProfilePane6Next").disabled = true;
                                    }
                                }
                            }
                        }),
                        m("label[for='printBedRectangular']", "Rectangular")
                    ])
                ]),
                m("td", [
                    m("div.checkboxGroup", [
                        m("input#printBedCircular[type='radio']", {
                            name: "printBedShape",
                            checked: tempProfile.printBedDimensions.circular,
                            onclick: function () {
                                if (!tempProfile.printBedDimensions.circular) {
                                    tempProfile.printBedDimensions.circular = true;
                                    if (tempProfile.printBedDimensions.diameter === 0) {
                                        tempProfile.printBedDimensions.diameter = Math.min(tempProfile.printBedDimensions.x, tempProfile.printBedDimensions.y);
                                    }
                                    tempProfile.printBedDimensions.x = 0;
                                    tempProfile.printBedDimensions.y = 0;
                                    if (tempProfile.printBedDimensions.origin === "middle") {
                                        tempProfile.printBedDimensions.originOffsets.x = tempProfile.printBedDimensions.diameter / 2;
                                        tempProfile.printBedDimensions.originOffsets.y = tempProfile.printBedDimensions.diameter / 2;
                                        document.getElementById("bedOriginCustomX").value = tempProfile.printBedDimensions.originOffsets.x;
                                        document.getElementById("bedOriginCustomY").value = tempProfile.printBedDimensions.originOffsets.y;
                                    }
                                    let printBedXInput = document.getElementById("printBedX");
                                    let printBedYInput = document.getElementById("printBedY");
                                    let printBedDiameterInput = document.getElementById("printBedDiameter");
                                    document.getElementById("printBedPreviewRectangular").style.display = "none";
                                    document.getElementById("printBedPreviewCircular").style.display = "block";
                                    let bedPreview = document.getElementById("printBedPreviewCircularBed");
                                    let diameter = getBedPreviewCircular(tempProfile.printBedDimensions);
                                    bedPreview.style.width = diameter + "px";
                                    bedPreview.style.height = diameter + "px";
                                    printBedXInput.disabled = true;
                                    printBedYInput.disabled = true;
                                    printBedDiameterInput.disabled = false;
                                    printBedDiameterInput.value = tempProfile.printBedDimensions.diameter;
                                    updateBedOriginPreview(tempProfile.printBedDimensions);
                                    FormValidation.resetValidationError(printBedXInput.parentElement);
                                    FormValidation.resetValidationError(printBedYInput.parentElement);
                                }
                                let baseProfile = PrinterPresets.getPresetByUID(tempProfile.baseProfile);
                                if (tempProfile.baseProfile === "custom" || (tempProfile.printBedDimensions.circular === baseProfile.printBed.circular && tempProfile.printBedDimensions.diameter === baseProfile.printBed.diameter)) {
                                    document.getElementById("bedShapeDefault").style.display = "none";
                                } else {
                                    document.getElementById("bedShapeDefault").style.display = "";
                                }
                                if (guidedSetup) {
                                    if (tempProfile.printBedDimensions.diameter > 0) {
                                        document.getElementById("newProfilePane6Next").disabled = false;
                                    } else {
                                        document.getElementById("newProfilePane6Next").disabled = true;
                                    }
                                }
                            }
                        }),
                        m("label[for='printBedCircular']", "Circular")
                    ])
                ])
            ]),

            m("tr", [
                m("td", {
                    colspan: 2
                }, [
                    m("div#printBedPreviewRectangular", {
                        config: function (el) {
                            if (tempProfile.printBedDimensions.circular) {
                                el.style.display = "none";
                            }
                        }
                    }, [
                        m("div#printBedPreviewRectangularBed", {
                            config: function (el) {
                                let dimensions = getBedPreviewRectangular(tempProfile.printBedDimensions);
                                el.style.width = dimensions.x + "px";
                                el.style.height = dimensions.y + "px";
                            }
                        }, [
                            m("div#printBedPreviewRectangularOrigin", {
                                config: function (el) {
                                    updateBedOriginPreview(tempProfile.printBedDimensions);
                                },
                                style: {
                                    marginTop: "-4px",
                                    marginLeft: "-2px"
                                }
                            }),
                            m("label[for='printBedX'].xLabel", "X"),
                            m("label[for='printBedY'].yLabel", "Y"),
                            m("div.yInput", [
                                m("div#printBedYError.formError", [
                                    m("input#printBedY.formInput", {
                                        style: {
                                            width: "70px",
                                            display: "inline-block"
                                        },
                                        disabled: tempProfile.printBedDimensions.circular,
                                        value: tempProfile.printBedDimensions.y === 0 ? "" : tempProfile.printBedDimensions.y,
                                        oninput: function (event) {
                                            tempProfile.printBedDimensions.y = FormValidation.validateNumberInput(event.target.value, 0,
                                                0, false,
                                                false, true,
                                                true,
                                                event.target.parentElement, "Print bed Y", "mm");
                                            if (tempProfile.printBedDimensions.y > 0) {
                                                let previewDimensions = getBedPreviewRectangular(tempProfile.printBedDimensions);
                                                let previewBed = document.getElementById("printBedPreviewRectangularBed");
                                                previewBed.style.width = previewDimensions.x + "px";
                                                previewBed.style.height = previewDimensions.y + "px";
                                            }
                                            if (tempProfile.baseProfile === "custom" || tempProfile.printBedDimensions.y === PrinterPresets.getPresetByUID(tempProfile.baseProfile).printBed.y) {
                                                document.getElementById("bedShapeDefault").style.display = "none";
                                            } else {
                                                document.getElementById("bedShapeDefault").style.display = "";
                                            }
                                            if (tempProfile.printBedDimensions.origin === "middle") {
                                                tempProfile.printBedDimensions.originOffsets.y = tempProfile.printBedDimensions.y / 2;
                                                document.getElementById("bedOriginCustomY").value = tempProfile.printBedDimensions.originOffsets.y;
                                            }
                                            if (guidedSetup) {
                                                if (tempProfile.printBedDimensions.x > 0 && tempProfile.printBedDimensions.y > 0) {
                                                    document.getElementById("newProfilePane6Next").disabled = false;
                                                } else {
                                                    document.getElementById("newProfilePane6Next").disabled = true;
                                                }
                                            }
                                        }
                                    }),
                                    m("label[for='printBedY']", {
                                        style: {
                                            "padding-left": "5px"
                                        }
                                    }, " mm")
                                ])
                            ]),
                            m("div.xInput", [
                                m("div#printBedXError.formError", [
                                    m("input#printBedX.formInput", {
                                        style: {
                                            width: "70px",
                                            display: "inline-block"
                                        },
                                        disabled: tempProfile.printBedDimensions.circular,
                                        value: tempProfile.printBedDimensions.x === 0 ? "" : tempProfile.printBedDimensions.x,
                                        oninput: function (event) {
                                            tempProfile.printBedDimensions.x = FormValidation.validateNumberInput(event.target.value, 0,
                                                0, false,
                                                false, true,
                                                true,
                                                event.target.parentElement, "Print bed X", "mm");
                                            if (tempProfile.printBedDimensions.x > 0) {
                                                let previewDimensions = getBedPreviewRectangular(tempProfile.printBedDimensions);
                                                let previewBed = document.getElementById("printBedPreviewRectangularBed");
                                                previewBed.style.width = previewDimensions.x + "px";
                                                previewBed.style.height = previewDimensions.y + "px";
                                            }
                                            if (tempProfile.baseProfile === "custom" || tempProfile.printBedDimensions.x === PrinterPresets.getPresetByUID(tempProfile.baseProfile).printBed.x) {
                                                document.getElementById("bedShapeDefault").style.display = "none";
                                            } else {
                                                document.getElementById("bedShapeDefault").style.display = "";
                                            }
                                            if (tempProfile.printBedDimensions.origin === "middle") {
                                                tempProfile.printBedDimensions.originOffsets.x = tempProfile.printBedDimensions.x / 2;
                                                document.getElementById("bedOriginCustomX").value = tempProfile.printBedDimensions.originOffsets.x;
                                            }
                                            if (guidedSetup) {
                                                if (tempProfile.printBedDimensions.x > 0 && tempProfile.printBedDimensions.y > 0) {
                                                    document.getElementById("newProfilePane6Next").disabled = false;
                                                } else {
                                                    document.getElementById("newProfilePane6Next").disabled = true;
                                                }
                                            }
                                        }
                                    }),
                                    m("label[for='printBedX']", {
                                        style: {
                                            "padding-left": "5px"
                                        }
                                    }, " mm")
                                ])
                            ])
                        ])
                    ]),
                    m("div#printBedPreviewCircular", {
                        config: function (el) {
                            if (!tempProfile.printBedDimensions.circular) {
                                el.style.display = "none";
                            }
                        }
                    }, [
                        m("div#printBedPreviewCircularBed", {
                            config: function (el) {
                                let diameter = getBedPreviewCircular(tempProfile.printBedDimensions);
                                el.style.width = diameter + "px";
                                el.style.height = diameter + "px";
                            },
                            style: {
                                "border-radius": "50%"
                            }
                        }, [
                            m("div#printBedPreviewCircularOrigin", {
                                config: function (el) {
                                    updateBedOriginPreview(tempProfile.printBedDimensions);
                                },
                                style: {
                                    marginTop: "-4px",
                                    marginLeft: "-2px",
                                }
                            }),
                            m("label[for='printBedDiameter'].diameterLabel", "Diameter"),
                            m("div.diameterInput", [
                                m("div#printBedDiameterError.formError", [
                                    m("input#printBedDiameter.formInput", {
                                        style: {
                                            width: "70px",
                                            display: "inline-block"
                                        },
                                        disabled: !tempProfile.printBedDimensions.circular,
                                        value: tempProfile.printBedDimensions.diameter === 0 ? "" : tempProfile.printBedDimensions.diameter,
                                        oninput: function (event) {
                                            tempProfile.printBedDimensions.diameter = FormValidation.validateNumberInput(event.target.value, 0,
                                                0, false,
                                                false, true,
                                                true,
                                                event.target.parentElement, "Print bed diameter", "mm");
                                            if (tempProfile.printBedDimensions.diameter > 0) {
                                                let diameter = getBedPreviewCircular(tempProfile.printBedDimensions);
                                                let previewBed = document.getElementById("printBedPreviewCircularBed");
                                                previewBed.style.width = diameter + "px";
                                                previewBed.style.height = diameter + "px";
                                            }
                                            if (tempProfile.baseProfile === "custom" || tempProfile.printBedDimensions.diameter === PrinterPresets.getPresetByUID(tempProfile.baseProfile).printBed.diameter) {
                                                document.getElementById("bedShapeDefault").style.display = "none";
                                            } else {
                                                document.getElementById("bedShapeDefault").style.display = "";
                                            }
                                            if (tempProfile.printBedDimensions.origin === "middle") {
                                                tempProfile.printBedDimensions.originOffsets.x = tempProfile.printBedDimensions.diameter / 2;
                                                tempProfile.printBedDimensions.originOffsets.y = tempProfile.printBedDimensions.diameter / 2;
                                                document.getElementById("bedOriginCustomX").value = tempProfile.printBedDimensions.originOffsets.x;
                                                document.getElementById("bedOriginCustomY").value = tempProfile.printBedDimensions.originOffsets.x;
                                            }
                                            if (guidedSetup) {
                                                if (tempProfile.printBedDimensions.diameter > 0) {
                                                    document.getElementById("newProfilePane6Next").disabled = false;
                                                } else {
                                                    document.getElementById("newProfilePane6Next").disabled = true;
                                                }
                                            }
                                        }
                                    }),
                                    m("label[for='printBedX']", {
                                        style: {
                                            "padding-left": "5px"
                                        }
                                    }, " mm")
                                ])
                            ])
                        ])
                    ])
                ])
            ]),

            m("tr", [
                m("th", [
                    m("label.tooltip", {
                        "data-tooltip": tooltips.printBedOrigin
                    }, "Print Bed Origin"),
                    m("button.usePresetDefault#bedOriginDefault", {
                        style: {
                            display: (tempProfile.baseProfile === "custom" || (tempProfile.printBedDimensions.origin === PrinterPresets.getPresetByUID(tempProfile.baseProfile).printBed.origin && (tempProfile.printBedDimensions.origin !== "custom" || (tempProfile.printBedDimensions.originOffsets.x === PrinterPresets.getPresetByUID(tempProfile.baseProfile).printBed.originOffsets.x && tempProfile.printBedDimensions.originOffsets.y === PrinterPresets.getPresetByUID(tempProfile.baseProfile).printBed.originOffsets.y)))) ? "none" : ""
                        },
                        onclick: function (event) {
                            let baseProfile = PrinterPresets.getPresetByUID(tempProfile.baseProfile);
                            if (baseProfile.printBed.origin === "bottomleft") {
                                document.getElementById("bedOriginBottomLeft").click();
                            } else if (baseProfile.printBed.origin === "middle") {
                                document.getElementById("bedOriginMiddle").click();
                            } else {
                                let evt = document.createEvent("HTMLEvents");
                                evt.initEvent("input", false, true);
                                tempProfile.printBedDimensions.originOffsets.x = baseProfile.printBed.originOffsets.x;
                                tempProfile.printBedDimensions.originOffsets.y = baseProfile.printBed.originOffsets.y;
                                document.getElementById("bedOriginCustomX").value = baseProfile.printBed.originOffsets.x;
                                document.getElementById("bedOriginCustomY").value = baseProfile.printBed.originOffsets.y;
                                document.getElementById("bedOriginCustom").click();
                                document.getElementById("bedOriginCustomX").dispatchEvent(evt);
                                document.getElementById("bedOriginCustomY").dispatchEvent(evt);
                                updateBedOriginPreview(tempProfile.printBedDimensions);
                            }
                            event.target.style.display = "none";
                        }
                    })
                ]),
                m("td", [
                    m("div.checkboxGroup", [
                        m("input#bedOriginBottomLeft[type='radio']", {
                            name: "bedOrigin",
                            value: "bottomleft",
                            checked: tempProfile.printBedDimensions.origin === "bottomleft",
                            onclick: function () {
                                tempProfile.printBedDimensions.origin = "bottomLeft";
                                tempProfile.printBedDimensions.originOffsets.x = 0;
                                tempProfile.printBedDimensions.originOffsets.y = 0;
                                let offsetX = document.getElementById("bedOriginCustomX");
                                let offsetY = document.getElementById("bedOriginCustomY");
                                offsetX.disabled = true;
                                offsetY.disabled = true;
                                offsetX.value = tempProfile.printBedDimensions.originOffsets.x;
                                offsetY.value = tempProfile.printBedDimensions.originOffsets.y;
                                offsetX.style.opacity = 0.3;
                                offsetY.style.opacity = 0.3;
                                updateBedOriginPreview(tempProfile.printBedDimensions);
                                if (tempProfile.baseProfile === "custom" || tempProfile.printBedDimensions.origin === PrinterPresets.getPresetByUID(tempProfile.baseProfile).printBed.origin) {
                                    document.getElementById("bedOriginDefault").style.display = "none";
                                } else {
                                    document.getElementById("bedOriginDefault").style.display = "";
                                }
                            }
                        }),
                        m("label[for='bedOriginBottomLeft']", "Bottom-left")
                    ]),
                    m("div.checkboxGroup", [
                        m("input#bedOriginMiddle[type='radio']", {
                            name: "bedOrigin",
                            value: "middle",
                            checked: tempProfile.printBedDimensions.origin === "middle",
                            onclick: function () {
                                tempProfile.printBedDimensions.origin = "middle";
                                if (tempProfile.printBedDimensions.circular) {
                                    tempProfile.printBedDimensions.originOffsets.x = tempProfile.printBedDimensions.diameter / 2;
                                    tempProfile.printBedDimensions.originOffsets.y = tempProfile.printBedDimensions.diameter / 2;
                                } else {
                                    tempProfile.printBedDimensions.originOffsets.x = tempProfile.printBedDimensions.x / 2;
                                    tempProfile.printBedDimensions.originOffsets.y = tempProfile.printBedDimensions.y / 2;
                                }
                                let offsetX = document.getElementById("bedOriginCustomX");
                                let offsetY = document.getElementById("bedOriginCustomY");
                                offsetX.disabled = true;
                                offsetY.disabled = true;
                                offsetX.value = tempProfile.printBedDimensions.originOffsets.x;
                                offsetY.value = tempProfile.printBedDimensions.originOffsets.y;
                                offsetX.style.opacity = 0.3;
                                offsetY.style.opacity = 0.3;
                                updateBedOriginPreview(tempProfile.printBedDimensions);
                                if (tempProfile.baseProfile === "custom" || tempProfile.printBedDimensions.origin === PrinterPresets.getPresetByUID(tempProfile.baseProfile).printBed.origin) {
                                    document.getElementById("bedOriginDefault").style.display = "none";
                                } else {
                                    document.getElementById("bedOriginDefault").style.display = "";
                                }
                            }
                        }),
                        m("label[for='bedOriginMiddle']", "Middle")
                    ])
                ]),
                m("td", [
                    m("div.checkboxGroup", [
                        m("input#bedOriginCustom[type='radio']", {
                            name: "bedOrigin",
                            value: "custom",
                            checked: tempProfile.printBedDimensions.origin === "custom",
                            onclick: function () {
                                tempProfile.printBedDimensions.origin = "custom";
                                let offsetX = document.getElementById("bedOriginCustomX");
                                let offsetY = document.getElementById("bedOriginCustomY");
                                offsetX.disabled = false;
                                offsetY.disabled = false;
                                offsetX.style.opacity = 1;
                                offsetY.style.opacity = 1;
                                if (tempProfile.baseProfile === "custom" || (PrinterPresets.getPresetByUID(tempProfile.baseProfile).printBed.origin === "custom" && tempProfile.printBedDimensions.originOffsets.x === PrinterPresets.getPresetByUID(tempProfile.baseProfile).printBed.originOffsets.x && tempProfile.printBedDimensions.originOffsets.y === PrinterPresets.getPresetByUID(tempProfile.baseProfile).printBed.originOffsets.y)) {
                                    document.getElementById("bedOriginDefault").style.display = "none";
                                } else {
                                    document.getElementById("bedOriginDefault").style.display = "";
                                }
                            }
                        }),
                        m("label[for='bedOriginCustom']", "Custom offsets"),
                        m("table", {
                            style: {
                                "table-layout": "fixed",
                                "margin-left": "28px"
                            }
                        }, [
                            m("tbody", [
                                m("tr", [
                                    m("th", {
                                        style: {
                                            width: "20px",
                                            "font-weight": "500"
                                        }
                                    }, [
                                        m("label[for='bedOriginCustomX']", "X")
                                    ]),
                                    m("td", [
                                        m("div.formError#bedOriginCustomXError", [
                                            m("input.formInput#bedOriginCustomX[type='text']", {
                                                style: {
                                                    "width": "60px",
                                                    "display": "inline-block",
                                                    "margin-right": "5px",
                                                    "margin-bottom": 0,
                                                    opacity: (tempProfile.printBedDimensions.origin === "custom" ? 1 : 0.3)
                                                },
                                                value: tempProfile.printBedDimensions.originOffsets.x || "0",
                                                disabled: tempProfile.printBedDimensions.origin !== "custom",
                                                oninput: function (event) {
                                                    tempProfile.printBedDimensions.originOffsets.x = FormValidation.validateNumberInput(
                                                        event.target.value,
                                                        0,
                                                        false, true,
                                                        false, true,
                                                        true,
                                                        event.target.parentElement,
                                                        "Print bed offset X", "mm");
                                                    updateBedOriginPreview(tempProfile.printBedDimensions);

                                                    if (tempProfile.baseProfile === "custom" || (PrinterPresets.getPresetByUID(tempProfile.baseProfile).printBed.origin === "custom" && tempProfile.printBedDimensions.originOffsets.x === PrinterPresets.getPresetByUID(tempProfile.baseProfile).printBed.originOffsets.x && tempProfile.printBedDimensions.originOffsets.y === PrinterPresets.getPresetByUID(tempProfile.baseProfile).printBed.originOffsets.y)) {
                                                        document.getElementById("bedOriginDefault").style.display = "none";
                                                    } else {
                                                        document.getElementById("bedOriginDefault").style.display = "";
                                                    }
                                                }
                                            }),
                                            m("label[for='bedOriginCustomX']", " mm")
                                        ])
                                    ])
                                ]),
                                m("tr", [
                                    m("th", {
                                        style: {
                                            width: "20px",
                                            "font-weight": "500"
                                        }
                                    }, [
                                        m("label[for='bedOriginCustomY']", "Y")
                                    ]),
                                    m("td", [
                                        m("div.formError#bedOriginCustomYError", [
                                            m("input.formInput#bedOriginCustomY[type='text']", {
                                                style: {
                                                    "width": "60px",
                                                    "display": "inline-block",
                                                    "margin-right": "5px",
                                                    opacity: (tempProfile.printBedDimensions.origin === "custom" ? 1 : 0.3)
                                                },
                                                value: tempProfile.printBedDimensions.originOffsets.y || "0",
                                                disabled: tempProfile.printBedDimensions.origin !== "custom",
                                                oninput: function (event) {
                                                    tempProfile.printBedDimensions.originOffsets.y = FormValidation.validateNumberInput(
                                                        event.target.value,
                                                        0,
                                                        false, true,
                                                        false, true,
                                                        true,
                                                        event.target.parentElement,
                                                        "Print bed offset Y", "mm");
                                                    updateBedOriginPreview(tempProfile.printBedDimensions);
                                                    if (tempProfile.baseProfile === "custom" || (PrinterPresets.getPresetByUID(tempProfile.baseProfile).printBed.origin === "custom" && tempProfile.printBedDimensions.originOffsets.x === PrinterPresets.getPresetByUID(tempProfile.baseProfile).printBed.originOffsets.x && tempProfile.printBedDimensions.originOffsets.y === PrinterPresets.getPresetByUID(tempProfile.baseProfile).printBed.originOffsets.y)) {
                                                        document.getElementById("bedOriginDefault").style.display = "none";
                                                    } else {
                                                        document.getElementById("bedOriginDefault").style.display = "";
                                                    }
                                                }
                                            }),
                                            m("label[for='bedOriginCustomY']", " mm")
                                        ])
                                    ])
                                ])
                            ])
                        ])
                    ])
                ])
            ]),

            m("tr", [
                m("th", {
                    rowspan: 2
                }, [
                    m("span.tooltip", {
                        "data-tooltip": tooltips.bowdenTube
                    }, "Bowden Printers"),
                    m("button.usePresetDefault#bowdenBufferDefault", {
                        style: {
                            display: (tempProfile.baseProfile === "custom" || tempProfile.bowdenTube === PrinterPresets.getPresetByUID(tempProfile.baseProfile).bowdenTube) ? "none" : ""
                        },
                        onclick: function (event) {
                            let baseProfile = PrinterPresets.getPresetByUID(tempProfile.baseProfile);
                            let hasBowdenBuffer = document.getElementById("hasBowdenBuffer");
                            if (baseProfile.bowdenTube === false) {
                                if (hasBowdenBuffer.checked) {
                                    hasBowdenBuffer.click();
                                }
                            } else {
                                if (!hasBowdenBuffer.checked) {
                                    hasBowdenBuffer.click();
                                }
                                tempProfile.bowdenTube = baseProfile.bowdenTube;
                                document.getElementById("bowdenBuffer").value = tempProfile.bowdenTube;
                            }
                            event.target.style.display = "none";
                        }
                    })
                ]),

                m("td", {
                    colspan: 2
                }, [
                    m("div.checkboxGroup", [
                        m("input#hasBowdenBuffer[type='checkbox']", {
                            checked: tempProfile.bowdenTube !== false,
                            onclick: function (event) {
                                let additionalBox = document.getElementById("bowdenCustomize");
                                let additionalInput = document.getElementById("bowdenBuffer");
                                if (event.target.checked) {
                                    tempProfile.bowdenTube = BOWDEN_DEFAULT;
                                    additionalInput.value = tempProfile.bowdenTube;
                                    additionalBox.style.opacity = 1;
                                    additionalInput.disabled = false;
                                    additionalInput.focus();
                                } else {
                                    additionalBox.style.opacity = 0.3;
                                    additionalInput.disabled = true;
                                    tempProfile.bowdenTube = false;
                                    additionalInput.value = "";
                                    FormValidation.resetValidationError(additionalInput.parentElement);
                                }
                                if (tempProfile.baseProfile === "custom" || tempProfile.bowdenTube === PrinterPresets.getPresetByUID(tempProfile.baseProfile).bowdenTube) {
                                    document.getElementById("bowdenBufferDefault").style.display = "none";
                                } else {
                                    document.getElementById("bowdenBufferDefault").style.display = "";
                                }
                            }
                        }),
                        m("label[for='hasBowdenBuffer']", "Printer has a Bowden tube")
                    ])
                ]),

            ]),

            m("tr", [
                m("td", {
                    colspan: 2
                }, [
                    m("div#bowdenCustomize", {
                        config: function (el) {
                            if (tempProfile.bowdenTube === false) {
                                el.style.opacity = 0.3;
                            }
                        },
                        style: {
                            "margin-left": "26px"
                        }
                    }, [
                        m("label[for='bowdenBuffer']", "Length of Bowden tube (mm)"),
                        m("div#bowdenBufferError.formError", [
                            m("input#bowdenBuffer.formInput", {
                                value: (tempProfile.bowdenTube === false ? "" : tempProfile.bowdenTube),
                                disabled: tempProfile.bowdenTube === false,
                                oninput: function (event) {
                                    tempProfile.bowdenTube = FormValidation.validateNumberInput(event.target.value,
                                        (profile ? profile.bowdenTube : BOWDEN_NONE),
                                        BOWDEN_NONE, false,
                                        false, true,
                                        true,
                                        event.target.parentElement, "Bowden Tube Length", "mm");
                                    if (tempProfile.baseProfile === "custom" || tempProfile.bowdenTube === PrinterPresets.getPresetByUID(tempProfile.baseProfile).bowdenTube) {
                                        document.getElementById("bowdenBufferDefault").style.display = "none";
                                    } else {
                                        document.getElementById("bowdenBufferDefault").style.display = "";
                                    }
                                }
                            })
                        ])
                    ])
                ])
            ])

        ];
    }

    if (newProfileWizard) {

        function updateSetupContent() {

            let customTubeClipImage = "";
            let customTubeClipText = "If you require a different clip geometry, please look [here](http://mm3d.co/guide-clip).";
            let customScrollWheelImage = "";
            let customScrollWheelText = "";
            let customPositionPaletteImage = "";
            let customPositionPaletteText = "";
            let customFinalSetupImage = "";
            let customFinalSetupText = "";

            if (tempProfile.baseProfile !== "custom") {
                let baseProfile = PrinterPresets.getPresetByUID(tempProfile.baseProfile);
                if (baseProfile.customSetupInfo) {
                    if (baseProfile.customSetupInfo.tubeClipImage) {
                        customTubeClipImage = baseProfile.customSetupInfo.tubeClipImage;
                    }
                    if (baseProfile.customSetupInfo.tubeClipText) {
                        customTubeClipText = baseProfile.customSetupInfo.tubeClipText;
                    }
                    if (baseProfile.customSetupInfo.scrollWheelImage) {
                        customScrollWheelImage = baseProfile.customSetupInfo.scrollWheelImage;
                    }
                    if (baseProfile.customSetupInfo.scrollWheelText) {
                        customScrollWheelText = baseProfile.customSetupInfo.scrollWheelText;
                    }
                    if (baseProfile.customSetupInfo.positionPaletteImage) {
                        customPositionPaletteImage = baseProfile.customSetupInfo.positionPaletteImage;
                    }
                    if (baseProfile.customSetupInfo.positionPaletteText) {
                        customPositionPaletteText = baseProfile.customSetupInfo.positionPaletteText;
                    }
                    if (baseProfile.customSetupInfo.finalSetupImage) {
                        customFinalSetupImage = baseProfile.customSetupInfo.finalSetupImage;
                    }
                    if (baseProfile.customSetupInfo.finalSetupText) {
                        customFinalSetupText = baseProfile.customSetupInfo.finalSetupText;
                    }
                }
            }
            if (customScrollWheelText === "") {
                if (tempProfile.bowdenTube === false) {
                    customScrollWheelText = "Position your Scroll Wheel so that it securely attaches to your printer and can move freely in all axes.";
                } else {
                    customScrollWheelText = "Position your Scroll Wheel so that it securely attaches to your printer and provides a smooth filament path into your extruder.";
                }
            }
            if (customFinalSetupText === "") {
                if (tempProfile.bowdenTube === false) {
                    customFinalSetupText = "See below for some examples of printer and Palette setups.";
                } else {
                    customFinalSetupText = "See below for an example of a printer and Palette setup.";
                }
            }
            m.render(document.getElementById("tubeClipText"), m.trust(marked(customTubeClipText)));
            document.getElementById("scrollWheelPlacementText").innerText = customScrollWheelText;
            m.render(document.getElementById("palettePlacementText"), m.trust(marked(customPositionPaletteText)));
            document.getElementById("confirmSetupText").innerText = customFinalSetupText;
            if (customTubeClipImage) {
                document.getElementById("tubeClipImage").style.backgroundImage = "url('" + customTubeClipImage + "')";
                document.getElementById("tubeClipImage").style.display = "block";
                document.getElementById("tubeClipAnimation").style.display = "none";
            } else {
                document.getElementById("tubeClipImage").style.display = "none";
                document.getElementById("tubeClipAnimation").style.display = "block";
            }
            if (customScrollWheelImage) {
                document.getElementById("scrollWheelPlacementImage").style.backgroundImage = "url('" + customScrollWheelImage + "')";
                document.getElementById("scrollWheelPlacementImage").style.display = "block";
                document.getElementById("directDriveScrollWheelPlacementAnimation").style.display = "none";
                document.getElementById("bowdenScrollWheelPlacementAnimation").style.display = "none";
            } else if (tempProfile.bowdenTube !== false) {
                document.getElementById("scrollWheelPlacementImage").style.display = "none";
                document.getElementById("directDriveScrollWheelPlacementAnimation").style.display = "none";
                document.getElementById("bowdenScrollWheelPlacementAnimation").style.display = "block";
            } else {
                document.getElementById("scrollWheelPlacementImage").style.display = "none";
                document.getElementById("directDriveScrollWheelPlacementAnimation").style.display = "block";
                document.getElementById("bowdenScrollWheelPlacementAnimation").style.display = "none";
            }
            if (customPositionPaletteImage) {
                document.getElementById("palettePlacementImage").style.backgroundImage = "url('" + customPositionPaletteImage + "')";
                document.getElementById("palettePlacementImage").style.display = "block";
                document.getElementById("palettePlacementAnimation").style.display = "none";
            } else {
                document.getElementById("palettePlacementImage").style.display = "none";
                document.getElementById("palettePlacementAnimation").style.display = "block";
            }
            if (customFinalSetupImage) {
                m.render(document.getElementById("confirmSetupImage"), [
                    m("div", {
                        style: {
                            width: "500px",
                            height: "250px",
                            "margin-left": "auto",
                            "margin-right": "auto",
                            "background-size": "contain",
                            "background-image": "url('" + customFinalSetupImage + "')"
                        }
                    })
                ]);
            } else if (tempProfile.bowdenTube !== false) {
                m.render(document.getElementById("confirmSetupImage"), [
                    m("div", {
                        style: {
                            width: "500px",
                            height: "250px",
                            "margin-left": "auto",
                            "margin-right": "auto",
                            "background-size": "contain",
                            "background-image": "url('../assets/onboarding/images/bowden.png')"
                        }
                    })
                ]);
            } else {
                m.render(document.getElementById("confirmSetupImage"), getImageGallery("confirmSetupGallery", 500, 250, [
                    "../assets/onboarding/images/makerbot-rep2.png",
                    "../assets/onboarding/images/craftbot.png",
                    "../assets/onboarding/images/wanhao-i3.png",
                    "../assets/onboarding/images/printrbot.png",
                ]));
            }

        }

        function getPane12Content() {
            if (tempProfile.postprocessing === "makerbot") {
                return [
                    m("h3", "Configure Slicer"),
                    m("p", "The following guides will show you how to set up your slicer in preparation for running a calibration print."),
                    m("ul", [
                        m("li", [
                            m("a", {
                                href: "http://mm3d.co/simplify3d-5thgen"
                            }, "Simplify3D"),
                            " (recommended)"
                        ]),
                        m("li", [
                            m("a", {
                                href: "http://mm3d.co/slic3r-5thgen"
                            }, "Slic3r"),
                            " (advanced)"
                        ])
                    ]),
                    m("div.paneButtons", [
                        m("div.leftPane", [
                            m("button.formButton", {
                                onclick: closeProfileModal
                            }, "Cancel")
                        ]),
                        m("div.rightPane", [
                            m("button.formButton", {
                                onclick: function () {
                                    event.target.blur();
                                    document.getElementById("open-modal").scrollTop = 0;
                                    document.getElementById("newProfilePane12").style.display = "none";
                                    document.getElementById("newProfilePane11").style.display = "block";
                                    document.getElementById("guidedSetupProgress").style.width = "90%";
                                    setTimeout(function () {
                                        if (document.getElementById("newProfilePane11").style.display === "block") {
                                            bmPositionPalette.play();
                                        }
                                    }, 500);
                                }
                            }, "Back"),
                            m("button.formButton#newProfilePane12Next", {
                                onclick: function () {
                                    event.target.blur();
                                    document.getElementById("open-modal").scrollTop = 0;
                                    document.getElementById("newProfilePane12").style.display = "none";
                                    document.getElementById("newProfilePane13").style.display = "block";
                                    document.getElementById("guidedSetupProgress").style.width = "100%";
                                }
                            }, "Next")
                        ])
                    ])
                ];
            }
            if (tempProfile.extruderCount > 1) {
                return [
                    m("h3", "Configure Multi-Extruder Printer"),
                    m("p", "Because your printer has more than one extruder, you'll need to make a few adjustments in your slicer before continuing."),
                    m("p", [
                        "You can use any ",
                        m("strong", m("em", "one")),
                        " of your printer's extruders, but your start sequence must:"
                    ]),
                    m("ul", [
                        m("li", "Not contain any tool change commands,"),
                        m("li", "Only prime/purge one extruder, and"),
                        m("li", "Only heat the extruder that will be used for printing.")
                    ]),
                    m("p", [
                        "For more detailed information and help, see ",
                        m("a", {
                            href: "http://mm3d.co/dual-extruders"
                        }, "mm3d.co/dual-extruders"),
                        "."
                    ]),
                    m("div.paneButtons", [
                        m("div.leftPane", [
                            m("button.formButton", {
                                onclick: closeProfileModal
                            }, "Cancel")
                        ]),
                        m("div.rightPane", [
                            m("button.formButton", {
                                onclick: function () {
                                    event.target.blur();
                                    document.getElementById("open-modal").scrollTop = 0;
                                    document.getElementById("newProfilePane12").style.display = "none";
                                    document.getElementById("newProfilePane11").style.display = "block";
                                    document.getElementById("guidedSetupProgress").style.width = "90%";
                                    setTimeout(function () {
                                        if (document.getElementById("newProfilePane11").style.display === "block") {
                                            bmPositionPalette.play();
                                        }
                                    }, 500);
                                }
                            }, "Back"),
                            m("button.formButton#newProfilePane12Next", {
                                onclick: function () {
                                    event.target.blur();
                                    document.getElementById("open-modal").scrollTop = 0;
                                    document.getElementById("newProfilePane12").style.display = "none";
                                    document.getElementById("newProfilePane13").style.display = "block";
                                    document.getElementById("guidedSetupProgress").style.width = "100%";
                                }
                            }, "Next")
                        ])
                    ])
                ];
            }
            return [];
        }

        let skipPane2 = false;
        let skipPane3 = false;
        let skipPane4 = false;
        let bmGuideTubeClip;
        let bmBowdenTubeReplacement;
        let bmScrollWheelPlacement;
        let bmBowdenScrollWheelPlacement;
        let bmPositionPalette;
        m.render(modalWindow, [
            m("div.container", [
                m("div.printerProfile", {
                    style: {
                        position: "relative",
                        "padding-bottom": "70px"
                    }
                }, [
                    getWizardProgressBar(5, "guidedSetupProgressBar", "guidedSetupProgress"),
                    m("h2", "New Printer Profile"),
                    m("span#errorText"),
                    m("br"),

                    m("div#newProfilePanes", [
                        m("div#newProfilePane1", [
                            m("h3", "Select your printer manufacturer"),
                            m("div.paneScrollBox", [
                                PrinterPresets.presets.map(function (brand) {
                                    return m("div.checkboxGroup", [
                                        m("input#presetBrand_" + brand.name + "[type='radio']", {
                                            name: "presetBrand",
                                            onclick: function () {
                                                m.render(document.getElementById("presetModelSelect"), [
                                                    brand.models.map(function (model) {
                                                        return m("div.checkboxGroup", [
                                                            m("input#presetModel_" + model.uid + "[type='radio']", {
                                                                value: model.uid,
                                                                name: "presetModel",
                                                                onclick: function (event) {
                                                                    tempProfile.baseProfile = event.target.value;
                                                                    let originalName = PrinterPresets.getPresetByUID(tempProfile.baseProfile).name;
                                                                    let profileName = originalName;
                                                                    let counter = 2;
                                                                    while (true) {
                                                                        let uniqueName = true;
                                                                        PrinterProfiles.getProfileList().forEach(function (printer) {
                                                                            if (printer.profileName.toLowerCase() === profileName.toLowerCase()) {
                                                                                uniqueName = false;
                                                                            }
                                                                        });
                                                                        if (uniqueName) {
                                                                            tempProfile.profileName = profileName;
                                                                            document.getElementById("profileName").value = profileName;
                                                                            FormValidation.resetValidationError(document.getElementById("profileNameError"));
                                                                            break;
                                                                        } else {
                                                                            profileName = originalName + " " + counter;
                                                                            counter++;
                                                                        }
                                                                    }
                                                                    skipPane3 = true;
                                                                    skipPane4 = false;
                                                                    document.getElementById("profileCustomize").checked = false;
                                                                    document.getElementById("newProfilePane2Next").disabled = false;
                                                                    document.getElementById("newProfilePane4Next").disabled = false;
                                                                }
                                                            }),
                                                            m("label[for='presetModel_" + model.uid + "']", PrinterPresets.getFullModelName(brand, model))
                                                        ])
                                                    }),
                                                    m("div.checkboxGroup", [
                                                        m("input#presetModel_notfound[type='radio']", {
                                                            name: "presetModel",
                                                            onclick: function () {
                                                                tempProfile = new Printer();
                                                                skipPane3 = false;
                                                                skipPane4 = true;
                                                                m.render(document.getElementById("guidedPrinterTabContent"), getPrinterTabContent());
                                                                m.render(document.getElementById("guidedDimensionsTabContent"), getDimensionsTabContent());
                                                                updateSetupContent();
                                                                document.getElementById("profileCustomize").checked = false;
                                                                document.getElementById("newProfilePane2Next").disabled = false;
                                                            }
                                                        }),
                                                        m("label[for='presetModel_notfound']", "My printer model is not in the list")
                                                    ])
                                                ]);
                                                skipPane2 = false;
                                                skipPane3 = true;
                                                skipPane4 = false;
                                                document.getElementById("newProfilePane1Next").disabled = false;
                                            }
                                        }),
                                        m("label[for='presetBrand_" + brand.name + "']", brand.name)
                                    ]);
                                }),
                                m("div.checkboxGroup", [
                                    m("input#presetBrand_notfound[type='radio']", {
                                        name: "presetBrand",
                                        onclick: function () {
                                            tempProfile = new Printer();
                                            skipPane2 = true;
                                            skipPane3 = false;
                                            skipPane4 = true;
                                            m.render(document.getElementById("guidedPrinterTabContent"), getPrinterTabContent());
                                            m.render(document.getElementById("guidedDimensionsTabContent"), getDimensionsTabContent());
                                            updateSetupContent();
                                            document.getElementById("profileCustomize").checked = false;
                                            document.getElementById("newProfilePane1Next").disabled = false;
                                        }
                                    }),
                                    m("label[for='presetBrand_notfound']", "My printer manufacturer is not in the list")
                                ]),
                                m("div.checkboxGroup", [
                                    m("input#presetBrand_custom[type='radio']", {
                                        name: "presetBrand",
                                        onclick: function () {
                                            tempProfile = new Printer();
                                            skipPane2 = true;
                                            skipPane3 = true;
                                            skipPane4 = true;
                                            m.render(document.getElementById("guidedPrinterTabContent"), getPrinterTabContent());
                                            m.render(document.getElementById("guidedDimensionsTabContent"), getDimensionsTabContent());
                                            updateSetupContent();
                                            document.getElementById("profileCustomize").checked = false;
                                            document.getElementById("newProfilePane1Next").disabled = false;
                                        }
                                    }),
                                    m("label[for='presetBrand_custom']", "My printer is not commercially available")
                                ])
                            ]),
                            m("div.paneButtons", [
                                m("div.leftPane", [
                                    m("button.formButton", {
                                        onclick: closeProfileModal
                                    }, "Cancel")
                                ]),
                                m("div.rightPane", [
                                    m("button#newProfilePane1Next.formButton", {
                                        disabled: true,
                                        onclick: function () {
                                            event.target.blur();
                                            document.getElementById("open-modal").scrollTop = 0;
                                            document.getElementById("newProfilePane1").style.display = "none";
                                            if (skipPane2) {
                                                if (skipPane3) {
                                                    if (skipPane4) {
                                                        if (guidedSetup) {
                                                            document.getElementById("newProfilePane5").style.display = "block";
                                                            document.getElementById("guidedSetupProgress").style.width = "36%";
                                                        } else {
                                                            printerProfileModal(undefined, tempProfile, onClose, 0);
                                                        }
                                                    } else {
                                                        document.getElementById("newProfilePane4").style.display = "block";
                                                        document.getElementById("guidedSetupProgress").style.width = "27%";
                                                    }
                                                } else {
                                                    document.getElementById("newProfilePane3").style.display = "block";
                                                    document.getElementById("guidedSetupProgress").style.width = "18%";
                                                }
                                            } else {
                                                document.getElementById("newProfilePane2").style.display = "block";
                                                document.getElementById("guidedSetupProgress").style.width = "9%";
                                            }
                                        }
                                    }, "Next")
                                ])
                            ])
                        ]),
                        m("div#newProfilePane2", {
                            style: {
                                display: "none"
                            }
                        }, [
                            m("h3", "Select your printer model"),
                            m("div.paneScrollBox", [
                                m("div#presetModelSelect")
                            ]),
                            m("div.paneButtons", [
                                m("div.leftPane", [
                                    m("button.formButton", {
                                        onclick: closeProfileModal
                                    }, "Cancel")
                                ]),
                                m("div.rightPane", [
                                    m("button.formButton", {
                                        onclick: function () {
                                            event.target.blur();
                                            document.getElementById("open-modal").scrollTop = 0;
                                            document.getElementById("newProfilePane2").style.display = "none";
                                            document.getElementById("newProfilePane1").style.display = "block";
                                            document.getElementById("guidedSetupProgress").style.width = 0;
                                        }
                                    }, "Back"),
                                    m("button#newProfilePane2Next.formButton", {
                                        disabled: true,
                                        onclick: function () {
                                            event.target.blur();
                                            document.getElementById("open-modal").scrollTop = 0;
                                            document.getElementById("newProfilePane2").style.display = "none";
                                            if (skipPane3) {
                                                if (skipPane4) {
                                                    if (guidedSetup) {
                                                        document.getElementById("newProfilePane5").style.display = "block";
                                                        document.getElementById("guidedSetupProgress").style.width = "36%";
                                                    } else {
                                                        printerProfileModal(undefined, tempProfile, onClose, 0);
                                                    }
                                                } else {
                                                    document.getElementById("newProfilePane4").style.display = "block";
                                                    document.getElementById("guidedSetupProgress").style.width = "27%";
                                                }
                                            } else {
                                                document.getElementById("newProfilePane3").style.display = "block";
                                                document.getElementById("guidedSetupProgress").style.width = "18%";
                                            }
                                        }
                                    }, "Next")
                                ])
                            ])
                        ]),
                        m("div#newProfilePane3", {
                            style: {
                                display: "none"
                            }
                        }, [
                            m("h3", "Get your printer model supported"),
                            m("p", "Want to see your printer in the list? So do we!"),
                            m("p", "Chroma and Palette are compatible with dozens of different 3D printers, and we are continually expanding support for a wider variety of printers."),
                            m("p", [
                                "Email ",
                                m("a", {
                                    href: "mailto:support@mosaicmanufacturing.com"
                                }, "support@mosaicmanufacturing.com"),
                                " with the make and model of your printer. Any additional information you can provide will help us build a preset for your printer."
                            ]),
                            m("p", "Even though your printer isn't available as a preset, you can set it up manually."),
                            m("p", "Click Next to begin creating a custom profile."),
                            m("p", ""),
                            m("div.paneButtons", [
                                m("div.leftPane", [
                                    m("button.formButton", {
                                        onclick: closeProfileModal
                                    }, "Cancel")
                                ]),
                                m("div.rightPane", [
                                    m("button.formButton", {
                                        onclick: function () {
                                            event.target.blur();
                                            document.getElementById("open-modal").scrollTop = 0;
                                            document.getElementById("newProfilePane3").style.display = "none";
                                            if (skipPane2) {
                                                document.getElementById("newProfilePane1").style.display = "block";
                                                document.getElementById("guidedSetupProgress").style.width = "0";
                                            } else {
                                                document.getElementById("newProfilePane2").style.display = "block";
                                                document.getElementById("guidedSetupProgress").style.width = "9%";
                                            }
                                        }
                                    }, "Back"),
                                    m("button.formButton", {
                                        onclick: function () {
                                            event.target.blur();
                                            document.getElementById("open-modal").scrollTop = 0;
                                            document.getElementById("newProfilePane3").style.display = "none";
                                            if (skipPane4) {
                                                if (guidedSetup) {
                                                    document.getElementById("newProfilePane5").style.display = "block";
                                                    document.getElementById("guidedSetupProgress").style.width = "36%";
                                                } else {
                                                    printerProfileModal(undefined, tempProfile, onClose, 0);
                                                }
                                            } else {
                                                document.getElementById("newProfilePane4").style.display = "block";
                                                document.getElementById("guidedSetupProgress").style.width = "27%";
                                            }
                                        }
                                    }, "Next")
                                ])
                            ])
                        ]),
                        m("div#newProfilePane4", {
                            style: {
                                display: "none"
                            }
                        }, [
                            m("h3", "Set up your printer profile"),

                            m("table", {
                                style: {
                                    width: "100%"
                                }
                            }, [
                                m("tbody", [
                                    m("tr", [
                                        m("th", [
                                            m("label[for='profileName']", "Profile Name")
                                        ]),
                                        m("td", {
                                            colspan: 2
                                        }, [
                                            m("div.formError#profileNameError", [
                                                m("input.formInput#profileName", {
                                                    oninput: function (event) {
                                                        let el = event.target.parentElement;
                                                        let value = event.target.value.trim();
                                                        if (value === "") {
                                                            FormValidation.showValidationError(el, "Make sure you name the profile!");
                                                            document.getElementById("newProfilePane4Next").disabled = true;
                                                        } else {
                                                            let uniqueName = true;
                                                            PrinterProfiles.getProfileList().forEach(function (printer) {
                                                                if (printer.profileName.toLowerCase() === value.toLowerCase()) {
                                                                    uniqueName = false;
                                                                }
                                                            });
                                                            if (uniqueName) {
                                                                tempProfile.profileName = value;
                                                                FormValidation.resetValidationError(el);
                                                                document.getElementById("newProfilePane4Next").disabled = false;
                                                            } else {
                                                                FormValidation.showValidationError(el, "A profile with this name already exists.");
                                                                document.getElementById("newProfilePane4Next").disabled = true;
                                                            }
                                                        }
                                                    }
                                                })
                                            ])
                                        ])
                                    ]),
                                    m("tr", {}, [
                                        m("th", [
                                            m("label[for='paletteType']", "Palette Type")
                                        ]),
                                        m("td", {
                                            colspan: 2,
                                            style: {
                                                "padding-top": "5px"
                                            },
                                            onchange: function (event) {
                                                tempProfile.paletteType = event.target.value;
                                                document.getElementById("integratedRow").style.display = tempProfile.isPalette2() ? null : "none";
                                            }
                                        }, [
                                            m("select.formSelect#paletteType" + (global.print ? ".formInputDisabled" : ""),
                                                Object.keys(Printer.PaletteTypes).map((type) => {
                                                return m("option", {
                                                    value: Printer.PaletteTypes[type],
                                                    selected: tempProfile.paletteType === Printer.PaletteTypes[type]
                                                }, Printer.PaletteTypes[type]);
                                            }))
                                        ])
                                    ]),

                                    m("tr#integratedRow", {
                                        style: {
                                            display: tempProfile.isPalette2() ? null : "none"
                                        }
                                    }, [
                                        m("th", [
                                            m("label.tooltip", {
                                                'data-tooltip': tooltips.canvasHub,
                                            }, "Connection")
                                        ]),
                                        m("td", [
                                            m("div.checkboxGroup", [
                                                m("input#integratedAccessory[type=radio]", {
                                                    name: "integrated",
                                                    checked: !tempProfile.integrated,
                                                    onclick: function () {
                                                        tempProfile.integrated = false;
                                                    }
                                                }),
                                                m("label[for='integratedAccessory']", "Accessory mode")
                                            ]),
                                            m("div.checkboxGroup", [
                                                m("input#integratedConnected[type=radio]", {
                                                    name: "integrated",
                                                    checked: tempProfile.integrated,
                                                    onclick: function () {
                                                        tempProfile.integrated = true;
                                                    }
                                                }),
                                                m("label[for='integratedConnected']", "Connected mode")
                                            ])
                                        ])
                                    ]),
                                    m("tr", [
                                        m("th", "Custom Settings"),
                                        m("td", {
                                            colspan: 2
                                        }, [
                                            m("div.checkboxGroup", [
                                                m("input#profileCustomize", {
                                                    type: "checkbox"
                                                }),
                                                m("label[for='profileCustomize']", "I need to customize the settings for this printer"),
                                                m("p", {
                                                    style: {
                                                        "margin-top": "5px",
                                                        "margin-left": "23px"
                                                    },
                                                }, "(print bed dimensions, nozzle size, etc.)")
                                            ])
                                        ])
                                    ])
                                ])
                            ]),

                            m("div.paneButtons", [
                                m("div.leftPane", [
                                    m("button.formButton", {
                                        onclick: closeProfileModal
                                    }, "Cancel")
                                ]),
                                m("div.rightPane", [
                                    m("button.formButton", {
                                        onclick: function () {
                                            event.target.blur();
                                            document.getElementById("open-modal").scrollTop = 0;
                                            document.getElementById("newProfilePane4").style.display = "none";
                                            if (skipPane3) {
                                                if (skipPane2) {
                                                    document.getElementById("newProfilePane1").style.display = "block";
                                                    document.getElementById("guidedSetupProgress").style.width = 0;
                                                } else {
                                                    document.getElementById("newProfilePane2").style.display = "block";
                                                    document.getElementById("guidedSetupProgress").style.width = "9%";
                                                }
                                            } else {
                                                document.getElementById("newProfilePane3").style.display = "block";
                                                document.getElementById("guidedSetupProgress").style.width = "18%";
                                            }
                                        }
                                    }, "Back"),
                                    m("button.formButton#newProfilePane4Next", {
                                        disabled: true,
                                        onclick: function () {
                                            event.target.blur();
                                            document.getElementById("open-modal").scrollTop = 0;
                                            if (tempProfile.baseProfile !== "custom") {
                                                let baseProfile = PrinterPresets.getPresetByUID(tempProfile.baseProfile);
                                                tempProfile.inputParsers = baseProfile.inputParsers.slice();
                                                tempProfile.engine = baseProfile.engine;
                                                tempProfile.postprocessing = baseProfile.postprocessing;
                                                tempProfile.volumetric = baseProfile.volumetric;
                                                tempProfile.independentExtruderAxes = !!baseProfile.independentExtruderAxes;
                                                tempProfile.jogPauses = !!baseProfile.jogPauses;
                                                tempProfile.extruderCount = baseProfile.extruderCount;
                                                tempProfile.printBedDimensions.circular = baseProfile.printBed.circular;
                                                if (tempProfile.printBedDimensions.circular) {
                                                    tempProfile.printBedDimensions.diameter = baseProfile.printBed.diameter;
                                                } else {
                                                    tempProfile.printBedDimensions.x = baseProfile.printBed.x;
                                                    tempProfile.printBedDimensions.y = baseProfile.printBed.y;
                                                }
                                                tempProfile.printBedDimensions.origin = baseProfile.printBed.origin;
                                                if (tempProfile.printBedDimensions.origin === "middle") {
                                                    if (tempProfile.printBedDimensions.circular) {
                                                        tempProfile.printBedDimensions.originOffsets.x = tempProfile.printBedDimensions.diameter / 2;
                                                        tempProfile.printBedDimensions.originOffsets.y = tempProfile.printBedDimensions.diameter / 2;
                                                    } else {
                                                        tempProfile.printBedDimensions.originOffsets.x = tempProfile.printBedDimensions.x / 2;
                                                        tempProfile.printBedDimensions.originOffsets.y = tempProfile.printBedDimensions.y / 2;
                                                    }
                                                } else if (tempProfile.printBedDimensions.origin === "custom") {
                                                    tempProfile.printBedDimensions.originOffsets.x = baseProfile.printBed.originOffsets.x;
                                                    tempProfile.printBedDimensions.originOffsets.y = baseProfile.printBed.originOffsets.y;
                                                }
                                                tempProfile.filamentDiameter = baseProfile.filamentDiameter;
                                                tempProfile.nozzleDiameter = baseProfile.nozzleDiameter;
                                                tempProfile.bowdenTube = baseProfile.bowdenTube;
                                                tempProfile.firmwarePurge = baseProfile.firmwarePurge || 0;
                                                tempProfile.gpxProfile = baseProfile.gpxProfile;
                                            }
                                            let customize = document.getElementById("profileCustomize").checked;
                                            if (guidedSetup) {
                                                updateSetupContent();
                                                document.getElementById("newProfilePane4").style.display = "none";
                                                if (tempProfile.baseProfile === "custom" || customize) {
                                                    m.render(document.getElementById("guidedPrinterTabContent"), getPrinterTabContent());
                                                    m.render(document.getElementById("guidedDimensionsTabContent"), getDimensionsTabContent());
                                                    document.getElementById("newProfilePane5Next").disabled = !customize;
                                                    document.getElementById("newProfilePane6Next").disabled = !customize;
                                                    document.getElementById("newProfilePane5").style.display = "block";
                                                    document.getElementById("guidedSetupProgress").style.width = "36%";
                                                } else {
                                                    if (tempProfile.isPalette2()) {
                                                        document.getElementById("newProfilePane4a").style.display = "block";
                                                        if (tempProfile.isIntegratedMSF()) {
                                                            document.getElementById("pane4aIntegrated").style.display = "block";
                                                            document.getElementById("pane4aNotIntegrated").style.display = "none";
                                                        } else {
                                                            document.getElementById("pane4aIntegrated").style.display = "none";
                                                            document.getElementById("pane4aNotIntegrated").style.display = "block";
                                                        }
                                                    } else {
                                                        document.getElementById("newProfilePane7").style.display = "block";
                                                    }
                                                    document.getElementById("guidedSetupProgress").style.width = "54%";
                                                }
                                            } else {
                                                if (customize) {
                                                    printerProfileModal(undefined, tempProfile, onClose, 0);
                                                } else {
                                                    if (tempProfile.isPalette2()) {
                                                        document.getElementById("open-modal").scrollTop = 0;
                                                        document.getElementById("newProfilePane4").style.display = "none";
                                                        document.getElementById("newProfilePane13a").style.display = "block";
                                                        document.getElementById("guidedSetupProgress").style.width = "90%";
                                                    } else {
                                                        dialog.showMessageBox(BrowserWindow.fromId(2), {
                                                            type: "question",
                                                            message: "Printer-to-Palette Calibration",
                                                            detail: "Would you like to go through the calibration process step-by-step or do you have calibration values to enter directly?",
                                                            buttons: ["Walkthrough", "I already have values", "Cancel"],
                                                            defaultId: 0,
                                                            cancelId: 2
                                                        }, function (choice) {
                                                            if (choice === 0) {
                                                                openCalibrationWizard(tempProfile, profile);
                                                            } else if (choice === 1) {
                                                                openCalibrationManualEntry(tempProfile, profile);
                                                            }
                                                        });
                                                    }
                                                }
                                            }
                                        }
                                    }, "Next")
                                ])
                            ])
                        ]),
                        m("div#newProfilePane4a", {
                            style: {
                                display: "none"
                            }
                        }, [
                            m("div#pane4aIntegrated", [
                                m("h3", [
                                    "Follow the Palette 2 Getting Started Guide at ",
                                    m("a", {
                                        href: "http://mm3d.co/gettingstarted"
                                    }, "mm3d.co/gettingstarted"),
                                ]),
                                m("h3", [
                                    "Next, follow 'Setting up CANVAS Hub' at ",
                                    m("a", {
                                        href: "http://mm3d.co/CHsupport"
                                    }, "mm3d.co/CHsupport"),
                                ]),
                                m("p", "Continue once you have completed the steps outlined in both guides.")
                            ]),
                            m("div#pane4aNotIntegrated", [
                                m("h3", [
                                    "Follow the Palette 2 Getting Started Guide at ",
                                    m("a", {
                                        href: "http://mm3d.co/gettingstarted"
                                    }, "mm3d.co/gettingstarted"),
                                ]),
                                m("p", "Continue once you have completed the steps outlined in the guide."),
                            ]),

                            m("div.paneButtons", [
                                m("div.leftPane", [
                                    m("button.formButton", {
                                        onclick: closeProfileModal
                                    }, "Cancel")
                                ]),
                                m("div.rightPane", [
                                    m("button.formButton", {
                                        onclick: function (event) {
                                            event.target.blur();
                                            let customize = document.getElementById("profileCustomize").checked;
                                            document.getElementById("open-modal").scrollTop = 0;
                                            document.getElementById("newProfilePane4a").style.display = "none";
                                            if (tempProfile.baseProfile === "custom" || customize) {
                                                document.getElementById("newProfilePane6").style.display = "block";
                                                document.getElementById("guidedSetupProgress").style.width = "27%";
                                            } else {
                                                document.getElementById("newProfilePane4").style.display = "block";
                                                document.getElementById("guidedSetupProgress").style.width = "27%";
                                            }
                                        }
                                    }, "Back"),
                                    m("button.formButton#newProfilePane4aNext", {
                                        onclick: function () {
                                            document.getElementById("open-modal").scrollTop = 0;
                                            document.getElementById("newProfilePane4a").style.display = "none";
                                            document.getElementById("newProfilePane13a").style.display = "block";
                                            document.getElementById("guidedSetupProgress").style.width = "90%";
                                        }
                                    }, "Next")
                                ])
                            ])
                        ]),
                        m("div#newProfilePane5", {
                            style: {
                                display: "none"
                            }
                        }, [
                            m("h3", "Set up your printer profile"),
                            m("br"),
                            m("table", {
                                style: {
                                    width: "100%"
                                }
                            }, [
                                m("tbody#guidedPrinterTabContent", [
                                    getPrinterTabContent(),
                                ])
                            ]),
                            m("div.paneButtons", [
                                m("div.leftPane", [
                                    m("button.formButton", {
                                        onclick: closeProfileModal
                                    }, "Cancel")
                                ]),
                                m("div.rightPane", [
                                    m("button.formButton", {
                                        onclick: function () {
                                            event.target.blur();
                                            document.getElementById("open-modal").scrollTop = 0;
                                            document.getElementById("newProfilePane5").style.display = "none";
                                            if (skipPane4) {
                                                if (skipPane3) {
                                                    if (skipPane2) {
                                                        document.getElementById("newProfilePane1").style.display = "block";
                                                        document.getElementById("guidedSetupProgress").style.width = 0;
                                                    } else {
                                                        document.getElementById("newProfilePane2").style.display = "block";
                                                        document.getElementById("guidedSetupProgress").style.width = "9%";
                                                    }
                                                } else {
                                                    document.getElementById("newProfilePane3").style.display = "block";
                                                    document.getElementById("guidedSetupProgress").style.width = "18%";
                                                }
                                            } else {
                                                document.getElementById("newProfilePane4").style.display = "block";
                                                document.getElementById("guidedSetupProgress").style.width = "27%";
                                            }
                                        }
                                    }, "Back"),
                                    m("button.formButton#newProfilePane5Next", {
                                        disabled: true,
                                        onclick: function () {
                                            event.target.blur();
                                            document.getElementById("open-modal").scrollTop = 0;
                                            document.getElementById("newProfilePane5").style.display = "none";
                                            document.getElementById("newProfilePane6").style.display = "block";
                                            document.getElementById("guidedSetupProgress").style.width = "45%";
                                        }
                                    }, "Next")
                                ])
                            ])
                        ]),
                        m("div#newProfilePane6", {
                            style: {
                                display: "none"
                            }
                        }, [
                            m("h3", "Set up your printer profile"),
                            m("table", {
                                style: {
                                    width: "100%"
                                }
                            }, [
                                m("tbody#guidedDimensionsTabContent", [
                                    getDimensionsTabContent()
                                ])
                            ]),
                            m("div.paneButtons", [
                                m("div.leftPane", [
                                    m("button.formButton", {
                                        onclick: closeProfileModal
                                    }, "Cancel")
                                ]),
                                m("div.rightPane", [
                                    m("button.formButton", {
                                        onclick: function () {
                                            event.target.blur();
                                            document.getElementById("open-modal").scrollTop = 0;
                                            document.getElementById("newProfilePane6").style.display = "none";
                                            document.getElementById("newProfilePane5").style.display = "block";
                                            document.getElementById("guidedSetupProgress").style.width = "36%";
                                        }
                                    }, "Back"),
                                    m("button.formButton#newProfilePane6Next", {
                                        disabled: true,
                                        onclick: function () {
                                            event.target.blur();
                                            document.getElementById("open-modal").scrollTop = 0;
                                            document.getElementById("newProfilePane6").style.display = "none";
                                            if (tempProfile.isPalette2()) {
                                                document.getElementById("newProfilePane4a").style.display = "block";
                                                if (tempProfile.isIntegratedMSF()) {
                                                    document.getElementById("pane4aIntegrated").style.display = "block";
                                                    document.getElementById("pane4aNotIntegrated").style.display = "none";
                                                } else {
                                                    document.getElementById("pane4aIntegrated").style.display = "none";
                                                    document.getElementById("pane4aNotIntegrated").style.display = "block";
                                                }
                                            } else {
                                                document.getElementById("newProfilePane7").style.display = "block";
                                            }
                                            document.getElementById("guidedSetupProgress").style.width = "54%";
                                        }
                                    }, "Next")
                                ])
                            ])
                        ]),
                        m("div#newProfilePane7", {
                            style: {
                                display: "none",
                                height: "350px"
                            }
                        }, [
                            m("div", {
                                style: {
                                    "background-image": "url('../assets/onboarding/introduction.svg')",
                                    "background-size": "contain",
                                    "background-position": "bottom center",
                                    "background-repeat": "no-repeat",
                                    width: "600px",
                                    height: "340px",
                                    "margin-top": "16px",
                                    "margin-left": "auto",
                                    "margin-right": "auto"
                                }
                            }),
                            m("div.paneButtons", [
                                m("div.leftPane", [
                                    m("button.formButton", {
                                        onclick: closeProfileModal
                                    }, "Cancel")
                                ]),
                                m("div.rightPane", [
                                    m("button.formButton", {
                                        onclick: function () {
                                            event.target.blur();
                                            document.getElementById("open-modal").scrollTop = 0;
                                            document.getElementById("newProfilePane7").style.display = "none";
                                            let customize = document.getElementById("profileCustomize").checked;
                                            if (tempProfile.baseProfile === "custom" || customize) {
                                                document.getElementById("newProfilePane6").style.display = "block";
                                                document.getElementById("guidedSetupProgress").style.width = "45%";
                                            } else {
                                                document.getElementById("newProfilePane4").style.display = "block";
                                                document.getElementById("guidedSetupProgress").style.width = "27%";
                                            }
                                        }
                                    }, "Back"),
                                    m("button.formButton#newProfilePane7Next", {
                                        onclick: function () {
                                            event.target.blur();
                                            document.getElementById("open-modal").scrollTop = 0;
                                            document.getElementById("newProfilePane7").style.display = "none";
                                            updateSetupContent();
                                            if (tempProfile.bowdenTube === false) {
                                                document.getElementById("newProfilePane8").style.display = "block";
                                                setTimeout(function () {
                                                    if (document.getElementById("newProfilePane8").style.display === "block") {
                                                        bmGuideTubeClip.play();
                                                    }
                                                }, 500);
                                            } else {
                                                document.getElementById("newProfilePane9").style.display = "block";
                                                setTimeout(function () {
                                                    if (document.getElementById("newProfilePane9").style.display === "block") {
                                                        bmBowdenTubeReplacement.play();
                                                    }
                                                }, 500);
                                            }
                                            document.getElementById("guidedSetupProgress").style.width = "63%";
                                        }
                                    }, "Next")
                                ])
                            ])
                        ]),
                        m("div#newProfilePane8", {
                            style: {
                                display: "none",
                                height: "350px"
                            }
                        }, [
                            m("h3", [
                                m("span.tooltip", {
                                    "data-tooltip": tooltips.positionGuideTubeClip
                                }, "Position guide tube clip")
                            ]),
                            m("div#tubeClipImage", {
                                style: {
                                    width: "500px",
                                    height: "250px",
                                    "margin-top": "40px",
                                    "margin-left": "auto",
                                    "margin-right": "auto",
                                    "background-size": "contain"
                                }
                            }),
                            m("div#tubeClipAnimation", {
                                style: {
                                    height: "300px",
                                    "margin-top": "-20px"
                                },
                                config: function (el) {
                                    bmGuideTubeClip = bodymovin.loadAnimation({
                                        container: el,
                                        renderer: "svg",
                                        loop: true,
                                        autoplay: false,
                                        path: "../assets/onboarding/guide-tube-clip.json"
                                    });
                                }
                            }),
                            m("div#tubeClipText", {
                                style: {
                                    "padding-left": "50px",
                                    "padding-right": "50px"
                                }
                            }),
                            m("div.paneButtons", [
                                m("div.leftPane", [
                                    m("button.formButton", {
                                        onclick: closeProfileModal
                                    }, "Cancel")
                                ]),
                                m("div.rightPane", [
                                    m("button.formButton", {
                                        onclick: function () {
                                            event.target.blur();
                                            document.getElementById("open-modal").scrollTop = 0;
                                            document.getElementById("newProfilePane8").style.display = "none";
                                            document.getElementById("newProfilePane7").style.display = "block";
                                            document.getElementById("guidedSetupProgress").style.width = "54%";
                                            bmGuideTubeClip.goToAndStop(0, true);
                                        }
                                    }, "Back"),
                                    m("button.formButton#newProfilePane8Next", {
                                        onclick: function () {
                                            event.target.blur();
                                            document.getElementById("open-modal").scrollTop = 0;
                                            document.getElementById("newProfilePane8").style.display = "none";
                                            document.getElementById("newProfilePane10").style.display = "block";
                                            document.getElementById("guidedSetupProgress").style.width = "72%";
                                            bmGuideTubeClip.goToAndStop(0, true);
                                            setTimeout(function () {
                                                if (document.getElementById("newProfilePane10").style.display === "block") {
                                                    bmScrollWheelPlacement.play();
                                                }
                                            }, 500);
                                        }
                                    }, "Next")
                                ])
                            ])
                        ]),
                        m("div#newProfilePane9", {
                            style: {
                                display: "none",
                                height: "350px"
                            }
                        }, [
                            m("h3", [
                                "Replace your Scroll Wheel’s tube without a magnet",
                                m("br"),
                                "with the shorter tube in your Tool Kit"
                            ]),
                            m("p", "Follow the diagram below to remove and replace your Scroll Wheel’s acrylic plate."),
                            m("div", {
                                config: function (el) {
                                    bmBowdenTubeReplacement = bodymovin.loadAnimation({
                                        container: el,
                                        renderer: "svg",
                                        loop: true,
                                        autoplay: false,
                                        path: "../assets/onboarding/bowden-tube-replacement.json"
                                    });
                                }
                            }),
                            m("div.paneButtons", [
                                m("div.leftPane", [
                                    m("button.formButton", {
                                        onclick: closeProfileModal
                                    }, "Cancel")
                                ]),
                                m("div.rightPane", [
                                    m("button.formButton", {
                                        onclick: function () {
                                            event.target.blur();
                                            document.getElementById("open-modal").scrollTop = 0;
                                            document.getElementById("newProfilePane9").style.display = "none";
                                            document.getElementById("newProfilePane7").style.display = "block";
                                            document.getElementById("guidedSetupProgress").style.width = "54%";
                                            bmBowdenTubeReplacement.goToAndStop(0, true);
                                        }
                                    }, "Back"),
                                    m("button.formButton#newProfilePane9Next", {
                                        onclick: function () {
                                            event.target.blur();
                                            document.getElementById("open-modal").scrollTop = 0;
                                            document.getElementById("newProfilePane9").style.display = "none";
                                            document.getElementById("newProfilePane10").style.display = "block";
                                            document.getElementById("guidedSetupProgress").style.width = "72%";
                                            bmBowdenTubeReplacement.goToAndStop(0, true);
                                            setTimeout(function () {
                                                if (document.getElementById("newProfilePane10").style.display === "block") {
                                                    bmBowdenScrollWheelPlacement.play();
                                                }
                                            }, 500);
                                        }
                                    }, "Next")
                                ])
                            ])
                        ]),
                        m("div#newProfilePane10", {
                            style: {
                                display: "none",
                                height: "350px"
                            }
                        }, [
                            m("h3", "Position Scroll Wheel"),
                            m("p", [
                                m("span.tooltip#scrollWheelPlacementText", {
                                    "data-tooltip": tooltips.positionScrollWheel
                                })
                            ]),
                            m("div#scrollWheelPlacementImage", {
                                style: {
                                    width: "500px",
                                    height: "250px",
                                    "margin-top": "20px",
                                    "margin-left": "auto",
                                    "margin-right": "auto",
                                    "background-size": "contain"
                                }
                            }),
                            m("div#directDriveScrollWheelPlacementAnimation", {
                                style: {
                                    display: "none",
                                    "margin-top": "-10px"
                                },
                                config: function (el) {
                                    bmScrollWheelPlacement = bodymovin.loadAnimation({
                                        container: el,
                                        renderer: "svg",
                                        loop: true,
                                        autoplay: false,
                                        path: "../assets/onboarding/scroll-wheel-placement.json"
                                    });
                                }
                            }),
                            m("div#bowdenScrollWheelPlacementAnimation", {
                                style: {
                                    display: "none",
                                    "margin-top": "-10px"
                                },
                                config: function (el) {
                                    bmBowdenScrollWheelPlacement = bodymovin.loadAnimation({
                                        container: el,
                                        renderer: "svg",
                                        loop: true,
                                        autoplay: false,
                                        path: "../assets/onboarding/bowden-scroll-wheel-placement.json"
                                    });
                                }
                            }),
                            m("div.paneButtons", [
                                m("div.leftPane", [
                                    m("button.formButton", {
                                        onclick: closeProfileModal
                                    }, "Cancel")
                                ]),
                                m("div.rightPane", [
                                    m("button.formButton", {
                                        onclick: function () {
                                            event.target.blur();
                                            document.getElementById("open-modal").scrollTop = 0;
                                            document.getElementById("newProfilePane10").style.display = "none";
                                            bmScrollWheelPlacement.goToAndStop(0, true);
                                            bmBowdenScrollWheelPlacement.goToAndStop(0, true);
                                            if (tempProfile.bowdenTube === false) {
                                                document.getElementById("newProfilePane8").style.display = "block";
                                                setTimeout(function () {
                                                    if (document.getElementById("newProfilePane8").style.display === "block") {
                                                        bmGuideTubeClip.play();
                                                    }
                                                }, 500);
                                            } else {
                                                document.getElementById("newProfilePane9").style.display = "block";
                                                setTimeout(function () {
                                                    if (document.getElementById("newProfilePane9").style.display === "block") {
                                                        bmBowdenTubeReplacement.play();
                                                    }
                                                }, 500);
                                            }
                                            document.getElementById("guidedSetupProgress").style.width = "63%";
                                        }
                                    }, "Back"),
                                    m("button.formButton#newProfilePane10Next", {
                                        onclick: function () {
                                            event.target.blur();
                                            document.getElementById("open-modal").scrollTop = 0;
                                            document.getElementById("newProfilePane10").style.display = "none";
                                            document.getElementById("newProfilePane11").style.display = "block";
                                            document.getElementById("guidedSetupProgress").style.width = "90%";
                                            bmScrollWheelPlacement.goToAndStop(0, true);
                                            bmBowdenScrollWheelPlacement.goToAndStop(0, true);
                                            setTimeout(function () {
                                                if (document.getElementById("newProfilePane11").style.display === "block") {
                                                    bmPositionPalette.play();
                                                }
                                            }, 500);
                                        }
                                    }, "Next")
                                ])
                            ])
                        ]),
                        m("div#newProfilePane11", {
                            style: {
                                display: "none",
                                height: "350px"
                            }
                        }, [
                            m("h3", "Position Palette"),
                            m("p", [
                                m("span.tooltip", {
                                    "data-tooltip": tooltips.positionPalette
                                }, "Position your Palette next to your printer such that the larger tube can slide over the smaller tube a distance of 15 cm.")
                            ]),
                            m("div#palettePlacementImage", {
                                style: {
                                    width: "500px",
                                    height: "250px",
                                    "margin-top": "20px",
                                    "margin-left": "auto",
                                    "margin-right": "auto",
                                    "background-size": "contain"
                                }
                            }),
                            m("div#palettePlacementAnimation", {
                                style: {
                                    "margin-top": "-10px"
                                },
                                config: function (el) {
                                    bmPositionPalette = bodymovin.loadAnimation({
                                        container: el,
                                        renderer: "svg",
                                        loop: true,
                                        autoplay: false,
                                        path: "../assets/onboarding/position-palette.json"
                                    });
                                }
                            }),
                            m("div#palettePlacementText", {
                                style: {
                                    "padding-left": "50px",
                                    "padding-right": "50px"
                                }
                            }),
                            m("div.paneButtons", [
                                m("div.leftPane", [
                                    m("button.formButton", {
                                        onclick: closeProfileModal
                                    }, "Cancel")
                                ]),
                                m("div.rightPane", [
                                    m("button.formButton", {
                                        onclick: function () {
                                            event.target.blur();
                                            document.getElementById("open-modal").scrollTop = 0;
                                            document.getElementById("newProfilePane11").style.display = "none";
                                            document.getElementById("newProfilePane10").style.display = "block";
                                            document.getElementById("guidedSetupProgress").style.width = "72%";
                                            bmPositionPalette.goToAndStop(0, true);
                                            if (tempProfile.bowdenTube === false) {
                                                setTimeout(function () {
                                                    if (document.getElementById("newProfilePane10").style.display === "block") {
                                                        bmScrollWheelPlacement.play();
                                                    }
                                                }, 500);
                                            } else {
                                                setTimeout(function () {
                                                    if (document.getElementById("newProfilePane10").style.display === "block") {
                                                        bmBowdenScrollWheelPlacement.play();
                                                    }
                                                }, 500);
                                            }
                                        }
                                    }, "Back"),
                                    m("button.formButton#newProfilePane11Next", {
                                        onclick: function () {
                                            event.target.blur();
                                            document.getElementById("open-modal").scrollTop = 0;
                                            document.getElementById("newProfilePane11").style.display = "none";
                                            if (tempProfile.extruderCount > 1 || tempProfile.postprocessing === "makerbot") {
                                                m.render(document.getElementById("newProfilePane12"), getPane12Content());
                                                document.getElementById("newProfilePane12").style.display = "block";
                                                document.getElementById("guidedSetupProgress").style.width = "95%";
                                            } else {
                                                document.getElementById("newProfilePane13").style.display = "block";
                                                document.getElementById("guidedSetupProgress").style.width = "100%";
                                            }
                                            bmPositionPalette.goToAndStop(0, true);
                                        }
                                    }, "Next")
                                ])
                            ])
                        ]),
                        m("div#newProfilePane12", {
                            style: {
                                display: "none",
                                height: "350px"
                            }
                        }),
                        m("div#newProfilePane13", {
                            style: {
                                display: "none",
                                height: "350px"
                            }
                        }, [
                            m("h3", "Confirm Setup"),
                            m("p", [
                                m("span#confirmSetupText"),
                                m("br"),
                                "Need more help? E-mail ",
                                m("a", {
                                    href: "mailto:support@mosaicmanufacturing.com"
                                }, "support@mosaicmanufacturing.com"),
                                "."
                            ]),
                            m("div#confirmSetupImage", {
                                style: {
                                    "margin-top": "20px"
                                }
                            }),
                            m("div.paneButtons", [
                                m("div.leftPane", [
                                    m("button.formButton", {
                                        onclick: closeProfileModal
                                    }, "Cancel")
                                ]),
                                m("div.rightPane", [
                                    m("button.formButton", {
                                        onclick: function () {
                                            event.target.blur();
                                            document.getElementById("open-modal").scrollTop = 0;
                                            document.getElementById("newProfilePane13").style.display = "none";
                                            if (tempProfile.extruderCount > 1 || tempProfile.postprocessing === "makerbot") {
                                                document.getElementById("newProfilePane12").style.display = "block";
                                                document.getElementById("guidedSetupProgress").style.width = "95%";
                                            } else {
                                                document.getElementById("newProfilePane11").style.display = "block";
                                                document.getElementById("guidedSetupProgress").style.width = "90%";
                                                setTimeout(function () {
                                                    if (document.getElementById("newProfilePane11").style.display === "block") {
                                                        bmPositionPalette.play();
                                                    }
                                                }, 500);
                                            }
                                        }
                                    }, "Back"),
                                    m("button.formButton#newProfilePane13Next", {
                                        onclick: function () {
                                            event.target.blur();
                                            document.getElementById("open-modal").scrollTop = 0;
                                            bmPositionPalette.goToAndStop(0, true);
                                            if (guidedSetup) {
                                                openCalibrationWizard(tempProfile, profile, true);
                                            } else {
                                                dialog.showMessageBox(BrowserWindow.fromId(2), {
                                                    type: "question",
                                                    message: "Printer-to-Palette Calibration",
                                                    detail: "Would you like to go through the calibration process step-by-step or do you have calibration values to enter directly?",
                                                    buttons: ["Walkthrough", "I already have values", "Cancel"],
                                                    defaultId: 0,
                                                    cancelId: 2
                                                }, function (choice) {
                                                    if (choice === 0) {
                                                        openCalibrationWizard(tempProfile, profile, true);
                                                    } else if (choice === 1) {
                                                        openCalibrationManualEntry(tempProfile, profile);
                                                    }
                                                });
                                            }
                                        }
                                    }, "Next")
                                ])
                            ])
                        ]),
                        m("div#newProfilePane13a", {
                            style: {
                                display: "none"
                            }
                        }, [
                            m("h3", "Learn how to slice for Palette 2"),
                            m("div", [
                                m("p", "The following guides will show you how to set up and slice your first multi-color model."),
                                m("ul", [
                                    m("li", [
                                        m("a", {
                                            href: "http://mm3d.co/simplify3d"
                                        }, "Simplify3D"),
                                        " (recommended)"
                                    ]),
                                    (tempProfile.postprocessing === "makerbot" ? [] : m("li", [
                                        m("a", {
                                            href: "http://mm3d.co/cura"
                                        }, "Cura"),
                                        " (recommended)"
                                    ])),
                                    m("li", [
                                        m("a", {
                                            href: "http://mm3d.co/slic3r"
                                        }, "Slic3r"),
                                        " (advanced)"
                                    ]),
                                    (tempProfile.postprocessing === "makerbot" ? [] : m("li", [
                                        m("a", {
                                            href: "http://mm3d.co/kisslicer"
                                        }, "KISSlicer"),
                                        " (most advanced)"
                                    ]))
                                ])
                            ]),
                            m("p", [
                                "Need something to print? We have a collection of multi-color prints ",
                                m("a", {
                                    href: "http://mm3d.co/stuff-to-print"
                                }, "here"),
                                "."
                            ]),
                            m("div.paneButtons", [
                                m("div.leftPane", [
                                    m("button.formButton", {
                                        onclick: closeProfileModal
                                    }, "Cancel")
                                ]),
                                m("div.rightPane", [
                                    m("button.formButton", {
                                        onclick: function (event) {
                                            event.target.blur();
                                            document.getElementById("open-modal").scrollTop = 0;
                                            document.getElementById("newProfilePane13a").style.display = "none";
                                            if (guidedSetup) {
                                                document.getElementById("newProfilePane4a").style.display = "block";
                                                document.getElementById("guidedSetupProgress").style.width = "54%";
                                            } else {
                                                document.getElementById("newProfilePane4").style.display = "block";
                                                document.getElementById("guidedSetupProgress").style.width = "27%";
                                            }
                                        }
                                    }, "Back"),
                                    m("button.confirm#newProfilePane13aNext", {
                                        onclick: function (event) {
                                            event.target.blur();
                                            PrinterProfiles.addProfile(tempProfile);
                                            config.saveProfile(tempProfile);
                                            Postprocessor.updateProfileDropdown();
                                            closeModal();
                                            window.removeEventListener("keydown", closeProfileModal);
                                            if (global.firstRun) {
                                                SetupView.startTutorial();
                                            }
                                        }
                                    }, "Finish")
                                ])
                            ])
                        ])
                    ])

                ])
            ])
        ]);
    } else {
        m.render(modalWindow, [
            m("div.container", [
                m("div.printerProfile", [
                    m("h2", (profile ? "Edit Printer Profile" : "New Printer Profile")),
                    m("span#errorText"),
                    m("br"),
                    m("table", {
                        style: {
                            width: "100%"
                        }
                    }, [
                        m("tbody", [
                            m("tr", [
                                m("th", [
                                    m("label[for='printerName']", "Profile Name")
                                ]),
                                m("td", {
                                    style: {
                                        width: "auto"
                                    }
                                }, [
                                    m("div#printerNameError.formError", [
                                        m("input#printerName.formInput", {
                                            value: tempProfile.profileName,
                                            oninput: function (event) {
                                                let el = event.target.parentElement;
                                                let value = event.target.value.trim();
                                                if (value === "") {
                                                    FormValidation.showValidationError(el, "Make sure you name the profile!");
                                                } else {
                                                    let uniqueName = true;
                                                    PrinterProfiles.getProfileList().forEach(function (printer) {
                                                        if (printer.profileName.toLowerCase() === value.toLowerCase() && printer !== profile) {
                                                            uniqueName = false;
                                                        }
                                                    });
                                                    if (uniqueName) {
                                                        tempProfile.profileName = value;
                                                        FormValidation.resetValidationError(el);
                                                    } else {
                                                        FormValidation.showValidationError(el, "A profile with this name already exists.");
                                                    }
                                                }
                                            }
                                        })
                                    ])
                                ])
                            ])
                        ])
                    ]),

                    m("div.tabbed", [
                        m("div.tabs", [
                            m("button#printerTabButton", {
                                class: (activeTab === 0 ? "active" : ""),
                                onclick: function () {
                                    document.getElementById("printerTabButton").className = "active";
                                    document.getElementById("printerTabContent").style.display = "block";
                                    document.getElementById("dimensionsTabButton").className = "";
                                    document.getElementById("dimensionsTabContent").style.display = "none";
                                    document.getElementById("paletteTabButton").className = "";
                                    document.getElementById("paletteTabContent").style.display = "none";
                                    document.getElementById("transitionTabButton").className = "";
                                    document.getElementById("transitionTabContent").style.display = "none";
                                    activeTab = 0;
                                }
                            }, "Printer"),
                            m("button#dimensionsTabButton", {
                                class: (activeTab === 1 ? "active" : ""),
                                onclick: function () {
                                    document.getElementById("printerTabButton").className = "";
                                    document.getElementById("printerTabContent").style.display = "none";
                                    document.getElementById("dimensionsTabButton").className = "active";
                                    document.getElementById("dimensionsTabContent").style.display = "block";
                                    document.getElementById("paletteTabButton").className = "";
                                    document.getElementById("paletteTabContent").style.display = "none";
                                    document.getElementById("transitionTabButton").className = "";
                                    document.getElementById("transitionTabContent").style.display = "none";
                                    activeTab = 1;
                                }
                            }, "Dimensions"),
                            m("button#paletteTabButton", {
                                class: (activeTab === 2 ? "active" : ""),
                                onclick: function () {
                                    document.getElementById("printerTabButton").className = "";
                                    document.getElementById("printerTabContent").style.display = "none";
                                    document.getElementById("dimensionsTabButton").className = "";
                                    document.getElementById("dimensionsTabContent").style.display = "none";
                                    document.getElementById("paletteTabButton").className = "active";
                                    document.getElementById("paletteTabContent").style.display = "block";
                                    document.getElementById("transitionTabButton").className = "";
                                    document.getElementById("transitionTabContent").style.display = "none";
                                    let saveButton = document.getElementById("saveProfileButton");
                                    if (saveButton.innerText === "Next") {
                                        saveButton.innerText = "Create";
                                    }
                                    activeTab = 2;
                                }
                            }, "Palette"),
                            m("button#transitionTabButton", {
                                class: (activeTab === 3 ? "active" : ""),
                                onclick: function () {
                                    document.getElementById("printerTabButton").className = "";
                                    document.getElementById("printerTabContent").style.display = "none";
                                    document.getElementById("dimensionsTabButton").className = "";
                                    document.getElementById("dimensionsTabContent").style.display = "none";
                                    document.getElementById("paletteTabButton").className = "";
                                    document.getElementById("paletteTabContent").style.display = "none";
                                    document.getElementById("transitionTabButton").className = "active";
                                    document.getElementById("transitionTabContent").style.display = "block";
                                    activeTab = 3;
                                }
                            }, "Transitions")
                        ]),
                        m("div.content", [
                            m("div#printerTabContent", {
                                style: {
                                    display: (activeTab === 0 ? "block" : "none")
                                }
                            }, [
                                m("table", {
                                    style: {
                                        width: "100%"
                                    }
                                }, [
                                    m("tbody", [
                                        getPrinterTabContent()
                                    ])
                                ])
                            ]),
                            m("div#dimensionsTabContent", {
                                style: {
                                    display: (activeTab === 1 ? "block" : "none")
                                }
                            }, [
                                m("table", {
                                    style: {
                                        width: "100%"
                                    }
                                }, [
                                    m("tbody", [
                                        getDimensionsTabContent()
                                    ])
                                ])
                            ]),
                            m("div#paletteTabContent", {
                                style: {
                                    display: (activeTab === 2 ? "block" : "none")
                                }
                            }, [
                                m("table", {
                                    style: {
                                        width: "100%"
                                    }
                                }, [
                                    m("tbody", [

                                        m("tr", [
                                            m("th", {
                                                colspan: 3
                                            }, [
                                                m("h3", {
                                                    style: {
                                                        "font-weight": "bold"
                                                    }
                                                }, "General Settings")
                                            ])
                                        ]),

                                        m("tr", {}, [
                                            m("th", [
                                                m("label[for='paletteType']" + (global.print ? ".labelDisabled" : ""), "Palette Type")
                                            ]),
                                            m("td", {
                                                colspan: 2,
                                                style: {
                                                    "padding-top": "5px"
                                                },
                                                onchange: function (event) {
                                                    tempProfile.paletteType = event.target.value;
                                                    document.getElementById("integratedRow").style.display = tempProfile.isPalette2() ? null : "none";
                                                    document.getElementById("calibrationRow").style.display = tempProfile.isPalette2() ? "none" : null;
                                                    document.getElementById("ppmDisplayValue").innerText = tempProfile.getPulsesPerMM().toFixed(4);
                                                }
                                            }, [
                                                m("select.formSelect#paletteType" + (global.print ? ".formInputDisabled" : ""), {
                                                    disabled: !!global.print,
                                                }, Object.keys(Printer.PaletteTypes).map((type) => {
                                                    return m("option", {
                                                        value: Printer.PaletteTypes[type],
                                                        selected: tempProfile.paletteType === Printer.PaletteTypes[type]
                                                    }, Printer.PaletteTypes[type]);
                                                }))
                                            ])
                                        ]),

                                        m("tr#integratedRow", {
                                            style: {
                                                display: tempProfile.isPalette2() ? null : "none"
                                            }
                                        }, [
                                            m("th", [
                                                m("label.tooltip" + (global.print ? ".labelDisabled" : ""), {
                                                    'data-tooltip': tooltips.canvasHub,
                                                }, "Connection")
                                            ]),
                                            m("td", [
                                                m("div.checkboxGroup", [
                                                    m("input#integratedAccessory[type=radio]", {
                                                        name: "integrated",
                                                        disabled: !!global.print,
                                                        checked: !tempProfile.integrated,
                                                        onclick: function () {
                                                            tempProfile.integrated = false;
                                                        }
                                                    }),
                                                    m("label[for='integratedAccessory']" + (global.print ? ".labelDisabled" : ""), "Accessory mode")
                                                ]),
                                                m("div.checkboxGroup", [
                                                    m("input#integratedConnected[type=radio]", {
                                                        name: "integrated",
                                                        disabled: !!global.print,
                                                        checked: tempProfile.integrated,
                                                        onclick: function () {
                                                            tempProfile.integrated = true;
                                                        }
                                                    }),
                                                    m("label[for='integratedConnected']" + (global.print ? ".labelDisabled" : ""), "Connected mode")
                                                ])
                                            ])
                                        ]),

                                        m("tr#calibrationRow", {
                                            style: {
                                                display: tempProfile.isPalette2() ? "none" : null
                                            }
                                        }, [
                                            m("th", [
                                                "Calibration Values",
                                                m("br"),
                                                m("span.tooltip", {
                                                    style: {
                                                        "font-size": "0.85em",
                                                        "margin-top": "5px"
                                                    },
                                                    "data-tooltip": tooltips.calibration
                                                }, "Why calibrate")
                                            ]),
                                            m("td", {
                                                colspan: 2
                                            }, [
                                                m("table", {
                                                    style: {
                                                        "margin-top": "5px"
                                                    }
                                                }, [
                                                    m("tbody", [
                                                        m("tr", [
                                                            m("td", "Loading Offset"),
                                                            m("td.selectable", {
                                                                style: {
                                                                    "padding-left": "8px"
                                                                }
                                                            }, tempProfile.loadingOffset)
                                                        ]),
                                                        m("tr", [
                                                            m("td", "Print Value"),
                                                            m("td.selectable", {
                                                                style: {
                                                                    "padding-left": "8px"
                                                                }
                                                            }, tempProfile.printValue)
                                                        ]),
                                                        m("tr", [
                                                            m("td", "Calibration Print Length"),
                                                            m("td.selectable", {
                                                                style: {
                                                                    "padding-left": "8px"
                                                                }
                                                            }, (tempProfile.calibrationGCodeLength / 1000).toFixed(2) + " m")
                                                        ]),
                                                        m("tr", [
                                                            m("td", "Pulses Per MM"),
                                                            m("td.selectable#ppmDisplayValue", {
                                                                style: {
                                                                    "padding-left": "8px"
                                                                }
                                                            }, tempProfile.getPulsesPerMM().toFixed(4))
                                                        ])
                                                    ])
                                                ]),
                                                m("div#printerCalibrationError.formError", [
                                                    m("button#printerCalibration.formButton", {
                                                        style: {
                                                            "margin-top": "20px"
                                                        },
                                                        onclick: function () {
                                                            dialog.showMessageBox(BrowserWindow.fromId(2), {
                                                                type: "question",
                                                                message: "Printer-to-Palette Calibration",
                                                                detail: "Would you like to go through the calibration process step-by-step or do you have calibration values to enter directly?",
                                                                buttons: ["Walkthrough", "I already have values", "Cancel"],
                                                                defaultId: 0,
                                                                cancelId: 2
                                                            }, function (choice) {
                                                                if (choice === 0) {
                                                                    openCalibrationWizard(tempProfile, profile);
                                                                } else if (choice === 1) {
                                                                    openCalibrationManualEntry(tempProfile, profile);
                                                                }
                                                            });
                                                        }
                                                    }, (tempProfile.loadingOffset === 0 || tempProfile.printValue === 0 || tempProfile.calibrationGCodeLength === 0
                                                        ? "Calibrate Printer with Palette" : "Re-Calibrate Printer with Palette"))
                                                ])
                                            ])
                                        ]),

                                        ((global.env.dev || global.advancedMode) ? [

                                            m("tr", [
                                                m("th", {
                                                    colspan: 3
                                                }, [
                                                    m("h3", {
                                                        style: {
                                                            "font-weight": "bold"
                                                        }
                                                    }, "Ping Settings")
                                                ])
                                            ]),

                                            (global.advancedMode ? [
                                                m("tr", [
                                                    m("th", [
                                                        m("span.tooltip", {
                                                            "data-tooltip": tooltips.pingRetraction
                                                        }, "Ping Retractions")
                                                    ]),
                                                    m("td", {
                                                        colspan: 2
                                                    }, [
                                                        m("table", [
                                                            m("tbody", [
                                                                m("tr", [
                                                                    m("td", {
                                                                        style: {
                                                                            "white-space": "nowrap",
                                                                            "padding-right": "30px"
                                                                        }
                                                                    }, [
                                                                        m("div.checkboxGroup", [
                                                                            m("input#pingRetractionAuto[type=radio]", {
                                                                                name: "pingRetraction",
                                                                                checked: tempProfile.pingRetraction === "auto",
                                                                                onclick: function (event) {
                                                                                    tempProfile.pingRetraction = "auto";
                                                                                    let input = document.getElementById("pingRetractionManualValue");
                                                                                    let label = document.getElementById("pingRetractionManualLabel");
                                                                                    input.disabled = true;
                                                                                    input.value = "";
                                                                                    input.style.opacity = 0.3;
                                                                                    label.style.opacity = 0.3;
                                                                                    FormValidation.resetValidationError(input.parentElement);
                                                                                }
                                                                            }),
                                                                            m("label[for='pingRetractionAuto']", "Auto")
                                                                        ])
                                                                    ]),
                                                                    m("td", {
                                                                        style: {
                                                                            "white-space": "nowrap",
                                                                            "padding-right": "15px"
                                                                        }
                                                                    }, [
                                                                        m("div.checkboxGroup", [
                                                                            m("input#pingRetractionManual[type=radio]", {
                                                                                name: "pingRetraction",
                                                                                checked: tempProfile.pingRetraction !== "auto",
                                                                                onclick: function (event) {
                                                                                    if (tempProfile.pingRetraction === "auto") {
                                                                                        tempProfile.pingRetraction = 0;
                                                                                        let input = document.getElementById("pingRetractionManualValue");
                                                                                        let label = document.getElementById("pingRetractionManualLabel");
                                                                                        input.disabled = false;
                                                                                        input.value = 0;
                                                                                        input.style.opacity = 1;
                                                                                        label.style.opacity = 1;
                                                                                        FormValidation.resetValidationError(input.parentElement);
                                                                                    }
                                                                                }
                                                                            }),
                                                                            m("label[for='pingRetractionManual']", "Manual")
                                                                        ])
                                                                    ]),
                                                                    m("td", {
                                                                        style: {
                                                                            "white-space": "nowrap"
                                                                        }
                                                                    }, [
                                                                        m("div.formError#pingRetractionManualValueError", {
                                                                            style: {
                                                                                "display": "inline-block"
                                                                            }
                                                                        }, [
                                                                            m("input#pingRetractionManualValue.formInput", {
                                                                                value: (tempProfile.pingRetraction === "auto" ? "" : tempProfile.pingRetraction),
                                                                                disabled: tempProfile.pingRetraction === "auto",
                                                                                style: {
                                                                                    display: "inline-block",
                                                                                    width: "100px",
                                                                                    opacity: (tempProfile.pingRetraction === "auto" ? 0.3 : 1),
                                                                                    "margin-right": "5px"
                                                                                },
                                                                                oninput: function (event) {
                                                                                    tempProfile.pingRetraction = FormValidation.validateNumberInput(event.target.value,
                                                                                        -1,
                                                                                        0, true,
                                                                                        false, true,
                                                                                        true,
                                                                                        event.target.parentElement, "Ping retraction", "mm");
                                                                                }
                                                                            })
                                                                        ]),
                                                                        m("label#pingRetractionManualLabel[for='pingRetractionManualValue']", {
                                                                            style: {
                                                                                opacity: (tempProfile.pingRetraction === "auto" ? 0.3 : 1)
                                                                            }
                                                                        }, "mm")
                                                                    ])
                                                                ])
                                                            ])
                                                        ])
                                                    ])
                                                ]),
                                                m("tr", [
                                                    m("th", [
                                                        m("span.tooltip", {
                                                            "data-tooltip": tooltips.jogPauses
                                                        }, "Movement Pauses"),
                                                        m("button.usePresetDefault#jogPausesDefault", {
                                                            style: {
                                                                display: (tempProfile.baseProfile === "custom" || tempProfile.jogPauses === !!PrinterPresets.getPresetByUID(tempProfile.baseProfile).jogPauses) ? "none" : ""
                                                            },
                                                            onclick: function (event) {
                                                                tempProfile.jogPauses = !!PrinterPresets.getPresetByUID(tempProfile.baseProfile).jogPauses;
                                                                document.getElementById("jogPauses").checked = tempProfile.jogPauses;
                                                                event.target.style.display = "none";
                                                            }
                                                        })
                                                    ]),
                                                    m("td", {
                                                        colspan: 2
                                                    }, [
                                                        m("div.checkboxGroup", [
                                                            m("input#jogPauses[type=checkbox]", {
                                                                checked: tempProfile.jogPauses,
                                                                onclick: function (event) {
                                                                    tempProfile.jogPauses = event.target.checked;
                                                                    if (tempProfile.baseProfile === "custom" || tempProfile.jogPauses === !!PrinterPresets.getPresetByUID(tempProfile.baseProfile).jogPauses) {
                                                                        document.getElementById("jogPausesDefault").style.display = "none";
                                                                    } else {
                                                                        document.getElementById("jogPausesDefault").style.display = "";
                                                                    }
                                                                }
                                                            }),
                                                            m("label[for='jogPauses']", "Use movement pauses for pings")
                                                        ])
                                                    ])
                                                ]),
                                                m("tr", [
                                                    m("th", [
                                                        m("span.tooltip", {
                                                            "data-tooltip": tooltips.pingOffTower
                                                        }, "Ping Off Tower")
                                                    ]),
                                                    m("td", {
                                                        colspan: 2
                                                    }, [
                                                        m("div.checkboxGroup", [
                                                            m("input#pingOffTower[type=checkbox]", {
                                                                checked: tempProfile.pingOffTower,
                                                                onclick: function (event) {
                                                                    tempProfile.pingOffTower = event.target.checked;
                                                                }
                                                            }),
                                                            m("label[for='pingOffTower']", "Pause off the edge of the tower during pings")
                                                        ])
                                                    ])
                                                ])
                                            ] : []),

                                            (global.env.dev ? [
                                                m("tr", [
                                                    m("th", [
                                                        m("label[for='mechPingSequence']", "Mech Ping GCode")
                                                    ]),
                                                    m("td", {
                                                        colspan: 2,
                                                        style: {
                                                            "padding-top": "10px"
                                                        }
                                                    }, [
                                                        m("textarea#mechPingSequence.formInput.preformatted", {
                                                            value: tempProfile.mechanicalPingGCode,
                                                            style: {
                                                                "margin-top": 0
                                                            },
                                                            oninput: function (event) {
                                                                tempProfile.mechanicalPingGCode = event.target.value;
                                                            }
                                                        })
                                                    ])
                                                ])
                                            ] : [])

                                        ] : [])

                                    ])
                                ])
                            ]),
                            m("div#transitionTabContent", {
                                style: {
                                    display: (activeTab === 3 ? "block" : "none")
                                }
                            }, [
                                m("table", {
                                    style: {
                                        width: "100%"
                                    }
                                }, [
                                    m("tbody", [

                                        m("tr", [
                                            m("th", {
                                                colspan: 3
                                            }, [
                                                m("h3", {
                                                    style: {
                                                        "font-weight": "bold"
                                                    }
                                                }, "General Settings")
                                            ])
                                        ]),

                                        (global.advancedMode ? m("tr", [
                                            m("th", "Transition Method"),
                                            m("td", {
                                                colspan: 2,
                                                style: {
                                                    "padding-bottom": "10px"
                                                }
                                            }, [
                                                m("div.checkboxGroup", [
                                                    m("input#useTransitionTower[type='radio']", {
                                                        name: "transitionMethod",
                                                        checked: tempProfile.transitionSettings.type === TRANSITION_TOWER,
                                                        onclick: function () {
                                                            tempProfile.transitionSettings.type = TRANSITION_TOWER;
                                                            document.getElementById("sideTransitionSettings").classList.add("formSectionDisabled");
                                                            document.getElementById("sideTransitionSpeed").disabled = true;
                                                            document.getElementById("purgeInPlace").disabled = true;
                                                            document.getElementById("purgeCoordinateX").disabled = true;
                                                            document.getElementById("purgeCoordinateY").disabled = true;
                                                            document.getElementById("purgeLocationNorth").disabled = true;
                                                            document.getElementById("purgeLocationWest").disabled = true;
                                                            document.getElementById("purgeLocationEast").disabled = true;
                                                            document.getElementById("purgeLocationSouth").disabled = true;
                                                            document.getElementById("purgeEdgeOffset").disabled = true;
                                                            FormValidation.resetValidationError(document.getElementById("sideTransitionSpeedError"));
                                                            FormValidation.resetValidationError(document.getElementById("purgeEdgeOffsetError"));
                                                            document.getElementById("transitionTowerSettings").classList.remove("formSectionDisabled");
                                                            document.getElementById("towerPrintSpeedAuto").disabled = false;
                                                            document.getElementById("towerPrintSpeedManual").disabled = false;
                                                            document.getElementById("towerPrintSpeedManualValue").disabled = (tempProfile.transitionSettings.towers.printSpeed === "auto");
                                                            document.getElementById("towerExtrusionWidthAuto").disabled = false;
                                                            document.getElementById("towerExtrusionWidthManual").disabled = false;
                                                            document.getElementById("towerExtrusionWidthManualValue").disabled = (tempProfile.transitionSettings.towers.extrusionWidth === "auto");
                                                            document.getElementById("minTowerDensity").disabled = false;
                                                            document.getElementById("minTowerBottomDensity").disabled = false;
                                                            document.getElementById("maxTowerDensity").disabled = false;
                                                            document.getElementById("towerPerimeterSpeed").disabled = false;
                                                            document.getElementById("forceTowerBottomPerimeter").disabled = false;
                                                            document.getElementById("infillPerimeterOverlapAuto").disabled = false;
                                                            document.getElementById("infillPerimeterOverlapManual").disabled = false;
                                                            document.getElementById("infillPerimeterOverlapManualValue").disabled = (tempProfile.transitionSettings.towers.infillPerimeterOverlap === "auto");
                                                            document.getElementById("generalTransitionSettings").classList.remove("formSectionDisabled");
                                                            document.getElementById("transitionLength").disabled = false;
                                                            document.getElementById("initialTransitionLength").disabled = false;
                                                            document.getElementById("targetPosition").disabled = false;
                                                            document.getElementById("useInfillDump").disabled = false;
                                                        }
                                                    }),
                                                    m("label.tooltip[for='useTransitionTower']", {
                                                        "data-tooltip": tooltips.transitionTowers
                                                    }, "Use a transition tower")
                                                ]),
                                                m("div.checkboxGroup", [
                                                    m("input#useSideTransitions[type='radio']", {
                                                        name: "transitionMethod",
                                                        checked: tempProfile.transitionSettings.type === SIDE_TRANSITIONS,
                                                        onclick: function () {
                                                            tempProfile.transitionSettings.type = SIDE_TRANSITIONS;
                                                            if (tempProfile.printBedDimensions.circular) {
                                                                tempProfile.transitionSettings.sideTransitions.purgeInPlace = true;
                                                            }
                                                            document.getElementById("transitionTowerSettings").classList.add("formSectionDisabled");
                                                            document.getElementById("towerPrintSpeedAuto").disabled = true;
                                                            document.getElementById("towerPrintSpeedManual").disabled = true;
                                                            document.getElementById("towerPrintSpeedManualValue").disabled = true;
                                                            document.getElementById("towerExtrusionWidthAuto").disabled = true;
                                                            document.getElementById("towerExtrusionWidthManual").disabled = true;
                                                            document.getElementById("towerExtrusionWidthManualValue").disabled = true;
                                                            document.getElementById("minTowerDensity").disabled = true;
                                                            document.getElementById("minTowerBottomDensity").disabled = true;
                                                            document.getElementById("maxTowerDensity").disabled = true;
                                                            document.getElementById("towerPerimeterSpeed").disabled = true;
                                                            document.getElementById("forceTowerBottomPerimeter").disabled = true;
                                                            document.getElementById("infillPerimeterOverlapAuto").disabled = true;
                                                            document.getElementById("infillPerimeterOverlapManual").disabled = true;
                                                            document.getElementById("infillPerimeterOverlapManualValue").disabled = true;
                                                            document.getElementById("sideTransitionSettings").classList.remove("formSectionDisabled");
                                                            document.getElementById("sideTransitionSpeed").disabled = false;
                                                            document.getElementById("purgeInPlace").disabled = !!tempProfile.printBedDimensions.circular;
                                                            document.getElementById("purgeCoordinateX").disabled = false;
                                                            document.getElementById("purgeCoordinateY").disabled = false;
                                                            document.getElementById("purgeLocationNorth").disabled = false;
                                                            document.getElementById("purgeLocationWest").disabled = false;
                                                            document.getElementById("purgeLocationEast").disabled = false;
                                                            document.getElementById("purgeLocationSouth").disabled = false;
                                                            document.getElementById("purgeEdgeOffset").disabled = false;
                                                            document.getElementById("generalTransitionSettings").classList.remove("formSectionDisabled");
                                                            document.getElementById("transitionLength").disabled = false;
                                                            document.getElementById("initialTransitionLength").disabled = false;
                                                            document.getElementById("targetPosition").disabled = false;
                                                            document.getElementById("useInfillDump").disabled = false;
                                                            if (tempProfile.printBedDimensions.circular) {
                                                                if (!document.getElementById("purgeInPlace").checked) {
                                                                    document.getElementById("purgeInPlace").click();
                                                                }
                                                            }
                                                        }
                                                    }),
                                                    m("label.tooltip[for='useSideTransitions']", {
                                                        "data-tooltip": tooltips.sideTransitions
                                                    }, "Use side transitions")
                                                ]),
                                                m("div.checkboxGroup", [
                                                    m("input#useNoTransitions[type='radio']", {
                                                        name: "transitionMethod",
                                                        checked: tempProfile.transitionSettings.type === NO_TRANSITIONS,
                                                        onclick: function () {
                                                            tempProfile.transitionSettings.type = NO_TRANSITIONS;
                                                            document.getElementById("transitionTowerSettings").classList.add("formSectionDisabled");
                                                            document.getElementById("towerPrintSpeedAuto").disabled = true;
                                                            document.getElementById("towerPrintSpeedManual").disabled = true;
                                                            document.getElementById("towerPrintSpeedManualValue").disabled = true;
                                                            document.getElementById("towerExtrusionWidthAuto").disabled = true;
                                                            document.getElementById("towerExtrusionWidthManual").disabled = true;
                                                            document.getElementById("towerExtrusionWidthManualValue").disabled = true;
                                                            document.getElementById("minTowerDensity").disabled = true;
                                                            document.getElementById("minTowerBottomDensity").disabled = true;
                                                            document.getElementById("maxTowerDensity").disabled = true;
                                                            document.getElementById("towerPerimeterSpeed").disabled = true;
                                                            document.getElementById("forceTowerBottomPerimeter").disabled = true;
                                                            document.getElementById("infillPerimeterOverlapAuto").disabled = true;
                                                            document.getElementById("infillPerimeterOverlapManual").disabled = true;
                                                            document.getElementById("infillPerimeterOverlapManualValue").disabled = true;
                                                            document.getElementById("sideTransitionSettings").classList.add("formSectionDisabled");
                                                            document.getElementById("sideTransitionSpeed").disabled = true;
                                                            document.getElementById("purgeInPlace").disabled = true;
                                                            document.getElementById("purgeCoordinateX").disabled = true;
                                                            document.getElementById("purgeCoordinateY").disabled = true;
                                                            document.getElementById("purgeLocationNorth").disabled = true;
                                                            document.getElementById("purgeLocationWest").disabled = true;
                                                            document.getElementById("purgeLocationEast").disabled = true;
                                                            document.getElementById("purgeLocationSouth").disabled = true;
                                                            document.getElementById("purgeEdgeOffset").disabled = true;
                                                            FormValidation.resetValidationError(document.getElementById("sideTransitionSpeedError"));
                                                            FormValidation.resetValidationError(document.getElementById("purgeEdgeOffsetError"));
                                                            document.getElementById("generalTransitionSettings").classList.add("formSectionDisabled");
                                                            document.getElementById("transitionLength").disabled = true;
                                                            document.getElementById("initialTransitionLength").disabled = true;
                                                            document.getElementById("targetPosition").disabled = true;
                                                            document.getElementById("useInfillDump").disabled = true;
                                                        }
                                                    }),
                                                    m("label.tooltip[for='useNoTransitions']", {
                                                        "data-tooltip": tooltips.noTransitions
                                                    }, "Don't purge transitions")
                                                ])
                                            ])
                                        ]) : []),

                                    ]),

                                    m("tbody#generalTransitionSettings" + (tempProfile.transitionSettings.type === NO_TRANSITIONS ? ".formSectionDisabled" : ""), [

                                        (global.advancedMode ? m("tr", [
                                            m("th", "Infill Transitioning"),
                                            m("td", {
                                                colspan: 2,
                                                style: {
                                                    "padding-bottom": "10px"
                                                }
                                            }, [
                                                m("div.checkboxGroup", [
                                                    m("input#useInfillDump[type=checkbox]", {
                                                        checked: tempProfile.transitionSettings.useInfillForTransition,
                                                        disabled: (tempProfile.transitionSettings.type === NO_TRANSITIONS || global.print),
                                                        onclick: function (event) {
                                                            tempProfile.transitionSettings.useInfillForTransition = event.target.checked;
                                                        }
                                                    }),
                                                    m("label[for='useInfillDump']", {
                                                        style: {
                                                            opacity: ((global.print && tempProfile.transitionSettings.type !== NO_TRANSITIONS) ? "0.3" : null)
                                                        }
                                                    }, "Attempt to use infill for transitioning filaments")
                                                ]),
                                                m("div.checkboxGroup", [
                                                    m("input#useSupportDump[type=checkbox]", {
                                                        checked: tempProfile.transitionSettings.useSupportForTransition,
                                                        disabled: (tempProfile.transitionSettings.type === NO_TRANSITIONS || global.print),
                                                        onclick: function (event) {
                                                            tempProfile.transitionSettings.useSupportForTransition = event.target.checked;
                                                        }
                                                    }),
                                                    m("label[for='useSupportDump']", {
                                                        style: {
                                                            opacity: ((global.print && tempProfile.transitionSettings.type !== NO_TRANSITIONS) ? "0.3" : null)
                                                        }
                                                    }, "Attempt to use supports for transitioning filaments")
                                                ])
                                            ])
                                        ]) : []),

                                        (global.advancedMode ? m("tr", [
                                            m("th", [
                                                m("label.tooltip[for='minTransitionLength']", {
                                                    "data-tooltip": tooltips.minTransitionLength
                                                }, "Min Transition Length")
                                            ]),
                                            m("td", {
                                                colspan: 2
                                            }, [
                                                m("div.rangePreview", [
                                                    m("div.range", [
                                                        m("input[type='range']#minTransitionLength.rangeInput", {
                                                            list: "transitionLengthSteps",
                                                            min: (global.advancedMode ? TRANSITION_MIN_LENGTH_ADVANCED : TRANSITION_MIN_LENGTH),
                                                            max: (global.advancedMode ? TRANSITION_MAX_LENGTH_ADVANCED : TRANSITION_MAX_LENGTH),
                                                            step: TRANSITION_STEP,
                                                            value: tempProfile.transitionSettings.minPurgeLength,
                                                            disabled: tempProfile.transitionSettings.type === NO_TRANSITIONS,
                                                            oninput: function (event) {
                                                                let value = event.target.value;
                                                                tempProfile.transitionSettings.minPurgeLength = parseInt(value);
                                                                document.getElementById("minTransitionLengthPreview").value = value + " mm";
                                                                if (tempProfile.transitionSettings.minPurgeLength > tempProfile.transitionSettings.purgeLength) {
                                                                    tempProfile.transitionSettings.purgeLength = tempProfile.transitionSettings.minPurgeLength;
                                                                    document.getElementById("transitionLength").value = value;
                                                                    document.getElementById("transitionLengthPreview").value = value + " mm";
                                                                }
                                                                if (tempProfile.transitionSettings.purgeLength > tempProfile.transitionSettings.initialPurgeLength) {
                                                                    tempProfile.transitionSettings.initialPurgeLength = tempProfile.transitionSettings.purgeLength;
                                                                    document.getElementById("initialTransitionLength").value = value;
                                                                    document.getElementById("initialTransitionLengthPreview").value = value + " mm";
                                                                }
                                                            }
                                                        }),
                                                        m("div.rangeMinLabel", (global.advancedMode ? TRANSITION_MIN_LENGTH_ADVANCED : TRANSITION_MIN_LENGTH) + " mm"),
                                                        m("div.rangeMaxLabel", (global.advancedMode ? TRANSITION_MAX_LENGTH_ADVANCED : TRANSITION_MAX_LENGTH) + " mm"),
                                                        m("div.clearfix")
                                                    ]),
                                                    m("div.preview", [
                                                        m("input#minTransitionLengthPreview.formInput", {
                                                            disabled: true,
                                                            value: tempProfile.transitionSettings.minPurgeLength + " mm"
                                                        })
                                                    ])
                                                ])
                                            ])

                                        ]) : []),

                                        m("tr", [
                                            m("th", [
                                                m("label.tooltip[for='transitionLength']", {
                                                    "data-tooltip": tooltips.transitionLength
                                                }, (global.advancedMode ? "Max Transition Length" : "Transition Length"))
                                            ]),
                                            m("td", {
                                                colspan: 2
                                            }, [
                                                m("div.rangePreview", [
                                                    m("div.range", [
                                                        m("input[type='range']#transitionLength.rangeInput", {
                                                            list: "transitionLengthSteps",
                                                            min: (global.advancedMode ? TRANSITION_MIN_LENGTH_ADVANCED : TRANSITION_MIN_LENGTH),
                                                            max: (global.advancedMode ? TRANSITION_MAX_LENGTH_ADVANCED : TRANSITION_MAX_LENGTH),
                                                            step: TRANSITION_STEP,
                                                            value: tempProfile.transitionSettings.purgeLength,
                                                            disabled: tempProfile.transitionSettings.type === NO_TRANSITIONS,
                                                            oninput: function (event) {
                                                                let value = event.target.value;
                                                                tempProfile.transitionSettings.purgeLength = parseInt(value);
                                                                document.getElementById("transitionLengthPreview").value = value + " mm";
                                                                if (global.advancedMode) {
                                                                    if (tempProfile.transitionSettings.purgeLength > tempProfile.transitionSettings.initialPurgeLength) {
                                                                        tempProfile.transitionSettings.initialPurgeLength = tempProfile.transitionSettings.purgeLength;
                                                                        document.getElementById("initialTransitionLength").value = value;
                                                                        document.getElementById("initialTransitionLengthPreview").value = value + " mm";
                                                                    }
                                                                    if (tempProfile.transitionSettings.purgeLength < tempProfile.transitionSettings.minPurgeLength) {
                                                                        tempProfile.transitionSettings.minPurgeLength = tempProfile.transitionSettings.purgeLength;
                                                                        document.getElementById("minTransitionLength").value = value;
                                                                        document.getElementById("minTransitionLengthPreview").value = value + " mm";
                                                                    }
                                                                } else {
                                                                    tempProfile.transitionSettings.minPurgeLength = tempProfile.transitionSettings.purgeLength;
                                                                    tempProfile.transitionSettings.initialPurgeLength = tempProfile.transitionSettings.purgeLength;
                                                                }
                                                            }
                                                        }),
                                                        m("datalist#transitionLengthSteps", getTransitionLengthTicks()),
                                                        m("div.rangeMinLabel", (global.advancedMode ? TRANSITION_MIN_LENGTH_ADVANCED : TRANSITION_MIN_LENGTH) + " mm"),
                                                        m("div.rangeMaxLabel", (global.advancedMode ? TRANSITION_MAX_LENGTH_ADVANCED : TRANSITION_MAX_LENGTH) + " mm"),
                                                        m("div.clearfix")
                                                    ]),
                                                    m("div.preview", [
                                                        m("input#transitionLengthPreview.formInput", {
                                                            disabled: true,
                                                            value: tempProfile.transitionSettings.purgeLength + " mm"
                                                        })
                                                    ])
                                                ])
                                            ])

                                        ]),

                                        (global.advancedMode ? m("tr", [
                                            m("th", [
                                                m("label.tooltip[for='initialTransitionLength']", {
                                                    "data-tooltip": tooltips.initialTransitionLength
                                                }, "Early Transition Length")
                                            ]),
                                            m("td", {
                                                colspan: 2
                                            }, [
                                                m("div.rangePreview", [
                                                    m("div.range", [
                                                        m("input[type='range']#initialTransitionLength.rangeInput", {
                                                            list: "transitionLengthSteps",
                                                            min: (global.advancedMode ? TRANSITION_MIN_LENGTH_ADVANCED : TRANSITION_MIN_LENGTH),
                                                            max: (global.advancedMode ? TRANSITION_MAX_LENGTH_ADVANCED : TRANSITION_MAX_LENGTH),
                                                            step: TRANSITION_STEP,
                                                            value: tempProfile.transitionSettings.initialPurgeLength,
                                                            disabled: tempProfile.transitionSettings.type === NO_TRANSITIONS,
                                                            oninput: function (event) {
                                                                let value = event.target.value;
                                                                tempProfile.transitionSettings.initialPurgeLength = parseInt(value);
                                                                document.getElementById("initialTransitionLengthPreview").value = value + " mm";
                                                                if (tempProfile.transitionSettings.initialPurgeLength < tempProfile.transitionSettings.purgeLength) {
                                                                    tempProfile.transitionSettings.purgeLength = tempProfile.transitionSettings.initialPurgeLength;
                                                                    document.getElementById("transitionLength").value = value;
                                                                    document.getElementById("transitionLengthPreview").value = value + " mm";
                                                                }
                                                                if (tempProfile.transitionSettings.initialPurgeLength < tempProfile.transitionSettings.minPurgeLength) {
                                                                    tempProfile.transitionSettings.minPurgeLength = tempProfile.transitionSettings.initialPurgeLength;
                                                                    document.getElementById("minTransitionLength").value = value;
                                                                    document.getElementById("minTransitionLengthPreview").value = value + " mm";
                                                                }
                                                            }
                                                        }),
                                                        m("div.rangeMinLabel", (global.advancedMode ? TRANSITION_MIN_LENGTH_ADVANCED : TRANSITION_MIN_LENGTH) + " mm"),
                                                        m("div.rangeMaxLabel", (global.advancedMode ? TRANSITION_MAX_LENGTH_ADVANCED : TRANSITION_MAX_LENGTH) + " mm"),
                                                        m("div.clearfix")
                                                    ]),
                                                    m("div.preview", [
                                                        m("input#initialTransitionLengthPreview.formInput", {
                                                            disabled: true,
                                                            value: tempProfile.transitionSettings.initialPurgeLength + " mm"
                                                        })
                                                    ])
                                                ])
                                            ])
                                        ]) : []),

                                        (global.advancedMode ? m("tr", [
                                            m("th", [
                                                m("label.tooltip[for='targetPosition']", {
                                                    "data-tooltip": tooltips.targetPosition
                                                }, "Target Position")
                                            ]),
                                            m("td", {
                                                colspan: 2
                                            }, [
                                                m("div.rangePreview", [
                                                    m("div.range", [
                                                        m("input[type='range']#targetPosition.rangeInput", {
                                                            list: "targetPositionSteps",
                                                            min: 0.2,
                                                            max: 0.6,
                                                            step: 0.1,
                                                            value: tempProfile.transitionSettings.targetPosition,
                                                            disabled: tempProfile.transitionSettings.type === NO_TRANSITIONS,
                                                            oninput: function (event) {
                                                                let value = event.target.value;
                                                                tempProfile.transitionSettings.targetPosition = parseFloat(value);
                                                                document.getElementById("targetPositionPreview").value = Math.round(value * 100) + "%";
                                                            }
                                                        }),
                                                        m("datalist#targetPositionSteps", [
                                                            m("option", "0.2"),
                                                            m("option", "0.3"),
                                                            m("option", "0.4"),
                                                            m("option", "0.5"),
                                                            m("option", "0.6")
                                                        ]),
                                                        m("div.rangeMinLabel", "20%"),
                                                        m("div.rangeMaxLabel", "60%"),
                                                        m("div.rangeMidLabel", "40%"),
                                                        m("div.clearfix")
                                                    ]),
                                                    m("div.preview", [
                                                        m("input#targetPositionPreview.formInput", {
                                                            disabled: true,
                                                            value: Math.round(tempProfile.transitionSettings.targetPosition * 100) + "%"
                                                        })
                                                    ])
                                                ])
                                            ])
                                        ]) : []),

                                    ]),

                                    (global.advancedMode ? [

                                        m("tbody#transitionTowerSettings" + (tempProfile.transitionSettings.type === TRANSITION_TOWER ? "" : ".formSectionDisabled"), [
                                            m("tr", [
                                                m("td", {
                                                    colspan: 3
                                                }, [
                                                    m("h3", {
                                                        style: {
                                                            "font-weight": "bold"
                                                        }
                                                    }, "Transition Towers")
                                                ])
                                            ]),

                                            m("tr", [
                                                m("th", [
                                                    m("span.tooltip", {
                                                        "data-tooltip": tooltips.towerPrintSpeed
                                                    }, "Print Speed")
                                                ]),
                                                m("td", {
                                                    colspan: 2
                                                }, [
                                                    m("table", [
                                                        m("tbody", [
                                                            m("tr", [
                                                                m("td", {
                                                                    style: {
                                                                        "white-space": "nowrap",
                                                                        "padding-right": "30px"
                                                                    }
                                                                }, [
                                                                    m("div.checkboxGroup", [
                                                                        m("input#towerPrintSpeedAuto[type=radio]", {
                                                                            name: "towerPrintSpeed",
                                                                            disabled: tempProfile.transitionSettings.type !== TRANSITION_TOWER,
                                                                            checked: tempProfile.transitionSettings.towers.printSpeed === "auto",
                                                                            onclick: function (event) {
                                                                                tempProfile.transitionSettings.towers.printSpeed = "auto";
                                                                                let input = document.getElementById("towerPrintSpeedManualValue");
                                                                                let label = document.getElementById("towerPrintSpeedManualLabel");
                                                                                input.disabled = true;
                                                                                input.value = "";
                                                                                input.style.opacity = 0.3;
                                                                                label.style.opacity = 0.3;
                                                                                FormValidation.resetValidationError(input.parentElement);
                                                                            }
                                                                        }),
                                                                        m("label[for='towerPrintSpeedAuto']", "Auto")
                                                                    ])
                                                                ]),
                                                                m("td", {
                                                                    style: {
                                                                        "white-space": "nowrap",
                                                                        "padding-right": "15px"
                                                                    }
                                                                }, [
                                                                    m("div.checkboxGroup", [
                                                                        m("input#towerPrintSpeedManual[type=radio]", {
                                                                            name: "towerPrintSpeed",
                                                                            disabled: tempProfile.transitionSettings.type !== TRANSITION_TOWER,
                                                                            checked: tempProfile.transitionSettings.towers.printSpeed !== "auto",
                                                                            onclick: function (event) {
                                                                                if (tempProfile.transitionSettings.towers.printSpeed === "auto") {
                                                                                    tempProfile.transitionSettings.towers.printSpeed = 0;
                                                                                    let input = document.getElementById("towerPrintSpeedManualValue");
                                                                                    let label = document.getElementById("towerPrintSpeedManualLabel");
                                                                                    input.disabled = false;
                                                                                    input.value = 0;
                                                                                    input.style.opacity = 1;
                                                                                    label.style.opacity = 1;
                                                                                    FormValidation.resetValidationError(input.parentElement);
                                                                                }
                                                                            }
                                                                        }),
                                                                        m("label[for='towerPrintSpeedManual']", "Manual")
                                                                    ])
                                                                ]),
                                                                m("td", {
                                                                    style: {
                                                                        "white-space": "nowrap"
                                                                    }
                                                                }, [
                                                                    m("div.formError#towerPrintSpeedManualValueError", {
                                                                        style: {
                                                                            "display": "inline-block"
                                                                        }
                                                                    }, [
                                                                        m("input#towerPrintSpeedManualValue.formInput", {
                                                                            value: (tempProfile.transitionSettings.towers.printSpeed === "auto" ? "" : tempProfile.transitionSettings.towers.printSpeed),
                                                                            disabled: tempProfile.transitionSettings.type !== TRANSITION_TOWER || tempProfile.transitionSettings.towers.printSpeed === "auto",
                                                                            style: {
                                                                                display: "inline-block",
                                                                                width: "100px",
                                                                                opacity: (tempProfile.transitionSettings.towers.printSpeed === "auto" ? 0.3 : 1),
                                                                                "margin-right": "5px"
                                                                            },
                                                                            oninput: function (event) {
                                                                                tempProfile.transitionSettings.towers.printSpeed = FormValidation.validateNumberInput(event.target.value,
                                                                                    -1,
                                                                                    0, false,
                                                                                    false, true,
                                                                                    true,
                                                                                    event.target.parentElement, "Tower print speed", "mm/s");
                                                                            }
                                                                        })
                                                                    ]),
                                                                    m("label#towerPrintSpeedManualLabel[for='towerPrintSpeedManualValue']", {
                                                                        style: {
                                                                            opacity: (tempProfile.transitionSettings.towers.printSpeed === "auto" ? 0.3 : 1)
                                                                        }
                                                                    }, "mm/s")
                                                                ])
                                                            ])
                                                        ])
                                                    ])
                                                ])
                                            ]),

                                            m("tr", [
                                                m("th", [
                                                    m("span.tooltip", {
                                                        "data-tooltip": tooltips.towerExtrusionWidth
                                                    }, "Extrusion Width")
                                                ]),
                                                m("td", {
                                                    colspan: 2
                                                }, [
                                                    m("table", [
                                                        m("tbody", [
                                                            m("tr", [
                                                                m("td", {
                                                                    style: {
                                                                        "white-space": "nowrap",
                                                                        "padding-right": "30px"
                                                                    }
                                                                }, [
                                                                    m("div.checkboxGroup", [
                                                                        m("input#towerExtrusionWidthAuto[type=radio]", {
                                                                            name: "towerExtrusionWidth",
                                                                            disabled: tempProfile.transitionSettings.type !== TRANSITION_TOWER,
                                                                            checked: tempProfile.transitionSettings.towers.extrusionWidth === "auto",
                                                                            onclick: function (event) {
                                                                                tempProfile.transitionSettings.towers.extrusionWidth = "auto";
                                                                                let input = document.getElementById("towerExtrusionWidthManualValue");
                                                                                let label = document.getElementById("towerExtrusionWidthManualLabel");
                                                                                input.disabled = true;
                                                                                input.value = "";
                                                                                input.style.opacity = 0.3;
                                                                                label.style.opacity = 0.3;
                                                                                FormValidation.resetValidationError(input.parentElement);
                                                                            }
                                                                        }),
                                                                        m("label[for='towerExtrusionWidthAuto']", "Auto")
                                                                    ])
                                                                ]),
                                                                m("td", {
                                                                    style: {
                                                                        "white-space": "nowrap",
                                                                        "padding-right": "15px"
                                                                    }
                                                                }, [
                                                                    m("div.checkboxGroup", [
                                                                        m("input#towerExtrusionWidthManual[type=radio]", {
                                                                            name: "towerExtrusionWidth",
                                                                            disabled: tempProfile.transitionSettings.type !== TRANSITION_TOWER,
                                                                            checked: tempProfile.transitionSettings.towers.extrusionWidth !== "auto",
                                                                            onclick: function (event) {
                                                                                if (tempProfile.transitionSettings.towers.extrusionWidth === "auto") {
                                                                                    tempProfile.transitionSettings.towers.extrusionWidth = tempProfile.nozzleDiameter * 1.2;
                                                                                    let input = document.getElementById("towerExtrusionWidthManualValue");
                                                                                    let label = document.getElementById("towerExtrusionWidthManualLabel");
                                                                                    input.disabled = false;
                                                                                    input.value = tempProfile.nozzleDiameter * 1.2;
                                                                                    input.style.opacity = 1;
                                                                                    label.style.opacity = 1;
                                                                                    FormValidation.resetValidationError(input.parentElement);
                                                                                }
                                                                            }
                                                                        }),
                                                                        m("label[for='towerExtrusionWidthManual']", "Manual")
                                                                    ])
                                                                ]),
                                                                m("td", {
                                                                    style: {
                                                                        "white-space": "nowrap"
                                                                    }
                                                                }, [
                                                                    m("div.formError#towerExtrusionWidthManualValueError", {
                                                                        style: {
                                                                            "display": "inline-block"
                                                                        }
                                                                    }, [
                                                                        m("input#towerExtrusionWidthManualValue.formInput", {
                                                                            value: (tempProfile.transitionSettings.towers.extrusionWidth === "auto" ? "" : tempProfile.transitionSettings.towers.extrusionWidth),
                                                                            disabled: tempProfile.transitionSettings.type !== TRANSITION_TOWER || tempProfile.transitionSettings.towers.extrusionWidth === "auto",
                                                                            style: {
                                                                                display: "inline-block",
                                                                                width: "100px",
                                                                                opacity: (tempProfile.transitionSettings.towers.extrusionWidth === "auto" ? 0.3 : 1),
                                                                                "margin-right": "5px"
                                                                            },
                                                                            oninput: function (event) {
                                                                                tempProfile.transitionSettings.towers.extrusionWidth = FormValidation.validateNumberInput(event.target.value,
                                                                                    -1,
                                                                                    0, false,
                                                                                    false, true,
                                                                                    true,
                                                                                    event.target.parentElement, "Tower extrusion width", "mm");
                                                                            }
                                                                        })
                                                                    ]),
                                                                    m("label#towerExtrusionWidthManualLabel[for='towerExtrusionWidthManualValue']", {
                                                                        style: {
                                                                            opacity: (tempProfile.transitionSettings.towers.extrusionWidth === "auto" ? 0.3 : 1)
                                                                        }
                                                                    }, "mm")
                                                                ])
                                                            ])
                                                        ])
                                                    ])
                                                ])
                                            ]),

                                            m("tr", [
                                                m("th", [
                                                    m("label.tooltip[for='minTowerDensity']", {
                                                        "data-tooltip": tooltips.minTowerDensity
                                                    }, "Min Density")
                                                ]),
                                                m("td", {
                                                    colspan: 2
                                                }, [
                                                    m("div.rangePreview", [
                                                        m("div.range", [
                                                            m("input[type='range']#minTowerDensity.rangeInput", {
                                                                list: "densitySteps",
                                                                min: 5,
                                                                max: 100,
                                                                step: 5,
                                                                disabled: tempProfile.transitionSettings.type !== TRANSITION_TOWER,
                                                                value: tempProfile.transitionSettings.towers.minDensity * 100,
                                                                oninput: function (event) {
                                                                    let value = parseInt(event.target.value);
                                                                    tempProfile.transitionSettings.towers.minDensity = value / 100;
                                                                    document.getElementById("minTowerDensityPreview").value = value + "%";
                                                                    if (tempProfile.transitionSettings.towers.minDensity > tempProfile.transitionSettings.towers.minFirstLayerDensity) {
                                                                        tempProfile.transitionSettings.towers.minFirstLayerDensity = tempProfile.transitionSettings.towers.minDensity;
                                                                        document.getElementById("minTowerBottomDensity").value = value;
                                                                        document.getElementById("minTowerBottomDensityPreview").value = value + "%";
                                                                    }
                                                                    if (tempProfile.transitionSettings.towers.minDensity > tempProfile.transitionSettings.towers.maxDensity) {
                                                                        tempProfile.transitionSettings.towers.maxDensity = tempProfile.transitionSettings.towers.minDensity;
                                                                        document.getElementById("maxTowerDensity").value = value;
                                                                        document.getElementById("maxTowerDensityPreview").value = value + "%";
                                                                    }
                                                                }
                                                            }),
                                                            m("div.rangeMinLabel", "5%"),
                                                            m("div.rangeMaxLabel", "100%"),
                                                            m("div.clearfix")
                                                        ]),
                                                        m("div.preview", [
                                                            m("input#minTowerDensityPreview.formInput", {
                                                                disabled: true,
                                                                value: tempProfile.transitionSettings.towers.minDensity * 100 + "%"
                                                            })
                                                        ])
                                                    ])
                                                ])
                                            ]),

                                            m("tr", [
                                                m("th", [
                                                    m("label.tooltip[for='minTowerBottomDensity']", {
                                                        "data-tooltip": tooltips.minTowerBottomDensity
                                                    }, "Min Bottom Density")
                                                ]),
                                                m("td", {
                                                    colspan: 2
                                                }, [
                                                    m("div.rangePreview", [
                                                        m("div.range", [
                                                            m("input[type='range']#minTowerBottomDensity.rangeInput", {
                                                                list: "densitySteps",
                                                                min: 5,
                                                                max: 100,
                                                                step: 5,
                                                                disabled: tempProfile.transitionSettings.type !== TRANSITION_TOWER,
                                                                value: tempProfile.transitionSettings.towers.minFirstLayerDensity * 100,
                                                                oninput: function (event) {
                                                                    let value = parseInt(event.target.value);
                                                                    tempProfile.transitionSettings.towers.minFirstLayerDensity = value / 100;
                                                                    document.getElementById("minTowerBottomDensityPreview").value = value + "%";
                                                                    if (tempProfile.transitionSettings.towers.minFirstLayerDensity < tempProfile.transitionSettings.towers.minDensity) {
                                                                        tempProfile.transitionSettings.towers.minDensity = tempProfile.transitionSettings.towers.minFirstLayerDensity;
                                                                        document.getElementById("minTowerDensity").value = value;
                                                                        document.getElementById("minTowerDensityPreview").value = value + "%";
                                                                    }
                                                                    if (tempProfile.transitionSettings.towers.minFirstLayerDensity > tempProfile.transitionSettings.towers.maxDensity) {
                                                                        tempProfile.transitionSettings.towers.maxDensity = tempProfile.transitionSettings.towers.minFirstLayerDensity;
                                                                        document.getElementById("maxTowerDensity").value = value;
                                                                        document.getElementById("maxTowerDensityPreview").value = value + "%";
                                                                    }
                                                                }
                                                            }),
                                                            m("datalist#densitySteps", [
                                                                m("option", "5"),
                                                                m("option", "10"),
                                                                m("option", "15"),
                                                                m("option", "20"),
                                                                m("option", "25"),
                                                                m("option", "30"),
                                                                m("option", "35"),
                                                                m("option", "40"),
                                                                m("option", "45"),
                                                                m("option", "50"),
                                                                m("option", "55"),
                                                                m("option", "60"),
                                                                m("option", "65"),
                                                                m("option", "70"),
                                                                m("option", "75"),
                                                                m("option", "80"),
                                                                m("option", "85"),
                                                                m("option", "90"),
                                                                m("option", "95"),
                                                                m("option", "100")
                                                            ]),
                                                            m("div.rangeMinLabel", "5%"),
                                                            m("div.rangeMaxLabel", "100%"),
                                                            m("div.clearfix")
                                                        ]),
                                                        m("div.preview", [
                                                            m("input#minTowerBottomDensityPreview.formInput", {
                                                                disabled: true,
                                                                value: tempProfile.transitionSettings.towers.minFirstLayerDensity * 100 + "%"
                                                            })
                                                        ])
                                                    ])
                                                ])
                                            ]),

                                            m("tr", [
                                                m("th", [
                                                    m("label.tooltip[for='maxTowerDensity']", {
                                                        "data-tooltip": tooltips.maxTowerDensity
                                                    }, "Max Density")
                                                ]),
                                                m("td", {
                                                    colspan: 2
                                                }, [
                                                    m("div.rangePreview", [
                                                        m("div.range", [
                                                            m("input[type='range']#maxTowerDensity.rangeInput", {
                                                                list: "densitySteps",
                                                                min: 50,
                                                                max: 100,
                                                                step: 10,
                                                                disabled: tempProfile.transitionSettings.type !== TRANSITION_TOWER,
                                                                value: tempProfile.transitionSettings.towers.maxDensity * 100,
                                                                oninput: function (event) {
                                                                    let value = parseInt(event.target.value);
                                                                    tempProfile.transitionSettings.towers.maxDensity = value / 100;
                                                                    document.getElementById("maxTowerDensityPreview").value = value + "%";
                                                                    if (tempProfile.transitionSettings.towers.maxDensity < tempProfile.transitionSettings.towers.minFirstLayerDensity) {
                                                                        tempProfile.transitionSettings.towers.minFirstLayerDensity = tempProfile.transitionSettings.towers.maxDensity;
                                                                        document.getElementById("minTowerBottomDensity").value = value;
                                                                        document.getElementById("minTowerBottomDensityPreview").value = value + "%";
                                                                    }
                                                                    if (tempProfile.transitionSettings.towers.maxDensity < tempProfile.transitionSettings.towers.minDensity) {
                                                                        tempProfile.transitionSettings.towers.minDensity = tempProfile.transitionSettings.towers.maxDensity;
                                                                        document.getElementById("minTowerDensity").value = value;
                                                                        document.getElementById("minTowerDensityPreview").value = value + "%";
                                                                    }
                                                                }
                                                            }),
                                                            m("div.rangeMinLabel", "50%"),
                                                            m("div.rangeMaxLabel", "100%"),
                                                            m("div.clearfix")
                                                        ]),
                                                        m("div.preview", [
                                                            m("input#maxTowerDensityPreview.formInput", {
                                                                disabled: true,
                                                                value: tempProfile.transitionSettings.towers.maxDensity * 100 + "%"
                                                            })
                                                        ])
                                                    ])
                                                ])
                                            ]),

                                            m("tr", [
                                                m("th", [
                                                    m("label.tooltip[for='towerPerimeterSpeed']", {
                                                        "data-tooltip": tooltips.towerPerimeterSpeed
                                                    }, "Perimeter Speed")
                                                ]),
                                                m("td", {
                                                    colspan: 2
                                                }, [
                                                    m("div.rangePreview", [
                                                        m("div.range", [
                                                            m("input[type='range']#towerPerimeterSpeed.rangeInput", {
                                                                list: "perimeterSpeedSteps",
                                                                min: 50,
                                                                max: 100,
                                                                step: 5,
                                                                disabled: tempProfile.transitionSettings.type !== TRANSITION_TOWER,
                                                                value: tempProfile.transitionSettings.towers.perimeterSpeedMultiplier * 100,
                                                                oninput: function (event) {
                                                                    let value = parseInt(event.target.value);
                                                                    tempProfile.transitionSettings.towers.perimeterSpeedMultiplier = value / 100;
                                                                    document.getElementById("towerPerimeterSpeedPreview").value = value + "%";
                                                                }
                                                            }),
                                                            m("datalist#perimeterSpeedSteps", [
                                                                m("option", "50"),
                                                                m("option", "55"),
                                                                m("option", "60"),
                                                                m("option", "65"),
                                                                m("option", "70"),
                                                                m("option", "75"),
                                                                m("option", "80"),
                                                                m("option", "85"),
                                                                m("option", "90"),
                                                                m("option", "95"),
                                                                m("option", "100")
                                                            ]),
                                                            m("div.rangeMinLabel", "50%"),
                                                            m("div.rangeMaxLabel", "100%"),
                                                            m("div.clearfix")
                                                        ]),
                                                        m("div.preview", [
                                                            m("input#towerPerimeterSpeedPreview.formInput", {
                                                                disabled: true,
                                                                value: tempProfile.transitionSettings.towers.perimeterSpeedMultiplier * 100 + "%"
                                                            })
                                                        ])
                                                    ])
                                                ])
                                            ]),

                                            m("tr", [
                                                m("th", [
                                                    m("span.tooltip", {
                                                        "data-tooltip": tooltips.infillPerimeterOverlap
                                                    }, "Infill-Perimeter Overlap")
                                                ]),
                                                m("td", {
                                                    colspan: 2
                                                }, [
                                                    m("table", [
                                                        m("tbody", [
                                                            m("tr", [
                                                                m("td", {
                                                                    style: {
                                                                        "white-space": "nowrap",
                                                                        "padding-right": "30px"
                                                                    }
                                                                }, [
                                                                    m("div.checkboxGroup", [
                                                                        m("input#infillPerimeterOverlapAuto[type=radio]", {
                                                                            name: "infillPerimeterOverlap",
                                                                            disabled: tempProfile.transitionSettings.type !== TRANSITION_TOWER,
                                                                            checked: tempProfile.transitionSettings.towers.infillPerimeterOverlap === "auto",
                                                                            onclick: function (event) {
                                                                                tempProfile.transitionSettings.towers.infillPerimeterOverlap = "auto";
                                                                                let input = document.getElementById("infillPerimeterOverlapManualValue");
                                                                                let label = document.getElementById("infillPerimeterOverlapManualLabel");
                                                                                input.disabled = true;
                                                                                input.value = "";
                                                                                input.style.opacity = 0.3;
                                                                                label.style.opacity = 0.3;
                                                                                FormValidation.resetValidationError(input.parentElement);
                                                                            }
                                                                        }),
                                                                        m("label[for='infillPerimeterOverlapAuto']", "Auto")
                                                                    ])
                                                                ]),
                                                                m("td", {
                                                                    style: {
                                                                        "white-space": "nowrap",
                                                                        "padding-right": "15px"
                                                                    }
                                                                }, [
                                                                    m("div.checkboxGroup", [
                                                                        m("input#infillPerimeterOverlapManual[type=radio]", {
                                                                            name: "infillPerimeterOverlap",
                                                                            disabled: tempProfile.transitionSettings.type !== TRANSITION_TOWER,
                                                                            checked: tempProfile.transitionSettings.towers.infillPerimeterOverlap !== "auto",
                                                                            onclick: function (event) {
                                                                                if (tempProfile.transitionSettings.towers.infillPerimeterOverlap === "auto") {
                                                                                    tempProfile.transitionSettings.towers.infillPerimeterOverlap = 0;
                                                                                    let input = document.getElementById("infillPerimeterOverlapManualValue");
                                                                                    let label = document.getElementById("infillPerimeterOverlapManualLabel");
                                                                                    input.disabled = false;
                                                                                    input.value = INFILL_PERIMETER_OVERLAP * 100;
                                                                                    input.style.opacity = 1;
                                                                                    label.style.opacity = 1;
                                                                                    FormValidation.resetValidationError(input.parentElement);
                                                                                }
                                                                            }
                                                                        }),
                                                                        m("label[for='infillPerimeterOverlapManual']", "Manual")
                                                                    ])
                                                                ]),
                                                                m("td", {
                                                                    style: {
                                                                        "white-space": "nowrap"
                                                                    }
                                                                }, [
                                                                    m("div.formError#infillPerimeterOverlapManualValueError", {
                                                                        style: {
                                                                            "display": "inline-block"
                                                                        }
                                                                    }, [
                                                                        m("input#infillPerimeterOverlapManualValue.formInput", {
                                                                            value: (tempProfile.transitionSettings.towers.infillPerimeterOverlap === "auto" ? "" : tempProfile.transitionSettings.towers.infillPerimeterOverlap * 100),
                                                                            disabled: tempProfile.transitionSettings.type !== TRANSITION_TOWER || tempProfile.transitionSettings.towers.infillPerimeterOverlap === "auto",
                                                                            style: {
                                                                                display: "inline-block",
                                                                                width: "100px",
                                                                                opacity: (tempProfile.transitionSettings.towers.infillPerimeterOverlap === "auto" ? 0.3 : 1),
                                                                                "margin-right": "5px"
                                                                            },
                                                                            oninput: function (event) {
                                                                                tempProfile.transitionSettings.towers.infillPerimeterOverlap = FormValidation.validateNumberInput(event.target.value,
                                                                                    INFILL_PERIMETER_OVERLAP * 100,
                                                                                    0, true,
                                                                                    100, true,
                                                                                    true,
                                                                                    event.target.parentElement, "Infill-perimeter overlap", "%") / 100;
                                                                            }
                                                                        })
                                                                    ]),
                                                                    m("label#infillPerimeterOverlapManualLabel[for='infillPerimeterOverlapManualValue']", {
                                                                        style: {
                                                                            opacity: (tempProfile.transitionSettings.towers.infillPerimeterOverlap === "auto" ? 0.3 : 1)
                                                                        }
                                                                    }, "%")
                                                                ])
                                                            ])
                                                        ])
                                                    ])
                                                ])
                                            ]),

                                            m("tr", [
                                                m("th", [
                                                    m("span.tooltip", {
                                                        "data-tooltip": tooltips.forceTowerBottomPerimeter
                                                    }, "First Layer Perimeter")
                                                ]),
                                                m("td", {
                                                    colspan: 2
                                                }, [
                                                    m("div.checkboxGroup", [
                                                        m("input#forceTowerBottomPerimeter[type=checkbox]", {
                                                            checked: tempProfile.transitionSettings.towers.forceBottomPerimeter,
                                                            disabled: tempProfile.transitionSettings.type !== TRANSITION_TOWER,
                                                            onclick: function (event) {
                                                                tempProfile.transitionSettings.towers.forceBottomPerimeter = event.target.checked;
                                                            }
                                                        }),
                                                        m("label[for='forceTowerBottomPerimeter']", "Always draw perimeters on the first tower layer")
                                                    ])
                                                ])
                                            ])

                                        ]),

                                        m("tbody#sideTransitionSettings" + (tempProfile.transitionSettings.type === SIDE_TRANSITIONS ? "" : ".formSectionDisabled"), [

                                            m("tr", [
                                                m("td", {
                                                    colspan: 3
                                                }, [
                                                    m("h3", {
                                                        style: {
                                                            "font-weight": "bold"
                                                        }
                                                    }, "Side Transitions")
                                                ])
                                            ]),

                                            m("tr", [
                                                m("th", [
                                                    m("label.tooltip[for='sideTransitionSpeed']", {
                                                        "data-tooltip": tooltips.sideTransitionSpeed
                                                    }, "Max Purge Speed")
                                                ]),
                                                m("td", {
                                                    colspan: 2
                                                }, [
                                                    m("div#sideTransitionSpeedError.formError", [
                                                        m("input#sideTransitionSpeed.formInput", {
                                                            style: {
                                                                width: "100px",
                                                                display: "inline-block"
                                                            },
                                                            disabled: tempProfile.transitionSettings.type !== SIDE_TRANSITIONS,
                                                            value: tempProfile.transitionSettings.sideTransitions.purgeSpeed,
                                                            oninput: function (event) {
                                                                tempProfile.transitionSettings.sideTransitions.purgeSpeed = FormValidation.validateNumberInput(
                                                                    event.target.value,
                                                                    0,
                                                                    0, false,
                                                                    false, true,
                                                                    true,
                                                                    event.target.parentElement, "Max purge speed", "mm/s");
                                                            }
                                                        }),
                                                        m("label[for='sideTransitionSpeed']", {
                                                            style: {
                                                                "padding-left": "5px"
                                                            }
                                                        }, " mm/s")
                                                    ])
                                                ])
                                            ]),

                                            m("tr", [
                                                m("th", [
                                                    m("label#purgeInPlaceLabel1.tooltip[for='sideTransitionSpeed']" + (tempProfile.printBedDimensions.circular ? ".labelDisabled" : ""), {
                                                        "data-tooltip": tooltips.purgeInPlace
                                                    }, "Extrude In Place")
                                                ]),
                                                m("td", {
                                                    colspan: 2,
                                                    style: {
                                                        "padding-bottom": "10px"
                                                    }
                                                }, [
                                                    m("div.checkboxGroup", [
                                                        m("input#purgeInPlace[type='checkbox']", {
                                                            disabled: tempProfile.transitionSettings.type !== SIDE_TRANSITIONS || tempProfile.printBedDimensions.circular,
                                                            checked: tempProfile.transitionSettings.sideTransitions.purgeInPlace || tempProfile.printBedDimensions.circular,
                                                            onclick: function (event) {
                                                                tempProfile.transitionSettings.sideTransitions.purgeInPlace = event.target.checked;
                                                                document.getElementById("purgeCoordinatesRow").style.display = (event.target.checked ? "" : "none");
                                                                document.getElementById("purgeEdgeRow").style.display = (event.target.checked ? "none" : "");
                                                                document.getElementById("purgeEdgeOffsetRow").style.display = (event.target.checked ? "none" : "");
                                                            }
                                                        }),
                                                        m("label#purgeInPlaceLabel2[for='purgeInPlace']" + (tempProfile.printBedDimensions.circular ? ".labelDisabled" : ""), "Extrude without coordinated X/Y movement")
                                                    ])
                                                ])
                                            ]),

                                            m("tr#purgeCoordinatesRow", {
                                                style: {
                                                    display: (tempProfile.transitionSettings.sideTransitions.purgeInPlace || tempProfile.printBedDimensions.circular ? "" : "none")
                                                }
                                            }, [
                                                m("th.tooltip", [
                                                    m("span.tooltip", {
                                                        "data-tooltip": tooltips.purgeCoordinates
                                                    }, "Purge Coordinates")
                                                ]),
                                                m("td", {
                                                    colspan: 2
                                                }, [
                                                    m("table", [
                                                        m("tbody", [
                                                            m("tr", [
                                                                m("th", {
                                                                    style: {
                                                                        width: "20px",
                                                                        "font-weight": 500
                                                                    }
                                                                }, [
                                                                    m("label[for='purgeCoordinateX']", "X")
                                                                ]),
                                                                m("td", {
                                                                    style: {
                                                                        "white-space": "nowrap",
                                                                        "padding-right": "30px"
                                                                    }
                                                                }, [
                                                                    m("div.formError#purgeCoordinateXError", {
                                                                        style: {
                                                                            "display": "inline-block"
                                                                        }
                                                                    }, [
                                                                        m("input#purgeCoordinateX.formInput", {
                                                                            value: tempProfile.transitionSettings.sideTransitions.coordinates.x || "0",
                                                                            disabled: tempProfile.transitionSettings.type !== SIDE_TRANSITIONS,
                                                                            style: {
                                                                                display: "inline-block",
                                                                                width: "100px",
                                                                                "margin-right": "5px"
                                                                            },
                                                                            oninput: function (event) {
                                                                                tempProfile.transitionSettings.sideTransitions.coordinates.x = FormValidation.validateNumberInput(event.target.value,
                                                                                    0,
                                                                                    false, true,
                                                                                    false, true,
                                                                                    true,
                                                                                    event.target.parentElement, "Purge coordinate X", "mm");
                                                                            }
                                                                        })
                                                                    ]),
                                                                    m("label[for='purgeCoordinateX']", "mm")
                                                                ]),
                                                                m("th", {
                                                                    style: {
                                                                        width: "20px",
                                                                        "font-weight": 500
                                                                    }
                                                                }, [
                                                                    m("label[for='purgeCoordinateY']", "Y")
                                                                ]),
                                                                m("td", {
                                                                    style: {
                                                                        "white-space": "nowrap",
                                                                        "padding-right": "30px"
                                                                    }
                                                                }, [
                                                                    m("div.formError#purgeCoordinateYError", {
                                                                        style: {
                                                                            "display": "inline-block"
                                                                        }
                                                                    }, [
                                                                        m("input#purgeCoordinateY.formInput", {
                                                                            value: tempProfile.transitionSettings.sideTransitions.coordinates.y || "0",
                                                                            disabled: tempProfile.transitionSettings.type !== SIDE_TRANSITIONS,
                                                                            style: {
                                                                                display: "inline-block",
                                                                                width: "100px",
                                                                                "margin-right": "5px"
                                                                            },
                                                                            oninput: function (event) {
                                                                                tempProfile.transitionSettings.sideTransitions.coordinates.y = FormValidation.validateNumberInput(event.target.value,
                                                                                    0,
                                                                                    false, true,
                                                                                    false, true,
                                                                                    true,
                                                                                    event.target.parentElement, "Purge coordinate Y", "mm");
                                                                            }
                                                                        })
                                                                    ]),
                                                                    m("label[for='purgeCoordinateX']", "mm")
                                                                ])
                                                            ])
                                                        ])
                                                    ])
                                                ])
                                            ]),

                                            m("tr#purgeEdgeRow", {
                                                style: {
                                                    display: (tempProfile.transitionSettings.sideTransitions.purgeInPlace || tempProfile.printBedDimensions.circular ? "none" : "")
                                                }
                                            }, [
                                                m("th", [
                                                    m("span.tooltip", {
                                                        "data-tooltip": tooltips.purgeEdge
                                                    }, "Purge Location")
                                                ]),
                                                m("td", {
                                                    colspan: 2,
                                                    style: {
                                                        "padding-bottom": "10px"
                                                    }
                                                }, [
                                                    m("table", [
                                                        m("tbody", [
                                                            m("tr", [
                                                                m("td"),
                                                                m("td", [
                                                                    m("div.checkboxGroup", [
                                                                        m("input#purgeLocationNorth[type='radio']", {
                                                                            name: "purgeLocation",
                                                                            disabled: tempProfile.transitionSettings.type !== SIDE_TRANSITIONS,
                                                                            checked: (tempProfile.transitionSettings.sideTransitions.purgeEdge === "north"),
                                                                            onclick: function () {
                                                                                tempProfile.transitionSettings.sideTransitions.purgeEdge = "north";
                                                                            }
                                                                        }),
                                                                        m("label[for='purgeLocationNorth']", "North")
                                                                    ])
                                                                ])
                                                            ]),
                                                            m("tr", [
                                                                m("td", [
                                                                    m("div.checkboxGroup", [
                                                                        m("input#purgeLocationWest[type='radio']", {
                                                                            name: "purgeLocation",
                                                                            disabled: tempProfile.transitionSettings.type !== SIDE_TRANSITIONS,
                                                                            checked: (tempProfile.transitionSettings.sideTransitions.purgeEdge === "west"),
                                                                            onclick: function () {
                                                                                tempProfile.transitionSettings.sideTransitions.purgeEdge = "west";
                                                                            }
                                                                        }),
                                                                        m("label[for='purgeLocationWest']", "West")
                                                                    ])
                                                                ]),
                                                                m("td"),
                                                                m("td", [
                                                                    m("div.checkboxGroup", [
                                                                        m("input#purgeLocationEast[type='radio']", {
                                                                            name: "purgeLocation",
                                                                            disabled: tempProfile.transitionSettings.type !== SIDE_TRANSITIONS,
                                                                            checked: (tempProfile.transitionSettings.sideTransitions.purgeEdge === "east"),
                                                                            onclick: function () {
                                                                                tempProfile.transitionSettings.sideTransitions.purgeEdge = "east";
                                                                            }
                                                                        }),
                                                                        m("label[for='purgeLocationEast']", "East")
                                                                    ])
                                                                ])
                                                            ]),
                                                            m("tr", [
                                                                m("td"),
                                                                m("td", [
                                                                    m("div.checkboxGroup", [
                                                                        m("input#purgeLocationSouth[type='radio']", {
                                                                            name: "purgeLocation",
                                                                            disabled: tempProfile.transitionSettings.type !== SIDE_TRANSITIONS,
                                                                            checked: (tempProfile.transitionSettings.sideTransitions.purgeEdge === "south"),
                                                                            onclick: function () {
                                                                                tempProfile.transitionSettings.sideTransitions.purgeEdge = "south";
                                                                            }
                                                                        }),
                                                                        m("label[for='purgeLocationSouth']", "South")
                                                                    ])
                                                                ])
                                                            ])
                                                        ])
                                                    ])
                                                ])
                                            ]),

                                            m("tr#purgeEdgeOffsetRow", {
                                                style: {
                                                    display: (tempProfile.transitionSettings.sideTransitions.purgeInPlace || tempProfile.printBedDimensions.circular ? "none" : "")
                                                }
                                            }, [
                                                m("th", [
                                                    m("label.tooltip[for='purgeEdgeOffset']", {
                                                        "data-tooltip": tooltips.purgeEdgeOffset
                                                    }, "Edge Offset")
                                                ]),
                                                m("td", {
                                                    colspan: 2
                                                }, [
                                                    m("td", {
                                                        colspan: 2
                                                    }, [
                                                        m("div#purgeEdgeOffsetError.formError", [
                                                            m("input#purgeEdgeOffset.formInput", {
                                                                style: {
                                                                    width: "100px",
                                                                    display: "inline-block"
                                                                },
                                                                disabled: tempProfile.transitionSettings.type !== SIDE_TRANSITIONS,
                                                                value: tempProfile.transitionSettings.sideTransitions.purgeEdgeOffset,
                                                                oninput: function (event) {
                                                                    tempProfile.transitionSettings.sideTransitions.purgeEdgeOffset = FormValidation.validateNumberInput(
                                                                        event.target.value,
                                                                        0,
                                                                        0, false,
                                                                        false, true,
                                                                        true,
                                                                        event.target.parentElement, "Edge offset", "mm");
                                                                }
                                                            }),
                                                            m("label[for='purgeEdgeOffset']", {
                                                                style: {
                                                                    "padding-left": "5px"
                                                                }
                                                            }, " mm")
                                                        ])
                                                    ])
                                                ])
                                            ])

                                        ])

                                    ] : []),

                                ])
                            ])

                        ])
                    ]),

                    m("button.formbutton", {
                        onclick: closeProfileModal
                    }, "Cancel"),
                    m("button.confirm#saveProfileButton", {
                        style: {
                            float: "right",
                            "margin-top": "10px"
                        },
                        onclick: function (event) {
                            event.target.blur();
                            if (profile) {
                                editProfile(profile, tempProfile);
                            } else if (event.target.innerText === "Next") {
                                document.getElementById("paletteTabButton").click();
                                event.target.innerText = "Create";
                            } else {
                                addProfile(tempProfile);
                            }
                        }
                    }, (profile ? "Save" : ((tempProfile.calibrationGCodeLength && tempProfile.loadingOffset && tempProfile.printValue) ? "Create" : "Next")))

                ])
            ])
        ]);
    }

    modalWindow.style.display = "block";
    setTimeout(function () {
        modalWindow.style.opacity = 1;
        modalWindow.style.pointerEvents = "auto";
    }, 10);

}

function openCalibrationManualEntry(tempProfile, editReference) {

    if (editReference === undefined) {
        editReference = false;
    }

    let loadingOffset = tempProfile.loadingOffset;
    let printValue = tempProfile.printValue;
    let calibrationGCodeLength = tempProfile.calibrationGCodeLength;

    function returnToNewModalHandler(e) {
        returnToNewModal(e, tempProfile, 2);
        window.removeEventListener("keydown", returnToNewModalHandler);
    }

    function returnToEditModalHandler(e) {
        returnToEditModal(e, editReference, tempProfile, 2);
        window.removeEventListener("keydown", returnToEditModalHandler);
    }

    // pressing the ESC key will close the modal
    window.removeEventListener("keydown", closeProfileModal);
    if (editReference === false) {
        window.addEventListener("keydown", returnToNewModalHandler);
    } else {
        window.addEventListener("keydown", returnToEditModalHandler);
    }

    let modalWindow = document.getElementById("open-modal");
    m.render(modalWindow, []);
    m.render(modalWindow, [
        m("div.container", [
            m("div.save", [
                m("h2", "Printer-to-Palette Calibration"),
                m("span#errorText"),
                m("br"),

                m("table", [
                    m("tbody", [
                        m("tr", [
                            m("th", [
                                m("label[for='loadingOffset']", "Loading Offset")
                            ]),
                            m("td", [
                                m("div#loadingOffsetError.formError", [
                                    m("input#loadingOffset.formInput", {
                                        value: (loadingOffset === 0 ? "" : loadingOffset),
                                        oninput: function (event) {
                                            loadingOffset = FormValidation.validateIntegerInput(event.target.value, 0,
                                                2000, true,
                                                90000, true,
                                                false,
                                                event.target.parentElement, "Loading Offset");
                                        }
                                    })
                                ])
                            ])
                        ]),
                        m("tr", [
                            m("th", [
                                m("label[for='printValue']", "Print Value")
                            ]),
                            m("td", [
                                m("div#printValueError.formError", [
                                    m("input#printValue.formInput", {
                                        value: (printValue === 0 ? "" : printValue),
                                        oninput: function (event) {
                                            let pvMin = 20 * calibrationGCodeLength;
                                            let pvMax = 40 * calibrationGCodeLength;
                                            printValue = FormValidation.validateIntegerInput(event.target.value, 0,
                                                pvMin, true,
                                                pvMax, true,
                                                false,
                                                event.target.parentElement, "Print Value");
                                        }
                                    })
                                ])
                            ])
                        ]),
                        m("tr", [
                            m("td", {
                                colspan: 2
                            }, [
                                m("div.inlineContent", [
                                    m("div#calibrationCodeError.formError", [
                                        m("button#loadCalibrationCode.formButton", {
                                            style: {
                                                "white-space": "nowrap"
                                            },
                                            onclick: function (e) {
                                                e.target.blur();
                                                loadCalibrationFile(function (totalExtrusion) {
                                                    if (totalExtrusion !== false && totalExtrusion > 0) {
                                                        calibrationGCodeLength = totalExtrusion;
                                                        FormValidation.resetValidationError(document.getElementById("calibrationCodeError"));
                                                        document.getElementById("loadCalibrationCode").innerText = "Reload Calibration File";
                                                        document.getElementById("printLength").value = (totalExtrusion / 1000).toFixed(2) + " m total";
                                                    }
                                                });
                                            }
                                        }, (calibrationGCodeLength === 0 ? "Load Calibration File" : "Reload Calibration File"))
                                    ]),
                                    m("input#printLength.formInputDisabled", {
                                        value: (calibrationGCodeLength === 0 ? "" : ((calibrationGCodeLength / 1000).toFixed(2) + " m total")),
                                        disabled: true
                                    })
                                ])
                            ])
                        ])
                    ])
                ]),

                m("button.formButton", {
                    onclick: function (e) {
                        if (editReference === false) {
                            returnToNewModal(e, tempProfile, 2);
                            window.removeEventListener("keydown", returnToNewModalHandler);
                        } else {
                            returnToEditModal(e, editReference, tempProfile, 2);
                            window.removeEventListener("keydown", returnToEditModalHandler);
                        }
                    }
                }, "Cancel"),
                m("button.confirm", {
                    style: {
                        float: "right",
                        "margin-top": "10px"
                    },
                    onclick: function (e) {

                        let validationErrorsExist = false;

                        if (loadingOffset === 0) {
                            validationErrorsExist = true;
                            FormValidation.showValidationError(document.getElementById("loadingOffsetError"));
                        }

                        if (printValue === 0) {
                            validationErrorsExist = true;
                            FormValidation.showValidationError(document.getElementById("printValueError"));
                        }

                        if (calibrationGCodeLength === 0) {
                            validationErrorsExist = true;
                            FormValidation.showValidationError(document.getElementById("calibrationCodeError"));
                        }

                        if (!validationErrorsExist) {
                            tempProfile.loadingOffset = loadingOffset;
                            tempProfile.printValue = printValue;
                            tempProfile.calibrationGCodeLength = calibrationGCodeLength;
                            if (editReference === false) {
                                returnToNewModal(e, tempProfile, 2);
                                window.removeEventListener("keydown", returnToNewModalHandler);
                            } else {
                                returnToEditModal(e, editReference, tempProfile, 2);
                                window.removeEventListener("keydown", returnToEditModalHandler);
                            }
                        }
                    }
                }, "Save")

            ])
        ])
    ]);

}

function openCalibrationWizard(tempProfile, editReference, closeAfter) {

    if (editReference === undefined) {
        editReference = false;
    }
    if (closeAfter === undefined) {
        closeAfter = false;
    }

    let loadingOffset = 0;
    let printValue = 0;
    let calibrationGCodeLength = 0;
    let calibrationPrintFilePath = "";
    let calibrationCSFFilePath = "";

    function returnToNoModalHandler(e) {
        if (e === true || e.type === "click" || e.keyCode === 27) {
            if (e === true) {
                PrinterProfiles.addProfile(tempProfile);
                config.saveProfile(tempProfile);
                Postprocessor.updateProfileDropdown();
                closeModal();
                window.removeEventListener("keydown", returnToNoModalHandler);
                if (global.firstRun) {
                    SetupView.startTutorial();
                }
            } else {
                e.target.blur();
                modalUtils.confirmUnsavedChangesDialog(function (choice) {
                    if (choice === 0) {
                        closeModal();
                        window.removeEventListener("keydown", returnToNoModalHandler);
                    }
                });
            }
        }
    }

    function returnToNewModalHandler(e) {
        returnToNewModal(e, tempProfile, 2);
        window.removeEventListener("keydown", returnToNewModalHandler);
    }

    function returnToEditModalHandler(e) {
        returnToEditModal(e, editReference, tempProfile, 2);
        window.removeEventListener("keydown", returnToEditModalHandler);
    }

    function onCalibrationWizardCancel(e) {
        if (closeAfter) {
            returnToNoModalHandler(e);
        } else {
            if (editReference === false) {
                returnToNewModal(e, tempProfile, 2);
                window.removeEventListener("keydown", returnToNewModalHandler);
            } else {
                returnToEditModal(e, editReference, tempProfile, 2);
                window.removeEventListener("keydown", returnToEditModalHandler);
            }
        }
    }

    // pressing the ESC key will close the modal
    window.removeEventListener("keydown", closeProfileModal);
    if (closeAfter) {
        window.addEventListener("keydown", returnToNoModalHandler);
    } else {
        if (editReference === false) {
            window.addEventListener("keydown", returnToNewModalHandler);
        } else {
            window.addEventListener("keydown", returnToEditModalHandler);
        }
    }

    let bmCalibrationIntro;
    let bmStartPalette;
    let bmFeedFilament;
    let bmPreheatPrinter;
    let bmLoadPrinter;
    let bmClipTube;
    let bmColorChange;
    let bmLoadingOffset;
    let bmPrintValue;

    function getPaneProgressValue(paneNumber) {
        const paneCount = 13;
        return Math.round(((paneNumber - 1) / (paneCount - 1)) * 100) + "%";
    }

    let modalWindow = document.getElementById("open-modal");
    m.render(modalWindow, []);
    m.render(modalWindow, [
        m("div.container", [
            m("div.calibrationWizard", [
                getWizardProgressBar(5, "calibrationWizardProgressBar", "calibrationWizardProgress"),
                m("h2", "Calibrate Your Printer"),
                m("span#errorText"),
                m("br"),

                m("div#wizardPanes", [
                    m("div#wizardPane1", {
                        style: {
                            display: "block"
                        }
                    }, [
                        m("p", [
                            m("span.tooltip", {
                                "data-tooltip": tooltips.calibration
                            }, [
                                "There are two calibration factors which Palette requires:",
                                m("br"),
                                "Loading Offset and Print Value."
                            ])
                        ]),
                        m("div", {
                            style: {
                                "margin-top": "-10px"
                            },
                            config: function (el) {
                                bmCalibrationIntro = bodymovin.loadAnimation({
                                    container: el,
                                    renderer: "svg",
                                    loop: true,
                                    autoplay: false,
                                    path: "../assets/onboarding/calibration-introduction.json"
                                });
                                setTimeout(function () {
                                    if (document.getElementById("wizardPane1").style.display === "block") {
                                        bmCalibrationIntro.play();
                                    }
                                }, 500);
                            }
                        }),
                        m("div.paneButtons", [
                            m("div.leftPane", [
                                m("button.formButton", {
                                    onclick: onCalibrationWizardCancel
                                }, "Cancel")
                            ]),
                            m("div.rightPane", [
                                m("button.formButton", {
                                    onclick: function () {
                                        document.getElementById("wizardPane1").style.display = "none";
                                        document.getElementById("wizardPane2").style.display = "block";
                                        document.getElementById("calibrationWizardProgress").style.width = getPaneProgressValue(2);
                                        bmCalibrationIntro.goToAndStop(0, true);
                                    }
                                }, "Next")
                            ])
                        ])
                    ]),
                    m("div#wizardPane2", {
                        style: {
                            display: "none"
                        }
                    }, [
                        m("h3", "Slice the calibration model"),
                        m("div", {
                            style: {
                                float: "right",
                                width: "177px",
                                height: "114px",
                                "margin-left": "20px",
                                "margin-right": "20px",
                                "background-image": "url('../assets/calibration-print.svg')",
                                "background-size": "contain",
                                "background-position": "center",
                                "background-repeat": "no-repeat"
                            }
                        }),
                        m("p", {
                            style: {
                                marginBottom: 0
                            }
                        }, "1. Slice the STL provided below using the slicer settings you typically use for your printer."),
                        m("button.formButton", {
                            style: {
                                marginBottom: 0
                            },
                            onclick: function (e) {
                                e.target.blur();
                                dialog.showSaveDialog(BrowserWindow.fromId(2), {
                                    defaultPath: path.join(app.getPath("desktop"), "CalibrationPrint.stl"),
                                    title: "Save Calibration Model",
                                    filters: [{
                                        name: "STL",
                                        extensions: ["stl"]
                                    }]
                                }, function (filePath) {
                                    if (filePath !== undefined) {
                                        fs.createReadStream(path.join(__dirname, "..", "assets", "CalibrationPrint.stl")).pipe(fs.createWriteStream(filePath));
                                    }
                                });
                            }
                        }, "Save Calibration Model"),
                        m("p", {
                            style: {
                                marginBottom: 0
                            }
                        }, "2. Once sliced, load your print file below."),

                        m("div.inlineContent", [
                            m("button#loadCalibrationCode.formButton", {
                                style: {
                                    "white-space": "nowrap"
                                },
                                onclick: function (e) {
                                    e.target.blur();
                                    loadCalibrationFile(function (totalExtrusion, inputBasePath, inputExt) {
                                        if (totalExtrusion !== false && totalExtrusion > 0) {
                                            calibrationCSFFilePath = inputBasePath + ".csf";
                                            calibrationPrintFilePath = inputBasePath + ".csf" + inputExt;
                                            calibrationGCodeLength = totalExtrusion;
                                            document.getElementById("printLength").value = "Complete (" + (calibrationGCodeLength / 1000).toFixed(2) + " m total)";
                                            setTimeout(async function () {
                                                // create a calibration MSF (CSF) for Palette
                                                const MSF = require("../models/msf");
                                                let msf = new MSF();
                                                msf.printerProfile = tempProfile;
                                                msf.colorsUsed = [10, 1, 1, 0];
                                                msf.setMaterials(["Default PLA", "Default PLA", "Default PLA", null]);
                                                msf.pulsesPerMM = 30;
                                                msf.loadingOffset = 0;
                                                msf.heatFactor = null;
                                                let totalLength = tempProfile.getMinFirstPieceLength();
                                                msf.spliceList.push([0, totalLength]);
                                                let halfPrintLength = Math.max(totalExtrusion / 2, SPLICE_MIN_LENGTH);
                                                totalLength += halfPrintLength;
                                                msf.spliceList.push([1, totalLength]);
                                                totalLength += halfPrintLength;
                                                msf.spliceList.push([2, totalLength]);
                                                fs.writeFileSync(calibrationCSFFilePath, msf.createMSF());
                                                // app.getFileIcon(calibrationCSFFilePath, function (err, icon) {
                                                //     if (!err) {
                                                //         let dataURL = icon.toDataURL({
                                                //             scaleFactor: 3.0
                                                //         });
                                                //         document.getElementById("csfOutfileIcon").style.backgroundImage = "url(" + dataURL + ")";
                                                //     }
                                                // });
                                                if (tempProfile.postprocessing === "makerbot") {
                                                    let print = new Print(inputBasePath + inputExt, tempProfile);
                                                    print._outRaft = print._raft;
                                                    await print.runPreFlight(true);
                                                    let outEngine = new Raft.Makerbot5thGenEngine({
                                                        skipInvalidInstructions: true,
                                                        volumetricExtrusion: tempProfile.volumetric,
                                                        filamentDiameter: tempProfile.filamentDiameter,
                                                        initialXYZCoordinateMode: Raft.CoordinateModes.Absolute,
                                                        initialExtrusionCoordinateMode: Raft.CoordinateModes.Relative,
                                                        toolheadCount: 4,
                                                        initialPrintState: Raft.PrintStates.StartSequence
                                                    });
                                                    let makerbotAssetPath;
                                                    if (global.env.type === "prebuilt" || global.env.type === "testing") {
                                                        makerbotAssetPath = "app/assets/calibration-makerbot";
                                                    } else {
                                                        makerbotAssetPath = path.join(app.getAppPath(), "assets/calibration-makerbot");
                                                    }
                                                    let outParser = new Raft.MakerbotParser(outEngine);
                                                    let outRaft = new Raft.RaftWrapper(outParser);
                                                    outRaft.instructions = print._raft.instructions;
                                                    outRaft.parser.thumbnailSmall = fs.readFileSync(makerbotAssetPath + "/thumbnail_55x40.png");
                                                    outRaft.parser.thumbnailMedium = fs.readFileSync(makerbotAssetPath + "/thumbnail_110x80.png");
                                                    outRaft.parser.thumbnailLarge = fs.readFileSync(makerbotAssetPath + "/thumbnail_320x200.png");
                                                    outRaft.parser.metaJson = await print.getMakerbot5thGenMeta();
                                                    calibrationPrintFilePath = calibrationCSFFilePath + ".makerbot";
                                                    outRaft.save(calibrationPrintFilePath);
                                                } else if (tempProfile.postprocessing === "g3drem") {
                                                    let print = new Print(inputBasePath + inputExt, tempProfile);
                                                    print._outRaft = print._raft;
                                                    await print.runPreFlight(true);
                                                    let engineName = PrinterPresets.getEngineInfo(tempProfile.engine).name;
                                                    let outEngine = new Raft[engineName]({
                                                        skipInvalidInstructions: true,
                                                        volumetricExtrusion: tempProfile.volumetric,
                                                        filamentDiameter: tempProfile.filamentDiameter,
                                                        initialXYZCoordinateMode: Raft.CoordinateModes.Absolute,
                                                        initialExtrusionCoordinateMode: Raft.CoordinateModes.Relative,
                                                        toolheadCount: 4,
                                                        initialPrintState: Raft.PrintStates.StartSequence
                                                    });
                                                    let outParser = new Raft.G3DremParser(outEngine);
                                                    let outRaft = new Raft.RaftWrapper(outParser);
                                                    outRaft.instructions = print._raft.instructions;
                                                    outRaft.parser.binaryHeader = await print.getDremelHeader();
                                                    calibrationPrintFilePath = calibrationCSFFilePath.replace(".csf", "_csf") + ".g3drem";
                                                    outRaft.save(calibrationPrintFilePath);
                                                } else if (tempProfile.postprocessing === "x3g") {
                                                    calibrationPrintFilePath = calibrationCSFFilePath + ".x3g";
                                                    require("./gpx").runGPX(tempProfile.gpxProfile, tempProfile.gpxConfigPath, inputBasePath + inputExt, calibrationPrintFilePath);
                                                } else {
                                                    fs.createReadStream(inputBasePath + inputExt).pipe(fs.createWriteStream(calibrationPrintFilePath));
                                                }
                                                m.render(
                                                    document.getElementById("calibrationFileTableContainer"),
                                                    menuUtils.getOutputFileGrid(tempProfile, calibrationPrintFilePath, calibrationCSFFilePath, true)
                                                );
                                                document.getElementById("wizardPane2Next").disabled = false;
                                            }, 100);
                                        }
                                    });
                                }
                            }, "Load Print File"),
                            m("input#printLength.formInputDisabled", {
                                disabled: true
                            })
                        ]),

                        m("div.paneButtons", [
                            m("div.leftPane", [
                                m("button.formButton", {
                                    onclick: onCalibrationWizardCancel
                                }, "Cancel")
                            ]),
                            m("div.rightPane", [
                                m("button.formButton", {
                                    onclick: function () {
                                        document.getElementById("wizardPane2").style.display = "none";
                                        document.getElementById("wizardPane1").style.display = "block";
                                        document.getElementById("calibrationWizardProgress").style.width = getPaneProgressValue(1);
                                        setTimeout(function () {
                                            if (document.getElementById("wizardPane1").style.display === "block") {
                                                bmCalibrationIntro.play();
                                            }
                                        }, 500);
                                    }
                                }, "Back"),
                                m("button#wizardPane2Next.formButton", {
                                    disabled: true,
                                    onclick: function () {
                                        document.getElementById("wizardPane2").style.display = "none";
                                        document.getElementById("wizardPane3").style.display = "block";
                                        document.getElementById("calibrationWizardProgress").style.width = getPaneProgressValue(3);
                                    }
                                }, "Next")
                            ])
                        ])

                    ]),
                    m("div#wizardPane3", {
                        style: {
                            display: "none"
                        }
                    }, [
                        m("h3", "Save Calibration Files"),
                        m("div#calibrationFileTableContainer"),
                        m("div.paneButtons", [
                            m("div.leftPane", [
                                m("button.formButton", {
                                    onclick: onCalibrationWizardCancel
                                }, "Cancel")
                            ]),
                            m("div.rightPane", [
                                m("button.formButton", {
                                    onclick: function () {
                                        document.getElementById("wizardPane3").style.display = "none";
                                        document.getElementById("wizardPane2").style.display = "block";
                                        document.getElementById("calibrationWizardProgress").style.width = getPaneProgressValue(2);
                                    }
                                }, "Back"),
                                m("button.formButton", {
                                    onclick: function () {
                                        document.getElementById("wizardPane3").style.display = "none";
                                        document.getElementById("wizardPane4").style.display = "block";
                                        document.getElementById("calibrationWizardProgress").style.width = getPaneProgressValue(4);
                                        setTimeout(function () {
                                            if (document.getElementById("wizardPane4").style.display === "block") {
                                                bmStartPalette.play();
                                            }
                                        }, 500);
                                    }
                                }, "Next")
                            ])
                        ])
                    ]),
                    m("div#wizardPane4", {
                        style: {
                            display: "none"
                        }
                    }, [
                        m("h3", "Launch printer calibration and follow along in Chroma"),
                        m("p", "Load Palette with the provided clear filament and two other filaments."),
                        m("div", {
                            style: {
                                "margin-top": "-10px"
                            },
                            config: function (el) {
                                bmStartPalette = bodymovin.loadAnimation({
                                    container: el,
                                    renderer: "svg",
                                    loop: true,
                                    autoplay: false,
                                    path: "../assets/onboarding/start-palette.json"
                                });
                            }
                        }),
                        m("div.paneButtons", [
                            m("div.leftPane", [
                                m("button.formButton", {
                                    onclick: onCalibrationWizardCancel
                                }, "Cancel")
                            ]),
                            m("div.rightPane", [
                                m("button.formButton", {
                                    onclick: function () {
                                        document.getElementById("wizardPane4").style.display = "none";
                                        document.getElementById("wizardPane3").style.display = "block";
                                        document.getElementById("calibrationWizardProgress").style.width = getPaneProgressValue(3);
                                        bmStartPalette.goToAndStop(0, true);
                                    }
                                }, "Back"),
                                m("button.formButton", {
                                    onclick: function () {
                                        document.getElementById("wizardPane4").style.display = "none";
                                        document.getElementById("wizardPane5").style.display = "block";
                                        document.getElementById("calibrationWizardProgress").style.width = getPaneProgressValue(5);
                                        bmStartPalette.goToAndStop(0, true);
                                        setTimeout(function () {
                                            if (document.getElementById("wizardPane5").style.display === "block") {
                                                bmFeedFilament.play();
                                            }
                                        }, 500);
                                    }
                                }, "Next")
                            ])
                        ])
                    ]),
                    m("div#wizardPane5", {
                        style: {
                            display: "none"
                        }
                    }, [
                        m("h3", "Press magnet against Palette to feed filament through guide tubes"),
                        m("p", m("span.tooltip", {
                            "data-tooltip": tooltips.loadingOffset
                        }, "Proceed to the next step when filament reaches the end of the tube.")),
                        m("div", {
                            style: {
                                position: "relative",
                                top: "-10px"
                            },
                            config: function (el) {
                                bmFeedFilament = bodymovin.loadAnimation({
                                    container: el,
                                    renderer: "svg",
                                    loop: true,
                                    autoplay: false,
                                    path: "../assets/onboarding/feed-filament.json"
                                });
                            }
                        }),
                        m("div.paneButtons", [
                            m("div.leftPane", [
                                m("button.formButton", {
                                    onclick: onCalibrationWizardCancel
                                }, "Cancel")
                            ]),
                            m("div.rightPane", [
                                m("button.formButton", {
                                    onclick: function () {
                                        document.getElementById("wizardPane5").style.display = "none";
                                        document.getElementById("wizardPane4").style.display = "block";
                                        document.getElementById("calibrationWizardProgress").style.width = getPaneProgressValue(4);
                                        bmFeedFilament.goToAndStop(0, true);
                                        setTimeout(function () {
                                            if (document.getElementById("wizardPane4").style.display === "block") {
                                                bmStartPalette.play();
                                            }
                                        }, 500);
                                    }
                                }, "Back"),
                                m("button.formButton", {
                                    onclick: function () {
                                        document.getElementById("wizardPane5").style.display = "none";
                                        document.getElementById("wizardPane6").style.display = "block";
                                        document.getElementById("calibrationWizardProgress").style.width = getPaneProgressValue(6);
                                        bmFeedFilament.goToAndStop(0, true);
                                        setTimeout(function () {
                                            if (document.getElementById("wizardPane6").style.display === "block") {
                                                bmPreheatPrinter.play();
                                            }
                                        }, 500);
                                    }
                                }, "Next")
                            ])
                        ])
                    ]),
                    m("div#wizardPane6", {
                        style: {
                            display: "none"
                        }
                    }, [
                        m("h3", "Preheat your printer"),
                        m("div", {
                            style: {
                                height: "280px"
                            },
                            config: function (el) {
                                bmPreheatPrinter = bodymovin.loadAnimation({
                                    container: el,
                                    renderer: "svg",
                                    loop: true,
                                    autoplay: false,
                                    path: "../assets/onboarding/preheat-printer.json"
                                });
                            }
                        }),
                        m("div.paneButtons", [
                            m("div.leftPane", [
                                m("button.formButton", {
                                    onclick: onCalibrationWizardCancel
                                }, "Cancel")
                            ]),
                            m("div.rightPane", [
                                m("button.formButton", {
                                    onclick: function () {
                                        document.getElementById("wizardPane6").style.display = "none";
                                        document.getElementById("wizardPane5").style.display = "block";
                                        document.getElementById("calibrationWizardProgress").style.width = getPaneProgressValue(5);
                                        bmPreheatPrinter.goToAndStop(0, true);
                                        setTimeout(function () {
                                            if (document.getElementById("wizardPane5").style.display === "block") {
                                                bmFeedFilament.play();
                                            }
                                        }, 500);
                                    }
                                }, "Back"),
                                m("button.formButton", {
                                    onclick: function () {
                                        document.getElementById("wizardPane6").style.display = "none";
                                        bmPreheatPrinter.goToAndStop(0, true);
                                        if (tempProfile.bowdenTube === false) {
                                            document.getElementById("wizardPane7").style.display = "block";
                                            document.getElementById("calibrationWizardProgress").style.width = getPaneProgressValue(7);
                                            setTimeout(function () {
                                                if (document.getElementById("wizardPane7").style.display === "block") {
                                                    bmLoadPrinter.play();
                                                }
                                            }, 500);
                                        } else {
                                            document.getElementById("wizardPane9").style.display = "block";
                                            document.getElementById("calibrationWizardProgress").style.width = getPaneProgressValue(9);
                                            setTimeout(function () {
                                                if (document.getElementById("wizardPane9").style.display === "block") {
                                                    bmColorChange.play();
                                                }
                                            }, 500);
                                        }
                                    }
                                }, "Next")
                            ])
                        ])
                    ]),
                    m("div#wizardPane7", {
                        style: {
                            display: "none"
                        }
                    }, [
                        m("h3", "Load until filament is gripped by extruder gear"),
                        m("div", {
                            style: {
                                height: "280px"
                            },
                            config: function (el) {
                                bmLoadPrinter = bodymovin.loadAnimation({
                                    container: el,
                                    renderer: "svg",
                                    loop: true,
                                    autoplay: false,
                                    path: "../assets/onboarding/load-printer.json"
                                });
                            }
                        }),
                        m("div.paneButtons", [
                            m("div.leftPane", [
                                m("button.formButton", {
                                    onclick: onCalibrationWizardCancel
                                }, "Cancel")
                            ]),
                            m("div.rightPane", [
                                m("button.formButton", {
                                    onclick: function () {
                                        document.getElementById("wizardPane7").style.display = "none";
                                        document.getElementById("wizardPane6").style.display = "block";
                                        document.getElementById("calibrationWizardProgress").style.width = getPaneProgressValue(6);
                                        bmLoadPrinter.goToAndStop(0, true);
                                        setTimeout(function () {
                                            if (document.getElementById("wizardPane6").style.display === "block") {
                                                bmPreheatPrinter.play();
                                            }
                                        }, 500);
                                    }
                                }, "Back"),
                                m("button.formButton", {
                                    onclick: function () {
                                        document.getElementById("wizardPane7").style.display = "none";
                                        document.getElementById("wizardPane8").style.display = "block";
                                        document.getElementById("calibrationWizardProgress").style.width = getPaneProgressValue(8);
                                        bmLoadPrinter.goToAndStop(0, true);
                                        setTimeout(function () {
                                            if (document.getElementById("wizardPane8").style.display === "block") {
                                                bmClipTube.play();
                                            }
                                        }, 500);
                                    }
                                }, "Next")
                            ])
                        ])
                    ]),
                    m("div#wizardPane8", {
                        style: {
                            display: "none"
                        }
                    }, [
                        m("h3", "Press guide tube into the clip until secured"),
                        m("div", {
                            style: {
                                height: "300px"
                            },
                            config: function (el) {
                                bmClipTube = bodymovin.loadAnimation({
                                    container: el,
                                    renderer: "svg",
                                    loop: true,
                                    autoplay: false,
                                    path: "../assets/onboarding/clip-tube.json"
                                });
                            }
                        }),
                        m("div.paneButtons", [
                            m("div.leftPane", [
                                m("button.formButton", {
                                    onclick: onCalibrationWizardCancel
                                }, "Cancel")
                            ]),
                            m("div.rightPane", [
                                m("button.formButton", {
                                    onclick: function () {
                                        document.getElementById("wizardPane8").style.display = "none";
                                        document.getElementById("wizardPane7").style.display = "block";
                                        document.getElementById("calibrationWizardProgress").style.width = getPaneProgressValue(7);
                                        bmClipTube.goToAndStop(0, true);
                                        setTimeout(function () {
                                            if (document.getElementById("wizardPane7").style.display === "block") {
                                                bmLoadPrinter.play();
                                            }
                                        }, 500);
                                    }
                                }, "Back"),
                                m("button.formButton", {
                                    onclick: function () {
                                        document.getElementById("wizardPane8").style.display = "none";
                                        document.getElementById("wizardPane9").style.display = "block";
                                        document.getElementById("calibrationWizardProgress").style.width = getPaneProgressValue(9);
                                        bmClipTube.goToAndStop(0, true);
                                        setTimeout(function () {
                                            if (document.getElementById("wizardPane9").style.display === "block") {
                                                bmColorChange.play();
                                            }
                                        }, 500);
                                    }
                                }, "Next")
                            ])
                        ])
                    ]),
                    m("div#wizardPane9", {
                        style: {
                            display: "none"
                        }
                    }, [
                        m("h3", "Slowly jog into extruder until color changes"),
                        m("p", m("span.tooltip", {
                            "data-tooltip": tooltips.loadingOffset
                        }, m("strong", "Load clear filament through and stop once the next color appears!"))),
                        m("div", {
                            style: {
                                height: "280px"
                            },
                            config: function (el) {
                                bmColorChange = bodymovin.loadAnimation({
                                    container: el,
                                    renderer: "svg",
                                    loop: true,
                                    autoplay: false,
                                    path: "../assets/onboarding/color-change.json"
                                });
                            }
                        }),
                        m("div.paneButtons", [
                            m("div.leftPane", [
                                m("button.formButton", {
                                    onclick: onCalibrationWizardCancel
                                }, "Cancel")
                            ]),
                            m("div.rightPane", [
                                m("button.formButton", {
                                    onclick: function () {
                                        document.getElementById("wizardPane9").style.display = "none";
                                        bmColorChange.goToAndStop(0, true);
                                        if (tempProfile.bowdenTube === false) {
                                            document.getElementById("wizardPane8").style.display = "block";
                                            document.getElementById("calibrationWizardProgress").style.width = getPaneProgressValue(8);
                                            setTimeout(function () {
                                                if (document.getElementById("wizardPane8").style.display === "block") {
                                                    bmClipTube.play();
                                                }
                                            }, 500);
                                        } else {
                                            document.getElementById("wizardPane6").style.display = "block";
                                            document.getElementById("calibrationWizardProgress").style.width = getPaneProgressValue(6);
                                            setTimeout(function () {
                                                if (document.getElementById("wizardPane6").style.display === "block") {
                                                    bmPreheatPrinter.play();
                                                }
                                            }, 500);
                                        }
                                    }
                                }, "Back"),
                                m("button.formButton", {
                                    onclick: function () {
                                        document.getElementById("wizardPane9").style.display = "none";
                                        document.getElementById("wizardPane10").style.display = "block";
                                        document.getElementById("calibrationWizardProgress").style.width = getPaneProgressValue(10);
                                        bmColorChange.goToAndStop(0, true);
                                        setTimeout(function () {
                                            if (document.getElementById("wizardPane10").style.display === "block") {
                                                bmLoadingOffset.play();
                                            }
                                        }, 500);
                                    }
                                }, "Next")
                            ])
                        ])
                    ]),
                    m("div#wizardPane10", {
                        style: {
                            display: "none"
                        }
                    }, [
                        m("h3", "Follow the process below to lock in your Loading Offset"),
                        m("div", {
                            style: {
                                height: "300px",
                                "margin-top": "-30px"
                            },
                            config: function (el) {
                                bmLoadingOffset = bodymovin.loadAnimation({
                                    container: el,
                                    renderer: "svg",
                                    loop: true,
                                    autoplay: false,
                                    path: "../assets/onboarding/loading-offset.json"
                                });
                            }
                        }),
                        m("div.paneButtons", [
                            m("div.leftPane", [
                                m("button.formButton", {
                                    onclick: onCalibrationWizardCancel
                                }, "Cancel")
                            ]),
                            m("div.rightPane", [
                                m("button.formButton", {
                                    onclick: function () {
                                        document.getElementById("wizardPane10").style.display = "none";
                                        document.getElementById("wizardPane9").style.display = "block";
                                        document.getElementById("calibrationWizardProgress").style.width = getPaneProgressValue(9);
                                        bmLoadingOffset.goToAndStop(0, true);
                                        setTimeout(function () {
                                            if (document.getElementById("wizardPane9").style.display === "block") {
                                                bmColorChange.play();
                                            }
                                        }, 500);
                                    }
                                }, "Back"),
                                m("button.formButton", {
                                    onclick: function () {
                                        document.getElementById("wizardPane10").style.display = "none";
                                        document.getElementById("wizardPane11").style.display = "block";
                                        document.getElementById("calibrationWizardProgress").style.width = getPaneProgressValue(11);
                                        bmLoadingOffset.goToAndStop(0, true);
                                        setTimeout(function () {
                                            if (document.getElementById("wizardPane11").style.display === "block") {
                                                bmPrintValue.play();
                                            }
                                        }, 500);
                                    }
                                }, "Next")
                            ])
                        ])
                    ]),
                    m("div#wizardPane11", {
                        style: {
                            display: "none"
                        }
                    }, [
                        m("h3", "Without changing filament, start the calibration print"),
                        m("p", "Once the print completes, lock in your Print Value."),
                        m("div", {
                            style: {
                                height: "300px",
                                "margin-top": "-10px"
                            },
                            config: function (el) {
                                bmPrintValue = bodymovin.loadAnimation({
                                    container: el,
                                    renderer: "svg",
                                    loop: true,
                                    autoplay: false,
                                    path: "../assets/onboarding/print-value.json"
                                });
                            }
                        }),
                        m("div.paneButtons", [
                            m("div.leftPane", [
                                m("button.formButton", {
                                    onclick: onCalibrationWizardCancel
                                }, "Cancel")
                            ]),
                            m("div.rightPane", [
                                m("button.formButton", {
                                    onclick: function () {
                                        document.getElementById("wizardPane11").style.display = "none";
                                        document.getElementById("wizardPane10").style.display = "block";
                                        document.getElementById("calibrationWizardProgress").style.width = getPaneProgressValue(10);
                                        bmPrintValue.goToAndStop(0, true);
                                        setTimeout(function () {
                                            if (document.getElementById("wizardPane10").style.display === "block") {
                                                bmLoadingOffset.play();
                                            }
                                        }, 500);
                                    }
                                }, "Back"),
                                m("button.formButton", {
                                    onclick: function () {
                                        document.getElementById("wizardPane11").style.display = "none";
                                        document.getElementById("wizardPane12").style.display = "block";
                                        document.getElementById("calibrationWizardProgress").style.width = getPaneProgressValue(12);
                                        bmPrintValue.goToAndStop(0, true);
                                    }
                                }, "Next")
                            ])
                        ])
                    ]),
                    m("div#wizardPane12", {
                        style: {
                            display: "none"
                        }
                    }, [
                        m("h3", "Enter calibration values"),

                        m("table", [
                            m("tbody", [
                                m("tr", [
                                    m("th", [
                                        m("label[for='loadingOffset']", "Loading Offset")
                                    ]),
                                    m("td", [
                                        m("div#loadingOffsetError.formError", [
                                            m("input#loadingOffset.formInput", {
                                                oninput: function (event) {
                                                    loadingOffset = FormValidation.validateIntegerInput(event.target.value, 0,
                                                        2000, true,
                                                        90000, true,
                                                        false,
                                                        event.target.parentElement, "Loading Offset");
                                                }
                                            })
                                        ])
                                    ])
                                ]),
                                m("tr", [
                                    m("th", [
                                        m("label[for='printValue']", "Print Value")
                                    ]),
                                    m("td", [
                                        m("div#printValueError.formError", [
                                            m("input#printValue.formInput", {
                                                oninput: function (event) {
                                                    let pvMin = 20 * calibrationGCodeLength;
                                                    let pvMax = 40 * calibrationGCodeLength;
                                                    printValue = FormValidation.validateIntegerInput(event.target.value, 0,
                                                        pvMin, true,
                                                        pvMax, true,
                                                        false,
                                                        event.target.parentElement, "Print Value");
                                                }
                                            })
                                        ])
                                    ])
                                ])
                            ])
                        ]),

                        m("div.paneButtons", [
                            m("div.leftPane", [
                                m("button.formButton", {
                                    onclick: onCalibrationWizardCancel
                                }, "Cancel")
                            ]),
                            m("div.rightPane", [
                                m("button.formButton", {
                                    onclick: function () {
                                        document.getElementById("wizardPane12").style.display = "none";
                                        document.getElementById("wizardPane11").style.display = "block";
                                        document.getElementById("calibrationWizardProgress").style.width = getPaneProgressValue(11);
                                        setTimeout(function () {
                                            if (document.getElementById("wizardPane11").style.display === "block") {
                                                bmPrintValue.play();
                                            }
                                        }, 500);
                                    }
                                }, "Back"),
                                m("button.formButton", {
                                    onclick: function (e) {

                                        let validationErrorsExist = false;

                                        if (loadingOffset === 0) {
                                            validationErrorsExist = true;
                                            FormValidation.showValidationError(document.getElementById("loadingOffsetError"));
                                        }

                                        if (printValue === 0) {
                                            validationErrorsExist = true;
                                            FormValidation.showValidationError(document.getElementById("printValueError"));
                                        }

                                        if (!validationErrorsExist) {
                                            document.getElementById("wizardPane12").style.display = "none";
                                            document.getElementById("wizardPane13").style.display = "block";
                                        }
                                    }
                                }, "Next")
                            ])
                        ])
                    ]),

                    m("div#wizardPane13", {
                        style: {
                            display: "none"
                        }
                    }, [
                        m("h3", "Learn how to slice for Palette"),
                        m("div", (tempProfile.baseProfile !== "custom" && PrinterPresets.getPresetByUID(tempProfile.baseProfile).customSetupInfo
                            && PrinterPresets.getPresetByUID(tempProfile.baseProfile).customSetupInfo.slicerText) ? [
                                m.trust(marked(PrinterPresets.getPresetByUID(tempProfile.baseProfile).customSetupInfo.slicerText))
                        ] : [
                            m("p", "The following guides will show you how to set up and slice your first multi-color model."),
                            m("ul", [
                                m("li", [
                                    m("a", {
                                        href: "http://mm3d.co/simplify3d"
                                    }, "Simplify3D"),
                                    " (recommended)"
                                ]),
                                (tempProfile.postprocessing === "makerbot" ? [] : m("li", [
                                    m("a", {
                                        href: "http://mm3d.co/cura"
                                    }, "Cura"),
                                    " (recommended)"
                                ])),
                                m("li", [
                                    m("a", {
                                        href: "http://mm3d.co/slic3r"
                                    }, "Slic3r"),
                                    " (advanced)"
                                ]),
                                (tempProfile.postprocessing === "makerbot" ? [] : m("li", [
                                    m("a", {
                                        href: "http://mm3d.co/kisslicer"
                                    }, "KISSlicer"),
                                    " (most advanced)"
                                ]))
                            ])
                        ]),
                        m("p", [
                            "Need something to print? We have a collection of multi-color prints ",
                            m("a", {
                                href: "http://mm3d.co/stuff-to-print"
                            }, "here"),
                            "."
                        ]),

                        m("div.paneButtons", [
                            m("div.leftPane", [
                                m("button.formButton", {
                                    onclick: onCalibrationWizardCancel
                                }, "Cancel")
                            ]),
                            m("div.rightPane", [
                                m("button.formButton", {
                                    onclick: function () {
                                        document.getElementById("wizardPane13").style.display = "none";
                                        document.getElementById("wizardPane12").style.display = "block";
                                    }
                                }, "Back"),
                                m("button.confirm", {
                                    onclick: function (e) {
                                        tempProfile.loadingOffset = loadingOffset;
                                        tempProfile.printValue = printValue;
                                        tempProfile.calibrationGCodeLength = calibrationGCodeLength;
                                        if (closeAfter) {
                                            returnToNoModalHandler(true);
                                        } else {
                                            if (editReference === false) {
                                                returnToNewModal(e, tempProfile, 2);
                                                window.removeEventListener("keydown", returnToNewModalHandler);
                                            } else {
                                                returnToEditModal(e, editReference, tempProfile, 2);
                                                window.removeEventListener("keydown", returnToEditModalHandler);
                                            }
                                        }
                                    }
                                }, "Finish")
                            ])
                        ])
                    ])
                ])

            ])
        ])
    ]);

}

function loadCalibrationFile(callback) {

    let gpxConfigMissing = require("./gpx").checkGPXConfigMissing(tempProfile);
    if (gpxConfigMissing) {
        return;
    }

    let allFormats = [];
    let filters = [];
    let currentProfileParsers = tempProfile.inputParsers;
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
        if (filenames === undefined) {
            return;
        }
        document.getElementById("printLength").value = "Analyzing...";
        setTimeout(async function () {
            try {
                let calibrationPrint = new Print(filenames[0], tempProfile);
                // console.log(calibrationPrint);
                await calibrationPrint.runPreFlight(true);
                if (callback) {
                    callback(
                        calibrationPrint.totalExtrusion,
                        path.join(calibrationPrint.inputDir, calibrationPrint.inputName),
                        calibrationPrint.inputExt
                    );
                }
            } catch (err) {
                // console.error(err);
                Postprocessor.displayWarningDialog(err);
                document.getElementById("printLength").value = "";
                if (callback) {
                    callback(false);
                }
            }
        }, 500);

    });

}

function validateProfile(modifications) {

    let validationErrorsExist = false;

    let validationErrors = {
        printerTab: false,
        dimensionsTab: false,
        paletteTab: false,
        transitionTab: false
    };

    if (modifications.profileName === "") {
        validationErrorsExist = true;
        FormValidation.showValidationError(document.getElementById("printerNameError"), "Make sure you name the profile!");
    }

    if (modifications.engine === "tiertime" && modifications.extruderStepsPerMM <= 0) {
        validationErrorsExist = true;
        validationErrors.printerTab = true;
        FormValidation.showValidationError(document.getElementById("extruderStepsPerMMError"));
    }

    if (!modifications.isPalette2()
        && (modifications.loadingOffset === 0 || modifications.printValue === 0
            || modifications.calibrationGCodeLength === 0)) {
        validationErrorsExist = true;
        validationErrors.paletteTab = true;
        FormValidation.showValidationError(document.getElementById("printerCalibrationError"));
    }

    if (modifications.printBedDimensions.circular) {
        if (modifications.printBedDimensions.diameter === 0) {
            validationErrorsExist = true;
            validationErrors.dimensionsTab = true;
            FormValidation.showValidationError(document.getElementById("printBedDiameterError"));
        }
    } else {
        if (modifications.printBedDimensions.x === 0) {
            validationErrorsExist = true;
            validationErrors.dimensionsTab = true;
            FormValidation.showValidationError(document.getElementById("printBedXError"));
        }
        if (modifications.printBedDimensions.y === 0) {
            validationErrorsExist = true;
            validationErrors.dimensionsTab = true;
            FormValidation.showValidationError(document.getElementById("printBedYError"));
        }
    }

    if (modifications.nozzleDiameter <= 0) {
        validationErrorsExist = true;
        validationErrors.printerTab = true;
        FormValidation.showValidationError(document.getElementById("nozzleDiameterError"));
    }

    if (modifications.pingRetraction !== "auto" && modifications.pingRetraction < 0) {
        validationErrorsExist = true;
        validationErrors.dimensionsTab = true;
        FormValidation.showValidationError(document.getElementById("pingRetractionManualValue"));
    }

    if (modifications.transitionSettings.type === TRANSITION_TOWER) {
        if (modifications.transitionSettings.towers.printSpeed !== "auto"
            && modifications.transitionSettings.towers.printSpeed <= 0) {
            validationErrorsExist = true;
            validationErrors.transitionTab = true;
            FormValidation.showValidationError(document.getElementById("towerPrintSpeedManualValueError"));
        }
        if (modifications.transitionSettings.towers.extrusionWidth !== "auto"
            && modifications.transitionSettings.towers.extrusionWidth <= 0) {
            validationErrorsExist = true;
            validationErrors.transitionTab = true;
            FormValidation.showValidationError(document.getElementById("towerExtrusionWidthManualValueError"));
        }
        if (modifications.transitionSettings.towers.infillPerimeterOverlap !== "auto"
            && (modifications.transitionSettings.towers.infillPerimeterOverlap < 0
                || modifications.transitionSettings.towers.infillPerimeterOverlap > 1)) {
            validationErrorsExist = true;
            validationErrors.transitionTab = true;
            FormValidation.showValidationError(document.getElementById("infillPerimeterOverlapManualValueError"));
        }
    } else if (modifications.transitionSettings.type === SIDE_TRANSITIONS) {
        if (modifications.transitionSettings.sideTransitions.purgeSpeed <= 0) {
            validationErrorsExist = true;
            validationErrors.transitionTab = true;
            FormValidation.showValidationError(document.getElementById("sideTransitionSpeedError"));
        }
        if (modifications.transitionSettings.sideTransitions.purgeEdgeOffset <= 0) {
            validationErrorsExist = true;
            validationErrors.transitionTab = true;
            FormValidation.showValidationError(document.getElementById("purgeEdgeOffsetError"));
        }
    }

    if (validationErrorsExist) {
        return validationErrors;
    }
    return false;

}

function addProfile(profile) {

    let validationErrors = validateProfile(profile);

    if (validationErrors) {
        if (validationErrors.printerTab) {
            document.getElementById("printerTabButton").click();
        } else if (validationErrors.dimensionsTab) {
            document.getElementById("dimensionsTabButton").click();
        } else if (validationErrors.paletteTab) {
            document.getElementById("paletteTabButton").click();
        } else if (validationErrors.transitionTab) {
            document.getElementById("transitionTabButton").click();
        }
        return;
    }

    // add the profile to the global list
    PrinterProfiles.addProfile(profile);
    dataCollection.logPrinterProfileCreation(profile);

    if (global.print === null) {
        // set the new profile as the active profile and write the config file
        PrinterProfiles.setActiveProfileIndex(PrinterProfiles.getProfileIndex(profile));
        config.writeConfigFile();
    }

    // return to the starting view
    Postprocessor.updateProfileDropdown();
    closeProfileModal(true);
}

async function editProfile(profile, modifications) {

    let validationErrors = validateProfile(modifications);

    if (validationErrors) {
        if (validationErrors.printerTab) {
            document.getElementById("printerTabButton").click();
        } else if (validationErrors.dimensionsTab) {
            document.getElementById("dimensionsTabButton").click();
        } else if (validationErrors.paletteTab) {
            document.getElementById("paletteTabButton").click();
        } else if (validationErrors.transitionTab) {
            document.getElementById("transitionTabButton").click();
        }
        return;
    }

    let updateCurrentPrint = false;
    let redrawPrint = false;
    if (modifications.nozzleDiameter !== profile.nozzleDiameter) {
        updateCurrentPrint = true;
    }
    if (modifications.printBedDimensions.circular !== profile.printBedDimensions.circular) {
        updateCurrentPrint = true;
    } else if (modifications.printBedDimensions.circular) {
        if (modifications.printBedDimensions.diameter !== profile.printBedDimensions.diameter) {
            updateCurrentPrint = true;
        }
    } else {
        if (modifications.printBedDimensions.x !== profile.printBedDimensions.x
            || modifications.printBedDimensions.y !== profile.printBedDimensions.y) {
            updateCurrentPrint = true;
        }
    }
    if (modifications.transitionSettings.type !== profile.transitionSettings.type) {
        updateCurrentPrint = true;
    }
    if (modifications.printBedDimensions.originOffsets.x !== profile.printBedDimensions.originOffsets.x
        || modifications.printBedDimensions.originOffsets.y !== profile.printBedDimensions.originOffsets.y) {
        updateCurrentPrint = true;
    }
    if (modifications.transitionSettings.type === TRANSITION_TOWER
        && (modifications.transitionSettings.purgeLength !== profile.transitionSettings.purgeLength
            || modifications.transitionSettings.initialPurgeLength !== profile.transitionSettings.initialPurgeLength)) {
        updateCurrentPrint = true;
    }
    if (global.advancedMode && modifications.transitionSettings.type === TRANSITION_TOWER
        && modifications.transitionSettings.minPurgeLength !== profile.transitionSettings.minPurgeLength) {
        updateCurrentPrint = true;
    }
    if (modifications.transitionSettings.type === TRANSITION_TOWER
        && modifications.transitionSettings.targetPosition !== profile.transitionSettings.targetPosition) {
        redrawPrint = true;
    }
    if (modifications.transitionSettings.type === TRANSITION_TOWER
        && (modifications.transitionSettings.useInfillForTransition !== profile.transitionSettings.useInfillForTransition
            || modifications.transitionSettings.useSupportForTransition !== profile.transitionSettings.useSupportForTransition)) {
        updateCurrentPrint = true;
    }
    if (modifications.transitionSettings.type === TRANSITION_TOWER
        && (modifications.transitionSettings.towers.printSpeed !== profile.transitionSettings.towers.printSpeed
            || modifications.transitionSettings.towers.extrusionWidth !== profile.transitionSettings.towers.extrusionWidth
            || modifications.transitionSettings.towers.minDensity !== profile.transitionSettings.towers.minDensity
            || modifications.transitionSettings.towers.minFirstLayerDensity !== profile.transitionSettings.towers.minFirstLayerDensity
            || modifications.transitionSettings.towers.maxDensity !== profile.transitionSettings.towers.maxDensity
            || modifications.transitionSettings.towers.perimeterSpeedMultiplier !== profile.transitionSettings.towers.perimeterSpeedMultiplier
            || modifications.transitionSettings.towers.forceBottomPerimeter !== profile.transitionSettings.towers.forceBottomPerimeter
            || modifications.transitionSettings.towers.infillPerimeterOverlap !== profile.transitionSettings.towers.infillPerimeterOverlap)) {
        updateCurrentPrint = true;
    }
    if (modifications.transitionSettings.type === TRANSITION_TOWER
        && modifications.getPulsesPerMM() !== profile.getPulsesPerMM()) {
        updateCurrentPrint = true;
    }

    // mutate the profile and write the config file
    if (modifications.profileName !== profile.profileName) {
        config.deleteProfile(profile);
    }

    profile.assignValues(modifications);

    let isActive = (profile === PrinterProfiles.getActiveProfile());
    PrinterProfiles.sortAlphabetically();
    if (isActive) {
        PrinterProfiles.setActiveProfileIndex(PrinterProfiles.getProfileList().indexOf(profile) + 1);
    }
    dataCollection.logPrinterProfileEdit(profile);
    config.saveProfile(profile);
    config.writeConfigFile();

    // return to the starting view
    Postprocessor.updateProfileDropdown();
    Postprocessor.updateColorStrengthSliders();
    closeProfileModal(true);

    if (profile === PrinterProfiles.getActiveProfile()) {
        Visualizer.drawPrintBed(profile);
        if (global.print && updateCurrentPrint) {
            await Postprocessor.updateCurrentPrint();
        } else if (global.print && redrawPrint) {
            await Visualizer.drawPrint(global.print);
        }
    }

}

function deleteProfile(profile) {
    let activePrinterIndex = PrinterProfiles.getActiveProfileIndex();
    let profileList = PrinterProfiles.getProfileList();
    let profileCount = profileList.length;
    let printerIndex = profileList.indexOf(profile) + 1;
    let printerSelect = document.getElementById("mainPrinterSelect");

    if (printerIndex < activePrinterIndex) {
        activePrinterIndex--;
        if (printerSelect.selectedIndex > 0) {
            printerSelect.selectedIndex--;
        }
    } else if (printerIndex === activePrinterIndex) {
        if (profileCount > 1) {
            activePrinterIndex = 1;
            printerSelect.selectedIndex = 1;
        } else {
            activePrinterIndex = 0;
            printerSelect.selectedIndex = 0;
        }
    }

    dataCollection.logPrinterProfileDelete(profile.uuid);
    config.deleteProfile(profile);
    PrinterProfiles.setActiveProfileIndex(activePrinterIndex);
    PrinterProfiles.removeProfileAtIndex(printerIndex);
    config.writeConfigFile();
    if (activePrinterIndex > 0) {
        Visualizer.drawPrintBed(PrinterProfiles.getProfileAtIndex(activePrinterIndex));
    }
    if (global.print !== null) {
        Postprocessor.updateCurrentPrint();
    }

    Postprocessor.updateProfileDropdown();
    if (PrinterProfiles.getProfileCount() === 0) {
        closeModal();
        SetupView.openSetupWindow();
    } else {
        openModal();
    }
}

exports.openModal = openModal;
exports.closeModal = closeModal;
exports.newPrinterModal = function (onClose) {
    printerProfileModal(undefined, undefined, onClose);
};
exports.newPrinterFromExistingModal = function (profile, onClose) {
    printerProfileModal(undefined, profile, onClose);
};
exports.editPrinterModal = function (printer, onClose, activeTab) {
    if (activeTab === undefined) {
        activeTab = 3;
    }
    printerProfileModal(printer, undefined, onClose, activeTab);
};
