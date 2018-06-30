const m = require("mithril");
const bodymovin = require("bodymovin");

const Electron = require("electron");
const BrowserWindow = Electron.remote.BrowserWindow;
const dialog = Electron.remote.dialog;

const config = require("../config");
const PrinterProfiles = require("../models/printer-profiles");
const PrinterProfileView = require("./printer-profile-view");
const menu = require("./menu");
const menuUtils = require("./menu-utils");
const Postprocessor = require("./postprocessor-view");

let setupWindowOpen = false;

function openSetupWindow() {
    let setupWindow = document.getElementById("profileSetupWindow");
    m.render(setupWindow, [
        m("div.container", {
            style: {
                position: "relative",
                overflow: "hidden"
            }
        }, [
            m("h1", "Welcome to Chroma!"),
            m("img", {
                src: "../assets/mosaic-app-icon.png",
                style: {
                    width: "300px",
                    position: "absolute",
                    bottom: "-35px",
                    right: "-90px",
                    opacity: "0.3",
                    "pointer-events": "none"
                }
            }),
            m("br"),
            m("p", {
                style: {
                    "padding-right": "200px"
                }
            }, "Chroma is Palette’s software companion, helping you process your print files for multi-material printing."),
            m("p", "Start by creating a new printer profile below."),
            m("br"),
            m("br"),
            m("br"),
            m("br"),
            m("br"),
            m("br"),
            m("br"),
            m("br"),
            m("br"),
            m("button.confirm", {
                onclick: function (e) {
                    e.target.blur();

                    function newPrinterHandler() {
                        const PrinterProfileView = require("./printer-profile-view");
                        PrinterProfileView.newPrinterModal(function () {
                            PrinterProfileView.closeModal();
                            if (PrinterProfiles.getProfileCount() > 0) {
                                startTutorial();
                            } else {
                                openSetupWindow();
                            }
                        });
                    }

                    dialog.showMessageBox(BrowserWindow.fromId(2), {
                        type: "question",
                        message: "Update Palette firmware",
                        detail: "Updating your Palette to the latest firmware is highly recommended.",
                        buttons: ["No Thanks", "Update", "Cancel"],
                        defaultId: 1,
                        cancelId: 2
                    }, function (choice) {
                        if (choice === 2) {
                            return;
                        }
                        if (choice === 1) {
                            closeSetupWindow();
                            require("./firmware").openModal(function () {
                                setTimeout(newPrinterHandler, 600);
                            });
                        } else {
                            closeSetupWindow();
                            newPrinterHandler();
                        }
                    });
                }
            }, "New Printer Profile"),
            m("button", {
                style: {
                    "margin-left": "10px"
                },
                onclick: function (e) {
                    e.target.blur();
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
                            closeSetupWindow();
                            PrinterProfileView.newPrinterFromExistingModal(profile, function () {
                                PrinterProfileView.closeModal();
                                if (PrinterProfiles.getProfileCount() > 0) {
                                    startTutorial();
                                } else {
                                    openSetupWindow();
                                }
                            });
                            dialog.showMessageBox(BrowserWindow.fromId(2), {
                                type: "warning",
                                message: "Chroma 1 profile import",
                                detail: "Chroma 2 profiles contain some additional settings.\n\nTo finish importing this profile, please fill in:\n- Nozzle Diameter\n- Base Model (if available)\n- Firmware\n- Volumetric Extrusion\n- Input Files",
                                buttons: ["OK"],
                                defaultId: 0
                            }, function () {});
                        } else {
                            Postprocessor.updateProfileDropdown();
                            closeSetupWindow();
                            if (global.firstRun) {
                                setTimeout(startTutorial, 800);
                            }
                        }
                    });
                }
            }, "Import Existing"),
            m("button", {
                style: {
                    float: "right",
                    position: "relative",
                    "z-index": "50"
                },
                onclick: function (e) {
                    e.target.blur();
                    Electron.remote.app.quit();
                }
            }, "Quit")
        ])
    ]);
    menu.disableSetupViewActions();
    setupWindow.style.display = "block";
    setupWindow.style.opacity = 1;
    setupWindow.style.pointerEvents = "auto";
    setupWindowOpen = true;
}

