
const path = require("path");
const m = require("mithril");

const Electron = require("electron");
const app = Electron.remote.app;
const BrowserWindow = Electron.remote.BrowserWindow;
const dialog = Electron.remote.dialog;

const config = require("../config");
const dataCollection = require("../models/data-collection");
const MaterialMatrix = require("../models/material-matrix");
const FormValidation = require("./form-validation");
const menu = require("./menu");
const modalUtils = require("./modal-utils");
const Postprocessor = require("./postprocessor-view");
const PrinterProfiles = require("../models/printer-profiles");
const SetupView = require("./setup-view");

const tooltips = {
    heatFactor: "The amount of time spent heating filament. Each increment of 1 adds an additional second to the heating time. Note that higher heating times may require slower print speeds.",
    compressionFactor: "The distance the two filament ends are compressed into one another. Each increment of 1 adds an additional compression of 0.6 mm to the splice.",
    reverseSplicing: "Forward splicing heats the outgoing filament and compresses the ingoing filament into it. Reverse splicing instead heats the ingoing filament and reverses the outgoing filament back into it. Reverse splicing is useful for flexible filaments (like TPU) which can buckle under compression."
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
                m("h2", "Material Profiles"),
                m("table#materials.tableHoverHighlight", [
                    Object.keys(MaterialMatrix.matrix.matrix).map(function (profileName) {
                        return m("tr.hoverHighlight", [
                            m("td.colExpand", profileName),
                            m("td", [
                                m("button", {
                                    onclick: function () {
                                        materialProfileModal(profileName, false);
                                    }
                                }, "Edit")
                            ]),
                            m("td", [
                                m("button", {
                                    disabled: MaterialMatrix.isDefaultProfile(profileName),
                                    onclick: function () {
                                        dialog.showMessageBox(BrowserWindow.fromId(2), {
                                            type: "question",
                                            message: "Delete Material Profile",
                                            detail: "Are you sure you wish to delete the profile “" + profileName + "”?",
                                            buttons: ["Cancel", "Delete"],
                                            defaultId: 0,
                                            cancelId: 0
                                        }, function (choice) {
                                            if (choice === 1) {
                                                deleteProfile(profileName);
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
                        let originalName = "Custom PLA";
                        let name = originalName;
                        let counter = 2;
                        while (MaterialMatrix.matrix.profileNameTaken(name)) {
                            name = originalName + " " + counter;
                            counter++;
                        }
                        materialProfileModal(name, true);
                    }
                }, "New Profile"),
                m("div", {
                    style: {
                        float: "right"
                    }
                }, [
                    m("button", {
                        style: {
                            "margin-right": "8px"
                        },
                        onclick: importProfiles
                    }, "Import"),
                    m("button", {
                        style: {
                            "margin-right": "5px"
                        },
                        onclick: exportProfilesModal
                    }, "Export")
                ])
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
}

let onProfileClose = null;
let originalNewMatrix = null;
let newMatrix = null;

function closeProfileModal(event) {
    event = event || window.event;
    if (event === true || event.type === "click" || event.keyCode === 27) {
        // check for unsaved changes
        if (event !== true && !newMatrix.equals(originalNewMatrix)) {
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

function importProfiles() {

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
        let importMatrix = config.importMaterials(filenames[0]);
        let importNames = Object.keys(importMatrix.matrix);
        let importedNames = [];
        for (let materialName of importNames) {
            let counterName = materialName;
            let counter = 2;
            let uniqueName = MaterialMatrix.matrix.addEmptyProfile(materialName);
            while (!uniqueName) {
                counterName = materialName + " " + counter;
                counter++;
                uniqueName = MaterialMatrix.matrix.addEmptyProfile(counterName);
            }
            importedNames.push(counterName);
            MaterialMatrix.matrix.changeProfileType(counterName, importMatrix.matrix[materialName].type);
        }
        for (let i = 0; i < importNames.length; i++) {
            for (let j = 0; j < importNames.length; j++) {
                MaterialMatrix.matrix.matrix[importedNames[i]].combinations[importedNames[j]] = importMatrix.matrix[importNames[i]].combinations[importNames[j]];
            }
        }
        dataCollection.logMaterialProfileImport(MaterialMatrix.matrix);
        config.saveMaterials();
        Postprocessor.updateMaterialDropdowns();
        openModal();
    });

}

function exportProfilesModal() {

    function returnToMainModal(event) {
        event = event || window.event;
        if (event === true || event.type === "click" || event.keyCode === 27) {
            window.removeEventListener("keydown", returnToMainModal);
            openModal();
        }
    }

    // pressing the ESC key will close the modal
    window.removeEventListener("keydown", closeProfileModal);
    window.addEventListener("keydown", returnToMainModal);

    let exportCount = 0;
    let presetExports = {};
    for (let material of Object.keys(MaterialMatrix.matrix.matrix)) {
        presetExports[material] = false;
    }

    let modalWindow = document.getElementById("open-modal");
    m.render(modalWindow, []);
    m.render(modalWindow, [
        m("div.container", [
            m("div.save", [
                m("h2", "Export Material Profiles"),
                m("span#errorText"),
                m("br"),
                m("p", "Material profiles work in terms of combinations of materials."),
                m("p", "This means that if you want to export the settings used between two materials, you should export both of the materials."),

                m("table", [
                    m("tbody", [
                        m("tr", [
                            m("td", [
                                Object.keys(MaterialMatrix.matrix.matrix).map(function (material, index) {
                                    return m("div.checkboxGroup", [
                                        m("input#materialProfile" + index + "[type='checkbox']", {
                                            onclick: function (event) {
                                                if (event.target.checked) {
                                                    presetExports[material] = true;
                                                    exportCount++;
                                                } else {
                                                    presetExports[material] = false;
                                                    exportCount--;
                                                }
                                                document.getElementById("materialExportSave").disabled = (exportCount === 0);
                                            }
                                        }),
                                        m("label[for='materialProfile" + index + "']", (material.length > 40 ? material.substr(0, 40) + "..." : material))
                                    ])
                                })
                            ])
                        ])
                    ])
                ]),
                m("br"),

                m("button.formButton", {
                    onclick: returnToMainModal
                }, "Cancel"),
                m("button#materialExportSave.confirm", {
                    style: {
                        float: "right",
                        "margin-top": "10px"
                    },
                    disabled: true,
                    onclick: function (e) {
                        if (exportCount === 0) {
                            return;
                        }
                        let exportMatrix = new MaterialMatrix();
                        for (let material in presetExports) {
                            if (presetExports.hasOwnProperty(material) && presetExports[material]) {
                                exportMatrix.matrix[material] = {
                                    type: MaterialMatrix.matrix.matrix[material].type,
                                    combinations: {}
                                };
                                for (let combo in presetExports) {
                                    if (presetExports.hasOwnProperty(combo) && presetExports[combo]) {
                                        exportMatrix.matrix[material].combinations[combo] = MaterialMatrix.matrix.matrix[material].combinations[combo];
                                    }
                                }
                            }
                        }
                        dialog.showSaveDialog(BrowserWindow.fromId(2), {
                            defaultPath: path.join(app.getPath("desktop"), "materials.yml"),
                            title: "Export Material Profiles",
                            filters: [{
                                name: "YAML document",
                                extensions: ["yml"]
                            }]
                        }, function (outpath) {
                            if (outpath !== undefined) {
                                config.exportMaterials(exportMatrix, outpath);
                            }
                        });

                        returnToMainModal(true);
                    }
                }, "Export")

            ])
        ])
    ]);

}

function materialProfileModal(profileName, isNew, onClose) {

    newMatrix = MaterialMatrix.matrix.clone();
    if (isNew) {
        newMatrix.addEmptyProfile(profileName);
    }
    originalNewMatrix = newMatrix.clone();

    let materialType = "PLA";
    let materialFinalized = false;

    menu.disableModalActions();

    if (typeof onClose === "function") {
        onProfileClose = onClose;
    } else if (onClose === undefined || onClose === null) {
        if (PrinterProfiles.getProfileCount() === 0) {
            onProfileClose = function () {
                closeModal();
                SetupView.openSetupWindow();
            };
        } else {
            onProfileClose = returnToMainModal;
        }
    }

    // pressing the ESC key will close the modal
    window.removeEventListener("keydown", closeMainModal);
    window.addEventListener("keydown", closeProfileModal);

    let modalWindow = document.getElementById("open-modal");
    modalWindow.scrollTop = 0;
    m.render(modalWindow, []);

    function renderFirstView() {
        m.render(modalWindow, [
            m("div.container", [
                m("div.printerProfile", [
                    m("h2", (isNew ? "New Material Profile" : "Edit Material Profile")),
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
                                    "Material Type"
                                ]),
                                m("td", [
                                    (isNew && !materialFinalized ? [
                                        m("select.formSelect#materialType", {
                                            onchange: function (event) {
                                                materialType = event.target.value;
                                                let name = (materialType === "Other" ? "Custom Material" : "Custom " + materialType);
                                                let newName = name;
                                                let counter = 2;
                                                while (newMatrix.profileNameTaken(newName)) {
                                                    newName = name + " " + counter;
                                                    counter++;
                                                }
                                                newMatrix.renameProfile(profileName, newName);
                                                document.getElementById("materialName").value = newName;
                                                profileName = newName;
                                            }
                                        }, [
                                            MaterialMatrix.materialTypes.map(function (type) {
                                                return m("option", {
                                                    selected: newMatrix.matrix[profileName].type === type
                                                }, type)
                                            })
                                        ])
                                    ] : [
                                        m("input#materialType.formInput.formInputDisabled", {
                                            value: newMatrix.matrix[profileName].type,
                                            disabled: true,
                                            style: {
                                                border: "none",
                                                opacity: 1
                                            }
                                        })
                                    ])
                                ])
                            ]),

                            m("tr", [
                                m("th", [
                                    m("label[for='materialName']", "Profile Name")
                                ]),
                                m("td", {
                                    style: {
                                        width: "auto"
                                    }
                                }, [
                                    m("div#materialNameError.formError", [
                                        m("input#materialName.formInput" + (MaterialMatrix.isDefaultProfile(profileName) ? ".formInputDisabled" : ""), {
                                            value: profileName,
                                            disabled: MaterialMatrix.isDefaultProfile(profileName),
                                            oninput: function (event) {
                                                let el = event.target.parentElement;
                                                let value = event.target.value.trim();
                                                if (value === "") {
                                                    document.getElementById("saveProfileButton").disabled = true;
                                                    document.getElementById("nextButton").disabled = true;
                                                    FormValidation.showValidationError(el, "Make sure you name the profile!");
                                                } else if (value !== profileName) {
                                                    let uniqueName = true;
                                                    Object.keys(newMatrix.matrix).forEach(function (material) {
                                                        if (material.toLowerCase() === value.toLowerCase() && material !== profileName) {
                                                            uniqueName = false;
                                                        }
                                                    });
                                                    if (uniqueName) {
                                                        newMatrix.renameProfile(profileName, value);
                                                        profileName = value;
                                                        FormValidation.resetValidationError(el);
                                                        document.getElementById("saveProfileButton").disabled = false;
                                                        document.getElementById("nextButton").disabled = false;
                                                    } else {
                                                        FormValidation.showValidationError(el, "A profile with this name already exists.");
                                                        document.getElementById("saveProfileButton").disabled = true;
                                                        document.getElementById("nextButton").disabled = true;
                                                    }
                                                } else {
                                                    FormValidation.resetValidationError(el);
                                                    document.getElementById("saveProfileButton").disabled = false;
                                                    document.getElementById("nextButton").disabled = false;
                                                }
                                            }
                                        })
                                    ])
                                ])
                            ])

                        ])
                    ]),

                    m("button.formbutton", {
                        onclick: closeProfileModal
                    }, "Cancel"),
                    m("div", {
                        style: {
                            float: "right"
                        }
                    }, [
                        m("button#nextButton", {
                            style: {
                                "margin-right": "10px"
                            },
                            onclick: function (event) {
                                event.target.blur();
                                if (isNew) {
                                    newMatrix.changeProfileType(profileName, materialType);
                                    originalNewMatrix = newMatrix.clone();
                                    materialFinalized = true;
                                }
                                renderSecondView();
                            }
                        }, "Tune Settings"),
                        m("button.confirm#saveProfileButton", {
                            style: {
                                "margin-top": "5px"
                            },
                            onclick: function (event) {
                                event.target.blur();
                                newMatrix.changeProfileType(profileName, materialType);
                                validateAndSaveChanges(newMatrix, isNew);
                            }
                        }, (isNew? "Create" : "Save"))
                    ])

                ])
            ])
        ]);
    }

    function renderSecondView() {
        m.render(modalWindow, [
            m("div.container", [
                m("div.printerProfile", [
                    m("h2", (isNew ? "New Material Profile" : "Edit Material Profile")),
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
                                    m("label[for='materialName']", "Profile Name")
                                ]),
                                m("td", {
                                    style: {
                                        width: "auto"
                                    }
                                }, [
                                    m("div#materialNameError.formError", [
                                        m("input#materialName.formInput.formInputDisabled", {
                                            value: profileName,
                                            disabled: true,
                                            style: {
                                                border: "none",
                                                opacity: 1,
                                                "text-overflow": "ellipsis",
                                                "pointer-events": "none"
                                            }
                                        })
                                    ])
                                ])
                            ]),

                            m("tr", [
                                m("th", "Splice Settings"),
                                m("td", [
                                    m("select.formSelect#combinations", {
                                        onchange: function (event) {
                                            let material = event.target.value;
                                            renderSpliceSettingsTable(profileName, material);
                                        }
                                    }, [
                                        Object.keys(newMatrix.matrix).filter(function (material) {
                                            return newMatrix.matrix[profileName].combinations[material] !== null;
                                        }).map(function (material) {
                                            return m("option", {
                                                selected: material === profileName,
                                                value: material
                                            }, (material.length > 83 ? material.substr(0, 80) + "..." : material))
                                        })
                                    ]),

                                    m("table", [
                                        m("tbody#spliceSettings")
                                    ])
                                ])
                            ])

                        ])
                    ]),

                    m("button.formbutton", {
                        onclick: closeProfileModal
                    }, "Cancel"),
                    m("div", {
                        style: {
                            float: "right"
                        }
                    }, [
                        (MaterialMatrix.isDefaultProfile(profileName) ? [] : [
                            m("button", {
                                style: {
                                    "margin-right": "10px"
                                },
                                onclick: function (event) {
                                    event.target.blur();
                                    renderFirstView();
                                }
                            }, (isNew ? "Back" : "Edit Name"))
                        ]),
                        m("button.confirm#saveProfileButton", {
                            style: {
                                "margin-top": "5px"
                            },
                            onclick: function (event) {
                                event.target.blur();
                                validateAndSaveChanges(newMatrix, isNew);
                            }
                        }, (isNew? "Create" : "Save"))
                    ])

                ])
            ])
        ]);
        if (newMatrix.matrix[profileName].combinations[profileName] !== null) {
            renderSpliceSettingsTable(profileName, profileName);
        } else {
            for (let combo of Object.keys(newMatrix.matrix[profileName].combinations)) {
                if (newMatrix.matrix[profileName].combinations[combo] !== null) {
                    renderSpliceSettingsTable(profileName, combo);
                    break;
                }
            }
        }
    }

    function renderSpliceSettingsTable(profileIngoing, profileOutgoing) {
        let defaultsButtons = newMatrix.matrix[profileIngoing].type !== "Other" && newMatrix.matrix[profileOutgoing].type !== "Other";
        let allowZero = !(profileIngoing === "Default PLA" && profileOutgoing === "Default PLA");
        let profileIngoingDisplayName = (profileIngoing.length > 32 ? profileIngoing.substr(0, 30) + "…" : profileIngoing);
        let profileOutgoingDisplayName = (profileOutgoing.length > 32 ? profileOutgoing.substr(0, 30) + "…" : profileOutgoing);
        m.render(document.getElementById("spliceSettings"), [
            m("tr", [
                m("th", {
                    colspan: 2
                }, [
                    m("h3", (
                        profileIngoing === profileOutgoing
                            ? profileIngoingDisplayName + " to " + profileOutgoingDisplayName
                            : profileIngoingDisplayName + " (ingoing) to " + profileOutgoingDisplayName + " (outgoing)"
                    ))
                ])
            ]),
            m("tr", [
                m("th", [
                    m("label.tooltip[for='heatFactor1']", {
                        "data-tooltip": tooltips.heatFactor
                    }, "Heat Factor"),
                    (defaultsButtons ? m("button.useMaterialDefault#heatFactor1Default", {
                        style: {
                            display: (!MaterialMatrix.defaults[newMatrix.matrix[profileIngoing].type][newMatrix.matrix[profileOutgoing].type]
                                || newMatrix.matrix[profileIngoing].combinations[profileOutgoing].heatFactor === MaterialMatrix.defaults[newMatrix.matrix[profileIngoing].type][newMatrix.matrix[profileOutgoing].type].heatFactor) ? "none" : ""
                        },
                        onclick: function (event) {
                            let defaultHeatFactor = MaterialMatrix.defaults[newMatrix.matrix[profileIngoing].type][newMatrix.matrix[profileOutgoing].type].heatFactor;
                            newMatrix.matrix[profileIngoing].combinations[profileOutgoing].heatFactor = defaultHeatFactor;
                            document.getElementById("heatFactor1").value = defaultHeatFactor;
                            event.target.style.display = "none";
                        }
                    }) : [])
                ]),
                m("td", [
                    m("div.formError", [
                        m("input#heatFactor1.formInput", {
                            value: newMatrix.matrix[profileIngoing].combinations[profileOutgoing].heatFactor || "0",
                            oninput: function (event) {
                                newMatrix.matrix[profileIngoing].combinations[profileOutgoing].heatFactor = FormValidation.validateNumberInput(
                                    event.target.value,
                                    0,
                                    0, allowZero,
                                    15, true,
                                    true,
                                    event.target.parentElement,
                                    "Splice heat factor");
                                if (defaultsButtons && MaterialMatrix.defaults[newMatrix.matrix[profileIngoing].type][newMatrix.matrix[profileOutgoing].type]) {
                                    let defaultHeatFactor = MaterialMatrix.defaults[newMatrix.matrix[profileIngoing].type][newMatrix.matrix[profileOutgoing].type].heatFactor;
                                    document.getElementById("heatFactor1Default").style.display = (newMatrix.matrix[profileIngoing].combinations[profileOutgoing].heatFactor === defaultHeatFactor) ? "none" : "";
                                }
                            }
                        })
                    ])
                ])
            ]),
            m("tr", [
                m("th", [
                    m("label.tooltip[for='compressionFactor1']", {
                        "data-tooltip": tooltips.compressionFactor
                    }, "Compression Factor"),
                    (defaultsButtons ? m("button.useMaterialDefault#compressionFactor1Default", {
                        style: {
                            display: (!MaterialMatrix.defaults[newMatrix.matrix[profileIngoing].type][newMatrix.matrix[profileOutgoing].type]
                                || newMatrix.matrix[profileIngoing].combinations[profileOutgoing].compressionFactor === MaterialMatrix.defaults[newMatrix.matrix[profileIngoing].type][newMatrix.matrix[profileOutgoing].type].compressionFactor) ? "none" : ""
                        },
                        onclick: function (event) {
                            let defaultCompressionFactor = MaterialMatrix.defaults[newMatrix.matrix[profileIngoing].type][newMatrix.matrix[profileOutgoing].type].compressionFactor;
                            newMatrix.matrix[profileIngoing].combinations[profileOutgoing].compressionFactor = defaultCompressionFactor;
                            document.getElementById("compressionFactor1").value = defaultCompressionFactor;
                            event.target.style.display = "none";
                        }
                    }) : [])
                ]),
                m("td", [
                    m("div.formError", [
                        m("input#compressionFactor1.formInput", {
                            value: newMatrix.matrix[profileIngoing].combinations[profileOutgoing].compressionFactor || "0",
                            oninput: function (event) {
                                newMatrix.matrix[profileIngoing].combinations[profileOutgoing].compressionFactor = FormValidation.validateNumberInput(
                                    event.target.value,
                                    0,
                                    0, allowZero,
                                    15, true,
                                    true,
                                    event.target.parentElement,
                                    "Splice compression factor");
                                if (defaultsButtons && MaterialMatrix.defaults[newMatrix.matrix[profileIngoing].type][newMatrix.matrix[profileOutgoing].type]) {
                                    let defaultCompressionFactor = MaterialMatrix.defaults[newMatrix.matrix[profileIngoing].type][newMatrix.matrix[profileOutgoing].type].compressionFactor;
                                    document.getElementById("compressionFactor1Default").style.display = (newMatrix.matrix[profileIngoing].combinations[profileOutgoing].compressionFactor === defaultCompressionFactor) ? "none" : "";
                                }
                            }
                        })
                    ])
                ])
            ]),
            m("tr", [
                m("th", [
                    m("span.tooltip", {
                        "data-tooltip": tooltips.reverseSplicing
                    }, "Reverse Splicing"),
                    (defaultsButtons ? m("button.useMaterialDefault#reverse1Default", {
                        style: {
                            display: (!MaterialMatrix.defaults[newMatrix.matrix[profileIngoing].type][newMatrix.matrix[profileOutgoing].type]
                                || newMatrix.matrix[profileIngoing].combinations[profileOutgoing].reverse === MaterialMatrix.defaults[newMatrix.matrix[profileIngoing].type][newMatrix.matrix[profileOutgoing].type].reverse) ? "none" : ""
                        },
                        onclick: function (event) {
                            let defaultReverse = MaterialMatrix.defaults[newMatrix.matrix[profileIngoing].type][newMatrix.matrix[profileOutgoing].type].reverse;
                            newMatrix.matrix[profileIngoing].combinations[profileOutgoing].reverse = defaultReverse;
                            document.getElementById("reverse1").checked = defaultReverse;
                            event.target.style.display = "none";
                        }
                    }) : [])
                ]),
                m("td", [
                    m("div.formError", [
                        m("div.checkboxGroup", [
                            m("input#reverse1[type='checkbox']", {
                                checked: newMatrix.matrix[profileIngoing].combinations[profileOutgoing].reverse,
                                onclick: function (event) {
                                    newMatrix.matrix[profileIngoing].combinations[profileOutgoing].reverse = event.target.checked;
                                    if (defaultsButtons && MaterialMatrix.defaults[newMatrix.matrix[profileIngoing].type][newMatrix.matrix[profileOutgoing].type]) {
                                        let defaultReverse = MaterialMatrix.defaults[newMatrix.matrix[profileIngoing].type][newMatrix.matrix[profileOutgoing].type].reverse;
                                        document.getElementById("reverse1Default").style.display = (newMatrix.matrix[profileIngoing].combinations[profileOutgoing].reverse === defaultReverse) ? "none" : "";
                                    }
                                }
                            }),
                            m("label[for='reverse1']", "Use reverse splicing")
                        ])
                    ])
                ])
            ]),
            (profileIngoing === profileOutgoing ? [] : [
                m("tr", [
                    m("th", {
                        colspan: 2
                    }, [
                        m("h3", profileOutgoingDisplayName + " (ingoing) to " + profileIngoingDisplayName + " (outgoing)")
                    ])
                ]),
                m("tr", [
                    m("th", [
                        m("label.tooltip[for='heatFactor2']", {
                            "data-tooltip": tooltips.heatFactor
                        }, "Heat Factor"),
                        (defaultsButtons ? m("button.useMaterialDefault#heatFactor2Default", {
                            style: {
                                display: (!MaterialMatrix.defaults[newMatrix.matrix[profileOutgoing].type][newMatrix.matrix[profileIngoing].type]
                                    || newMatrix.matrix[profileOutgoing].combinations[profileIngoing].heatFactor === MaterialMatrix.defaults[newMatrix.matrix[profileOutgoing].type][newMatrix.matrix[profileIngoing].type].heatFactor) ? "none" : ""
                            },
                            onclick: function (event) {
                                let defaultHeatFactor = MaterialMatrix.defaults[newMatrix.matrix[profileOutgoing].type][newMatrix.matrix[profileIngoing].type].heatFactor;
                                newMatrix.matrix[profileOutgoing].combinations[profileIngoing].heatFactor = defaultHeatFactor;
                                document.getElementById("heatFactor2").value = defaultHeatFactor;
                                event.target.style.display = "none";
                            }
                        }) : [])
                    ]),
                    m("td", [
                        m("div.formError", [
                            m("input#heatFactor2.formInput", {
                                value: newMatrix.matrix[profileOutgoing].combinations[profileIngoing].heatFactor || "0",
                                oninput: function (event) {
                                    newMatrix.matrix[profileOutgoing].combinations[profileIngoing].heatFactor = FormValidation.validateNumberInput(
                                        event.target.value,
                                        0,
                                        0, allowZero,
                                        15, true,
                                        true,
                                        event.target.parentElement,
                                        "Splice heat factor");
                                    if (defaultsButtons && MaterialMatrix.defaults[newMatrix.matrix[profileOutgoing].type][newMatrix.matrix[profileIngoing].type]) {
                                        let defaultHeatFactor = MaterialMatrix.defaults[newMatrix.matrix[profileOutgoing].type][newMatrix.matrix[profileIngoing].type].heatFactor;
                                        document.getElementById("heatFactor2Default").style.display = (newMatrix.matrix[profileOutgoing].combinations[profileIngoing].heatFactor === defaultHeatFactor) ? "none" : "";
                                    }
                                }
                            })
                        ])
                    ])
                ]),
                m("tr", [
                    m("th", [
                        m("label.tooltip[for='compressionFactor2']", {
                            "data-tooltip": tooltips.compressionFactor
                        }, "Compression Factor"),
                        (defaultsButtons ? m("button.useMaterialDefault#compressionFactor2Default", {
                            style: {
                                display: (!MaterialMatrix.defaults[newMatrix.matrix[profileOutgoing].type][newMatrix.matrix[profileIngoing].type]
                                    || newMatrix.matrix[profileOutgoing].combinations[profileIngoing].compressionFactor === MaterialMatrix.defaults[newMatrix.matrix[profileOutgoing].type][newMatrix.matrix[profileIngoing].type].compressionFactor) ? "none" : ""
                            },
                            onclick: function (event) {
                                let defaultCompressionFactor = MaterialMatrix.defaults[newMatrix.matrix[profileOutgoing].type][newMatrix.matrix[profileIngoing].type].compressionFactor;
                                newMatrix.matrix[profileOutgoing].combinations[profileIngoing].compressionFactor = defaultCompressionFactor;
                                document.getElementById("compressionFactor2").value = defaultCompressionFactor;
                                event.target.style.display = "none";
                            }
                        }) : [])
                    ]),
                    m("td", [
                        m("div.formError", [
                            m("input.formInput", {
                                value: newMatrix.matrix[profileOutgoing].combinations[profileIngoing].compressionFactor || "0",
                                oninput: function (event) {
                                    newMatrix.matrix[profileOutgoing].combinations[profileIngoing].compressionFactor = FormValidation.validateNumberInput(
                                        event.target.value,
                                        0,
                                        0, allowZero,
                                        15, true,
                                        true,
                                        event.target.parentElement,
                                        "Splice compression factor");
                                    if (defaultsButtons && MaterialMatrix.defaults[newMatrix.matrix[profileOutgoing].type][newMatrix.matrix[profileIngoing].type]) {
                                        let defaultCompressionFactor = MaterialMatrix.defaults[newMatrix.matrix[profileOutgoing].type][newMatrix.matrix[profileIngoing].type].compressionFactor;
                                        document.getElementById("compressionFactor2Default").style.display = (newMatrix.matrix[profileOutgoing].combinations[profileIngoing].compressionFactor === defaultCompressionFactor) ? "none" : "";
                                    }
                                }
                            })
                        ])
                    ])
                ]),
                m("tr", [
                    m("th", [
                        m("span.tooltip", {
                            "data-tooltip": tooltips.reverseSplicing
                        }, "Reverse Splicing"),
                        (defaultsButtons ? m("button.useMaterialDefault#reverse2Default", {
                            style: {
                                display: (!MaterialMatrix.defaults[newMatrix.matrix[profileOutgoing].type][newMatrix.matrix[profileIngoing].type]
                                    || newMatrix.matrix[profileOutgoing].combinations[profileIngoing].reverse === MaterialMatrix.defaults[newMatrix.matrix[profileOutgoing].type][newMatrix.matrix[profileIngoing].type].reverse) ? "none" : ""
                            },
                            onclick: function (event) {
                                let defaultReverse = MaterialMatrix.defaults[newMatrix.matrix[profileOutgoing].type][newMatrix.matrix[profileIngoing].type].reverse;
                                newMatrix.matrix[profileOutgoing].combinations[profileIngoing].reverse = defaultReverse;
                                document.getElementById("reverse2").checked = defaultReverse;
                                event.target.style.display = "none";
                            }
                        }) : [])
                    ]),
                    m("td", [
                        m("div.formError", [
                            m("div.checkboxGroup", [
                                m("input#reverse2[type='checkbox']", {
                                    checked: newMatrix.matrix[profileOutgoing].combinations[profileIngoing].reverse,
                                    onclick: function (event) {
                                        newMatrix.matrix[profileOutgoing].combinations[profileIngoing].reverse = event.target.checked;
                                        if (defaultsButtons && MaterialMatrix.defaults[newMatrix.matrix[profileOutgoing].type][newMatrix.matrix[profileIngoing].type]) {
                                            let defaultReverse = MaterialMatrix.defaults[newMatrix.matrix[profileOutgoing].type][newMatrix.matrix[profileIngoing].type].reverse;
                                            document.getElementById("reverse2Default").style.display = (newMatrix.matrix[profileOutgoing].combinations[profileIngoing].reverse === defaultReverse) ? "none" : "";
                                        }
                                    }
                                }),
                                m("label[for='reverse2']", "Use reverse splicing")
                            ])
                        ])
                    ])
                ])
            ])
        ])
    }

    if (MaterialMatrix.isDefaultProfile(profileName) || !isNew) {
        renderSecondView();
    } else {
        renderFirstView();
    }

    modalWindow.style.display = "block";
    setTimeout(function () {
        modalWindow.style.opacity = 1;
        modalWindow.style.pointerEvents = "auto";
    }, 10);

}

