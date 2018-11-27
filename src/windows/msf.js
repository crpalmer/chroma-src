(function () {

    const fs = require("fs");
    const path = require("path");
    const m = require("mithril");

    const Electron = require("electron");
    const dialog = Electron.remote.dialog;
    const webFrame = require("electron").webFrame;
    webFrame.setZoomFactor(1);
    webFrame.setVisualZoomLevelLimits(1, 1);

    const MSF = require("../models/msf");

    function getParameterByName(name, url) {
        if (!url) {
            url = window.location.href;
        }
        name = name.replace(/[\[\]]/g, "\\$&");
        let regex = new RegExp("[?&]" + name + "(=([^&#]*)|&|#|$)"),
            results = regex.exec(url);
        if (!results) return null;
        if (!results[2]) return '';
        return decodeURIComponent(results[2].replace(/\+/g, " "));
    }

    let msf = new MSF();
    let msfType = "MSF";
    msf.clearMaterials();

    let driveInfo = [];
    let materialIndexInfo = [];

    function openMSF(filepath) {
        msf = MSF.fromLines(fs.readFileSync(filepath, "utf-8").split(/\r\n|\n|\r/));
        msfType = path.extname(filepath).slice(1).toUpperCase();
    }

    function getSpliceList(msf, relativeDistances) {
        let lastSpliceDist = 0;
        let rows = [];
        for (let splice of msf.spliceList) {
            let drive = splice[0];
            let thisSpliceDist = splice[1];
            let displayDist = thisSpliceDist;
            if (relativeDistances) {
                displayDist = thisSpliceDist - lastSpliceDist;
                lastSpliceDist = thisSpliceDist;
            }
            rows.push(m("tr", [
                m("td.msf-editor-tooltip", {
                    "data-tooltip": driveInfo[drive].name
                }, drive + 1),
                m("td", displayDist)
            ]));
        }
        return rows;
    }

    function getPingList(msf, relativeDistances) {
        let lastPingDist = 0;
        let rows = [];
        for (let ping of msf.pingList) {
            let thisPingDist = ping[0];
            let displayDist = thisPingDist;
            if (relativeDistances) {
                displayDist = thisPingDist - lastPingDist;
                lastPingDist = thisPingDist;
            }
            rows.push(m("tr", [
                m("td", displayDist)
            ]));
        }
        return rows;
    }

    let queryPath = getParameterByName("path");
    if (queryPath) {
        try {
            openMSF(queryPath);
        } catch (e) {
            dialog.showMessageBox({
                type: "warning",
                message: e.message,
                detail: e.detail,
                buttons: ["OK"],
                defaultId: 0
            }, function () {});
            Electron.remote.getCurrentWindow().destroy();
        }
    }

    if (msf.version >= 1.4) {
        driveInfo = msf.materials.map(function (material, drive) {
            if (material.index === 0) {
                return {
                    used: false,
                    materialIndex: 0,
                    name: "Unused"
                };
            }
            return {
                used: true,
                materialIndex: material.index,
                name: material.name || "PLA"
            };
        });
        for (let drive of driveInfo) {
            if (drive.materialIndex > 0) {
                materialIndexInfo[drive.materialIndex] = drive.name.split(" ").pop();
            }
        }
    } else {
        driveInfo = msf.getColorsUsedLabels().map(function (label, drive) {
            return {
                used: msf.colorsUsed[drive] > 0,
                name: label
            };
        });
    }

    m.render(document.getElementById("msf-editor"), [
        m("div.msf-editor-toolbar", [
            m("div.checkboxGroup", [
                m("input[type='checkbox']#cumulativeDistances", {
                    checked: true,
                    onclick: function (e) {
                        let relative = !e.target.checked;
                        let heading = relative ? "Relative Length (mm)" : "Cumulative Length (mm)";
                        m.render(document.getElementById("spliceRows"), getSpliceList(msf, relative));
                        document.getElementById("spliceHeading").innerText = heading;
                        if (msf.pingList.length > 0) {
                            m.render(document.getElementById("pingRows"), getPingList(msf, relative));
                            document.getElementById("pingHeading").innerText = heading;
                        }
                    }
                }),
                m("label[for='cumulativeDistances']", "Display lengths as cumulative values")
            ])
        ]),
        m("table", [
            m("tbody", [
                m("tr", [
                    m("th", {
                        style: {
                            width: "150px"
                        }
                    }, msfType + " Version"),
                    m("td", msf.version.toFixed(1))
                ]),
                m("tr", [
                    m("th", "Drives Used"),
                    m("td", {
                        style: {
                            "padding-top": "3px"
                        }
                    }, [
                        m("table", [
                            (msf.version >= 1.4 ? [
                                m("tbody", [
                                    driveInfo.map(function (driveInfo, drive) {
                                        if (!driveInfo.used) {
                                            return [];
                                        }
                                        return m("tr", [
                                            m("td", {
                                                style: {
                                                    padding: 0,
                                                    "padding-left": "2px",
                                                    width: "20px"
                                                }
                                            }, drive + 1),
                                            m("td", {
                                                style: {
                                                    padding: 0
                                                }
                                            }, driveInfo.name)
                                        ]);
                                    })
                                ])
                            ] : driveInfo.map(function (driveInfo) {
                                return driveInfo.name;
                            }).join(", "))
                        ])
                    ])
                ]),
                (msfType === "MSF" ? [
                    m("tr", [
                        m("th", "Loading Offset"),
                        m("td", msf.loadingOffset)
                    ]),
                    m("tr", [
                        m("th", "Pulses Per MM"),
                        m("td", [
                            m("span", {
                                title: msf.pulsesPerMM
                            }, msf.pulsesPerMM.toFixed(4))
                        ])
                    ])
                ] : []),
                (msf.version === 1.3 ? m("tr", [
                    m("th", "Heating Factor"),
                    m("td", msf.heatFactor + "%")
                ]) : [])
            ])
        ]),

        m("h3.msf-section-collapse", {
            onclick: function (e) {
                let table = document.getElementById("spliceList");
                if (table.style.display === "none") {
                    table.style.display = null;
                    e.target.classList.remove("collapsed");
                } else {
                    table.style.display = "none";
                    e.target.classList.add("collapsed");
                }
            }
        }, "Splices (" + msf.spliceList.length + ")"),
        m("table#spliceList", [
            m("thead", [
                m("tr", [
                    m("th", {
                        style: {
                            "width": "50px"
                        }
                    }, "Drive"),
                    m("th#spliceHeading", "Cumulative Length (mm)")
                ])
            ]),
            m("tbody#spliceRows", getSpliceList(msf, false))
        ]),

        (msf.pingList.length > 0 ? [
            m("h3.msf-section-collapse.collapsed", {
                onclick: function (e) {
                    let table = document.getElementById("pingList");
                    if (table.style.display === "none") {
                        table.style.display = null;
                        e.target.classList.remove("collapsed");
                    } else {
                        table.style.display = "none";
                        e.target.classList.add("collapsed");
                    }
                }
            }, "Pings (" + msf.pingList.length + ")"),
            m("table#pingList", {
                style: {
                    display: "none"
                }
            }, [
                m("thead", [
                    m("tr", [
                        m("th#pingHeading", "Cumulative Length (mm)")
                    ])
                ]),
                m("tbody#pingRows", getPingList(msf, false))
            ]),
        ] : []),

        (msf.version >= 1.4 && msf.algorithmsList.length > 0 ? [
            m("h3.msf-section-collapse.collapsed", {
                onclick: function (e) {
                    let table = document.getElementById("algorithmsList");
                    if (table.style.display === "none") {
                        table.style.display = null;
                        e.target.classList.remove("collapsed");
                    } else {
                        table.style.display = "none";
                        e.target.classList.add("collapsed");
                    }
                }
            }, "Splice Settings (" + msf.algorithmsList.length + ")"),
            m("table#algorithmsList", {
                style: {
                    display: "none",
                    width: "auto"
                }
            }, [
                m("thead", [
                    m("tr", [
                        m("th", {
                            style: {
                                width: "1px",
                                "padding-right": "20px"
                            }
                        }, "Materials"),
                        m("th", {
                            style: {
                                width: "1px",
                                "padding-right": "20px"
                            }
                        }, "Heat"),
                        m("th", {
                            style: {
                                width: "1px",
                                "padding-right": "20px"
                            }
                        }, "Compression"),
                        m("th", {
                            style: {
                                width: "1px"
                            }
                        }, (msf.version >= 2.0 ? "Cooling" : "Direction")),
                    ])
                ]),
                m("tbody#algorithmsRows", msf.algorithmsList.map(function (algorithm) {
                    return m("tr", [
                        m("td", materialIndexInfo[algorithm.ingoing] + "–" + materialIndexInfo[algorithm.outgoing]),
                        m("td", algorithm.heatFactor),
                        m("td", algorithm.compressionFactor),
                        (msf.version >= 2.0 ? [
                            m("td", algorithm.coolingFactor)
                        ] : [
                            m("td", algorithm.reverse ? "Reverse" : "Forward")
                        ]),
                    ])
                }))
            ])
        ] : [])

    ]);

    document.ondragover = document.ondrop = function (event) {
        event.preventDefault();
    };

    document.body.ondrop = function (event) {
        event.preventDefault();
    };

})();
