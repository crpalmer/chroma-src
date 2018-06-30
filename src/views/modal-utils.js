const m = require("mithril");

const Electron = require("electron");
const BrowserWindow = Electron.remote.BrowserWindow;
const dialog = Electron.remote.dialog;

const menu = require("./menu");

let cleanup = null;

function beforeOpenModal(onClose) {
    cleanup = onClose;
    menu.disableModalActions();
    let modalWindow = document.getElementById("open-modal");
    window.addEventListener("keydown", closeModalHandler);
}

function afterOpenModal() {
    let modalWindow = document.getElementById("open-modal");
    modalWindow.style.display = "block";
    setTimeout(function () {
        modalWindow.style.opacity = 1;
        modalWindow.style.pointerEvents = "auto";
    }, 10);
}

function closeModalHandler(event) {
    if (event.keyCode === 27) {
        closeModal();
    }
}

function closeModal() {
    if (typeof cleanup === "function") {
        cleanup();
        cleanup = null;
    }
    let modalWindow = document.getElementById("open-modal");
    modalWindow.style.opacity = 0;
    modalWindow.style.pointerEvents = "none";
    setTimeout(function () {
        menu.enableModalActions();
        modalWindow.style.display = "none";
        m.render(modalWindow, []);
    }, 500);
    window.removeEventListener("keydown", closeModalHandler);
}

function confirmUnsavedChangesDialog(callback) {
    dialog.showMessageBox(BrowserWindow.fromId(2), {
        type: "warning",
        message: "Confirm Unsaved Changes",
        detail: "Your changes will be lost if you don't save them.",
        buttons: ["Don't Save", "Keep Going"],
        defaultId: 1,
        cancelId: 1
    }, callback);
}

exports.beforeOpenModal = beforeOpenModal;
exports.afterOpenModal = afterOpenModal;
exports.closeModal = closeModal;
exports.closeModalHandler = closeModalHandler;
exports.confirmUnsavedChangesDialog = confirmUnsavedChangesDialog;