function validateAndSaveChanges(newMatrix, isNew) {

    let validationErrorsExist = false;

    for (let profile of Object.keys(newMatrix.matrix)) {
        if (newMatrix.matrix[profile].type !== "Other") {
            for (let combo of Object.keys(newMatrix.matrix[profile].combinations)) {
                if (newMatrix.matrix[combo].type !== "Other") {
                    if (newMatrix.matrix[profile].combinations[combo] !== null) {
                        if (newMatrix.matrix[profile].combinations[combo].heatFactor < 0) {
                            validationErrorsExist = true;
                        }
                        if (newMatrix.matrix[profile].combinations[combo].compressionFactor < 0) {
                            validationErrorsExist = true;
                        }
                    }
                }
            }
        }
    }

    if (validationErrorsExist) {
        return;
    }

    // add the profile to the global list
    MaterialMatrix.matrix = newMatrix;

    // write the config file
    config.saveMaterials();

    if (isNew) {
        dataCollection.logMaterialProfileCreation(MaterialMatrix.matrix);
    } else {
        dataCollection.logMaterialProfileEdit(MaterialMatrix.matrix);
    }

    // return to the starting view
    Postprocessor.updateMaterialDropdowns();
    closeProfileModal(true);
}

function deleteProfile(name) {

    MaterialMatrix.matrix.deleteProfile(name);
    config.saveMaterials();

    dataCollection.logMaterialProfileDelete(MaterialMatrix.matrix);

    Postprocessor.updateMaterialDropdowns();
    openModal();
}

exports.openModal = openModal;
exports.closeModal = closeModal;
