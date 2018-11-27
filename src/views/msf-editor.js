const path = require("path");

const Electron = require("electron");
const BrowserWindow = Electron.remote.BrowserWindow;
const dialog = Electron.remote.dialog;

function selectMSF() {
    dialog.showOpenDialog({
        filters: [{
            name: "MSF",
            extensions: ["msf", "maf", "csf"]
        }]
    }, function (filenames) {
        if (filenames === undefined) {
            return;
        }
        openEditor(filenames[0]);
    });
}

function createMSF() {
    openEditor(false);
}

function openEditor(filepath) {

    let editor = new BrowserWindow({
        width: 450,
        height: 500,
        minWidth: 450,
        maxWidth: 450,
        minHeight: 300,
        useContentSize: true,
        resizable: true,
        title: "MSF Viewer",
        show: false
    });
    editor.setMenu(null);
    editor.on("closed", function () {
        editor = null;
    });
    if (filepath === false) {
        editor.loadURL("file://" + __dirname + "/../windows/msf.html?win=" + editor.id);
    } else {
        editor.loadURL("file://" + __dirname + "/../windows/msf.html?win=" + editor.id + "&path=" + encodeURIComponent(filepath));
    }
    editor.once("ready-to-show", function () {
        let basename = path.basename(filepath, path.extname(filepath));
        editor.setTitle((basename.length > 80 ? basename.substr(0, 80) + "..." : basename) + " — MSF Viewer");
        if (process.platform === "darwin") {
            editor.setRepresentedFilename(filepath);
        }
        editor.show();
    });

}

exports.selectMSF = selectMSF;
exports.createMSF = createMSF;
exports.openEditor = openEditor;
