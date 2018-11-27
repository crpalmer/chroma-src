
const fs = require("fs");
const yaml = require("js-yaml");
const path = require("path");
const Raft = require("raft-js");

const appVersion = require("../package.json").version;
const MaterialMatrix = require("../models/material-matrix");
const Print = require("../models/print");
const Printer = require("../models/printer");

let program = require("commander");

let debug = false;
let printerProfile = null;
let printExtruder = 0;
let globalMatrix = null;
let driveColors = [1, 1, 1, 1];
let driveMaterials = [null, null, null, null];
let inputPath = null;
let outputPath = null;

function loadYML(ymlPath) {
    return yaml.load(fs.readFileSync(ymlPath).toString());
}

function parseArgs() {

    function list(val) {
        return val.split(":").map(function (item) {
            if (item[0] === "\"" && item.slice(-1) === "\"") {
                return item.trim("\"");
            }
            if (item[0] === "'" && item.slice(-1) === "'") {
                return item.trim("'");
            }
            return item;
        });
    }

    program
        .version(appVersion)
        .usage("[options] --printer <path-to-profile> <path-to-input-file> <path-to-output-file>")
        .option("-d, --debug",                      "print debug information to stdout")
        .option("--printer <path>",                 "printer profile to be used")
        .option("--plain-msf",                      "include a Plain MSF as output")
        .option("--materials <path>",               "use a custom material matrix file")
        .option("--print-extruder <n>",             "toolhead to use for printing (multi-extruder only)", parseInt)
        .option("--drive-colors <x:x[:x[:x]]>",     "numbers for drive colors", list)
        .option("--drive-materials <x:x[:x[:x]]>",  "material names for each drive", list)
    ;

    program.on("--help", function () {
        console.log("");
        console.log("  If running in OEM mode, <path-to-output-file> will be the location of the");
        console.log("  single output file (e.g. X.oem.gcode). If running in non-OEM mode,");
        console.log("  <path-to-output-file> will be the location of the output MSF, and the output");
        console.log("  print file (e.g. X.msf.gcode) will be automatically created based on input");
        console.log("  file extension and output MSF name.");
        console.log("");
        console.log("  Warning and error messages will be written to stderr, and errors will each");
        console.log("  be associated with a different non-zero exit code.");
        console.log("");
        console.log("  EXIT CODES");
        console.log("  ==========");
        console.log("");
        console.log("  0    success");
        console.log("");
        console.log("  1    input file does not exist/is not readable");
        console.log("  2    printer profile does not exist/is not readable");
        console.log("  3    materials file (if specified) does not exist/is not readable");
        console.log("  4    output path is not writable");
        console.log("  5    error with drive color(s) specified");
        console.log("  6    error with drive material(s) specified");
        console.log("  7    print extruder required but not specified, or invalid");
        console.log("");
        console.log("  10   incompatible file format");
        console.log("  11   incompatible tool used");
        console.log("  12   no print layers detected");
        console.log("  13   layer too thin");
        console.log("  14   bounding box could not be determined");
        console.log("  15   no dense layers in transition tower");
        console.log("  16   could not analyze print extrusion");
        console.log("  17   cannot position towers");
        console.log("");
        console.log("  20   first piece too short");
        console.log("  21   piece too short");
        console.log("  22   tower inconsistency occurred");
        console.log("  23   transition inconsistency occurred");
        console.log("");
        console.log("  99   unknown error occurred");
        console.log("");
    });

    program.parse(process.argv);

    if (process.argv.length <= 2) {
        program.help();
        process.exit(0);
    }

    if (program.debug) {
        debug = true;
    }

    // load printer profile
    if (program.printer === undefined) {
        console.error("No printer profile specified");
        process.exit(2);
    }
    if (!fs.existsSync(program.printer)) {
        console.error("Printer profile does not exist");
        process.exit(2);
    }
    try {
        printerProfile = Printer.unserialize(loadYML(program.printer));
    } catch (e) {
        console.error("Printer profile is not readable");
        process.exit(2);
    }
    if (printerProfile.nozzleDiameter === 0) {
        console.error("Printer profile contains incomplete settings");
        process.exit(2);
    }

    // parse printExtruder option
    if (printerProfile.extruderCount > 1 && printerProfile.printExtruder === false) {
        if (printerProfile.printExtruder === false) {
            if (program.printExtruder === undefined) {
                console.error("--print-extruder required but not defined");
                process.exit(7);
            }
            if (isNaN(program.printExtruder)) {
                console.error("--print-extruder is not a number");
                process.exit(7);
            }
            if (program.printExtruder < 0 || program.printExtruder >= printerProfile.extruderCount) {
                console.error("--print-extruder is not a valid toolhead index");
                process.exit(7);
            }
            printExtruder = program.printExtruder;
        } else {
            printExtruder = printerProfile.printExtruder;
        }
    }

    // load material matrix
    if (program.materials === undefined) {
        globalMatrix = MaterialMatrix.getDefault();
    } else {
        if (!fs.existsSync(program.materials)) {
            console.error("Materials file does not exist");
            process.exit(3);
        }
        try {
            globalMatrix = MaterialMatrix.unserialize(loadYML(program.materials), false);
        } catch (e) {
            console.error("Materials file is not readable");
            process.exit(3);
        }
    }

    // validate drive colors
    if (program.driveColors !== undefined) {
        if (program.driveColors.length === 0 || program.driveColors.length > 4) {
            console.error("Invalid number of drive colors specified");
            process.exit(5);
        }
        for (let i = 0; i < program.driveColors.length; i++) {
            let color = parseInt(program.driveColors[i]);
            if (color < 0 || color >= 14) {
                console.error("Invalid color index '" + color + "' specified");
                process.exit(5);
            }
            driveColors[i] = color;
        }
    }

    // validate drive materials
    if (program.driveMaterials !== undefined) {
        if (program.driveMaterials.length === 0 || program.driveMaterials.length > 4) {
            console.error("Invalid number of drive materials specified");
            process.exit(5);
        }
        for (let i = 0; i < program.driveMaterials.length; i++) {
            let material = program.driveMaterials[i];
            if (!globalMatrix.matrix.hasOwnProperty(material)) {
                console.error("Nonexistent material '" + material + "' specified");
                process.exit(5);
            }
            driveMaterials[i] = material;
        }
    }

    // validate input file
    if (program.args.length < 1) {
        console.error("No input file specified");
        process.exit(1);
    }
    if (!fs.existsSync(program.args[0])) {
        console.error("Input file does not exist");
        process.exit(1);
    }
    try {
        fs.accessSync(program.args[0], fs.R_OK)
    } catch (e) {
        console.error("Input file is not readable");
        process.exit(1);
    }
    inputPath = program.args[0];

    // validate output file
    if (program.args.length < 2) {
        console.error("No output file specified");
        process.exit(4);
    }
    if (!fs.existsSync(path.dirname(program.args[1]))) {
        console.error("Directory of output file does not exist");
        process.exit(4);
    }
    try {
        fs.accessSync(path.dirname(program.args[1]), fs.W_OK)
    } catch (e) {
        console.error("Directory of output file is not writable");
        process.exit(4);
    }
    outputPath = program.args[1];

}

