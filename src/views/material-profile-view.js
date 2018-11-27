
const m = require("mithril");

const Electron = require("electron");
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
    heatFactor: {
        P: "The amount of time spent heating filament. Each increment of 1 adds an additional 1 second to the heating time. Note that higher heating times may require slower print speeds.",
        SC: "The amount of time spent heating filament. Each increment of 1 adds an additional 0.5 seconds to the heating time. Note that higher heating times may require slower print speeds.",
        SCP: "The amount of time spent heating filament. Each increment of 1 adds an additional 0.5 seconds to the heating time. Note that higher heating times may require slower print speeds."
    },
    compressionFactor: {
        P: "The distance the two filament ends are compressed into one another. Each increment of 1 adds an additional compression of 0.6 mm to the splice.",
        SC: "The distance the two filament ends are compressed into one another. Each increment of 1 adds an additional compression of 1 mm to the splice.",
        SCP: "The distance the two filament ends are compressed into one another. Each increment of 1 adds an additional compression of 1 mm to the splice."
    },
    coolingFactor: {
        SC: "The amount of time spent cooling filament. Each increment of 1 adds an additional 1 second to the cooling time. Note that higher cooling times may require slower print speeds.",
        SCP: "The amount of time spent cooling filament. Each increment of 1 adds an additional 1 second to the cooling time. Note that higher cooling times may require slower print speeds."
    },
    reverseSplicing: "Forward splicing heats the outgoing filament and compresses the ingoing filament into it. Reverse splicing instead heats the ingoing filament and reverses the outgoing filament back into it. Reverse splicing is useful for flexible filaments (like TPU) which can buckle under compression.",
};

function getMinHeat(spliceCore) {
    if (spliceCore === MaterialMatrix.spliceCores.SC) return -8;
    if (spliceCore === MaterialMatrix.spliceCores.SCP) return -6;
    return 0;
}

function getMaxHeat(spliceCore) {
    if (spliceCore === MaterialMatrix.spliceCores.SC) return 8;
    if (spliceCore === MaterialMatrix.spliceCores.SCP) return 6;
    return 15;
}

function getMinCompression(spliceCore) {
    if (spliceCore === MaterialMatrix.spliceCores.SC) return -10;
    if (spliceCore === MaterialMatrix.spliceCores.SCP) return -10;
    return 0;
}

function getMaxCompression(spliceCore) {
    if (spliceCore === MaterialMatrix.spliceCores.SC) return 10;
    if (spliceCore === MaterialMatrix.spliceCores.SCP) return 10;
    return 15;
}

function getMinCooling(spliceCore) {
    if (spliceCore === MaterialMatrix.spliceCores.SC) return -13;
    if (spliceCore === MaterialMatrix.spliceCores.SCP) return -10;
    return 0;
}

function getMaxCooling(spliceCore) {
    if (spliceCore === MaterialMatrix.spliceCores.SC) return 13;
    if (spliceCore === MaterialMatrix.spliceCores.SCP) return 16;
    return 15;
}

let spliceCore = MaterialMatrix.spliceCores.P;

function closeMainModal(event) {
    event = event || window.event;
    if (event.type === "click" || event.keyCode === 27) {
        window.removeEventListener("keydown", closeMainModal);
        closeModal();
    }
}

function returnToMainModal() {
    openModal(spliceCore);
}

function openModal(setSpliceCore = null) {

    if (setSpliceCore) {
        spliceCore = setSpliceCore;
    } else if (PrinterProfiles.getActiveProfile()) {
        spliceCore = PrinterProfiles.getActiveProfile().getSpliceCore();
    } else {
        spliceCore = MaterialMatrix.spliceCores.P;
    }

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
                m("table", {
                    style: {
                        width: "100%"
                    }
                },[
                    m("tr", [
                        m("th", "Splicing Technology"),
                        m("td.colExpand", {
                            style: {
                                "padding-top": "5px"
                            }
                        },[
                            m("select.formSelect", {
                                onchange: function (event) {
                                    spliceCore = event.target.value;
                                    renderProfileList();
                                }
                            }, [
                                Object.keys(MaterialMatrix.spliceCores).map((core) => {
                                    return m("option", {
                                        selected: core === spliceCore,
                                        value: core,
                                    }, MaterialMatrix.spliceCoreLabels[core]);
                                })
                            ])
                        ])
                    ])
                ]),

                m("table#materials.tableHoverHighlight"),
                m("button", {
                    onclick: function () {
                        let originalName = "Custom PLA";
                        let name = originalName;
                        let counter = 2;
                        while (MaterialMatrix.globalMatrix.profileNameTaken(spliceCore, name)) {
                            name = originalName + " " + counter;
                            counter++;
                        }
                        materialProfileModal(spliceCore, name, true);
                    }
                }, "New Profile"),
            ])
        ])
    ]);

    function renderProfileList() {
        m.render(document.getElementById("materials"),
            Object.keys(MaterialMatrix.globalMatrix.matrix[spliceCore]).map((profileName) => {
                return m("tr.hoverHighlight", [
                    m("td.colExpand", profileName),
                    m("td", [
                        m("button", {
                            onclick: function () {
                                materialProfileModal(spliceCore, profileName, false);
                            }
                        }, "Edit")
                    ]),
                    m("td", [
                        m("button", {
                            disabled: MaterialMatrix.isDefaultProfile(spliceCore, profileName),
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
                                        deleteProfile(spliceCore, profileName);
                                    }
                                });
                            }
                        }, "Delete")
                    ])
                ]);
            })
        );
    }
    renderProfileList();

    modalWindow.style.display = "block";
    setTimeout(function () {
        modalWindow.style.opacity = "1";
        modalWindow.style.pointerEvents = "auto";
    }, 10);

}

