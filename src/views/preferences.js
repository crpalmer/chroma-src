
const m = require("mithril");

const Electron = require("electron");
const BrowserWindow = Electron.remote.BrowserWindow;
const dialog = Electron.remote.dialog;

const config = require("../config");
const dataCollection = require("../models/data-collection");
const dataCollectionViews = require("./data-collection-views");
const menu = require("./menu");
const modalUtils = require("./modal-utils");
const Postprocessor = require("./postprocessor-view");

function mHeading(label) {
    return m("tr", [
        m("th", {
            colspan: 2
        }, [
            m("h3", {
                style: {
                    "font-weight": "bold"
                }
            }, label)
        ])
    ]);
}

let preferencesOpen = false;

function openPreferencesModal() {

    if (preferencesOpen) {
        return;
    }
    preferencesOpen = true;

    let preferences = {
        reduceMemoryUsage: global.reduceMemoryUsage,
        dataCollection: global.dataCollection,
        exportPlainMSF: global.exportPlainMSF,
        exportScreenshot: global.exportScreenshot,
        advancedMode: global.advancedMode,
        betaFeatures: global.betaFeatures,
        autoRegenerateTowers: global.autoRegenerateTowers
    };

    let updateCurrentPrint = false;

    function updatePreferences() {
        updateCurrentPrint = (preferences.advancedMode !== global.advancedMode
            || preferences.betaFeatures !== global.betaFeatures);
        global.reduceMemoryUsage = preferences.reduceMemoryUsage;
        global.dataCollection = preferences.dataCollection;
        global.exportPlainMSF = preferences.exportPlainMSF;
        global.exportScreenshot = preferences.exportScreenshot;
        global.advancedMode = preferences.advancedMode;
        global.betaFeatures = preferences.betaFeatures;
        global.autoRegenerateTowers = preferences.autoRegenerateTowers;
        config.writeConfigFile();
        Electron.ipcRenderer.send("preferences-changed", [
            ["reduceMemoryUsage", global.reduceMemoryUsage],
            ["dataCollection", global.dataCollection],
            ["exportPlainMSF", global.exportPlainMSF],
            ["exportScreenshot", global.exportScreenshot],
            ["advancedMode", global.advancedMode],
            ["betaFeatures", global.betaFeatures],
            ["autoRegenerateTowers", global.autoRegenerateTowers]
        ]);
        Postprocessor.updateColorStrengthSliders();
        dataCollection.logPreferences();
    }

    function closeModalHandler(e) {
        e.target.blur();
        if (preferences.reduceMemoryUsage !== global.reduceMemoryUsage
            || preferences.dataCollection !== global.dataCollection
            || preferences.exportPlainMSF !== global.exportPlainMSF
            || preferences.exportScreenshot !== global.exportScreenshot
            || preferences.advancedMode !== global.advancedMode
            || preferences.betaFeatures !== global.betaFeatures
            || preferences.autoRegenerateTowers !== global.autoRegenerateTowers
        ) {
            modalUtils.confirmUnsavedChangesDialog(function (choice) {
                if (choice === 0) {
                    modalUtils.closeModal();
                }
            });
        } else {
            modalUtils.closeModal();
        }
    }

    modalUtils.beforeOpenModal(function () {
        preferencesOpen = false;
        if (updateCurrentPrint && global.print) {
            window.setTimeout(Postprocessor.updateCurrentPrint, 600);
        }
    });

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
                    onclick: closeModalHandler
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
                m("h2", "Chroma Preferences"),

                m("table.preferences", {
                    style: {
                        "margin-bottom": "20px"
                    }
                }, [
                    m("tbody", [
                        mHeading("General"),
                        m("tr", [
                            m("th", "Reduce Memory Usage"),
                            m("td", [
                                m("div.checkboxGroup", [
                                    m("input[type='checkbox']#reduceMemoryUsage", {
                                        checked: preferences.reduceMemoryUsage,
                                        onclick: function (e) {
                                            preferences.reduceMemoryUsage = e.target.checked;
                                        }
                                    }),
                                    m("label[for='reduceMemoryUsage']", "Close the loaded file after processing")
                                ])
                            ])
                        ]),
                        m("tr", [
                            m("th", "Auto-Regenerate Tower"),
                            m("td", [
                                m("div.checkboxGroup.longLabel", [
                                    m("input[type='checkbox']#autoRegenerateTowers", {
                                        checked: preferences.autoRegenerateTowers,
                                        onclick: function (e) {
                                            preferences.autoRegenerateTowers = e.target.checked;
                                        }
                                    }),
                                    m("label[for='autoRegenerateTowers'].long", "Regenerate the transition tower when editing the active printer profile")
                                ])
                            ])
                        ]),
                        m("tr", [
                            m("th", "Data Sharing"),
                            m("td", [
                                m("div.checkboxGroup", [
                                    m("input[type='checkbox']#dataCollection", {
                                        checked: preferences.dataCollection,
                                        onclick: function (e) {
                                            preferences.dataCollection = e.target.checked;
                                        }
                                    }),
                                    m("label[for='dataCollection']", "Share anonymous usage data with Mosaic")
                                ]),
                                m("div.preferenceDescription", {
                                    style: {
                                        "margin-left": "25px"
                                    }
                                }, [
                                    m("p", "Allow Mosaic to collect data that will be used to improve the Palette experience. Any data that we collect is anonymous, and we will never have access to your print files.")
                                ])
                            ])
                        ]),
                        mHeading("Export Settings"),
                        m("tr", [
                            m("th", "Generate Plain MSF"),
                            m("td", [
                                m("div.checkboxGroup", [
                                    m("input[type='checkbox']#exportPlainMSF", {
                                        checked: preferences.exportPlainMSF,
                                        onclick: function (e) {
                                            preferences.exportPlainMSF = e.target.checked;
                                        }
                                    }),
                                    m("label[for='exportPlainMSF']", "Save a human-readable .msf.txt file")
                                ])
                            ])
                        ]),
                        m("tr", [
                            m("th", "Save Bed Preview"),
                            m("td", [
                                m("div.checkboxGroup", [
                                    m("input[type='checkbox']#exportScreenshot", {
                                        checked: preferences.exportScreenshot,
                                        onclick: function (e) {
                                            preferences.exportScreenshot = e.target.checked;
                                        }
                                    }),
                                    m("label[for='exportScreenshot']", "Save a screenshot of the print bed")
                                ])
                            ])
                        ]),
                        mHeading("Advanced"),
                        m("tr", [
                            m("th", "Advanced Settings"),
                            m("td", [
                                m("div.checkboxGroup", [
                                    m("input[type='checkbox']#advancedMode", {
                                        checked: preferences.advancedMode,
                                        onclick: function (e) {
                                            preferences.advancedMode = e.target.checked;
                                        }
                                    }),
                                    m("label[for='advancedMode']", "Enable advanced settings")
                                ])
                            ])
                        ]),
                        m("tr", [
                            m("th", "Beta Features"),
                            m("td", [
                                m("div.checkboxGroup", [
                                    m("input[type='checkbox']#betaFeatures", {
                                        disabled: true,
                                        checked: preferences.betaFeatures,
                                        onclick: function (e) {
                                            if (e.target.checked) {
                                                dialog.showMessageBox(BrowserWindow.fromId(2), {
                                                    type: "question",
                                                    message: "Enable Beta Features",
                                                    detail: "Beta features offer experimental improvements for Chroma and are not for the faint of heart. These features have limited documentation and are to be used at your own risk.\n\nAre you sure you wish to enable beta features?",
                                                    buttons: ["Cancel", "Continue"],
                                                    defaultId: 0,
                                                    cancelId: 0
                                                }, function (choice) {
                                                    if (choice === 1) {
                                                        preferences.betaFeatures = true;
                                                    } else {
                                                        e.target.checked = false;
                                                        preferences.betaFeatures = false;
                                                    }
                                                });
                                            } else {
                                                preferences.betaFeatures = false;
                                            }
                                        }
                                    }),
                                    m("label[for='betaFeatures']", "Enable beta features")
                                ]),
                                m("div.preferenceDescription", {
                                    style: {
                                        "margin-left": "25px"
                                    }
                                }, [
                                    m("p", "Beta features offer experimental improvements for Chroma and are not for the faint of heart. These features have limited documentation and are to be used at your own risk."),
                                    m("p", "Current beta features: None")
                                ])
                            ])
                        ]),
                        mHeading("Reset Chroma"),
                        m("tr", [
                            m("td", {
                                colspan: 2
                            }, [
                                m("button.danger", {
                                    onclick: function (e) {
                                        e.target.blur();
                                        dialog.showMessageBox(BrowserWindow.fromId(2), {
                                            type: "question",
                                            message: "Reset Application Settings",
                                            detail: "Are you sure you wish to clear the list of printer and material profiles and reset all settings?",
                                            buttons: ["Cancel", "Continue"],
                                            defaultId: 0,
                                            cancelId: 0
                                        }, function (choice) {
                                            if (choice === 1) {
                                                config.resetConfigFile();
                                                menu.reloadApp(BrowserWindow.fromId(2));
                                            }
                                        });
                                    }
                                }, "Reset App Settings..."),
                                m("div.preferenceDescription", [
                                    m("p", {
                                        style: {
                                            "margin-top": 0
                                        }
                                    }, [
                                        m("strong", "Warning:"),
                                        " this will clear the list of printer and material profiles and reset all settings!"
                                    ])
                                ])
                            ])
                        ]),
                    ])
                ]),
                m("button", {
                    onclick: closeModalHandler
                }, "Cancel"),
                m("button.confirm", {
                    style: {
                        float: "right",
                        "margin-top": "10px"
                    },
                    onclick: function (e) {
                        e.target.blur();
                        updatePreferences();
                        closeModalHandler(e);
                    }
                }, "Save")
            ])
        ])
    ]);

    modalUtils.afterOpenModal();

}

exports.openPreferencesModal = openPreferencesModal;