function closeSetupWindow() {
    let setupWindow = document.getElementById("profileSetupWindow");
    setupWindow.style.opacity = 0;
    setupWindow.style.pointerEvents = "none";
    menu.enableSetupViewActions();
    setTimeout(function () {
        setupWindow.style.display = "none";
        setupWindowOpen = false;
    }, 500);
}

function gcodeLoadStart() {
    let tutorialLayer = document.getElementById("tutorial");
    m.render(tutorialLayer, "");
    window.removeEventListener("input-load-start", gcodeLoadStart);
    window.addEventListener("input-load-end", gcodeLoadEnd);
}

function gcodeLoadEnd() {
    let tutorialLayer = document.getElementById("tutorial");
    m.render(tutorialLayer, tutorialBoxes().customizeColors);
    window.removeEventListener("input-load-end", gcodeLoadEnd);
}

function gcodeSaveStart() {
    window.removeEventListener("output-save-start", gcodeSaveStart);
    closeTutorial(false);
}

function tutorialBoxes() {
    return {
        start: [
            m("div.tutorialStartBox", [
                m("h3", "Chroma Quick Start"),
                m("p", {
                    style: {
                        "margin-bottom": "30px"
                    }
                }, [
                    "Would you like to learn how to prepare your files for Palette?",
                    m("br"),
                    "(You can find this guide later in the Help menu)"
                ]),
                m("button.confirm", {
                    onclick: function () {
                        let tutorialLayer = document.getElementById("tutorial");
                        if (global.print) {
                            m.render(tutorialLayer, tutorialBoxes().customizeColors);
                        } else {
                            m.render(tutorialLayer, tutorialBoxes().selectProfile);
                        }
                    }
                }, "Yes Please"),
                m("button", {
                    style: {
                        "margin-left": "10px"
                    },
                    onclick: function () {
                        closeTutorial();
                    }
                }, "No Thanks")
            ])
        ],
        selectProfile: [
            m("div.tutorialBox", {
                style: {
                    top: "65px",
                    left: "20px"
                }
            }, [
                m("button.closeButton", {
                    style: {
                        float: "right"
                    },
                    onclick: function () {
                        closeTutorial();
                    }
                }, [
                    m("svg", {
                        height: 10,
                        width: 10
                    }, [
                        m("line", {
                            x1: 1,
                            y1: 1,
                            x2: 9,
                            y2: 9,
                            stroke: "#000",
                            "stroke-width": 2
                        }),
                        m("line", {
                            x1: 1,
                            y1: 9,
                            x2: 9,
                            y2: 1,
                            stroke: "#000",
                            "stroke-width": 2
                        })
                    ])
                ]),
                m("h3", "Select a printer profile"),
                m("button.confirm", {
                    onclick: function (e) {
                        e.target.blur();
                        let tutorialLayer = document.getElementById("tutorial");
                        m.render(tutorialLayer, tutorialBoxes().openGCode);
                    }
                }, "Next")
            ])
        ],
        openGCode: [
            m("div.tutorialBox", {
                style: {
                    top: "65px",
                    left: "230px"
                },
                config: function (el) {
                    window.addEventListener("input-load-start", gcodeLoadStart);
                }
            }, [
                m("button.closeButton", {
                    style: {
                        float: "right"
                    },
                    onclick: function () {
                        closeTutorial();
                    }
                }, [
                    m("svg", {
                        height: 10,
                        width: 10
                    }, [
                        m("line", {
                            x1: 1,
                            y1: 1,
                            x2: 9,
                            y2: 9,
                            stroke: "#000",
                            "stroke-width": 2
                        }),
                        m("line", {
                            x1: 1,
                            y1: 9,
                            x2: 9,
                            y2: 1,
                            stroke: "#000",
                            "stroke-width": 2
                        })
                    ])
                ]),
                m("h3", "Load a print file"),
                m("p", "First, slice a multi-tool part in your slicer."),
                m("p", "Click the button above (or press " + (process.platform === "darwin" ? "⌘O" : "Ctrl–O") + ") and locate the print file to begin processing.")
            ])
        ],
        customizeColors: [
            m("div.tutorialBox", {
                style: {
                    top: "65px",
                    left: "330px"
                }
            }, [
                m("button.closeButton", {
                    style: {
                        float: "right"
                    },
                    onclick: function () {
                        closeTutorial();
                    }
                }, [
                    m("svg", {
                        height: 10,
                        width: 10
                    }, [
                        m("line", {
                            x1: 1,
                            y1: 1,
                            x2: 9,
                            y2: 9,
                            stroke: "#000",
                            "stroke-width": 2
                        }),
                        m("line", {
                            x1: 1,
                            y1: 9,
                            x2: 9,
                            y2: 1,
                            stroke: "#000",
                            "stroke-width": 2
                        })
                    ])
                ]),
                m("h3", "Customize colors/materials (optional)"),
                m("p", "Change the preview colors by clicking on the colored bubbles."),
                m("p", "You can also select the materials you will be using by clicking on the downward-arrow icon. For your first print, we highly recommend sticking with PLA!"),
                m("p", "Palette will remember these selections and prompt you to load the correct filament when starting the print."),
                m("button.confirm", {
                    onclick: function (e) {
                        e.target.blur();
                        let tutorialLayer = document.getElementById("tutorial");
                        m.render(tutorialLayer, tutorialBoxes().saveOutput);
                    }
                }, "Next")
            ])
        ],
        saveOutput: [
            m("div.tutorialBox.tutorialBoxRight", {
                style: {
                    top: "65px",
                    right: "20px"
                },
                config: function (el) {
                    window.addEventListener("output-save-start", gcodeSaveStart);
                }
            }, [
                m("button.closeButton", {
                    style: {
                        float: "right"
                    },
                    onclick: function () {
                        closeTutorial();
                    }
                }, [
                    m("svg", {
                        height: 10,
                        width: 10
                    }, [
                        m("line", {
                            x1: 1,
                            y1: 1,
                            x2: 9,
                            y2: 9,
                            stroke: "#000",
                            "stroke-width": 2
                        }),
                        m("line", {
                            x1: 1,
                            y1: 9,
                            x2: 9,
                            y2: 1,
                            stroke: "#000",
                            "stroke-width": 2
                        })
                    ])
                ]),
                m("h3", "Save output files"),
                m("p", "Click the button above (or press " + (process.platform === "darwin" ? "⌘S" : "Ctrl–S") + ") to save the processed files for your Palette and printer."),
                m("p", "That's it—you're ready to print!"),
            ])
        ]
    }
}