function closeModal() {
    let modalWindow = document.getElementById("open-modal");
    let errors = document.getElementById("errorText");
    if (errors) {
        m.render(errors, "");
    }
    modalWindow.style.opacity = "0";
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

function materialProfileModal(spliceCore, profileName, isNew, onClose) {

    newMatrix = MaterialMatrix.globalMatrix.clone();
    if (isNew) {
        newMatrix.addEmptyProfile(spliceCore, profileName);
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
                                m("th", "Splicing Technology"),
                                m("td", {
                                    style: {
                                        width: "auto"
                                    }
                                }, [
                                    m("input.formInputDisabled", {
                                        value: MaterialMatrix.spliceCoreLabels[spliceCore],
                                        disabled: true,
                                        style: {
                                            border: "none",
                                            opacity: 1,
                                            "text-overflow": "ellipsis",
                                            "pointer-events": "none"
                                        }
                                    })
                                ])
                            ]),

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
                                                while (newMatrix.profileNameTaken(spliceCore, newName)) {
                                                    newName = name + " " + counter;
                                                    counter++;
                                                }
                                                newMatrix.renameProfile(spliceCore, profileName, newName);
                                                document.getElementById("materialName").value = newName;
                                                profileName = newName;
                                            }
                                        }, [
                                            Object.keys(MaterialMatrix.materialTypes).map((group) => {
                                                if (group === 'other') {
                                                    return m("option", {
                                                        selected: newMatrix.matrix[spliceCore][profileName].type === 'Other'
                                                    }, 'Other')
                                                }
                                                return m("optgroup", {
                                                    label: group
                                                }, MaterialMatrix.materialTypes[group].map((type) => {
                                                    return m("option", {
                                                        selected: newMatrix.matrix[spliceCore][profileName].type === type
                                                    }, type)
                                                }));
                                            })
                                        ])
                                    ] : [
                                        m("input#materialType.formInput.formInputDisabled", {
                                            value: newMatrix.matrix[spliceCore][profileName].type,
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
                                        m("input#materialName.formInput" + (MaterialMatrix.isDefaultProfile(spliceCore, profileName) ? ".formInputDisabled" : ""), {
                                            value: profileName,
                                            disabled: MaterialMatrix.isDefaultProfile(spliceCore, profileName),
                                            oninput: function (event) {
                                                let el = event.target.parentElement;
                                                let value = event.target.value.trim();
                                                if (value === "") {
                                                    document.getElementById("saveProfileButton").disabled = true;
                                                    document.getElementById("nextButton").disabled = true;
                                                    FormValidation.showValidationError(el, "Make sure you name the profile!");
                                                } else if (value !== profileName) {
                                                    let uniqueName = true;
                                                    Object.keys(newMatrix.matrix[spliceCore]).forEach(function (material) {
                                                        if (material.toLowerCase() === value.toLowerCase() && material !== profileName) {
                                                            uniqueName = false;
                                                        }
                                                    });
                                                    if (uniqueName) {
                                                        newMatrix.renameProfile(spliceCore, profileName, value);
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
                                    newMatrix.changeProfileType(spliceCore, profileName, materialType);
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
                                newMatrix.changeProfileType(spliceCore, profileName, materialType);
                                validateAndSaveChanges(spliceCore, newMatrix, isNew);
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
                                m("th", "Splicing Technology"),
                                m("td", {
                                    style: {
                                        width: "auto"
                                    }
                                }, [
                                    m("input.formInputDisabled", {
                                        value: MaterialMatrix.spliceCoreLabels[spliceCore],
                                        disabled: true,
                                        style: {
                                            border: "none",
                                            opacity: 1,
                                            "text-overflow": "ellipsis",
                                            "pointer-events": "none"
                                        }
                                    })
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
                                        Object.keys(newMatrix.matrix[spliceCore]).filter(function (material) {
                                            return newMatrix.matrix[spliceCore][profileName].combinations[material] !== null;
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
                        (MaterialMatrix.isDefaultProfile(spliceCore, profileName) ? [] : [
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
                                validateAndSaveChanges(spliceCore, newMatrix, isNew);
                            }
                        }, (isNew? "Create" : "Save"))
                    ])

                ])
            ])
        ]);
        if (newMatrix.matrix[spliceCore][profileName].combinations[profileName] !== null) {
            renderSpliceSettingsTable(profileName, profileName);
        } else {
            for (let combo of Object.keys(newMatrix.matrix[spliceCore][profileName].combinations)) {
                if (newMatrix.matrix[spliceCore][profileName].combinations[combo] !== null) {
                    renderSpliceSettingsTable(profileName, combo);
                    break;
                }
            }
        }
    }

    function renderSpliceSettingsTable(profileIngoing, profileOutgoing) {
        let defaultsButtons = newMatrix.matrix[spliceCore][profileIngoing].type !== "Other" && newMatrix.matrix[spliceCore][profileOutgoing].type !== "Other";
        let allowZero = !(profileIngoing === "Default PLA" && profileOutgoing === "Default PLA") || (spliceCore !== MaterialMatrix.spliceCores.P);
        let profileIngoingDisplayName = (profileIngoing.length > 32 ? profileIngoing.substr(0, 30) + "…" : profileIngoing);
        let profileOutgoingDisplayName = (profileOutgoing.length > 32 ? profileOutgoing.substr(0, 30) + "…" : profileOutgoing);
        let heatingMin = getMinHeat(spliceCore);
        let heatingMax = getMaxHeat(spliceCore);
        let compressionMin = getMinCompression(spliceCore);
        let compressionMax = getMaxCompression(spliceCore);
        let coolingMin = getMinCooling(spliceCore);
        let coolingMax = getMaxCooling(spliceCore);
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
                        "data-tooltip": tooltips.heatFactor[spliceCore]
                    }, "Heat Factor"),
                    (defaultsButtons ? m("button.useMaterialDefault#heatFactor1Default", {
                        style: {
                            display: (!MaterialMatrix.defaults[spliceCore][newMatrix.matrix[spliceCore][profileIngoing].type][newMatrix.matrix[spliceCore][profileOutgoing].type]
                                || newMatrix.matrix[spliceCore][profileIngoing].combinations[profileOutgoing].heatFactor === MaterialMatrix.defaults[spliceCore][newMatrix.matrix[spliceCore][profileIngoing].type][newMatrix.matrix[spliceCore][profileOutgoing].type].heatFactor) ? "none" : ""
                        },
                        onclick: function (event) {
                            let defaultHeatFactor = MaterialMatrix.defaults[spliceCore][newMatrix.matrix[spliceCore][profileIngoing].type][newMatrix.matrix[spliceCore][profileOutgoing].type].heatFactor;
                            newMatrix.matrix[spliceCore][profileIngoing].combinations[profileOutgoing].heatFactor = defaultHeatFactor;
                            document.getElementById("heatFactor1").value = defaultHeatFactor;
                            event.target.style.display = "none";
                        }
                    }) : [])
                ]),
                m("td", [
                    m("div.formError", [
                        m("input#heatFactor1.formInput", {
                            value: newMatrix.matrix[spliceCore][profileIngoing].combinations[profileOutgoing].heatFactor || "0",
                            oninput: function (event) {
                                if (spliceCore === MaterialMatrix.spliceCores.P) {
                                    newMatrix.matrix[spliceCore][profileIngoing].combinations[profileOutgoing].heatFactor = FormValidation.validateNumberInput(
                                        event.target.value,
                                        0,
                                        heatingMin, allowZero,
                                        heatingMax, true,
                                        true,
                                        event.target.parentElement,
                                        "Splice heat factor");
                                } else {
                                    newMatrix.matrix[spliceCore][profileIngoing].combinations[profileOutgoing].heatFactor = FormValidation.validateIntegerInput(
                                        event.target.value,
                                        0,
                                        heatingMin, allowZero,
                                        heatingMax, true,
                                        true,
                                        event.target.parentElement,
                                        "Splice heat factor");
                                }
                                if (defaultsButtons && MaterialMatrix.defaults[spliceCore][newMatrix.matrix[spliceCore][profileIngoing].type][newMatrix.matrix[spliceCore][profileOutgoing].type]) {
                                    let defaultHeatFactor = MaterialMatrix.defaults[spliceCore][newMatrix.matrix[spliceCore][profileIngoing].type][newMatrix.matrix[spliceCore][profileOutgoing].type].heatFactor;
                                    document.getElementById("heatFactor1Default").style.display = (newMatrix.matrix[spliceCore][profileIngoing].combinations[profileOutgoing].heatFactor === defaultHeatFactor) ? "none" : "";
                                }
                            }
                        })
                    ])
                ])
            ]),
            m("tr", [
                m("th", [
                    m("label.tooltip[for='compressionFactor1']", {
                        "data-tooltip": tooltips.compressionFactor[spliceCore]
                    }, "Compression Factor"),
                    (defaultsButtons ? m("button.useMaterialDefault#compressionFactor1Default", {
                        style: {
                            display: (!MaterialMatrix.defaults[spliceCore][newMatrix.matrix[spliceCore][profileIngoing].type][newMatrix.matrix[spliceCore][profileOutgoing].type]
                                || newMatrix.matrix[spliceCore][profileIngoing].combinations[profileOutgoing].compressionFactor === MaterialMatrix.defaults[spliceCore][newMatrix.matrix[spliceCore][profileIngoing].type][newMatrix.matrix[spliceCore][profileOutgoing].type].compressionFactor) ? "none" : ""
                        },
                        onclick: function (event) {
                            let defaultCompressionFactor = MaterialMatrix.defaults[spliceCore][newMatrix.matrix[spliceCore][profileIngoing].type][newMatrix.matrix[spliceCore][profileOutgoing].type].compressionFactor;
                            newMatrix.matrix[spliceCore][profileIngoing].combinations[profileOutgoing].compressionFactor = defaultCompressionFactor;
                            document.getElementById("compressionFactor1").value = defaultCompressionFactor;
                            event.target.style.display = "none";
                        }
                    }) : [])
                ]),
                m("td", [
                    m("div.formError", [
                        m("input#compressionFactor1.formInput", {
                            value: newMatrix.matrix[spliceCore][profileIngoing].combinations[profileOutgoing].compressionFactor || "0",
                            oninput: function (event) {
                                if (spliceCore === MaterialMatrix.spliceCores.P) {
                                    newMatrix.matrix[spliceCore][profileIngoing].combinations[profileOutgoing].compressionFactor = FormValidation.validateNumberInput(
                                        event.target.value,
                                        0,
                                        compressionMin, allowZero,
                                        compressionMax, true,
                                        true,
                                        event.target.parentElement,
                                        "Splice compression factor");
                                } else {
                                    newMatrix.matrix[spliceCore][profileIngoing].combinations[profileOutgoing].compressionFactor = FormValidation.validateIntegerInput(
                                        event.target.value,
                                        0,
                                        compressionMin, allowZero,
                                        compressionMax, true,
                                        true,
                                        event.target.parentElement,
                                        "Splice compression factor");
                                }
                                if (defaultsButtons && MaterialMatrix.defaults[spliceCore][newMatrix.matrix[spliceCore][profileIngoing].type][newMatrix.matrix[spliceCore][profileOutgoing].type]) {
                                    let defaultCompressionFactor = MaterialMatrix.defaults[spliceCore][newMatrix.matrix[spliceCore][profileIngoing].type][newMatrix.matrix[spliceCore][profileOutgoing].type].compressionFactor;
                                    document.getElementById("compressionFactor1Default").style.display = (newMatrix.matrix[spliceCore][profileIngoing].combinations[profileOutgoing].compressionFactor === defaultCompressionFactor) ? "none" : "";
                                }
                            }
                        })
                    ])
                ])
            ]),
            (spliceCore === MaterialMatrix.spliceCores.P ? [
                m("tr", [
                    m("th", [
                        m("span.tooltip", {
                            "data-tooltip": tooltips.reverseSplicing
                        }, "Reverse Splicing"),
                        (defaultsButtons ? m("button.useMaterialDefault#reverse1Default", {
                            style: {
                                display: (!MaterialMatrix.defaults[spliceCore][newMatrix.matrix[spliceCore][profileIngoing].type][newMatrix.matrix[spliceCore][profileOutgoing].type]
                                    || newMatrix.matrix[spliceCore][profileIngoing].combinations[profileOutgoing].reverse === MaterialMatrix.defaults[spliceCore][newMatrix.matrix[spliceCore][profileIngoing].type][newMatrix.matrix[spliceCore][profileOutgoing].type].reverse) ? "none" : ""
                            },
                            onclick: function (event) {
                                let defaultReverse = MaterialMatrix.defaults[spliceCore][newMatrix.matrix[spliceCore][profileIngoing].type][newMatrix.matrix[spliceCore][profileOutgoing].type].reverse;
                                newMatrix.matrix[spliceCore][profileIngoing].combinations[profileOutgoing].reverse = defaultReverse;
                                document.getElementById("reverse1").checked = defaultReverse;
                                event.target.style.display = "none";
                            }
                        }) : [])
                    ]),
                    m("td", [
                        m("div.formError", [
                            m("div.checkboxGroup", [
                                m("input#reverse1[type='checkbox']", {
                                    checked: newMatrix.matrix[spliceCore][profileIngoing].combinations[profileOutgoing].reverse,
                                    onclick: function (event) {
                                        newMatrix.matrix[spliceCore][profileIngoing].combinations[profileOutgoing].reverse = event.target.checked;
                                        if (defaultsButtons && MaterialMatrix.defaults[spliceCore][newMatrix.matrix[spliceCore][profileIngoing].type][newMatrix.matrix[spliceCore][profileOutgoing].type]) {
                                            let defaultReverse = MaterialMatrix.defaults[spliceCore][newMatrix.matrix[spliceCore][profileIngoing].type][newMatrix.matrix[spliceCore][profileOutgoing].type].reverse;
                                            document.getElementById("reverse1Default").style.display = (newMatrix.matrix[spliceCore][profileIngoing].combinations[profileOutgoing].reverse === defaultReverse) ? "none" : "";
                                        }
                                    }
                                }),
                                m("label[for='reverse1']", "Use reverse splicing")
                            ])
                        ])
                    ])
                ])
            ] : [
                m("tr", [
                    m("th", [
                        m("label.tooltip[for='coolingFactor1']", {
                            "data-tooltip": tooltips.coolingFactor[spliceCore]
                        }, "Cooling Factor"),
                        (defaultsButtons ? m("button.useMaterialDefault#coolingFactor1Default", {
                            style: {
                                display: (!MaterialMatrix.defaults[spliceCore][newMatrix.matrix[spliceCore][profileIngoing].type][newMatrix.matrix[spliceCore][profileOutgoing].type]
                                    || newMatrix.matrix[spliceCore][profileIngoing].combinations[profileOutgoing].coolingFactor === MaterialMatrix.defaults[spliceCore][newMatrix.matrix[spliceCore][profileIngoing].type][newMatrix.matrix[spliceCore][profileOutgoing].type].coolingFactor) ? "none" : ""
                            },
                            onclick: function (event) {
                                let defaultCoolingFactor = MaterialMatrix.defaults[spliceCore][newMatrix.matrix[spliceCore][profileIngoing].type][newMatrix.matrix[spliceCore][profileOutgoing].type].coolingFactor;
                                newMatrix.matrix[spliceCore][profileIngoing].combinations[profileOutgoing].coolingFactor = defaultCoolingFactor;
                                document.getElementById("coolingFactor1").value = defaultCoolingFactor;
                                event.target.style.display = "none";
                            }
                        }) : [])
                    ]),
                    m("td", [
                        m("div.formError", [
                            m("input#coolingFactor1.formInput", {
                                value: newMatrix.matrix[spliceCore][profileIngoing].combinations[profileOutgoing].coolingFactor || "0",
                                oninput: function (event) {
                                    newMatrix.matrix[spliceCore][profileIngoing].combinations[profileOutgoing].coolingFactor = FormValidation.validateIntegerInput(
                                        event.target.value,
                                        0,
                                        coolingMin, allowZero,
                                        coolingMax, true,
                                        true,
                                        event.target.parentElement,
                                        "Splice cooling factor");
                                    if (defaultsButtons && MaterialMatrix.defaults[spliceCore][newMatrix.matrix[spliceCore][profileIngoing].type][newMatrix.matrix[spliceCore][profileOutgoing].type]) {
                                        let defaultCoolingFactor = MaterialMatrix.defaults[spliceCore][newMatrix.matrix[spliceCore][profileIngoing].type][newMatrix.matrix[spliceCore][profileOutgoing].type].coolingFactor;
                                        document.getElementById("coolingFactor1Default").style.display = (newMatrix.matrix[spliceCore][profileIngoing].combinations[profileOutgoing].coolingFactor === defaultCoolingFactor) ? "none" : "";
                                    }
                                }
                            })
                        ])
                    ])
                ]),
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
                            "data-tooltip": tooltips.heatFactor[spliceCore]
                        }, "Heat Factor"),
                        (defaultsButtons ? m("button.useMaterialDefault#heatFactor2Default", {
                            style: {
                                display: (!MaterialMatrix.defaults[spliceCore][newMatrix.matrix[spliceCore][profileOutgoing].type][newMatrix.matrix[spliceCore][profileIngoing].type]
                                    || newMatrix.matrix[spliceCore][profileOutgoing].combinations[profileIngoing].heatFactor === MaterialMatrix.defaults[spliceCore][newMatrix.matrix[spliceCore][profileOutgoing].type][newMatrix.matrix[spliceCore][profileIngoing].type].heatFactor) ? "none" : ""
                            },
                            onclick: function (event) {
                                let defaultHeatFactor = MaterialMatrix.defaults[spliceCore][newMatrix.matrix[spliceCore][profileOutgoing].type][newMatrix.matrix[spliceCore][profileIngoing].type].heatFactor;
                                newMatrix.matrix[spliceCore][profileOutgoing].combinations[profileIngoing].heatFactor = defaultHeatFactor;
                                document.getElementById("heatFactor2").value = defaultHeatFactor;
                                event.target.style.display = "none";
                            }
                        }) : [])
                    ]),
                    m("td", [
                        m("div.formError", [
                            m("input#heatFactor2.formInput", {
                                value: newMatrix.matrix[spliceCore][profileOutgoing].combinations[profileIngoing].heatFactor || "0",
                                oninput: function (event) {
                                    if (spliceCore === MaterialMatrix.spliceCores.P) {
                                        newMatrix.matrix[spliceCore][profileOutgoing].combinations[profileIngoing].heatFactor = FormValidation.validateNumberInput(
                                            event.target.value,
                                            0,
                                            heatingMin, allowZero,
                                            heatingMax, true,
                                            true,
                                            event.target.parentElement,
                                            "Splice heat factor");
                                    } else {
                                        newMatrix.matrix[spliceCore][profileOutgoing].combinations[profileIngoing].heatFactor = FormValidation.validateIntegerInput(
                                            event.target.value,
                                            0,
                                            heatingMin, allowZero,
                                            heatingMax, true,
                                            true,
                                            event.target.parentElement,
                                            "Splice heat factor");
                                    }
                                    if (defaultsButtons && MaterialMatrix.defaults[spliceCore][newMatrix.matrix[spliceCore][profileOutgoing].type][newMatrix.matrix[spliceCore][profileIngoing].type]) {
                                        let defaultHeatFactor = MaterialMatrix.defaults[spliceCore][newMatrix.matrix[spliceCore][profileOutgoing].type][newMatrix.matrix[spliceCore][profileIngoing].type].heatFactor;
                                        document.getElementById("heatFactor2Default").style.display = (newMatrix.matrix[spliceCore][profileOutgoing].combinations[profileIngoing].heatFactor === defaultHeatFactor) ? "none" : "";
                                    }
                                }
                            })
                        ])
                    ])
                ]),
                m("tr", [
                    m("th", [
                        m("label.tooltip[for='compressionFactor2']", {
                            "data-tooltip": tooltips.compressionFactor[spliceCore]
                        }, "Compression Factor"),
                        (defaultsButtons ? m("button.useMaterialDefault#compressionFactor2Default", {
                            style: {
                                display: (!MaterialMatrix.defaults[spliceCore][newMatrix.matrix[spliceCore][profileOutgoing].type][newMatrix.matrix[spliceCore][profileIngoing].type]
                                    || newMatrix.matrix[spliceCore][profileOutgoing].combinations[profileIngoing].compressionFactor === MaterialMatrix.defaults[spliceCore][newMatrix.matrix[spliceCore][profileOutgoing].type][newMatrix.matrix[spliceCore][profileIngoing].type].compressionFactor) ? "none" : ""
                            },
                            onclick: function (event) {
                                let defaultCompressionFactor = MaterialMatrix.defaults[spliceCore][newMatrix.matrix[spliceCore][profileOutgoing].type][newMatrix.matrix[spliceCore][profileIngoing].type].compressionFactor;
                                newMatrix.matrix[spliceCore][profileOutgoing].combinations[profileIngoing].compressionFactor = defaultCompressionFactor;
                                document.getElementById("compressionFactor2").value = defaultCompressionFactor;
                                event.target.style.display = "none";
                            }
                        }) : [])
                    ]),
                    m("td", [
                        m("div.formError", [
                            m("input.formInput", {
                                value: newMatrix.matrix[spliceCore][profileOutgoing].combinations[profileIngoing].compressionFactor || "0",
                                oninput: function (event) {
                                    if (spliceCore === MaterialMatrix.spliceCores.P) {
                                        newMatrix.matrix[spliceCore][profileOutgoing].combinations[profileIngoing].compressionFactor = FormValidation.validateNumberInput(
                                            event.target.value,
                                            0,
                                            compressionMin, allowZero,
                                            compressionMax, true,
                                            true,
                                            event.target.parentElement,
                                            "Splice compression factor");
                                    } else {
                                        newMatrix.matrix[spliceCore][profileOutgoing].combinations[profileIngoing].compressionFactor = FormValidation.validateIntegerInput(
                                            event.target.value,
                                            0,
                                            compressionMin, allowZero,
                                            compressionMax, true,
                                            true,
                                            event.target.parentElement,
                                            "Splice compression factor");
                                    }
                                    if (defaultsButtons && MaterialMatrix.defaults[spliceCore][newMatrix.matrix[spliceCore][profileOutgoing].type][newMatrix.matrix[spliceCore][profileIngoing].type]) {
                                        let defaultCompressionFactor = MaterialMatrix.defaults[spliceCore][newMatrix.matrix[spliceCore][profileOutgoing].type][newMatrix.matrix[spliceCore][profileIngoing].type].compressionFactor;
                                        document.getElementById("compressionFactor2Default").style.display = (newMatrix.matrix[spliceCore][profileOutgoing].combinations[profileIngoing].compressionFactor === defaultCompressionFactor) ? "none" : "";
                                    }
                                }
                            })
                        ])
                    ])
                ]),
                (spliceCore === MaterialMatrix.spliceCores.P ? [
                    m("tr", [
                        m("th", [
                            m("span.tooltip", {
                                "data-tooltip": tooltips.reverseSplicing
                            }, "Reverse Splicing"),
                            (defaultsButtons ? m("button.useMaterialDefault#reverse2Default", {
                                style: {
                                    display: (!MaterialMatrix.defaults[spliceCore][newMatrix.matrix[spliceCore][profileOutgoing].type][newMatrix.matrix[spliceCore][profileIngoing].type]
                                        || newMatrix.matrix[spliceCore][profileOutgoing].combinations[profileIngoing].reverse === MaterialMatrix.defaults[spliceCore][newMatrix.matrix[spliceCore][profileOutgoing].type][newMatrix.matrix[spliceCore][profileIngoing].type].reverse) ? "none" : ""
                                },
                                onclick: function (event) {
                                    let defaultReverse = MaterialMatrix.defaults[spliceCore][newMatrix.matrix[spliceCore][profileOutgoing].type][newMatrix.matrix[spliceCore][profileIngoing].type].reverse;
                                    newMatrix.matrix[spliceCore][profileOutgoing].combinations[profileIngoing].reverse = defaultReverse;
                                    document.getElementById("reverse2").checked = defaultReverse;
                                    event.target.style.display = "none";
                                }
                            }) : [])
                        ]),
                        m("td", [
                            m("div.formError", [
                                m("div.checkboxGroup", [
                                    m("input#reverse2[type='checkbox']", {
                                        checked: newMatrix.matrix[spliceCore][profileOutgoing].combinations[profileIngoing].reverse,
                                        onclick: function (event) {
                                            newMatrix.matrix[spliceCore][profileOutgoing].combinations[profileIngoing].reverse = event.target.checked;
                                            if (defaultsButtons && MaterialMatrix.defaults[spliceCore][newMatrix.matrix[spliceCore][profileOutgoing].type][newMatrix.matrix[spliceCore][profileIngoing].type]) {
                                                let defaultReverse = MaterialMatrix.defaults[spliceCore][newMatrix.matrix[spliceCore][profileOutgoing].type][newMatrix.matrix[spliceCore][profileIngoing].type].reverse;
                                                document.getElementById("reverse2Default").style.display = (newMatrix.matrix[spliceCore][profileOutgoing].combinations[profileIngoing].reverse === defaultReverse) ? "none" : "";
                                            }
                                        }
                                    }),
                                    m("label[for='reverse2']", "Use reverse splicing")
                                ])
                            ])
                        ])
                    ])
                ] : [
                    m("tr", [
                        m("th", [
                            m("label.tooltip[for='coolingFactor2']", {
                                "data-tooltip": tooltips.coolingFactor[spliceCore]
                            }, "Cooling Factor"),
                            (defaultsButtons ? m("button.useMaterialDefault#coolingFactor2Default", {
                                style: {
                                    display: (!MaterialMatrix.defaults[spliceCore][newMatrix.matrix[spliceCore][profileOutgoing].type][newMatrix.matrix[spliceCore][profileIngoing].type]
                                        || newMatrix.matrix[spliceCore][profileOutgoing].combinations[profileIngoing].coolingFactor === MaterialMatrix.defaults[spliceCore][newMatrix.matrix[spliceCore][profileOutgoing].type][newMatrix.matrix[spliceCore][profileIngoing].type].coolingFactor) ? "none" : ""
                                },
                                onclick: function (event) {
                                    let defaultCoolingFactor = MaterialMatrix.defaults[spliceCore][newMatrix.matrix[spliceCore][profileOutgoing].type][newMatrix.matrix[spliceCore][profileIngoing].type].coolingFactor;
                                    newMatrix.matrix[spliceCore][profileOutgoing].combinations[profileIngoing].coolingFactor = defaultCoolingFactor;
                                    document.getElementById("coolingFactor2").value = defaultCoolingFactor;
                                    event.target.style.display = "none";
                                }
                            }) : [])
                        ]),
                        m("td", [
                            m("div.formError", [
                                m("input#coolingFactor2.formInput", {
                                    value: newMatrix.matrix[spliceCore][profileOutgoing].combinations[profileIngoing].coolingFactor || "0",
                                    oninput: function (event) {
                                        newMatrix.matrix[spliceCore][profileOutgoing].combinations[profileIngoing].coolingFactor = FormValidation.validateIntegerInput(
                                            event.target.value,
                                            0,
                                            coolingMin, allowZero,
                                            coolingMax, true,
                                            true,
                                            event.target.parentElement,
                                            "Splice cooling factor");
                                        if (defaultsButtons && MaterialMatrix.defaults[spliceCore][newMatrix.matrix[spliceCore][profileOutgoing].type][newMatrix.matrix[spliceCore][profileIngoing].type]) {
                                            let defaultCoolingFactor = MaterialMatrix.defaults[spliceCore][newMatrix.matrix[spliceCore][profileOutgoing].type][newMatrix.matrix[spliceCore][profileIngoing].type].coolingFactor;
                                            document.getElementById("coolingFactor2Default").style.display = (newMatrix.matrix[spliceCore][profileOutgoing].combinations[profileIngoing].coolingFactor === defaultCoolingFactor) ? "none" : "";
                                        }
                                    }
                                })
                            ])
                        ])
                    ])
                ])
            ])
        ])
    }

    if (MaterialMatrix.isDefaultProfile(spliceCore, profileName) || !isNew) {
        renderSecondView();
    } else {
        renderFirstView();
    }

    modalWindow.style.display = "block";
    setTimeout(function () {
        modalWindow.style.opacity = "1";
        modalWindow.style.pointerEvents = "auto";
    }, 10);

}

