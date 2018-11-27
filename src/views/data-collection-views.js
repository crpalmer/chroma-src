
const m = require("mithril");

const Electron = require("electron");

const config = require("../config");

const learnMoreLink = "#";

let dialogOpen = false;

function showDataCollectionDialog(callback) {
    let useCB = (typeof callback === "function");
    if (global.firstRun) {
        if (useCB) {
            callback();
        }
        return;
    }
    if (global.dataCollection !== null) {
        if (useCB) {
            callback();
        }
        return;
    }
    if (global.env.dev || global.env.name === "beta") {
        if (useCB) {
            callback();
        }
        return;
    }
    dialogOpen = true;
    function handleChoice(optedIn) {
        dialogOpen = false;
        global.dataCollection = optedIn;
        config.writeConfigFile();
        Electron.ipcRenderer.send("preferences-changed", [
            ["dataCollection", global.dataCollection]
        ]);
        document.getElementById("updateNotifications").style.display = "none";
        if (useCB) {
            callback();
        }
    }
    setTimeout(function () {
        let el = document.getElementById("updateNotifications");
        m.render(el, [
            m("div#dataCollectionDialog", [
                m("h3", "May we learn about how you use Chroma and Palette?"),
                m("p", "We're proud that Chroma and Palette provide some of the most advanced multi-material capabilities in 3D printing, and we will continue to advance our products as far as we can."),
                m("p", "In order to prioritize the products and features we deliver, we want to know how you use Chroma and Palette—what’s important, what's not, and what doesn't work well. The collection of usage data allows us to measure performance and deliver features that matter."),
                m("p", "Any data that we collect is anonymous, and we will never have access to your print files."),
                m("p", "(You can always change your mind later under Preferences > Data Sharing)"),
                m("div.buttonList", {
                    style: {
                        "margin-bottom": "-10px"
                    }
                }, [
                    m("div.right", [
                        m("button.confirm", {
                            onclick: function () {
                                handleChoice(true);
                            }
                        }, "Accept"),
                        m("button", {
                            onclick: function () {
                                handleChoice(false);
                            }
                        }, "Decline")
                    ])
                ])
            ])
        ]);
        el.style.display = "block";
    }, 1500);
}

exports.learnMoreLink = learnMoreLink;
exports.showDataCollectionDialog = showDataCollectionDialog;
exports.dialogIsOpen = function () {
    return dialogOpen;
};