function startTutorial() {
    let tutorialLayer = document.getElementById("tutorial");
    m.render(tutorialLayer, tutorialBoxes().start);
}

function closeTutorial(disableFirstRun = true) {
    let tutorialLayer = document.getElementById("tutorial");
    m.render(tutorialLayer, "");
    if (global.firstRun && disableFirstRun) {
        global.firstRun = false;
        config.writeConfigFile();
    } else {
        global.firstRun = true;
    }
}

function openPrintOffboarding(print, msf, printFilePath, msfPath) {

    let modalWindow = document.getElementById("open-modal");
    modalWindow.scrollTop = 0;
    m.render(modalWindow, []);

    let bmSDCard;
    let bmPrintLoading;
    let bmPings;

    m.render(modalWindow, [
        m("div.container", [
            m("div.printerProfile", {
                style: {
                    position: "relative"
                }
            }, [
                m("h2", {
                    style: {
                        "padding-bottom": "10px"
                    }
                }, "Starting a Palette Print"),
                m("div#offboardingPanes", {
                    style: {
                        height: "480px"
                    }
                }, [
                    m("div#offboardingPane1", {
                        style: {
                            display: "block"
                        }
                    }, [
                        m("h3", "Save MSF to SD card"),
                        menuUtils.getOutputFileGrid(printFilePath, msfPath),
                        m("div", {
                            style: {
                                height: "200px"
                            },
                            config: function (el) {
                                bmSDCard = bodymovin.loadAnimation({
                                    container: el,
                                    renderer: "svg",
                                    loop: true,
                                    autoplay: false,
                                    path: "../assets/offboarding/sd-card.json"
                                });
                                setTimeout(function () {
                                    let pane1 = document.getElementById("offboardingPane1");
                                    if (pane1 && pane1.style.display === "block") {
                                        bmSDCard.play();
                                    }
                                }, 500);
                            }
                        }),
                        m("div.paneButtons", [
                            m("div.rightPane", [
                                m("button.formButton", {
                                    onclick: function () {
                                        document.getElementById("offboardingPane1").style.display = "none";
                                        document.getElementById("offboardingPane2").style.display = "block";
                                        bmSDCard.goToAndStop(0, true);
                                        setTimeout(function () {
                                            let pane2 = document.getElementById("offboardingPane2");
                                            if (pane2 && pane2.style.display === "block") {
                                                bmPrintLoading.play();
                                            }
                                        }, 500);
                                    }
                                }, "Next")
                            ])
                        ])
                    ]),
                    m("div#offboardingPane2", {
                        style: {
                            display: "none"
                        }
                    }, [
                        m("h3", "Load filament from Palette into printer"),
                        m("p", "Once filament arrives at the end of Palette's guide tube, start feeding it into your printer and clip in your guide tube. Continue loading until Palette tells you to stop."),
                        m("p", "After confirming loading on Palette, you can begin your print."),
                        m("div", {
                            config: function (el) {
                                bmPrintLoading = bodymovin.loadAnimation({
                                    container: el,
                                    renderer: "svg",
                                    loop: true,
                                    autoplay: false,
                                    path: "../assets/offboarding/print-loading.json"
                                });
                            }
                        }),
                        m("div.paneButtons", [
                            m("div.rightPane", [
                                m("button.formButton", {
                                    onclick: function () {
                                        bmPrintLoading.goToAndStop(0, true);
                                        document.getElementById("offboardingPane2").style.display = "none";
                                        document.getElementById("offboardingPane1").style.display = "block";
                                        setTimeout(function () {
                                            let pane1 = document.getElementById("offboardingPane1");
                                            if (pane1 && pane1.style.display === "block") {
                                                bmSDCard.play();
                                            }
                                        }, 500);
                                    }
                                }, "Back"),
                                m("button.formButton", {
                                    onclick: function () {
                                        bmPrintLoading.goToAndStop(0, true);
                                        document.getElementById("offboardingPane2").style.display = "none";
                                        document.getElementById("offboardingPane3").style.display = "block";
                                        setTimeout(function () {
                                            let pane3 = document.getElementById("offboardingPane3");
                                            if (pane3 && pane3.style.display === "block") {
                                                bmPings.play();
                                            }
                                        }, 500);
                                    }
                                }, "Next")
                            ])
                        ])
                    ]),
                    m("div#offboardingPane3", {
                        style: {
                            display: "none"
                        }
                    }, [
                        m("h3", "Why does my printer pause on the transition tower?"),
                        m("p", "Pings are calibration checkpoints throughout a print. Your printer will pause twice during a ping—don't be alarmed when this happens! Pings update Palette on a print’s progress, and help Palette ensure it’s continually making the right amount of filament."),
                        m("div", {
                            config: function (el) {
                                bmPings = bodymovin.loadAnimation({
                                    container: el,
                                    renderer: "svg",
                                    loop: true,
                                    autoplay: false,
                                    path: "../assets/offboarding/pings.json"
                                });
                            }
                        }),
                        m("div.paneButtons", [
                            m("div.rightPane", [
                                m("button.formButton", {
                                    onclick: function () {
                                        bmPings.goToAndStop(0, true);
                                        document.getElementById("offboardingPane3").style.display = "none";
                                        document.getElementById("offboardingPane2").style.display = "block";
                                        setTimeout(function () {
                                            let pane2 = document.getElementById("offboardingPane2");
                                            if (pane2 && pane2.style.display === "block") {
                                                bmPrintLoading.play();
                                            }
                                        }, 500);
                                    }
                                }, "Back"),
                                m("button.formButton.confirm", {
                                    onclick: function () {
                                        bmPings.goToAndStop(0, true);
                                        document.getElementById("offboardingPane3").style.display = "none";
                                        global.firstRun = false;
                                        config.writeConfigFile();
                                        menuUtils.displayPrintSummary(print, msf, printFilePath, msfPath);
                                    }
                                }, "Next")
                            ])
                        ])
                    ])
                ]),
            ])
        ])
    ]);

    modalWindow.style.display = "block";
    setTimeout(function () {
        modalWindow.style.opacity = 1;
        modalWindow.style.pointerEvents = "auto";
    }, 10);

}

exports.setupWindowOpen = function () {
    return setupWindowOpen;
};
exports.openSetupWindow = openSetupWindow;
exports.closeSetupWindow = closeSetupWindow;
exports.startTutorial = startTutorial;
exports.openPrintOffboarding = openPrintOffboarding;