function validateAndSaveChanges(spliceCore, newMatrix, isNew) {

    let validationErrorsExist = false;

    if (spliceCore === MaterialMatrix.spliceCores.P) {
        for (let profile of Object.keys(newMatrix.matrix[spliceCore])) {
            if (newMatrix.matrix[spliceCore][profile].type !== "Other") {
                for (let combo of Object.keys(newMatrix.matrix[spliceCore][profile].combinations)) {
                    if (newMatrix.matrix[spliceCore][combo].type !== "Other") {
                        if (newMatrix.matrix[spliceCore][profile].combinations[combo] !== null) {
                            if (newMatrix.matrix[spliceCore][profile].combinations[combo].heatFactor < 0) {
                                validationErrorsExist = true;
                            }
                            if (newMatrix.matrix[spliceCore][profile].combinations[combo].compressionFactor < 0) {
                                validationErrorsExist = true;
                            }
                            if (newMatrix.matrix[spliceCore][profile].combinations[combo].coolingFactor < 0) {
                                validationErrorsExist = true;
                            }
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
    MaterialMatrix.globalMatrix = newMatrix;

    // write the config file
    config.saveMaterials();

    if (isNew) {
        dataCollection.logMaterialProfileCreation(MaterialMatrix.globalMatrix);
    } else {
        dataCollection.logMaterialProfileEdit(MaterialMatrix.globalMatrix);
    }

    // return to the starting view
    Postprocessor.updateMaterialDropdowns();
    closeProfileModal(true);
}

function deleteProfile(spliceCore, name) {

    MaterialMatrix.globalMatrix.deleteProfile(spliceCore, name);
    config.saveMaterials();

    dataCollection.logMaterialProfileDelete(MaterialMatrix.globalMatrix);

    Postprocessor.updateMaterialDropdowns();
    openModal(spliceCore);
}

exports.openModal = openModal;
exports.closeModal = closeModal;