function checkValidMaterialCombinations(print, driveMaterials, materialMatrix) {
    let materials = driveMaterials.slice();
    let conflicts = [];
    let emptyAlgorithms = [];
    for (let z in print.transitionInfo) {
        if (print.transitionInfo.hasOwnProperty(z)) {
            for (let transition of print.transitionInfo[z]) {
                let ingoing = materials[transition.to];
                let outgoing = materials[transition.from];
                if (ingoing !== null && outgoing !== null) {
                    let spliceSettings = materialMatrix.matrix[ingoing].combinations[outgoing];
                    if (spliceSettings === null) {
                        let error1 = outgoing + " cannot be spliced with " + ingoing;
                        let error2 = ingoing + " cannot be spliced with " + outgoing;
                        if (conflicts.indexOf(error1) < 0 && conflicts.indexOf(error2) < 0) {
                            conflicts.push(error1);
                        }
                    } else if (spliceSettings.heatFactor === 0 || spliceSettings.compressionFactor === 0) {
                        let emptyAlgCombo = ingoing + " to " + outgoing;
                        if (emptyAlgorithms.indexOf(emptyAlgCombo) < 0) {
                            emptyAlgorithms.push(emptyAlgCombo);
                        }
                    }
                }
            }
        }
    }
    return {
        conflicts: conflicts,
        emptyAlgorithms: emptyAlgorithms
    };
}

