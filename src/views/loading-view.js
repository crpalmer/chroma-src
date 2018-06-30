const Electron = require("electron");
const BrowserWindow = Electron.remote.BrowserWindow;
const m = require("mithril");

let loadingView;
let loadingBarComplete;
let loadingMessage;
let initialized = false;

const barWidth = 500;
let intervalWidth;
let currentProgress;

let mainWindow;

let inProgress = false;

function initialize() {
    mainWindow = BrowserWindow.fromId(2);
    loadingView = document.getElementById("loadingView");
    m.render(loadingView, [
        m("div#loadingBar", [
            m("div#loadingBarComplete")
        ]),
        m("div#loadingMessage")
    ]);
    loadingBarComplete = document.getElementById("loadingBarComplete");
    loadingMessage = document.getElementById("loadingMessage");
    initialized = true;
}

function startSync(segments, message) {
    if (!initialized) {
        initialize();
    }
    intervalWidth = barWidth / (segments - 1);
    inProgress = true;
    currentProgress = 0;
    loadingBarComplete.style.width = 0;
    loadingMessage.innerText = message;
    displayScreen();
}

async function start(segments, message) {
    return new Promise(function (fulfill, reject) {
        startSync(segments, message);
        setTimeout(fulfill, 0);
    });
}

function displayScreen() {
    loadingView.style.opacity = 1;
    loadingView.style.pointerEvents = "auto";
    mainWindow.setProgressBar(0);
}

function incrementSync(message) {
    currentProgress += intervalWidth;
    if (currentProgress > barWidth) {
        currentProgress = barWidth;
    }
    loadingBarComplete.style.width = Math.floor(currentProgress) + "px";
    loadingMessage.innerText = message;
    mainWindow.setProgressBar(currentProgress / barWidth);
}

async function increment(message) {
    return new Promise(function (fulfill, reject) {
        incrementSync(message);
        setTimeout(fulfill, 0);
    });
}

function done() {
    if (currentProgress < barWidth) {
        incrementSync("");
        setTimeout(dismissScreen, 50);
    } else {
        dismissScreen();
    }
}

function dismissScreen() {
    inProgress = false;
    loadingView.style.opacity = 0;
    loadingView.style.pointerEvents = "none";
    mainWindow.setProgressBar(-1);
    if (process.platform === "darwin") {
        Electron.remote.app.dock.bounce();
    }
}

module.exports.start = start;
module.exports.startSync = startSync;
module.exports.increment = increment;
module.exports.incrementSync = incrementSync;
module.exports.done = done;
module.exports.inProgress = function () {
    return inProgress;
};
