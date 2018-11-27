const fs = require("fs");
const path = require("path");
const m = require("mithril");

const Electron = require("electron");
const BrowserWindow = Electron.remote.BrowserWindow;
const dialog = Electron.remote.dialog;

const MaterialMatrix = require("../models/material-matrix");
const MSF = require("../models/msf");
const Printer = require("../models/printer");
const profiles = require("../models/printer-profiles");
const FormValidation = require("./form-validation");
const modalUtils = require("./modal-utils");
const SetupView = require("./setup-view");

let tooltips = {
    infillDumpSavings: "By using $1 for transitioning filaments, the amount of extra filament (and time) required for this print was reduced by $2, or $3!",
    whatArePings: "Pings are checkpoints throughout a print. Your printer will pause twice during a ping (don't be alarmed when this happens). Pings update Palette on a print’s progress, and help Palette ensure it’s continually making the right amount of filament.",
    gradientModeFirstPiece: "Include an initial segment of filament before the gradient begins.",
    gradientModeLastPiece: "Include a final segment of filament after the gradient ends."
};

function convertToPlainMSF() {
    const MSF = require("../models/msf");
    dialog.showOpenDialog(BrowserWindow.fromId(2), {
        filters: [{
            name: "MSF",
            extensions: ["msf"]
        }]
    }, function (filenames) {
        if (filenames === undefined) {
            return;
        }
        fs.readFile(filenames[0], "utf-8", function (err, data) {
            if (!err) {
                try {
                    let plainMSF = MSF.fromLines(data.split(/\r\n|\n|\r/)).createPlainMSF();
                    dialog.showSaveDialog(BrowserWindow.fromId(2), {
                        defaultPath: filenames[0] + ".txt",
                        title: "Save Plain MSF",
                        filters: [{
                            name: "Plain MSF",
                            extensions: ["txt"]
                        }]
                    }, function (path) {
                        if (path !== undefined) {
                            fs.writeFileSync(path, plainMSF);
                        }
                    });
                } catch (e) {
                    dialog.showMessageBox(BrowserWindow.fromId(2), {
                        type: "error",
                        message: e.message,
                        detail: e.detail,
                        buttons: ["OK"],
                        defaultId: 0
                    }, function () {});
                }
            }
        });
    });
}