async function runProcess() {
    try {
        parseArgs();
        global.advancedMode = true;
        global.betaFeatures = true;
        global.pingOptions = {
            usePings: true,
            useMechanicalPings: false
        };
        if (debug) {
            Print.DEBUG.memoryLeak = false;
            Print.DEBUG.preflight = false;
            Print.DEBUG.comments = true;
            Print.DEBUG.console = true;
            Print.DEBUG.sourceMap = true;
            Print.DEBUG.skipModifications = false;
        }
    } catch (e) {
        console.error(e);
        process.exit(99);
    }
    try {
        let print = new Print(inputPath, printerProfile, printExtruder);
        await print.runPreFlight();
        await print.addTowers();
        let someMaterialsSet = false;
        let allMaterialsSet = true;
        print.drivesUsed.forEach(function (driveUsed, drive) {
            if (driveUsed) {
                if (driveMaterials[drive] === null) {
                    allMaterialsSet = false;
                } else {
                    someMaterialsSet = true;
                }
            }
        });
        if (someMaterialsSet && !allMaterialsSet) {
            console.error("Some but not all materials specified");
            process.exit(6);
        }
        let materialIssues = checkValidMaterialCombinations(print, driveMaterials, globalMatrix);
        if (materialIssues.conflicts.length > 0) {
            console.error("Material compatibility conflict" + (materialIssues.conflicts.length > 1 ? "s" : "") + ":");
            materialIssues.conflicts.forEach(function (conflict) {
                console.error(conflict);
            });
        }
        if (materialIssues.emptyAlgorithms.length > 0) {
            console.error("Empty material algorithm" + (materialIssues.emptyAlgorithms.length > 1 ? "s" : "") + ":");
            materialIssues.emptyAlgorithms.forEach(function (emptyAlgorithms) {
                console.error(emptyAlgorithms);
            });
        }
        if (materialIssues.conflicts.length > 0 || materialIssues.emptyAlgorithms.length > 0) {
            process.exit(6);
        }
        if (!someMaterialsSet) {
            print.drivesUsed.forEach(function (driveUsed, drive) {
                if (driveUsed) {
                    driveMaterials[drive] = "Default PLA";
                }
            });
        }
        let msf = await print.createOutput(driveColors, driveMaterials);
        if (!printerProfile.isIntegratedMSF()) {
            let msfOut = msf.createMSF();
            fs.writeFileSync(outputPath, msfOut);  // output the MSF
        }
        if (program.plainMsf) {
            let msfPlain = msf.createPlainMSF();
            fs.writeFileSync(outputPath + ".txt", msfPlain);   // output the plain MSF
        }
        let printFilePath = outputPath + print.inputExt;
        if (printerProfile.isIntegratedMSF()) {
            printFilePath = outputPath;
        }
        if (print._printerProfile.postprocessing === "makerbot") {
            printFilePath = outputPath + ".makerbot";
            let outEngine = new Raft.Makerbot5thGenEngine({
                skipInvalidInstructions: true,
                volumetricExtrusion: print._printerProfile.volumetric,
                filamentDiameter: print._printerProfile.filamentDiameter,
                initialXYZCoordinateMode: Raft.CoordinateModes.Absolute,
                initialExtrusionCoordinateMode: Raft.CoordinateModes.Relative,
                toolheadCount: 4,
                initialPrintState: Raft.PrintStates.StartSequence
            });
            let outParser = new Raft.MakerbotParser(outEngine);
            let outRaft = new Raft.RaftWrapper(outParser);
            outRaft.instructions = print._raft.instructions;
            outRaft.parser.metaJson = await print.getMakerbot5thGenMeta();
            outRaft.save(printFilePath);
        } else if (print._printerProfile.postprocessing === "g3drem") {
            console.error("Chroma CLI does not currently support .g3drem conversion");
            process.exit(10);
        } else if (print.inputExt === ".g3drem") {
            const extname = path.extname(outputPath);
            printFilePath = outputPath.replace(extname, "_" + extname.slice(1)) + ".g3drem";
            print._raft.save(printFilePath);
        } else {
            print._raft.save(printFilePath);
            if (print._printerProfile.postprocessing === "x3g") {
                console.error("Chroma CLI does not currently support .x3g conversion (consider using GPX directly)");
                process.exit(10);
            }
        }
    } catch (e) {
        if (e.exitCode) {
            console.error(e.message + "\n" + e.detail);
            process.exit(e.exitCode);
        } else {
            console.error(e.message);
            process.exit(99);
        }
    }
}

// do processing
runProcess().then(function (value) {
    process.exit(0);
}, function (reason) {
    console.error(reason);
    process.exit(99);
});
