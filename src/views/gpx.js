
const ChildProcess = require("child_process");
const fs = require("fs");
const path = require("path");

const Electron = require("electron");
const app = Electron.remote.app;
const BrowserWindow = Electron.remote.BrowserWindow;
const dialog = Electron.remote.dialog;

function getGPXExecutablePath() {
    let gpxPath = "";
    if (global.env.type === "prebuilt" || global.env.type === "testing") {
        // path to GPX unpackaged resource location
        gpxPath = path.join(__dirname, "..", "..", "gpx");
        if (process.platform === "darwin") {
            gpxPath = path.join(gpxPath, "gpx-osx");
        } else if (process.platform === "win32") {
            if (process.arch === "x64") {
                gpxPath = path.join(gpxPath, "gpx-windows-x64.exe");
            } else {
                gpxPath = path.join(gpxPath, "gpx-windows-ia32.exe");
            }
        } else {
            gpxPath = path.join(gpxPath, "gpx-linux");
        }
    } else {
        // paths to (platform-specific) resource folder locations
        // app.getAppPath() resolves to:
        // - Mac:      Chroma.app/Contents/Resources/app.asar/
        // - Windows:  C:\...\Chroma\resources\app.asar\
        if (process.platform === "darwin") {
            gpxPath = path.join(app.getAppPath(), "..", "gpx", "gpx-osx");
        } else {
            gpxPath = path.join(app.getAppPath(), "..", "gpx");
            if (process.platform === "win32") {
                if (process.arch === "x64") {
                    gpxPath = path.join(gpxPath, "gpx-windows-x64.exe");
                } else {
                    gpxPath = path.join(gpxPath, "gpx-windows-ia32.exe");
                }
            } else {
                gpxPath = path.join(gpxPath, "gpx-linux");
            }
        }
    }
    return gpxPath;
}

function checkGPXConfigMissing(printer) {
    if (printer.postprocessing === "x3g" && printer.gpxProfile === "ini" && !fs.existsSync(printer.gpxConfigPath)) {
        dialog.showMessageBox(BrowserWindow.fromId(2), {
            type: "warning",
            message: "GPX Config File Missing",
            detail: "The config file path in your printer profile could not be located. Please move the file back into place or edit your profile and re-select it.",
            buttons: ["OK"],
            defaultId: 0
        }, function () {});
        return true;
    }
    return false;
}

function filterGPXErrors(stderr) {
    const lines = stderr.split("\n");
    const errors = [];
    for (let line of lines) {
        const trimmedLine = line.trim();
        if (trimmedLine !== ""
            && trimmedLine !== "GPX 2.5.2"
            && !trimmedLine.includes("All rights reserved")
            && !trimmedLine.includes("Additional changes Copyright")
            && !trimmedLine.includes("For usage information:")
            && !trimmedLine.match(/^\(line \d+\) Syntax warning:/)
            && !trimmedLine.match(/^\(line \d+\) warning/)
            && !trimmedLine.match(/^current position defined as/)
        ) {
            errors.push(trimmedLine);
        }
    }
    return errors;
}

function runGPX(gpxProfile, gpxConfigPath, inputPath, outputPath) {
    let gpxPath = getGPXExecutablePath();
    let args = ["-p"];
    if (gpxProfile === "ini") {
        args.push("-c");
        args.push(gpxConfigPath);
    } else {
        args.push("-m");
        args.push(gpxProfile);
    }
    args.push(inputPath);
    args.push(outputPath);
    if (global.env.dev) {
        console.log("GPX args: " + args.join(" "));
        console.log(args);
    }
    let gpxErrors = "";
    let gpx = ChildProcess.spawn(gpxPath, args);
    gpx.stdout.setEncoding('ascii');
    gpx.stderr.setEncoding('ascii');
    gpx.on("error", function (err) {
        if (global.env.dev) {
            console.log(err);
        }
        dialog.showMessageBox(BrowserWindow.fromId(2), {
            type: "warning",
            message: "GPX Error",
            detail: "An error occurred trying to run GPX on your output.",
            buttons: ["OK"],
            defaultId: 0
        }, function () {});
    });
    gpx.stderr.on("data", function (data) {
        gpxErrors += data;
    });
    gpx.on("exit", function (code, /* signal */) {
        let gpxErrorLines = filterGPXErrors(gpxErrors);
        if (global.env.dev) {
            console.log("exit code: " + code);
            console.log(gpxErrorLines);
        }
        if (gpxErrorLines.length > 1) {
            dialog.showMessageBox(BrowserWindow.fromId(2), {
                type: "warning",
                message: "GPX Errors",
                detail: gpxErrorLines.map((err) => ("- " + err)).join("\n"),
                buttons: ["OK"],
                defaultId: 0
            }, function () {});
        } else if (gpxErrorLines.length > 0) {
            dialog.showMessageBox(BrowserWindow.fromId(2), {
                type: "warning",
                message: "GPX Error",
                detail: gpxErrorLines[0],
                buttons: ["OK"],
                defaultId: 0
            }, function () {});
        }
    });
}

exports.checkGPXConfigMissing = checkGPXConfigMissing;
exports.runGPX = runGPX;