function generateCFGModal() {

    modalUtils.beforeOpenModal();

    let stepsPerCount = 0;
    let spliceDistance = 0;

    let modalWindow = document.getElementById("open-modal");
    m.render(modalWindow, [
        m("div.container", [
            m("div.save", [
                m("button.closeButton", {
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
                m("h2", "Generate Config File"),
                m("span#errorText"),
                m("br"),

                m("table", [
                    m("tbody", [
                        m("tr", [
                            m("th", [
                                m("label[for='stepsPerCount']", "Steps Per Count")
                            ]),
                            m("td", [
                                m("div#stepsPerCountError.formError", [
                                    m("input#stepsPerCount.formInput", {
                                        value: "",
                                        oninput: function (event) {
                                            stepsPerCount = FormValidation.validateNumberInput(event.target.value, 0,
                                                3, true,
                                                3.4, true,
                                                false,
                                                event.target.parentElement, "Steps Per Count");
                                        }
                                    })
                                ])
                            ])
                        ]),
                        m("tr", [
                            m("th", [
                                m("label[for='spliceDistance']", "Splice Distance")
                            ]),
                            m("td", [
                                m("div#spliceDistanceError.formError", [
                                    m("input#spliceDistance.formInput", {
                                        value: "",
                                        oninput: function (event) {
                                            spliceDistance = FormValidation.validateIntegerInput(event.target.value, 0,
                                                190, true,
                                                260, true,
                                                false,
                                                event.target.parentElement, "Splice Distance");
                                        }
                                    })
                                ])
                            ])
                        ])
                    ])
                ]),
                m("button.confirm", {
                    onclick: function (e) {
                        e.target.blur();

                        let validationErrorsExist = false;

                        if (stepsPerCount === 0) {
                            validationErrorsExist = true;
                            FormValidation.showValidationError(document.getElementById("stepsPerCountError"));
                        }

                        if (spliceDistance === 0) {
                            validationErrorsExist = true;
                            FormValidation.showValidationError(document.getElementById("spliceDistanceError"));
                        }

                        if (!validationErrorsExist) {
                            dialog.showSaveDialog(BrowserWindow.fromId(2), {
                                title: "Save Config file",
                                filters: [{
                                    name: "Palette Config",
                                    extensions: ["cfg"]
                                }]
                            }, function (outpath) {
                                if (outpath !== undefined) {
                                    let basename = path.basename(outpath);
                                    if (basename.length > 63) {
                                        let trimname = basename.slice(0, 59) + ".cfg";
                                        outpath = outpath.replace(basename, trimname);
                                    }
                                    let output = "CFG1.0\r\n";
                                    output += "spc:" + MSF.floatToHex(stepsPerCount) + "\r\n";
                                    output += "sd:" + MSF.intToHex(spliceDistance, 4) + "\r\n";
                                    fs.writeFileSync(outpath, output);
                                    stepsPerCount = 0;
                                    spliceDistance = 0;
                                    modalUtils.closeModal();
                                }
                            });
                        }

                    }
                }, "Save")
            ])
        ])
    ]);

    modalUtils.afterOpenModal();

}

function generateCustomMSFModal() {

    modalUtils.beforeOpenModal();

    let modalWindow = document.getElementById("open-modal");

    m.render(modalWindow, [
        m("div.container", [
            m("div.generateCustomMSF", [
                m("button.closeButton", {
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
                m("h2", "Generate Custom MSF"),

                m("div.tabs", [
                    m("button#randomTabButton", {
                        class: "active",
                        onclick: function () {
                            document.getElementById("randomTabButton").className = "active";
                            document.getElementById("endOfSpoolTabButton").className = "";
                            document.getElementById("patternTabButton").className = "";
                            document.getElementById("gradientTabButton").className = "";
                            _generateMSFRandomView();
                        }
                    }, "Random"),
                    m("button#endOfSpoolTabButton", {
                        onclick: function () {
                            document.getElementById("randomTabButton").className = "";
                            document.getElementById("endOfSpoolTabButton").className = "active";
                            document.getElementById("patternTabButton").className = "";
                            document.getElementById("gradientTabButton").className = "";
                            _generateMSFEndOfSpoolView();
                        }
                    }, "End-of-Spool"),
                    m("button#patternTabButton", {
                        onclick: function () {
                            document.getElementById("randomTabButton").className = "";
                            document.getElementById("endOfSpoolTabButton").className = "";
                            document.getElementById("patternTabButton").className = "active";
                            document.getElementById("gradientTabButton").className = "";
                            _generateMSFPatternView();
                        }
                    }, "Pattern"),
                    m("button#gradientTabButton", {
                        onclick: function () {
                            document.getElementById("randomTabButton").className = "";
                            document.getElementById("endOfSpoolTabButton").className = "";
                            document.getElementById("patternTabButton").className = "";
                            document.getElementById("gradientTabButton").className = "active";
                            _generateMSFGradientView();
                        }
                    }, "Gradient")
                ]),

                m("span#errorText"),
                m("br"),

                m("div#customMSFBox")


            ])
        ])
    ]);

    _generateMSFRandomView();

    modalUtils.afterOpenModal();

}

function _generateMSFRandomView() {

    m.render(document.getElementById("errorText"), "");

    let printerIndex = 0;
    let spliceCore = MaterialMatrix.spliceCores.P;
    let spliceLength = 0;
    let spliceLengthMin = 0;
    let spliceLengthMax = 0;
    let totalLength = 0;
    let lengthModeRange = false;
    let drivesUsed = [true, true, true, true];
    let materialProfile = "Default PLA";

    let modalBox = document.getElementById("customMSFBox");
    m.render(modalBox, []);
    m.render(modalBox, [

        m("p", "Create a random pattern of splices for layered prints."),

        m("table", [
            m("tbody", [
                m("tr", [
                    m("th", [
                        m("label[for='printerProfile']", "Printer Profile")
                    ]),
                    m("td", [
                        m("div#printerProfileError.formError", [
                            m("select#printerProfile.formInput", {
                                onchange: function (event) {
                                    printerIndex = event.target.selectedIndex;
                                    FormValidation.resetValidationError(event.target.parentElement);
                                    spliceCore = profiles.getProfileAtIndex(printerIndex).getSpliceCore();
                                    m.render(document.getElementById("materialProfile"), [
                                        Object.keys(MaterialMatrix.globalMatrix.matrix[spliceCore]).map(function (material) {
                                            return m("option", {
                                                value: material,
                                                selected: materialProfile === material
                                            }, (material.length > 80) ? material.substr(0, 80) + "..." : material);
                                        })
                                    ]);
                                    document.getElementById("materialProfile").disabled = false;
                                }
                            }, [
                                m("option", {
                                    disabled: true,
                                    selected: true
                                }, "Select a profile"),
                                profiles.getProfileList().map(function (printer) {
                                    return m("option", (printer.profileName.length > 80) ? printer.profileName.substr(0, 80) + "..." : printer.profileName);
                                })
                            ])
                        ])
                    ])
                ]),
                m("tr", [
                    m("th", [
                        m("label[for='materialProfile']", "Material Profile")
                    ]),
                    m("td", [
                        m("div#materialProfileError.formError", [
                            m("select#materialProfile.formInput", {
                                disabled: true,
                                onchange: function (event) {
                                    materialProfile = event.target.value;
                                    let materialType = MaterialMatrix.globalMatrix.matrix[spliceCore][materialProfile].type;
                                    if (MaterialMatrix.globalMatrix.checkCompatibility(spliceCore, materialProfile, materialProfile)) {
                                        FormValidation.resetValidationError(event.target.parentElement);
                                    } else {
                                        FormValidation.showValidationError(event.target.parentElement, materialType + " cannot be spliced with itself.");
                                    }
                                }
                            }, [
                                m("option", {
                                    disabled: true,
                                    selected: true
                                }, "Select a printer first")
                            ])
                        ])
                    ])
                ]),
                m("tr", [
                    m("th", [
                        m("label[for='drivesUsed']", "Drives to Use")
                    ]),
                    m("td", [
                        m("div#drivesUsedError.formError", [
                            m("div.checkboxGroup", {
                                style: {
                                    display: "inline-block",
                                    "margin-right": "20px"
                                }
                            }, [
                                m("input#useDrive1[type='checkbox']", {
                                    name: "drivesUsed",
                                    checked: true,
                                    onclick: function (e) {
                                        drivesUsed[0] = e.target.checked;
                                        let drivesUsedCount = drivesUsed.reduce(function (accumulator, currentValue) {
                                            return (currentValue ? accumulator + 1 : accumulator);
                                        });
                                        if (drivesUsedCount < 2) {
                                            drivesUsed[0] = true;
                                            e.preventDefault();
                                            return false;
                                        }
                                    }
                                }),
                                m("label[for='useDrive1']", "1")
                            ]),
                            m("div.checkboxGroup", {
                                style: {
                                    display: "inline-block",
                                    "margin-right": "20px"
                                }
                            }, [
                                m("input#useDrive2[type='checkbox']", {
                                    name: "drivesUsed",
                                    checked: true,
                                    onclick: function (e) {
                                        drivesUsed[1] = e.target.checked;
                                        let drivesUsedCount = drivesUsed.reduce(function (accumulator, currentValue) {
                                            return (currentValue ? accumulator + 1 : accumulator);
                                        });
                                        if (drivesUsedCount < 2) {
                                            drivesUsed[1] = true;
                                            e.preventDefault();
                                            return false;
                                        }
                                    }
                                }),
                                m("label[for='useDrive2']", "2")
                            ]),
                            m("div.checkboxGroup", {
                                style: {
                                    display: "inline-block",
                                    "margin-right": "20px"
                                }
                            }, [
                                m("input#useDrive3[type='checkbox']", {
                                    name: "drivesUsed",
                                    checked: true,
                                    onclick: function (e) {
                                        drivesUsed[2] = e.target.checked;
                                        let drivesUsedCount = drivesUsed.reduce(function (accumulator, currentValue) {
                                            return (currentValue ? accumulator + 1 : accumulator);
                                        });
                                        if (drivesUsedCount < 2) {
                                            drivesUsed[2] = true;
                                            e.preventDefault();
                                            return false;
                                        }
                                    }
                                }),
                                m("label[for='useDrive3']", "3")
                            ]),
                            m("div.checkboxGroup", {
                                style: {
                                    display: "inline-block"
                                }
                            }, [
                                m("input#useDrive4[type='checkbox']", {
                                    name: "drivesUsed",
                                    checked: true,
                                    onclick: function (e) {
                                        drivesUsed[3] = e.target.checked;
                                        let drivesUsedCount = drivesUsed.reduce(function (accumulator, currentValue) {
                                            return (currentValue ? accumulator + 1 : accumulator);
                                        });
                                        if (drivesUsedCount < 2) {
                                            drivesUsed[3] = true;
                                            e.preventDefault();
                                            return false;
                                        }
                                    }
                                }),
                                m("label[for='useDrive4']", "4")
                            ])
                        ])
                    ])
                ]),
                m("tr", [
                    m("th", [
                        m("label", "Length Mode")
                    ]),
                    m("td", [
                        m("div.checkboxGroup", {
                            style: {
                                display: "inline-block",
                                "margin-right": "20px"
                            }
                        }, [
                            m("input#lengthModeExact[type='radio']", {
                                name: "lengthMode",
                                checked: true,
                                onclick: function () {
                                    lengthModeRange = false;
                                    document.getElementById("lengthModeExactRow").style.display = "";
                                    document.getElementById("lengthModeRangeRowMin").style.display = "none";
                                    document.getElementById("lengthModeRangeRowMax").style.display = "none";
                                    document.getElementById("spliceLengthMin").value = "";
                                    document.getElementById("spliceLengthMax").value = "";
                                }
                            }),
                            m("label[for='lengthModeExact']", "exact")
                        ]),
                        m("div.checkboxGroup", {
                            style: {
                                display: "inline-block"
                            }
                        }, [
                            m("input#lengthModeRange[type='radio']", {
                                name: "lengthMode",
                                onclick: function () {
                                    lengthModeRange = true;
                                    document.getElementById("lengthModeExactRow").style.display = "none";
                                    document.getElementById("lengthModeRangeRowMin").style.display = "";
                                    document.getElementById("lengthModeRangeRowMax").style.display = "";
                                    document.getElementById("spliceLength").value = "";
                                }
                            }),
                            m("label[for='lengthModeRange']", "random in range")
                        ])
                    ])
                ]),
                m("tr#lengthModeExactRow", [
                    m("th", [
                        m("label[for='spliceLength']", "Splice Length (mm)")
                    ]),
                    m("td", [
                        m("div#spliceLengthError.formError", [
                            m("input#spliceLength.formInput", {
                                value: "",
                                oninput: function (event) {
                                    spliceLength = FormValidation.validateNumberInput(event.target.value, 0,
                                        80, true,
                                        false, true,
                                        true,
                                        event.target.parentElement, "Splice length", "mm");
                                }
                            })
                        ])
                    ])
                ]),
                m("tr#lengthModeRangeRowMin", {
                    style: {
                        display: "none"
                    }
                }, [
                    m("th", [
                        m("label[for='spliceLengthMin']", "Min Splice Length (mm)")
                    ]),
                    m("td", [
                        m("div#spliceLengthMinError.formError", [
                            m("input#spliceLengthMin.formInput", {
                                value: "",
                                oninput: function (event) {
                                    spliceLengthMin = FormValidation.validateNumberInput(event.target.value, 0,
                                        80, true,
                                        false, true,
                                        true,
                                        event.target.parentElement, "Min splice length", "mm");
                                }
                            })
                        ])
                    ])
                ]),
                m("tr#lengthModeRangeRowMax", {
                    style: {
                        display: "none"
                    }
                }, [
                    m("th", [
                        m("label[for='spliceLengthMax']", "Max Splice Length (mm)")
                    ]),
                    m("td", [
                        m("div#spliceLengthMaxError.formError", [
                            m("input#spliceLengthMax.formInput", {
                                value: "",
                                oninput: function (event) {
                                    spliceLengthMax = FormValidation.validateNumberInput(event.target.value, 0,
                                        Math.max(80, spliceLengthMin), false,
                                        false, true,
                                        true,
                                        event.target.parentElement, "Max splice length", "mm");
                                }
                            })
                        ])
                    ])
                ]),
                m("tr", [
                    m("th", [
                        m("label[for='totalLength']", "Total Length (mm)")
                    ]),
                    m("td", [
                        m("div#totalLengthError.formError", [
                            m("input#totalLength.formInput", {
                                value: "",
                                oninput: function (event) {
                                    totalLength = FormValidation.validateNumberInput(event.target.value, 0,
                                        0, false,
                                        false, true,
                                        true,
                                        event.target.parentElement, "Total length", "mm");
                                }
                            })
                        ])
                    ])
                ])
            ])
        ]),
        m("button.confirm", {
            onclick: function (e) {
                e.target.blur();

                let validationErrorsExist = false;

                let materialType = MaterialMatrix.globalMatrix.matrix[spliceCore][materialProfile].type;
                if (!MaterialMatrix.globalMatrix.checkCompatibility(spliceCore, materialProfile, materialProfile)) {
                    validationErrorsExist = true;
                    FormValidation.showValidationError(document.getElementById("materialProfileError"), materialType + " cannot be spliced with itself.");
                }

                if (lengthModeRange) {
                    if (spliceLengthMin === 0) {
                        validationErrorsExist = true;
                        FormValidation.showValidationError(document.getElementById("spliceLengthMinError"));
                    }
                    if (spliceLengthMax === 0 || spliceLengthMax <= spliceLengthMin) {
                        validationErrorsExist = true;
                        FormValidation.showValidationError(document.getElementById("spliceLengthMaxError"));
                    }
                } else {
                    if (spliceLength === 0) {
                        validationErrorsExist = true;
                        FormValidation.showValidationError(document.getElementById("spliceLengthError"));
                    }
                }

                if (totalLength === 0) {
                    validationErrorsExist = true;
                    FormValidation.showValidationError(document.getElementById("totalLengthError"));
                }

                if (printerIndex === 0) {
                    validationErrorsExist = true;
                    FormValidation.showValidationError(document.getElementById("printerProfileError"));
                }

                if (!validationErrorsExist) {
                    dialog.showSaveDialog(BrowserWindow.fromId(2), {
                        title: "Save MSF file",
                        filters: [{
                            name: "MSF",
                            extensions: [profiles.getProfileAtIndex(printerIndex).getMSFExtension(false)]
                        }]
                    }, function (outpath) {
                        if (outpath !== undefined) {
                            let printer = profiles.getProfileAtIndex(printerIndex);

                            let basename = path.basename(outpath);
                            if (basename.length > 63) {
                                let trimname = basename.slice(0, 59) + "." + printer.getMSFExtension(false);
                                outpath = outpath.replace(basename, trimname);
                            }

                            const MSF = require("../models/msf");

                            let msf = new MSF();
                            msf.version = printer.getMSFVersion();
                            msf.printerProfile = printer;
                            msf.pulsesPerMM = printer.getPulsesPerMM();
                            msf.loadingOffset = printer.loadingOffset;

                            let previousDrive = -1;
                            let currentDrive = -1;
                            let currentLength = 0;

                            while (currentLength < totalLength) {
                                while (currentDrive === previousDrive) {
                                    currentDrive = Math.floor(Math.random() * 3.9);
                                    if (!drivesUsed[currentDrive]) {
                                        currentDrive = previousDrive;
                                    }
                                }
                                if (lengthModeRange) {
                                    if (currentLength === 0) {
                                        if (spliceLengthMin > 140) {
                                            currentLength += Math.random() * (spliceLengthMax - spliceLengthMin) + spliceLengthMin;
                                        } else if (spliceLengthMax <= 140) {
                                            currentLength += 140;
                                        } else {
                                            currentLength += Math.random() * (spliceLengthMax - 140) + 140;
                                        }
                                    } else {
                                        currentLength += Math.random() * (spliceLengthMax - spliceLengthMin) + spliceLengthMin;
                                    }
                                } else {
                                    if (currentLength === 0 && spliceLength < 140) {
                                        currentLength += 140;
                                    } else {
                                        currentLength += spliceLength;
                                    }
                                }
                                msf.spliceList.push([currentDrive, currentLength]);
                                msf.colorsUsed[currentDrive] = 1;
                                previousDrive = currentDrive;
                            }
                            msf.setMaterials([
                                msf.colorsUsed[0] ? materialProfile : null,
                                msf.colorsUsed[1] ? materialProfile : null,
                                msf.colorsUsed[2] ? materialProfile : null,
                                msf.colorsUsed[3] ? materialProfile : null
                            ]);

                            let output = msf.createMSF();
                            fs.writeFileSync(outpath, output);

                            if (global.exportPlainMSF) {
                                let output = msf.createPlainMSF();
                                fs.writeFileSync(outpath + ".txt", output);
                            }
                            modalUtils.closeModal();
                        }
                    });
                }

            }
        }, "Save")

    ]);

}

function _generateMSFEndOfSpoolView() {

    m.render(document.getElementById("errorText"), "");

    let printerIndex = 0;
    let spliceCore = MaterialMatrix.spliceCores.P;
    let spoolCount = 2;
    let spool1Length = 0;
    let spool2Length = 0;
    let spool3Length = 0;
    let spool4Length = 0;
    let materialProfile = "Default PLA";

    let modalBox = document.getElementById("customMSFBox");
    m.render(modalBox, []);
    m.render(modalBox, [

        m("p", "Use Palette to join the ends of your spools together."),
        m("p", "Estimate the length of filament left on each spool. Underestimating and having leftover filament is better than overestimating and running out!"),

        m("table", [
            m("tbody", [
                m("tr", [
                    m("th", [
                        m("label[for='printerProfile']", "Printer Profile")
                    ]),
                    m("td", [
                        m("div#printerProfileError.formError", [
                            m("select#printerProfile.formInput", {
                                onchange: function (event) {
                                    printerIndex = event.target.selectedIndex;
                                    FormValidation.resetValidationError(event.target.parentElement);
                                    spliceCore = profiles.getProfileAtIndex(printerIndex).getSpliceCore();
                                    m.render(document.getElementById("materialProfile"), [
                                        Object.keys(MaterialMatrix.globalMatrix.matrix[spliceCore]).map(function (material) {
                                            return m("option", {
                                                value: material,
                                                selected: materialProfile === material
                                            }, (material.length > 80) ? material.substr(0, 80) + "..." : material);
                                        })
                                    ]);
                                    document.getElementById("materialProfile").disabled = false;
                                }
                            }, [
                                m("option", {
                                    disabled: true,
                                    selected: true
                                }, "Select a profile"),
                                profiles.getProfileList().map(function (printer) {
                                    return m("option", (printer.profileName.length > 80) ? printer.profileName.substr(0, 80) + "..." : printer.profileName);
                                })
                            ])
                        ])
                    ])
                ]),
                m("tr", [
                    m("th", [
                        m("label[for='materialProfile']", "Material Profile")
                    ]),
                    m("td", [
                        m("div#materialProfileError.formError", [
                            m("select#materialProfile.formInput", {
                                disabled: true,
                                onchange: function (event) {
                                    materialProfile = event.target.value;
                                    let materialType = MaterialMatrix.globalMatrix.matrix[spliceCore][materialProfile].type;
                                    if (MaterialMatrix.globalMatrix.checkCompatibility(spliceCore, materialProfile, materialProfile)) {
                                        FormValidation.resetValidationError(event.target.parentElement);
                                    } else {
                                        FormValidation.showValidationError(event.target.parentElement, materialType + " cannot be spliced with itself.");
                                    }
                                }
                            }, [
                                m("option", {
                                    disabled: true,
                                    selected: true
                                }, "Select a printer first")
                            ])
                        ])
                    ])
                ]),
                m("tr", [
                    m("th", [
                        m("label", "Number of Spools")
                    ]),
                    m("td", [
                        m("div.checkboxGroup", {
                            style: {
                                display: "inline-block",
                                "margin-right": "20px"
                            }
                        }, [
                            m("input#spools2[type='radio']", {
                                name: "spoolCount",
                                checked: true,
                                onclick: function () {
                                    spoolCount = 2;
                                    document.getElementById("spool3Row").style.display = "none";
                                    document.getElementById("spool4Row").style.display = "none";
                                    document.getElementById("spool3Length").value = "";
                                    document.getElementById("spool4Length").value = "";
                                }
                            }),
                            m("label[for='spools2']", "2")
                        ]),
                        m("div.checkboxGroup", {
                            style: {
                                display: "inline-block",
                                "margin-right": "20px"
                            }
                        }, [
                            m("input#spools3[type='radio']", {
                                name: "spoolCount",
                                onclick: function () {
                                    spoolCount = 3;
                                    document.getElementById("spool3Row").style.display = "";
                                    document.getElementById("spool4Row").style.display = "none";
                                    document.getElementById("spool4Length").value = "";
                                }
                            }),
                            m("label[for='spools3']", "3")
                        ]),
                        m("div.checkboxGroup", {
                            style: {
                                display: "inline-block"
                            }
                        }, [
                            m("input#spools4[type='radio']", {
                                name: "spoolCount",
                                onclick: function () {
                                    spoolCount = 4;
                                    document.getElementById("spool3Row").style.display = "";
                                    document.getElementById("spool4Row").style.display = "";
                                }
                            }),
                            m("label[for='spools4']", "4")
                        ])
                    ])
                ]),
                m("tr", [
                    m("th", [
                        m("label[for='spool1Length']", "Spool 1 Length (mm)")
                    ]),
                    m("td", [
                        m("div#spool1LengthError.formError", [
                            m("input#spool1Length.formInput", {
                                value: "",
                                oninput: function (event) {
                                    spool1Length = FormValidation.validateNumberInput(event.target.value, 0,
                                        140, true,
                                        false, true,
                                        true,
                                        event.target.parentElement, "Spool 1 length", "mm");
                                }
                            })
                        ])
                    ])
                ]),
                m("tr", [
                    m("th", [
                        m("label[for='spool2Length']", "Spool 2 Length (mm)")
                    ]),
                    m("td", [
                        m("div#spool2LengthError.formError", [
                            m("input#spool2Length.formInput", {
                                value: "",
                                oninput: function (event) {
                                    spool2Length = FormValidation.validateNumberInput(event.target.value, 0,
                                        140, true,
                                        false, true,
                                        true,
                                        event.target.parentElement, "Spool 2 length", "mm");
                                }
                            })
                        ])
                    ])
                ]),
                m("tr#spool3Row", {
                    style: {
                        display: "none"
                    }
                }, [
                    m("th", [
                        m("label[for='spool3Length']", "Spool 3 Length (mm)")
                    ]),
                    m("td", [
                        m("div#spool3LengthError.formError", [
                            m("input#spool3Length.formInput", {
                                value: "",
                                oninput: function (event) {
                                    spool3Length = FormValidation.validateNumberInput(event.target.value, 0,
                                        140, true,
                                        false, true,
                                        true,
                                        event.target.parentElement, "Spool 3 length", "mm");
                                }
                            })
                        ])
                    ])
                ]),
                m("tr#spool4Row", {
                    style: {
                        display: "none"
                    }
                }, [
                    m("th", [
                        m("label[for='spool4Length']", "Spool 4 Length (mm)")
                    ]),
                    m("td", [
                        m("div#spool4LengthError.formError", [
                            m("input#spool4Length.formInput", {
                                value: "",
                                oninput: function (event) {
                                    spool4Length = FormValidation.validateNumberInput(event.target.value, 0,
                                        140, true,
                                        false, true,
                                        true,
                                        event.target.parentElement, "Spool 4 length", "mm");
                                }
                            })
                        ])
                    ])
                ])
            ])
        ]),
        m("button.confirm", {
            onclick: function (e) {
                e.target.blur();

                let validationErrorsExist = false;

                let materialType = MaterialMatrix.globalMatrix.matrix[spliceCore][materialProfile].type;
                if (!MaterialMatrix.globalMatrix.checkCompatibility(spliceCore, materialProfile, materialProfile)) {
                    validationErrorsExist = true;
                    FormValidation.showValidationError(document.getElementById("materialProfileError"), materialType + " cannot be spliced with itself.");
                }

                if (spool1Length === 0) {
                    validationErrorsExist = true;
                    FormValidation.showValidationError(document.getElementById("spool1LengthError"));
                }

                if (spool2Length === 0) {
                    validationErrorsExist = true;
                    FormValidation.showValidationError(document.getElementById("spool2LengthError"));
                }

                if (spoolCount > 2 && spool3Length === 0) {
                    validationErrorsExist = true;
                    FormValidation.showValidationError(document.getElementById("spool3LengthError"));
                }

                if (spoolCount > 3 && spool4Length === 0) {
                    validationErrorsExist = true;
                    FormValidation.showValidationError(document.getElementById("spool4LengthError"));
                }

                if (printerIndex === 0) {
                    validationErrorsExist = true;
                    FormValidation.showValidationError(document.getElementById("printerProfileError"));
                }

                if (!validationErrorsExist) {
                    dialog.showSaveDialog(BrowserWindow.fromId(2), {
                        title: "Save MSF file",
                        filters: [{
                            name: "MSF",
                            extensions: [profiles.getProfileAtIndex(printerIndex).getMSFExtension(false)]
                        }]
                    }, function (outpath) {
                        if (outpath !== undefined) {
                            let printer = profiles.getProfileAtIndex(printerIndex);

                            let basename = path.basename(outpath);
                            if (basename.length > 63) {
                                let trimname = basename.slice(0, 59) + "." + printer.getMSFExtension(false);
                                outpath = outpath.replace(basename, trimname);
                            }

                            const MSF = require("../models/msf");

                            let msf = new MSF();
                            msf.version = printer.getMSFVersion();
                            msf.printerProfile = printer;
                            msf.pulsesPerMM = printer.getPulsesPerMM();
                            msf.loadingOffset = printer.loadingOffset;

                            msf.spliceList.push([0, spool1Length]);
                            msf.colorsUsed[0] = 1;
                            msf.spliceList.push([1, spool1Length + spool2Length]);
                            msf.colorsUsed[1] = 1;
                            if (spoolCount > 2) {
                                msf.spliceList.push([2, spool1Length + spool2Length + spool3Length]);
                                msf.colorsUsed[2] = 1;
                            }
                            if (spoolCount > 3) {
                                msf.spliceList.push([3, spool1Length + spool2Length + spool3Length + spool4Length]);
                                msf.colorsUsed[3] = 1;
                            }
                            msf.setMaterials([
                                msf.colorsUsed[0] ? materialProfile : null,
                                msf.colorsUsed[1] ? materialProfile : null,
                                msf.colorsUsed[2] ? materialProfile : null,
                                msf.colorsUsed[3] ? materialProfile : null
                            ]);

                            let output = msf.createMSF();
                            fs.writeFileSync(outpath, output);

                            if (global.exportPlainMSF) {
                                let output = msf.createPlainMSF();
                                fs.writeFileSync(outpath + ".txt", output);
                            }
                            modalUtils.closeModal();
                        }
                    });
                }

            }
        }, "Save")

    ]);

}

function _generateMSFPatternView() {

    m.render(document.getElementById("errorText"), "");

    let printerIndex = 0;
    let spliceCore = MaterialMatrix.spliceCores.P;
    let pattern = [[0, 0]];
    let repeatCount = 0;
    let materialProfile = "Default PLA";

    function getIndexInParent(domElement) {
        let siblings = domElement.parentElement.children;
        for (let i = 0; i < siblings.length; i++) {
            if (siblings[i] === domElement) {
                return i;
            }
        }
        return -1;
    }

    function onPatternDriveChange(e) {
        let row = e.target.parentElement.parentElement;
        let rowIndex = getIndexInParent(row);
        pattern[rowIndex][0] = parseInt(e.target.value);
    }
    function onPatternLengthChange(e, minLength) {
        let spliceLength = FormValidation.validateNumberInput(e.target.value, 0,
            minLength, true,
            false, true,
            true,
            e.target.parentElement, "Splice length", "mm");
        if (spliceLength === 0) {
            return;
        }
        let row = e.target.parentElement.parentElement.parentElement;
        let rowIndex = getIndexInParent(row);
        pattern[rowIndex][1] = spliceLength;
    }

    let modalBox = document.getElementById("customMSFBox");
    m.render(modalBox, []);
    m.render(modalBox, [

        m("p", "Create a repeating pattern for layered prints."),

        m("table", [
            m("tbody", [
                m("tr", [
                    m("th", [
                        m("label[for='printerProfile']", "Printer Profile")
                    ]),
                    m("td", [
                        m("div#printerProfileError.formError", [
                            m("select#printerProfile.formInput", {
                                onchange: function (event) {
                                    printerIndex = event.target.selectedIndex;
                                    FormValidation.resetValidationError(event.target.parentElement);
                                    spliceCore = profiles.getProfileAtIndex(printerIndex).getSpliceCore();
                                    m.render(document.getElementById("materialProfile"), [
                                        Object.keys(MaterialMatrix.globalMatrix.matrix[spliceCore]).map(function (material) {
                                            return m("option", {
                                                value: material,
                                                selected: materialProfile === material
                                            }, (material.length > 80) ? material.substr(0, 80) + "..." : material);
                                        })
                                    ]);
                                    document.getElementById("materialProfile").disabled = false;
                                }
                            }, [
                                m("option", {
                                    disabled: true,
                                    selected: true
                                }, "Select a profile"),
                                profiles.getProfileList().map(function (printer) {
                                    return m("option", (printer.profileName.length > 80) ? printer.profileName.substr(0, 80) + "..." : printer.profileName);
                                })
                            ])
                        ])
                    ])
                ]),
                m("tr", [
                    m("th", [
                        m("label[for='materialProfile']", "Material Profile")
                    ]),
                    m("td", [
                        m("div#materialProfileError.formError", [
                            m("select#materialProfile.formInput", {
                                disabled: true,
                                onchange: function (event) {
                                    materialProfile = event.target.value;
                                    let materialType = MaterialMatrix.globalMatrix.matrix[spliceCore][materialProfile].type;
                                    if (MaterialMatrix.globalMatrix.checkCompatibility(spliceCore, materialProfile, materialProfile)) {
                                        FormValidation.resetValidationError(event.target.parentElement);
                                    } else {
                                        FormValidation.showValidationError(event.target.parentElement, materialType + " cannot be spliced with itself.");
                                    }
                                }
                            }, [
                                m("option", {
                                    disabled: true,
                                    selected: true
                                }, "Select a printer first")
                            ])
                        ])
                    ])
                ]),
                m("tr", [
                    m("th", [
                        m("label[for='repeatCount']", "Number of Repeats")
                    ]),
                    m("td", [
                        m("div#repeatCountError.formError", [
                            m("input#repeatCount.formInput", {
                                value: "",
                                oninput: function (event) {
                                    repeatCount = FormValidation.validateIntegerInput(event.target.value, 0,
                                        1, true,
                                        false, true,
                                        true,
                                        event.target.parentElement, "Repeat count");
                                }
                            })
                        ])
                    ])
                ]),
                m("tr", [
                    m("th", [
                        m("label", "Pattern")
                    ]),
                    m("td", [
                        m("table", [
                            m("thead", [
                                m("tr", [
                                    m("th", {
                                        style: {
                                            width: "60px",
                                            "padding-right": "10px"
                                        }
                                    }, "Drive"),
                                    m("th", "Length (mm)"),
                                    m("th", {
                                        style: {
                                            width: "40px"
                                        }
                                    }, "")
                                ])
                            ]),
                            m("tbody#patternRows", [
                                m("tr", [
                                    m("td", {
                                        style: {
                                            "padding-right": "10px"
                                        }
                                    }, [
                                        m("select.formSelect", {
                                            onchange: onPatternDriveChange
                                        }, [
                                            [0, 1, 2, 3].map(function (driveNum) {
                                                return m("option", {
                                                    value: driveNum
                                                }, driveNum + 1)
                                            })
                                        ])
                                    ]),
                                    m("td", [
                                        m("div.formError", [
                                            m("input.formInput", {
                                                oninput: function (e) {
                                                    onPatternLengthChange(e, 140);
                                                }
                                            })
                                        ])
                                    ]),
                                    m("td", "")
                                ])
                            ])
                        ]),
                        m("button.formButton", {
                            onclick: function () {
                                let newRow = document.createElement("tr");
                                let td = document.createElement("td");
                                td.style.paddingRight = "10px";
                                let select = document.createElement("select");
                                select.className = "formSelect";
                                let option;
                                for (let i = 0; i <= 3; i++) {
                                    option = document.createElement("option");
                                    option.innerText = (i + 1);
                                    option.value = i;
                                    select.appendChild(option);
                                }
                                select.addEventListener("change", onPatternDriveChange);
                                td.appendChild(select);
                                newRow.appendChild(td);
                                td = document.createElement("td");
                                let div = document.createElement("div");
                                div.className = "formError";
                                let input = document.createElement("input");
                                input.className = "formInput";
                                input.addEventListener("input", function (e) {
                                    onPatternLengthChange(e, 80);
                                });
                                div.appendChild(input);
                                td.appendChild(div);
                                newRow.appendChild(td);
                                td = document.createElement("td");
                                let btn = document.createElement("button");
                                btn.className = "formButton";
                                btn.innerText = "–";
                                btn.addEventListener("click", function (e) {
                                    let row = e.target.parentElement.parentElement;
                                    let rowIndex = getIndexInParent(row);
                                    row.parentElement.removeChild(row);
                                    pattern.splice(rowIndex, 1);
                                });
                                td.appendChild(btn);
                                newRow.appendChild(td);
                                document.getElementById("patternRows").appendChild(newRow);
                                pattern.push([0, 0]);
                            }
                        }, "+")
                    ])
                ])
            ])
        ]),
        m("button.confirm", {
            onclick: function (e) {
                e.target.blur();

                let validationErrorsExist = false;

                let materialType = MaterialMatrix.globalMatrix.matrix[spliceCore][materialProfile].type;
                if (!MaterialMatrix.globalMatrix.checkCompatibility(spliceCore, materialProfile, materialProfile)) {
                    validationErrorsExist = true;
                    FormValidation.showValidationError(document.getElementById("materialProfileError"), materialType + " cannot be spliced with itself.");
                }

                if (repeatCount === 0) {
                    validationErrorsExist = true;
                    FormValidation.showValidationError(document.getElementById("repeatCountError"));
                }

                if (printerIndex === 0) {
                    validationErrorsExist = true;
                    FormValidation.showValidationError(document.getElementById("printerProfileError"));
                }

                let patternRows = document.getElementById("patternRows");

                if (!validationErrorsExist) {
                    dialog.showSaveDialog(BrowserWindow.fromId(2), {
                        title: "Save MSF file",
                        filters: [{
                            name: "MSF",
                            extensions: [profiles.getProfileAtIndex(printerIndex).getMSFExtension(false)]
                        }]
                    }, function (outpath) {
                        if (outpath !== undefined) {

                            const MSF = require("../models/msf");

                            let msf = new MSF();
                            let printer = profiles.getProfileAtIndex(printerIndex);
                            msf.version = printer.getMSFVersion();
                            msf.printerProfile = printer;
                            msf.pulsesPerMM = printer.getPulsesPerMM();
                            msf.loadingOffset = printer.loadingOffset;

                            let previousDrive = -1;
                            let currentDrive = -1;
                            let totalLength = 0;

                            let i, j;

                            for (j = 0; j < repeatCount; j++) {
                                for (i = 0; i < pattern.length; i++) {
                                    currentDrive = pattern[i][0];
                                    totalLength += pattern[i][1];
                                    if (currentDrive === previousDrive) {
                                        msf.spliceList[msf.spliceList.length - 1][1] = totalLength;
                                    } else {
                                        msf.spliceList.push([currentDrive, totalLength]);
                                    }
                                    msf.colorsUsed[currentDrive] = 1;
                                    previousDrive = currentDrive;
                                }
                            }
                            msf.setMaterials([
                                msf.colorsUsed[0] ? materialProfile : null,
                                msf.colorsUsed[1] ? materialProfile : null,
                                msf.colorsUsed[2] ? materialProfile : null,
                                msf.colorsUsed[3] ? materialProfile : null
                            ]);

                            let output = msf.createMSF();
                            fs.writeFileSync(outpath, output);

                            if (global.exportPlainMSF) {
                                let output = msf.createPlainMSF();
                                fs.writeFileSync(outpath + ".txt", output);
                            }
                            modalUtils.closeModal();
                        }
                    });
                }

            }
        }, "Save")

    ]);

}

function _generateMSFGradientView() {

    m.render(document.getElementById("errorText"), "");

    let printerIndex = 0;
    let spliceCore = MaterialMatrix.spliceCores.P;
    let firstSpliceLength = 0;
    let lastSpliceLength = 0;
    let minLength = 0;
    let maxLength = 0;
    let printLength = 0;
    let materialProfile = "Default PLA";

    let modalBox = document.getElementById("customMSFBox");
    m.render(modalBox, []);
    m.render(modalBox, [

        m("p", "Create an MSF that gradually changes from Drive 1 to Drive 2, producing a gradient effect on a layered print."),

        m("table", [
            m("tbody", [
                m("tr", [
                    m("th", [
                        m("label[for='printerProfile']", "Printer Profile")
                    ]),
                    m("td", [
                        m("div#printerProfileError.formError", [
                            m("select#printerProfile.formInput", {
                                onchange: function (event) {
                                    printerIndex = event.target.selectedIndex;
                                    FormValidation.resetValidationError(event.target.parentElement);
                                    spliceCore = profiles.getProfileAtIndex(printerIndex).getSpliceCore();
                                    m.render(document.getElementById("materialProfile"), [
                                        Object.keys(MaterialMatrix.globalMatrix.matrix[spliceCore]).map(function (material) {
                                            return m("option", {
                                                value: material,
                                                selected: materialProfile === material
                                            }, (material.length > 80) ? material.substr(0, 80) + "..." : material);
                                        })
                                    ]);
                                    document.getElementById("materialProfile").disabled = false;
                                }
                            }, [
                                m("option", {
                                    disabled: true,
                                    selected: true
                                }, "Select a profile"),
                                profiles.getProfileList().map(function (printer) {
                                    return m("option", (printer.profileName.length > 80) ? printer.profileName.substr(0, 80) + "..." : printer.profileName);
                                })
                            ])
                        ])
                    ])
                ]),
                m("tr", [
                    m("th", [
                        m("label[for='materialProfile']", "Material Profile")
                    ]),
                    m("td", [
                        m("div#materialProfileError.formError", [
                            m("select#materialProfile.formInput", {
                                disabled: true,
                                onchange: function (event) {
                                    materialProfile = event.target.value;
                                    let materialType = MaterialMatrix.globalMatrix.matrix[spliceCore][materialProfile].type;
                                    if (MaterialMatrix.globalMatrix.checkCompatibility(spliceCore, materialProfile, materialProfile)) {
                                        FormValidation.resetValidationError(event.target.parentElement);
                                    } else {
                                        FormValidation.showValidationError(event.target.parentElement, materialType + " cannot be spliced with itself.");
                                    }
                                }
                            }, [
                                m("option", {
                                    disabled: true,
                                    selected: true
                                }, "Select a printer first")
                            ])
                        ])
                    ])
                ]),
                m("tr", [
                    m("th", [
                        m("label.tooltip", {
                            "data-tooltip": tooltips.gradientModeFirstPiece
                        }, "First Piece Length (optional)")
                    ]),
                    m("td", [
                        m("div.formError#firstSpliceLengthError", [
                            m("input.formInput#firstSpliceLength", {
                                oninput: function (event) {
                                    if (event.target.value.trim() === "") {
                                        firstSpliceLength = 0;
                                        FormValidation.resetValidationError(event.target.parentElement);
                                    } else {
                                        firstSpliceLength = FormValidation.validateNumberInput(event.target.value, 0,
                                            0, true,
                                            false, true,
                                            true,
                                            event.target.parentElement, "First piece length", "mm");
                                    }
                                }
                            })
                        ])
                    ])
                ]),
                m("tr", [
                    m("th", [
                        m("label[for='minLength']", "Min Piece Length (mm)")
                    ]),
                    m("td", [
                        m("div#minLengthError.formError", [
                            m("input#minLength.formInput", {
                                value: "",
                                oninput: function (event) {
                                    minLength = FormValidation.validateNumberInput(event.target.value, 0,
                                        80, true,
                                        false, true,
                                        true,
                                        event.target.parentElement, "Min piece length", "mm");
                                }
                            })
                        ])
                    ])
                ]),
                m("tr", [
                    m("th", [
                        m("label[for='maxLength']", "Max Piece Length (mm)")
                    ]),
                    m("td", [
                        m("div#maxLengthError.formError", [
                            m("input#maxLength.formInput", {
                                value: "",
                                oninput: function (event) {
                                    maxLength = FormValidation.validateNumberInput(event.target.value, 0,
                                        Math.max(140, minLength), true,
                                        false, true,
                                        true,
                                        event.target.parentElement, "Max piece length", "mm");
                                }
                            })
                        ])
                    ])
                ]),
                m("tr", [
                    m("th", [
                        m("label.tooltip", {
                            "data-tooltip": tooltips.gradientModeLastPiece
                        }, "Last Piece Length (optional)")
                    ]),
                    m("td", [
                        m("div.formError#lastSpliceLengthError", [
                            m("input.formInput#lastSpliceLength", {
                                oninput: function (event) {
                                    if (event.target.value.trim() === "") {
                                        lastSpliceLength = 0;
                                        FormValidation.resetValidationError(event.target.parentElement);
                                    } else {
                                        lastSpliceLength = FormValidation.validateNumberInput(event.target.value, 0,
                                            0, true,
                                            false, true,
                                            true,
                                            event.target.parentElement, "Last piece length", "mm");
                                    }
                                }
                            })
                        ])
                    ])
                ]),
                m("tr", [
                    m("th", [
                        m("label[for='gradientPrintLength']", "Print Length (mm)")
                    ]),
                    m("td", [
                        m("div#printLengthError.formError", [
                            m("input#gradientPrintLength.formInput", {
                                value: "",
                                oninput: function (event) {
                                    printLength = FormValidation.validateNumberInput(event.target.value, 0,
                                        0, true,
                                        false, true,
                                        true,
                                        event.target.parentElement, "Print length", "mm");
                                }
                            })
                        ])
                    ])
                ])
            ])
        ]),
        m("button.confirm", {
            onclick: function (e) {
                e.target.blur();

                let validationErrorsExist = false;

                let materialType = MaterialMatrix.globalMatrix.matrix[spliceCore][materialProfile].type;
                if (!MaterialMatrix.globalMatrix.checkCompatibility(spliceCore, materialProfile, materialProfile)) {
                    validationErrorsExist = true;
                    FormValidation.showValidationError(document.getElementById("materialProfileError"), materialType + " cannot be spliced with itself.");
                }

                if (firstSpliceLength < 0) {
                    validationErrorsExist = true;
                    FormValidation.showValidationError(document.getElementById("firstSpliceLengthError"));
                }

                if (lastSpliceLength < 0) {
                    validationErrorsExist = true;
                    FormValidation.showValidationError(document.getElementById("lastSpliceLengthError"));
                }

                if (minLength === 0) {
                    validationErrorsExist = true;
                    FormValidation.showValidationError(document.getElementById("minLengthError"));
                }

                if (maxLength === 0 || maxLength <= minLength) {
                    validationErrorsExist = true;
                    FormValidation.showValidationError(document.getElementById("maxLengthError"));
                }

                if (printLength === 0) {
                    validationErrorsExist = true;
                    FormValidation.showValidationError(document.getElementById("printLengthError"));
                }

                if (printerIndex === 0) {
                    validationErrorsExist = true;
                    FormValidation.showValidationError(document.getElementById("printerProfileError"));
                }

                if (!validationErrorsExist) {
                    dialog.showSaveDialog(BrowserWindow.fromId(2), {
                        title: "Save MSF file",
                        filters: [{
                            name: "MSF",
                            extensions: [profiles.getProfileAtIndex(printerIndex).getMSFExtension(false)]
                        }]
                    }, function (outpath) {
                        if (outpath !== undefined) {

                            const MSF = require("../models/msf");

                            let msf = new MSF();
                            let printer = profiles.getProfileAtIndex(printerIndex);
                            msf.version = printer.getMSFVersion();
                            msf.printerProfile = printer;
                            msf.pulsesPerMM = printer.getPulsesPerMM();
                            msf.loadingOffset = printer.loadingOffset;

                            let pairLength = minLength + maxLength;
                            let pairCount = Math.ceil((printLength - firstSpliceLength - lastSpliceLength) / pairLength);

                            let lengthA;
                            let lengthB;

                            let totalLength = 0;
                            let i, t;

                            if (firstSpliceLength > 0) {
                                // first splice length will be included in the first splice (as drive 0)
                                totalLength += firstSpliceLength;
                            }

                            for (i = 0; i < pairCount; i++) {
                                t = i / (pairCount - 1);
                                lengthA = Math.round((minLength + t * (maxLength - minLength)) * 100) / 100;
                                lengthB = pairLength - lengthA;
                                totalLength += lengthB;
                                msf.spliceList.push([0, totalLength]);
                                totalLength += lengthA;
                                msf.spliceList.push([1, totalLength]);
                            }
                            totalLength += lastSpliceLength;
                            msf.spliceList.pop();
                            msf.spliceList.push([1, totalLength]);
                            msf.colorsUsed[0] = 1;
                            msf.colorsUsed[1] = 1;
                            msf.setMaterials([
                                msf.colorsUsed[0] ? materialProfile : null,
                                msf.colorsUsed[1] ? materialProfile : null,
                                msf.colorsUsed[2] ? materialProfile : null,
                                msf.colorsUsed[3] ? materialProfile : null
                            ]);

                            let output = msf.createMSF();
                            fs.writeFileSync(outpath, output);

                            if (global.exportPlainMSF) {
                                let output = msf.createPlainMSF();
                                fs.writeFileSync(outpath + ".txt", output);
                            }
                            modalUtils.closeModal();
                        }
                    });
                }

            }
        }, "Save")

    ]);

}

function getOutputFileGrid(printerProfile, printFilePath, msfPath, twoRows = false) {
    let msfAsset = path.extname(msfPath).slice(1).toUpperCase();
    let paletteAsset;
    if (printerProfile.paletteType === Printer.PaletteTypes.Palette2) {
        paletteAsset = "palette2";
    } else if (printerProfile.paletteType === Printer.PaletteTypes.Palette2Pro) {
        paletteAsset = "palette2pro";
    } else {
        paletteAsset = "palette";
    }
    let showFileLabel = "Show in " + (process.platform === "darwin" ? "Finder" : "Explorer");
    if (printerProfile.isIntegratedMSF()) {
        // single file entry, with CANVAS Hub
        return m("table.outputFileGridOneRow", [
            m("tbody", [
                m("tr", [
                    m("td"),
                    m("td", {
                        style: {
                            width: "50px"
                        }
                    }, [
                        m("div.fileIconPreviewLarge", {
                            title: showFileLabel,
                            style: {
                                cursor: "pointer"
                            },
                            config: function (el) {
                                Electron.remote.app.getFileIcon(printFilePath, function (err, icon) {
                                    if (!err) {
                                        let dataURL = icon.toDataURL({
                                            scaleFactor: 3.0
                                        });
                                        el.style.backgroundImage = "url(" + dataURL + ")";
                                    }
                                });
                            },
                            onclick: function (e) {
                                e.target.blur();
                                Electron.shell.showItemInFolder(printFilePath);
                            }
                        })
                    ]),
                    m("td.outputFileGridArrowBlue"),
                    m("td", {
                        style: {
                            "background-image": "url('../assets/canvasHub.svg')",
                            "background-size": "contain",
                            "background-position": "center center",
                            "background-repeat": "no-repeat",
                            "width": "64px",
                            "height": "80px"
                        }
                    }),
                    m("td")
                ]),
                m("tr", [
                    m("td.fileGridName", {
                        colspan: 5,
                        style: {
                            "padding-top": "10px",
                            "padding-bottom": "2px"
                        }
                    }, [
                        m("span", {
                            title: showFileLabel,
                            style: {
                                cursor: "pointer"
                            },
                            onclick: function (e) {
                                e.target.blur();
                                Electron.shell.showItemInFolder(printFilePath);
                            }
                        }, path.basename(printFilePath))
                    ])
                ]),
                m("tr", [
                    m("td", {
                        colspan: 5,
                        style: {
                            "font-size": "0.8em"
                        }
                    }, [
                        m("span", "Upload this file to CANVAS Hub")
                    ])
                ]),
                m("tr", [
                    m("td", {
                        colspan: 5
                    }, [
                        m("button", {
                            style: {
                                "margin-top": "4px",
                                "font-size": "0.75em",
                                cursor: "pointer",
                                padding: "3px 6px"
                            },
                            onclick: function (e) {
                                e.target.blur();
                                Electron.shell.showItemInFolder(printFilePath);
                            }
                        }, showFileLabel)
                    ])
                ])
            ])
        ]);
    } else if (twoRows) {
        return m("table.outputFileGridOneRow", [
            m("tbody", [
                m("tr", [
                    m("td"),
                    m("td", {
                        style: {
                            width: "50px"
                        }
                    }, [
                        m("div.fileIconPreviewLarge", {
                            title: showFileLabel,
                            style: {
                                cursor: "pointer",
                                "background-image": "url('../assets/" + msfAsset + ".svg')",
                                "background-size": "150%"
                            },
                            onclick: function (e) {
                                e.target.blur();
                                Electron.shell.showItemInFolder(msfPath);
                            }
                        })
                    ]),
                    m("td.outputFileGridArrowPurple"),
                    m("td", {
                        style: {
                            "background-image": "url('../assets/" + paletteAsset + ".svg')",
                            "background-size": "contain",
                            "background-position": "center center",
                            "background-repeat": "no-repeat",
                            "width": printerProfile.isPalette2() ? "70px" : "50px",
                            "height": "80px"
                        }
                    }),
                    m("td")
                ]),
                m("tr", [
                    m("td.fileGridName", {
                        colspan: 5,
                        style: {
                            "padding-top": "10px",
                            "padding-bottom": "2px"
                        }
                    }, [
                        m("span", {
                            title: showFileLabel,
                            style: {
                                cursor: "pointer"
                            },
                            onclick: function (e) {
                                e.target.blur();
                                Electron.shell.showItemInFolder(msfPath);
                            }
                        }, path.basename(msfPath))
                    ])
                ]),
                m("tr", [
                    m("td", {
                        colspan: 5,
                        style: {
                            "font-size": "0.8em"
                        }
                    }, [
                        m("span", "Save this file to Palette's SD card"),
                        m("button", {
                            style: {
                                "margin-left": "8px",
                                "font-size": "0.75em",
                                cursor: "pointer",
                                padding: "3px 6px"
                            },
                            onclick: function (e) {
                                e.target.blur();
                                Electron.shell.showItemInFolder(msfPath);
                            }
                        }, showFileLabel)
                    ])
                ]),
                m("tr", [
                    m("td", {
                        style: {
                            height: "20px"
                        }
                    })
                ]),
                m("tr", [
                    m("td"),
                    m("td", {
                        style: {
                            width: "50px"
                        }
                    }, [
                        m("div.fileIconPreviewLarge", {
                            title: showFileLabel,
                            style: {
                                cursor: "pointer"
                            },
                            config: function (el) {
                                Electron.remote.app.getFileIcon(printFilePath, function (err, icon) {
                                    if (!err) {
                                        let dataURL = icon.toDataURL({
                                            scaleFactor: 3.0
                                        });
                                        el.style.backgroundImage = "url(" + dataURL + ")";
                                    }
                                });
                            },
                            onclick: function (e) {
                                e.target.blur();
                                Electron.shell.showItemInFolder(printFilePath);
                            }
                        })
                    ]),
                    m("td.outputFileGridArrowBlue"),
                    m("td", {
                        style: {
                            "background-image": "url('../assets/printer.svg')",
                            "background-size": "contain",
                            "background-position": "center center",
                            "background-repeat": "no-repeat",
                            "width": "80px",
                            "height": "80px"
                        }
                    }),
                    m("td")
                ]),
                m("tr", [
                    m("td.fileGridName", {
                        colspan: 5,
                        style: {
                            "padding-top": "10px",
                            "padding-bottom": "2px"
                        }
                    }, [
                        m("span", {
                            title: showFileLabel,
                            style: {
                                cursor: "pointer"
                            },
                            onclick: function (e) {
                                e.target.blur();
                                Electron.shell.showItemInFolder(printFilePath);
                            }
                        }, path.basename(printFilePath))
                    ])
                ]),
                m("tr", [
                    m("td", {
                        colspan: 5,
                        style: {
                            "font-size": "0.8em"
                        }
                    }, [
                        m("span", "Save this file for your printer"),
                        m("button", {
                            style: {
                                "margin-left": "8px",
                                "font-size": "0.75em",
                                cursor: "pointer",
                                padding: "3px 6px"
                            },
                            onclick: function (e) {
                                e.target.blur();
                                Electron.shell.showItemInFolder(printFilePath);
                            }
                        }, showFileLabel)
                    ])
                ])
            ])
        ]);
    } else {
        return m("table.outputFileGridOneRow", [
            m("tbody", [
                m("tr", [
                    m("td", {
                        style: {
                            width: "30px"
                        }
                    }),
                    m("td", {
                        style: {
                            width: "50px"
                        }
                    }, [
                        m("div.fileIconPreviewLarge", {
                            title: showFileLabel,
                            style: {
                                cursor: "pointer",
                                "background-image": "url('../assets/" + msfAsset + ".svg')",
                                "background-size": "150%"
                            },
                            onclick: function (e) {
                                e.target.blur();
                                Electron.shell.showItemInFolder(msfPath);
                            }
                        })
                    ]),
                    m("td.outputFileGridArrowPurple"),
                    m("td", {
                        style: {
                            "background-image": "url('../assets/" + paletteAsset + ".svg')",
                            "background-size": "contain",
                            "background-position": "center center",
                            "background-repeat": "no-repeat",
                            "width": printerProfile.isPalette2() ? "70px" : "50px",
                            "height": "80px"
                        }
                    }),
                    m("td", {
                        style: {
                            width: "30px"
                        }
                    }),
                    m("td", {
                        style: {
                            width: "30px"
                        }
                    }),
                    m("td", {
                        style: {
                            width: "30px"
                        }
                    }),
                    m("td", {
                        style: {
                            width: "50px"
                        }
                    }, [
                        m("div.fileIconPreviewLarge", {
                            title: showFileLabel,
                            style: {
                                cursor: "pointer"
                            },
                            config: function (el) {
                                Electron.remote.app.getFileIcon(printFilePath, function (err, icon) {
                                    if (!err) {
                                        let dataURL = icon.toDataURL({
                                            scaleFactor: 3.0
                                        });
                                        el.style.backgroundImage = "url(" + dataURL + ")";
                                    }
                                });
                            },
                            onclick: function (e) {
                                e.target.blur();
                                Electron.shell.showItemInFolder(printFilePath);
                            }
                        })
                    ]),
                    m("td.outputFileGridArrowBlue"),
                    m("td", {
                        style: {
                            "background-image": "url('../assets/printer.svg')",
                            "background-size": "contain",
                            "background-position": "center center",
                            "background-repeat": "no-repeat",
                            "width": "80px",
                            "height": "80px"
                        }
                    }),
                    m("td", {
                        style: {
                            width: "30px"
                        }
                    })
                ]),
                m("tr", [
                    m("td.fileGridName", {
                        colspan: 5,
                        style: {
                            "padding-top": "10px",
                            "padding-bottom": "2px"
                        }
                    }, [
                        m("span", {
                            title: showFileLabel,
                            style: {
                                cursor: "pointer"
                            },
                            onclick: function (e) {
                                e.target.blur();
                                Electron.shell.showItemInFolder(msfPath);
                            }
                        }, path.basename(msfPath))
                    ]),
                    m("td"),
                    m("td.fileGridName", {
                        colspan: 5,
                        style: {
                            "padding-top": "10px",
                            "padding-bottom": "2px"
                        }
                    }, [
                        m("span", {
                            title: showFileLabel,
                            style: {
                                cursor: "pointer"
                            },
                            onclick: function (e) {
                                e.target.blur();
                                Electron.shell.showItemInFolder(printFilePath);
                            }
                        }, path.basename(printFilePath))
                    ])
                ]),
                m("tr", [
                    m("td", {
                        colspan: 5,
                        style: {
                            "font-size": "0.8em"
                        }
                    }, "Save this file to Palette's SD card"),
                    m("td"),
                    m("td", {
                        colspan: 5,
                        style: {
                            "font-size": "0.8em"
                        }
                    }, "Save this file for your printer")
                ]),
                m("tr", [
                    m("td", {
                        colspan: 5
                    }, [
                        m("button", {
                            style: {
                                "margin-top": "4px",
                                "font-size": "0.75em",
                                cursor: "pointer",
                                padding: "3px 6px"
                            },
                            onclick: function (e) {
                                e.target.blur();
                                Electron.shell.showItemInFolder(msfPath);
                            }
                        }, showFileLabel)
                    ]),
                    m("td"),
                    m("td", {
                        colspan: 5
                    }, [
                        m("button", {
                            style: {
                                "margin-top": "4px",
                                "font-size": "0.75em",
                                cursor: "pointer",
                                padding: "3px 6px"
                            },
                            onclick: function (e) {
                                e.target.blur();
                                Electron.shell.showItemInFolder(printFilePath);
                            }
                        }, showFileLabel)
                    ])
                ])
            ])
        ]);
    }
}

function displayPrintSummary(print, msf, printFilePath, msfPath) {
    if (!(msf instanceof MSF)) {
        return;
    }

    modalUtils.beforeOpenModal();

    let colorsUsed = msf.getColorsUsedLabels();
    let filamentLengths = msf.getFilamentLengthsByDrive();
    let infillDumpSavings = null;
    let savingsType = "infill";
    if (print._printerProfile.canInfillDump()) {
        let savings = print.getInfillDumpSavings(msf);
        if (savings.total > 0) {
            infillDumpSavings = {
                percent: Math.floor(savings.percent * 100),
                total: (savings.total / 1000).toFixed(2) + " m"
            };
        }
        if (print._printerProfile.transitionSettings.useSupportForTransition) {
            if (print._printerProfile.transitionSettings.useInfillForTransition) {
                savingsType += " and support material";
            } else {
                savingsType = "support material";
            }
        }
    }

    let modalWindow = document.getElementById("open-modal");
    m.render(modalWindow, [
        m("div.container", [
            m("div.save", {
                style: {
                    width: "550px",
                    position: "relative"
                }
            }, [
                m("button.closeButton", {
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
                (print._printerProfile.isPalette2() ? [] : [
                    m("a", {
                        href: "#",
                        style: {
                            float: "right",
                            "margin-top": "15px",
                            "margin-right": "15px",
                            "text-decoration": "none"
                        },
                        onclick: function (event) {
                            event.preventDefault();
                            event.stopPropagation();
                            SetupView.openPrintOffboarding(print, msf, printFilePath, msfPath);
                        }
                    }, "What do I do now?")
                ]),
                m("h2", "Ready to Print!"),
                m("br"),

                getOutputFileGrid(print._printerProfile, printFilePath, msfPath),

                m("table", [
                    m("tbody", [
                        (infillDumpSavings ? m("tr", {
                            style: {
                                color: (infillDumpSavings.percent >= 5 ? "#30963a" : null)
                            }
                        }, [
                            m("th", {
                                style: {
                                    "padding-top": "5px",
                                    "padding-bottom": "5px"
                                }
                            }, m("label.tooltip", {
                                "data-tooltip": tooltips.infillDumpSavings.replace("$1", savingsType).replace("$2", infillDumpSavings.total).replace("$3", infillDumpSavings.percent + "%")
                            }, "Filament/Time Saved")),
                            m("td", infillDumpSavings.total + (infillDumpSavings.percent > 0 ? " (" + infillDumpSavings.percent + "% waste reduction)" : ""))
                        ]) : []),
                        m("tr", [
                            m("th", {
                                style: {
                                    "padding-top": "5px",
                                    "padding-bottom": "5px"
                                }
                            }, "Materials Used"),
                            m("td", [
                                m("table", [
                                    m("tbody", [
                                        [0, 1, 2, 3].map(function (i) {
                                            return filamentLengths[i] ? m("tr", [
                                                m("td", {style: {"padding-right": "15px"}}, (i + 1)),
                                                m("td", {style: {"padding-right": "5px"}}, colorsUsed[i]),
                                                m("td", + (filamentLengths[i] / 1000).toFixed(2) + " m")
                                            ]) : []
                                        }),
                                        m("tr", [
                                            m("td"),
                                            m("td", {
                                                style: {
                                                    "padding-right": "10px"
                                                }
                                            }, "Total"),
                                            m("td", (msf.spliceList[msf.spliceList.length - 1][1] / 1000).toFixed(2) + " m"),
                                        ])
                                    ])
                                ])
                            ])
                        ]),
                        m("tr", [
                            m("th", {
                                style: {
                                    "padding-top": "5px",
                                    "padding-bottom": "5px"
                                }
                            }, "Number of Splices"),
                            m("td", msf.spliceList.length)
                        ]),
                        (msf.pingList.length === 0 ? [] : m("tr", [
                            m("th", {
                                style: {
                                    "padding-top": "5px",
                                    "padding-bottom": "5px"
                                }
                            }, [
                                m("label.tooltip", {
                                    "data-tooltip": tooltips.whatArePings
                                }, "Number of Pings")
                            ]),
                            m("td", msf.pingList.length)
                        ]))
                    ])
                ]),
                m("button.confirm", {
                    onclick: function (e) {
                        e.target.blur();
                        modalUtils.closeModal();
                    }
                }, "Close")
            ])
        ])
    ]);

    modalUtils.afterOpenModal();

}

function saveBedPreview() {
    let now = new Date();
    let timestamp = now.getFullYear() + "-"
        + ("00" + (now.getMonth() + 1)).substr(-2) + "-"
        + ("00" + now.getDate()).substr(-2) + " at "
        + now.getHours() + "."
        + ("00" + now.getMinutes()).substr(-2) + "."
        + ("00" + now.getSeconds()).substr(-2);
    dialog.showSaveDialog(BrowserWindow.fromId(2), {
        defaultPath: path.join(Electron.remote.app.getPath("desktop"), ("Chroma Screenshot " + timestamp + ".png")),
        title: "Save Screenshot",
        filters: [{
            name: "PNG",
            extensions: ["png"]
        }]
    }, function (path) {
        if (path !== undefined) {
            let screenshot = require("./visualizer").getScreenshot();
            fs.writeFileSync(path, screenshot, "base64");
        }
    });
}

exports.convertToPlainMSF = convertToPlainMSF;
exports.generateCFGModal = generateCFGModal;
exports.generateCustomMSFModal = generateCustomMSFModal;
exports.getOutputFileGrid = getOutputFileGrid;
exports.displayPrintSummary = displayPrintSummary;
exports.saveBedPreview = saveBedPreview;
