
const path = require("path");
const Raft = require("raft-js");

const BoundingBox = require("./bounding-box");
const MSF = require("./msf");
const PrinterPresets = require("./printer-presets");
const TransitionTower = require("./transition-tower");
const ZStateMachine = require("./z-state-machine");

const roundTo = require("./common").roundTo;
const getLineLength = require("./common").getLineLength;
const lerp = require("./common").lerp;

const TRANSITION_TOWER = require("../models/common").TRANSITION_TOWER;
const SIDE_TRANSITIONS = require("../models/common").SIDE_TRANSITIONS;
const NO_TRANSITIONS = require("../models/common").NO_TRANSITIONS;

const FIRST_PIECE_MIN_LENGTH = require("./common").FIRST_PIECE_MIN_LENGTH;
const SPLICE_MIN_LENGTH = require("./common").SPLICE_MIN_LENGTH;
const ZIGGURAT_THRESHOLD = require("./common").ZIGGURAT_THRESHOLD;

const PING_PAUSE_1_LENGTH = require("./common").PING_PAUSE_1_LENGTH;
const PING_PAUSE_2_LENGTH = require("./common").PING_PAUSE_2_LENGTH;
const PING_MIN_SPACING = require("./common").PING_MIN_SPACING;
const PING_MAX_SPACING = require("./common").PING_MAX_SPACING;
const PING_SPREAD_FACTOR = require("./common").PING_SPREAD_FACTOR;

const BOWDEN_NONE = require("./common").BOWDEN_NONE;

const DEBUG = {
    memoryLeak: false,
    preflight: false,
    comments: true,
    console: false,
    sourceMap: false,
    skipModifications: false
};


// SPLICE LENGTH CHECKS

function checkSpliceLength(spliceList) {
    if (spliceList.length === 1) {
        if (spliceList[0][1] < FIRST_PIECE_MIN_LENGTH - 5) {
            throw {
                message: "First Piece Too Short",
                detail: "The first piece created by Palette would be " + (spliceList[0][1] / 10).toFixed(1) + " cm, but must be at least " + (FIRST_PIECE_MIN_LENGTH / 10).toFixed(0) + " cm long. Try adding some more skirts to this model.",
                exitCode: 20
            };
        }
    } else {
        let spliceLength = spliceList[spliceList.length - 1][1] - spliceList[spliceList.length - 2][1];
        if (spliceLength < SPLICE_MIN_LENGTH - 10) {
            throw {
                message: "Piece Too Short",
                detail: "Chroma attempted to make a splice that was " + (spliceLength / 10).toFixed(1) + " cm long, but Palette's minimum splice length is " + (SPLICE_MIN_LENGTH / 10).toFixed(0) + " cm.",
                exitCode: 21
            };
        }
    }
}


// PING SPACING FUNCTIONS

function getNextPingStartValueLinear(lastPingStartValue) {
    return lastPingStartValue + PING_MIN_SPACING;
}

function getNextPingStartValueExponential(lastPingStartValue) {
    return Math.min(
        Math.max(
            lastPingStartValue * PING_SPREAD_FACTOR,
            lastPingStartValue + PING_MIN_SPACING
        ),
        lastPingStartValue + PING_MAX_SPACING
    );
}

function getNextPingStartValue(lastPingStartValue) {
    return getNextPingStartValueLinear(lastPingStartValue);
    // return getNextPingStartValueExponential(lastPingStartValue);
}


// INFILL DUMPING

function checkInfillDump(raft, allowDumpInInfill = true, allowDumpInSupports = false) {
    function inValidPrintState() {
        let currentPrintState = raft.getCurrentState().get("printState").value;
        return ((allowDumpInInfill && currentPrintState === Raft.PrintStates.Infill)
            || (allowDumpInSupports && currentPrintState === Raft.PrintStates.Support));
    }
    let initialExtrusion = raft.getCurrentState().get("extrusion").totalDispensed;
    if (inValidPrintState()) {
        let stepsBackward = 0;
        while (inValidPrintState()) {
            let stepping = raft.stepBackward();
            if (!stepping) {
                break;
            }
            stepsBackward++;
        }
        let extrusionAtStart = raft.getCurrentState().get("extrusion").totalDispensed;
        while (stepsBackward > 0) {
            raft.stepForward();
            stepsBackward--;
        }
        let stepsForward = 0;
        while (inValidPrintState()) {
            let stepping = raft.stepForward();
            if (!stepping) {
                break;
            }
            stepsForward++;
        }
        raft.stepBackward();
        stepsForward--;
        let extrusionAtEnd = raft.getCurrentState().get("extrusion").totalDispensed;
        while (stepsForward > 0) {
            raft.stepBackward();
            stepsForward--;
        }
        return {
            total: extrusionAtEnd - extrusionAtStart,
            usableTotal: extrusionAtEnd - extrusionAtStart,
            offset: initialExtrusion - extrusionAtStart,
            usableOffset: initialExtrusion - extrusionAtStart
        };
    } else {
        let infillDumpAmount = 0;
        let extrusionAtStart = raft.getCurrentState().get("extrusion").totalDispensed;
        let stepsForward = 0;
        while (true) {
            let stepping = raft.stepForward();
            if (!stepping) {
                break;
            }
            stepsForward++;
            if (raft.getCurrentState().get("extrusion").totalDispensed > extrusionAtStart) {
                break;
            }
            if (inValidPrintState()) {
                while (inValidPrintState()) {
                    stepping = raft.stepForward();
                    if (!stepping) {
                        break;
                    }
                    stepsForward++;
                }
                raft.stepBackward();
                stepsForward--;
                let extrusionAtEnd = raft.getCurrentState().get("extrusion").totalDispensed;
                infillDumpAmount = extrusionAtEnd - extrusionAtStart;
                break;
            }
        }
        while (stepsForward > 0) {
            raft.stepBackward();
            stepsForward--;
        }
        return {
            total: infillDumpAmount,
            usableTotal: infillDumpAmount,
            offset: initialExtrusion - extrusionAtStart,
            usableOffset: initialExtrusion - extrusionAtStart
        };
    }
}


// PREFLIGHT UTILITIES

function checkToolchangeRetractionSettings(retraction, toolChangeRetraction) {
    return (
        toolChangeRetraction !== 0
        && Math.abs(toolChangeRetraction - retraction) > 5
        && toolChangeRetraction > retraction * 2
    );
}


// OUTPUT GENERATION UTILITIES

function setExtrusionPosition(raft, value = 0) {
    let currentEState = raft.getCurrentState().get("extrusion");
    if (currentEState.coordinateMode === Raft.CoordinateModes.Relative) {
        return;
    }
    if (currentEState.position !== value) {
        raft.insertInstruction(new Raft.SetPositionInstruction({
            extrusion: value
        }));
    }
}

function insertDwellPause(raft, duration) {
    // duration is measured in milliseconds

    while (duration > 0) {
        if (duration > 4000) {
            raft.insertInstruction(new Raft.DwellInstruction({
                duration: 4000,
                useMilliseconds: true
            }));
            raft.insertInstruction(new Raft.LinearMoveInstruction({}));
            duration -= 4000;
        } else {
            raft.insertInstruction(new Raft.DwellInstruction({
                duration: duration,
                useMilliseconds: true
            }));
            duration = 0;
        }
    }

}

function insertRetract(raft, useDedicatedRetracts, retractDistance, retractSpeed) {
    if (useDedicatedRetracts) {
        raft.insertInstruction(new Raft.RetractInstruction({
            isUnretract: false
        }));
    } else {
        let currentEState = raft.getCurrentState().get("extrusion");
        let currentEPosition = currentEState.position;
        let cumulativeE = (currentEState.coordinateMode === Raft.CoordinateModes.Absolute);
        let eParam = (cumulativeE ? roundTo(currentEPosition - retractDistance, 5) : -retractDistance);
        raft.insertInstruction(new Raft.LinearMoveInstruction({
            extrusion: eParam,
            feedrate: retractSpeed
        }));
    }
}

function insertUnretract(raft, useDedicatedRetracts, retractDistance, retractSpeed) {
    if (useDedicatedRetracts) {
        raft.insertInstruction(new Raft.RetractInstruction({
            isUnretract: true
        }));
    } else {
        let currentEState = raft.getCurrentState().get("extrusion");
        let currentEPosition = currentEState.position;
        let cumulative = currentEState.coordinateMode === Raft.CoordinateModes.Absolute;
        let eParam = (cumulative ? roundTo(currentEPosition + retractDistance, 5) : retractDistance);
        raft.insertInstruction(new Raft.LinearMoveInstruction({
            extrusion: eParam,
            feedrate: retractSpeed
        }));
    }
}

function returnToPrintLookahead(raft, transitionMethod, defaultX, defaultY, rapidXYSpeed, towerZ) {
    let stepsForward = 0;
    let result = {
        overrideReturnMove: false,
        overrideUnhop: false,
        setTowerToLayer: null
    };
    let nextInstruction;
    while (true) {
        let stepping = raft.stepForward();
        if (!stepping) {
            break;
        }
        stepsForward++;
        nextInstruction = raft.getCurrentInstruction();
        if (nextInstruction instanceof Raft.MoveInstruction) {
            if ((nextInstruction.x !== null || nextInstruction.y !== null)
                && nextInstruction.extrusion === null) {
                result.overrideReturnMove = true;
                break;
            }
            if (nextInstruction.extrusion !== null) {
                break;
            }
        } else if (nextInstruction instanceof Raft.SetPositionInstruction) {
            break;
        } else if (nextInstruction instanceof Raft.ToolChangeInstruction) {
            break;
        }
    }
    if (result.overrideReturnMove) {
        if (transitionMethod === TRANSITION_TOWER) {
            if (nextInstruction.z !== null) {
                let currentZ = raft.getCurrentState().get("z").position;
                if (currentZ !== towerZ) {
                    result.setTowerToLayer = currentZ;
                    result.overrideUnhop = true;
                }
            }
        }
    } else {
        while (stepsForward > 0) {
            raft.stepBackward();
            stepsForward--;
        }
        raft.insertInstruction(new Raft.LinearMoveInstruction({
            x: defaultX,
            y: defaultY,
            feedrate: rapidXYSpeed,
            comment: " move back to print"
        }));
    }
    return result;
}

function getThisTransitionExtrusionForTower(tower, printer, z, toolChangeCounter) {
    let totalLayerToolChanges = tower.layerStats[z].transitions.length;
    let layerSegments = 1;
    let extraPieceLength = 0;
    let infillDumpLength = 0;
    if (totalLayerToolChanges > 0) {
        layerSegments = totalLayerToolChanges;
        extraPieceLength = tower.layerStats[z].transitions[toolChangeCounter].extraPieceLength;
        if (printer.canInfillDump()) {
            infillDumpLength = tower.layerStats[z].transitions[toolChangeCounter].infillDumpAmount.usableTotal;
        }
    }
    let thisTransitionExtrusion = ((tower.precode[z].totalExtrusion
        - tower.layerStats[z].totalExtraPieceLength
        + tower.layerStats[z].totalInfillDumpLength)
        / layerSegments) + extraPieceLength - infillDumpLength;
    if (global.advancedMode && totalLayerToolChanges > 0 && tower.driveColorStrengths
        && (!tower.useZiggurats || tower.towerLayerHeights.indexOf(z) > tower.zigguratLayerCount)
        && printer.transitionSettings.purgeLength > printer.transitionSettings.minPurgeLength) {
        thisTransitionExtrusion = printer.interpolatePurgeLengths(
            tower.driveColorStrengths[print.layerInfo[z].toolChanges[toolChangeCounter].from],
            tower.driveColorStrengths[print.layerInfo[z].toolChanges[toolChangeCounter].to]
        ) + extraPieceLength - infillDumpLength;
    }
    return thisTransitionExtrusion;
}


// FIRST PRINT LAYER CONDITION CHECKS

function checkFirstPrintLayerReached(raft, instruction, printLayerHeights) {
    let totalDispensed = raft.getCurrentState().get("extrusion").totalDispensed;
    if ((instruction instanceof Raft.MoveInstruction) && !(instruction instanceof Raft.HomeInstruction)
        && printLayerHeights.indexOf(raft.getCurrentState().get("z").position) === 0 && totalDispensed > 0) {
        return {
            firstPrintLayerReached: true,
            firstPrintLayerStartExtrusion: totalDispensed
        };
    }
    return {
        firstPrintLayerReached: false,
        firstPrintLayerStartExtrusion: 0
    };
}

function checkFirstPrintLayerPrinted(raft, instruction, firstPrintLayerStartExtrusion) {
    return ((instruction instanceof Raft.MoveInstruction) && !(instruction instanceof Raft.HomeInstruction)
        && raft.getCurrentState().get("extrusion").totalDispensed > firstPrintLayerStartExtrusion);
}

function checkLastExtrusionZ(raft, instruction) {
    if ((instruction instanceof Raft.MoveInstruction) && !(instruction instanceof Raft.HomeInstruction)
        && instruction.extrusion !== null) {
        raft.stepBackward();
        let previousExtrusion = raft.getCurrentState().get("extrusion").totalDispensed;
        raft.stepForward();
        let currentExtrusion = raft.getCurrentState().get("extrusion").totalDispensed;
        if (currentExtrusion > previousExtrusion) {
            return raft.getCurrentState().get("z").position;
        }
    }
    return null;
}


// POST-OUTPUT UTILITIES

function addLastSplice(msf, totalExtrusion, currentTool, printer, effectiveLoadingOffset) {
    // add the last splice to the MSF now that the print is finished
    // - includes the printer's Bowden tube length
    // - adds an extra multiplier to ensure the printer does not run out of filament
    let lastSpliceStart = 0;
    if (msf.spliceList.length > 0) {
        lastSpliceStart = msf.spliceList[msf.spliceList.length - 1][1];
    }
    let extraLength = (totalExtrusion - lastSpliceStart) * 0.04;
    if ((totalExtrusion - lastSpliceStart) < SPLICE_MIN_LENGTH) {
        extraLength += SPLICE_MIN_LENGTH - (totalExtrusion - lastSpliceStart);
    }
    msf.spliceList.push([
        currentTool,
        totalExtrusion + printer.firmwarePurge + extraLength + (printer.bowdenTube ? printer.bowdenTube : BOWDEN_NONE)
    ]);
    if (effectiveLoadingOffset > 2000) {
        if (msf.spliceList[msf.spliceList.length - 1][1] < 2000) {
            msf.spliceList[msf.spliceList.length - 1][1] = 2000;
        }
    } else {
        if (msf.spliceList[msf.spliceList.length - 1][1] < (effectiveLoadingOffset * 1.02)) {
            msf.spliceList[msf.spliceList.length - 1][1] = effectiveLoadingOffset * 1.02;
        }
    }
}

function addPrintExtruderChange(raft, printExtruder) {
    if (printExtruder !== 0 || raft.getCurrentState().get("toolhead").value === null) {
        raft.rewind();
        let stepping = true;
        while (stepping) {
            stepping = raft.stepForward();
            if (stepping) {
                if (!(raft.getCurrentInstruction() instanceof Raft.EmptyInstruction)
                    && !(raft.getCurrentInstruction() instanceof Raft.OEMInstruction)) {
                    stepping = false;
                    raft.stepBackward();
                }
            }
        }
        raft.insertInstruction(new Raft.ToolChangeInstruction({
            toolhead: printExtruder
        }));
    }
}

async function addOEMData(raft, msf) {
    let printTemp = 0;
    let bedTemp = 0;
    raft.rewind();
    await raft.play(async function (instruction, state) {
        if (state.get("extruderTemp").position !== null && state.get("extruderTemp").position > printTemp) {
            printTemp = state.get("extruderTemp").position;
        }
        if (state.get("bedTemp").position !== null && state.get("bedTemp").position > bedTemp) {
            bedTemp = state.get("bedTemp").position;
        }
    });
    raft.insertInstruction(new Raft.OSoftResetInstruction({}));
    raft.rewind();
    raft.stepForward();
    let colorsUsed = msf.getColorsUsedLabels();
    let driveInformation = "";
    for (let i = 0; i < 4; i++) {
        driveInformation += msf.materials[i].index + colorsUsed[i] + ":";
    }
    raft.insertInstruction(new Raft.ODriveInformationInstruction({
        value: driveInformation
    }));
    raft.insertInstruction(new Raft.OAlgorithmCountInstruction({
        count: 0
    }));
    raft.insertInstruction(new Raft.OSpliceCountInstruction({
        count: msf.spliceList.length
    }));
    for (let splice of msf.spliceList) {
        raft.insertInstruction(new Raft.OSpliceDataInstruction({
            drive: splice[0],
            length: splice[1]
        }));
    }
    raft.insertInstruction(new Raft.OStartMulticolorInstruction({}));
    if (printTemp > 0) {
        raft.insertInstruction(new Raft.SetToolheadTemperatureInstruction({
            stabilize: false,
            toolhead: 0,
            temperature: printTemp
        }));
    }
    if (bedTemp > 0) {
        raft.insertInstruction(new Raft.SetBedTemperatureInstruction({
            stabilize: false,
            temperature: bedTemp
        }));
    }
    while (true) {
        let stepping = raft.stepForward();
        if (!stepping) break;
        if (raft.getCurrentState().get("extrusion").totalDispensed > 0) {
            raft.stepBackward();
            break;
        }
        let currentInstruction = raft.getCurrentInstruction();
        if (((currentInstruction instanceof Raft.SetToolheadTemperatureInstruction)
                || (currentInstruction instanceof Raft.SetBedTemperatureInstruction))
            && currentInstruction.stabilize === true) {
            raft.stepBackward();
            raft.deleteInstruction();
        }
    }
    raft.insertInstruction(new Raft.StopInstruction({}));
}

class Print {

    constructor(filePath, printerProfile, printExtruder = 0) {

        this._printerProfile = printerProfile;
        this.printExtruder = printExtruder;

        let ext = path.extname(filePath).slice(1);
        let extLowercase = ext.toLowerCase();
        if (printerProfile.inputParsers.indexOf(extLowercase) < 0) {
            throw {
                message: "Unsupported file format",
                detail: "The currently selected printer profile is not compatible with ." + ext + " files.\n\nIf this is incorrect, you can change this setting under the Printer tab while editing the profile.",
                exitCode: 10
            };
        }

        this.inputDir = path.dirname(filePath);
        this.inputExt = "." + ext;
        this.inputName = path.basename(filePath, this.inputExt);

        let parserName = PrinterPresets.getParserInfo(extLowercase).name;
        let engineName = PrinterPresets.getEngineInfo(printerProfile.engine).name;

        let engine = new Raft[engineName]({
            skipInvalidInstructions: true,
            volumetricExtrusion: printerProfile.volumetric,
            filamentDiameter: printerProfile.filamentDiameter,
            initialXYZCoordinateMode: Raft.CoordinateModes.Absolute,
            initialExtrusionCoordinateMode: Raft.CoordinateModes.Absolute,
            toolheadCount: 4,
            initialPrintState: Raft.PrintStates.StartSequence,
            extruderStepsPerMM: printerProfile.extruderStepsPerMM
        });
        let parser = new Raft[parserName](engine);

        this._raft = new Raft.RaftWrapper(parser);
        this._raft.open(filePath);

        if (DEBUG.sourceMap) {
            this._raft.instructions.forEach(function (instruction, index) {
                instruction.comment += " (line " + (index + 1) + ")";
            });
        }

    }

    getFilePath() {
        return path.join(this.inputDir, this.inputName + this.inputExt);
    }

    /**
     * Run the first pass over the input GCode to learn about the print for later processing.
     * - determine which Palette drives will be used
     * - determine the bounding box of the print
     * - get transition info by layer for transition tower generation
     */
    async runPreFlight(calibrationOnly = false, progressBar = null) {

        const printer = this._printerProfile;
        const raft = this._raft;

        if (DEBUG.memoryLeak) {
            await raft.play();
            while (true) {
                this._raft.insertInstruction(new Raft.EmptyInstruction({
                    comment: "" + this._raft.programCounter
                }));
            }
        }

        let layerHeights = [];
        let layerStats = {};
        let toolsUsed = [false, false, false, false];

        let dedicatedRetractCommands = false;

        let speeds = {
            rapidXY: 0,
            printing: 0,
            printingFirstLayer: 0,
            printingByLayer: {},
            printingByTool: [0, 0, 0, 0],
            retraction: 0,
            rapidZ: 0
        };

        let boundingBox = new BoundingBox();
        boundingBox.zMin = 0;
        boundingBox.zMax = 0;


        // Step 1a. Determine which layers are considered print layers
        // Step 1b. Determine the greatest retraction amount used
        // Step 1c. Determine which drives will be used
        // Step 1d. Determine the max retraction distance for creating retractions later
        // Step 1e. Detect various print and movement speeds

        if (progressBar) {
            await progressBar.increment("Determining print settings");
        }

        let previousLayerZ = null;
        let previousPrintLayerZ = null;
        let currentZ = null;
        let printLayerCount = 0;
        let raftLayerCount = 0;
        let lastExtrusionZ = null;
        let retractDistances = {};
        let potentialMaxRetraction = 0;
        let toolChangeRetraction = 0;
        let solidLayerFeatureComments = false;

        // used with independentExtruderAxes only
        let lastPrintExtrusion = [0, 0, 0, 0];

        await raft.play(async function (instruction, state) {

            let previousZ = currentZ;
            currentZ = state.get("z").position;
            if (previousZ !== currentZ) {
                previousLayerZ = previousZ;
                if (layerStats[previousZ] && layerStats[previousZ].printLayer) {
                    previousPrintLayerZ = previousZ;
                }
            }

            if (!solidLayerFeatureComments && raft.getCurrentState().get("printState").value === Raft.PrintStates.SolidLayer) {
                solidLayerFeatureComments = true;
            }

            if (currentZ !== null) {
                let extrusion = state.get("extrusion");
                if ((instruction instanceof Raft.MoveInstruction) && !(instruction instanceof Raft.HomeInstruction)) {

                    if (instruction.z !== null) {
                        if (layerStats.hasOwnProperty(currentZ)) {
                            layerStats[currentZ].visitsToLayer++;
                        } else {
                            layerHeights.push(currentZ);
                            layerStats[currentZ] = {
                                toolChanges: [],
                                extrusionsWithMovement: 0,
                                visitsToLayer: 1,
                                printLayer: false,
                                raftLayer: false
                            };
                        }
                        if (instruction.x === null && instruction.y === null
                            && instruction.extrusion === null && instruction.feedrate !== null) {
                            speeds.rapidZ = Math.max(speeds.rapidZ, instruction.feedrate);
                        }
                    }
                    if (instruction.extrusion === null) {
                        if ((instruction.x !== null || instruction.y !== null) && instruction.z === null
                            && instruction.feedrate !== null) {
                            speeds.rapidXY = Math.max(speeds.rapidXY, instruction.feedrate);
                        }
                    } else {
                        if (printer.independentExtruderAxes) {
                            lastPrintExtrusion[state.get("toolhead").value] = extrusion.position;
                        }
                        let checkAsPrintLayer = true;
                        let invalidatePrintLayers = false;
                        if (previousPrintLayerZ !== currentZ && layerStats[previousPrintLayerZ]
                            && layerStats[currentZ].printLayer
                            && layerStats[previousPrintLayerZ].printLayer
                            && layerStats[previousPrintLayerZ].extrusionsWithMovement <= 2
                            && printLayerCount <= 2) {
                            checkAsPrintLayer = false;
                            invalidatePrintLayers = true;
                        }
                        if (extrusion.retraction > 0) {
                            if (extrusion.retraction > potentialMaxRetraction) {
                                potentialMaxRetraction = extrusion.retraction;
                            }
                            if (instruction.x === null && instruction.y === null && instruction.z === null
                                && instruction.feedrate !== null) {
                                speeds.retraction = Math.max(speeds.retraction, instruction.feedrate);
                            }
                        }
                        if (instruction.x !== null || instruction.y !== null) {
                            if (extrusion.retraction === 0 && potentialMaxRetraction > 0) {
                                potentialMaxRetraction = roundTo(potentialMaxRetraction, 5);
                                if (!retractDistances.hasOwnProperty(potentialMaxRetraction)) {
                                    retractDistances[potentialMaxRetraction] = 0;
                                }
                                retractDistances[potentialMaxRetraction]++;
                                potentialMaxRetraction = 0;
                            }
                            let currentX = state.get("x").position;
                            let currentY = state.get("y").position;
                            raft.stepBackward();
                            let previousExtrusion = raft.getCurrentState().get("extrusion").totalDispensed;
                            let previousX = raft.getCurrentState().get("x").position;
                            let previousY = raft.getCurrentState().get("y").position;
                            raft.stepForward();
                            if (extrusion.totalDispensed > previousExtrusion) {
                                layerStats[currentZ].extrusionsWithMovement++;
                            }
                            if (invalidatePrintLayers) {
                                for (let z of layerHeights) {
                                    if (z !== currentZ) {
                                        if (layerStats[z].printLayer) {
                                            layerStats[z].printLayer = false;
                                            printLayerCount--;
                                            speeds.printingFirstLayer = 0;
                                        }
                                        if (layerStats[z].raftLayer) {
                                            layerStats[z].raftLayer = false;
                                            raftLayerCount--;
                                        }
                                    }
                                }
                                lastExtrusionZ = currentZ;
                            }
                            if (checkAsPrintLayer) {
                                if (extrusion.totalDispensed > previousExtrusion
                                    && instruction.z === null
                                    && (currentX !== previousX || currentY !== previousY)) {
                                    toolsUsed[state.get("toolhead").value] = true;
                                    lastExtrusionZ = currentZ;
                                    if (layerStats[currentZ].printLayer === false) {
                                        layerStats[currentZ].printLayer = true;
                                        printLayerCount++;
                                        if (state.get("printState").value === Raft.PrintStates.Raft
                                            && !layerStats[currentZ].raftLayer) {
                                            layerStats[currentZ].raftLayer = true;
                                            raftLayerCount++;
                                        }
                                    }
                                }
                            }
                            let feedrate = null;
                            if (instruction.feedrate !== null) {
                                feedrate = instruction.feedrate;
                            } else if (raft.getCurrentState().get("feedrate").position !== null) {
                                feedrate = raft.getCurrentState().get("feedrate").position;
                            }
                            if (feedrate !== null) {
                                raft.stepBackward();
                                let previousExtrusion = raft.getCurrentState().get("extrusion").totalDispensed;
                                raft.stepForward();
                                if (state.get("extrusion").totalDispensed > previousExtrusion) {
                                    if (state.get("printState").value !== Raft.PrintStates.Support) {
                                        let currentTool = state.get("toolhead").value;
                                        if (printLayerCount > 1) {
                                            speeds.printing = Math.max(speeds.printing, feedrate);
                                        } else {
                                            speeds.printingFirstLayer = Math.max(speeds.printingFirstLayer, feedrate);
                                        }
                                        let z = state.get("z").position;
                                        if (!speeds.printingByLayer.hasOwnProperty(z)) {
                                            speeds.printingByLayer[z] = 0;
                                        }
                                        speeds.printingByLayer[z] = Math.max(speeds.printingByLayer[z], feedrate);
                                        if (currentTool !== null) {
                                            speeds.printingByTool[currentTool] = Math.max(speeds.printingByTool[currentTool], feedrate);
                                        }
                                    }
                                } else {
                                    speeds.rapidXY = Math.max(speeds.rapidXY, feedrate);
                                }
                            }
                        }
                    }
                } else if (instruction instanceof Raft.SetPositionInstruction) {
                    if (instruction.extrusion !== null) {
                        if (printer.independentExtruderAxes) {
                            lastPrintExtrusion[state.get("toolhead").value] = extrusion.position;
                        }
                    }
                } else if (instruction instanceof Raft.RetractInstruction) {
                    dedicatedRetractCommands = true;
                } else if (instruction instanceof Raft.ToolChangeInstruction) {
                    if (state.get("toolhead").value > 3) {
                        throw {
                            message: "Incompatible Tool Used",
                            detail: "Your print contains T" + state.get("toolhead").value + " instructions. Chroma can only process files for Palette using tools T0-T3. Please change the toolheads used in your slicer.",
                            exitCode: 11
                        };
                    }
                    if (printer.independentExtruderAxes && extrusion.coordinateMode === Raft.CoordinateModes.Absolute
                        && extrusion.position !== lastPrintExtrusion[state.get("toolhead").value]) {
                        raft.insertInstruction(new Raft.SetPositionInstruction({
                            extrusion: lastPrintExtrusion[state.get("toolhead").value],
                            comment: (DEBUG.comments ? " independent extruder axis handling" : "")
                        }));
                    }
                    if (extrusion.retraction > 0 && potentialMaxRetraction > 0) {
                        potentialMaxRetraction = roundTo(potentialMaxRetraction, 5);
                        if (potentialMaxRetraction > toolChangeRetraction) {
                            toolChangeRetraction = potentialMaxRetraction;
                        }
                    }
                    potentialMaxRetraction = 0;
                }
            }

        });

        if (speeds.rapidZ === 0) {
            speeds.rapidZ = speeds.retraction;
        }
        if (speeds.printingFirstLayer === 0 || speeds.printingFirstLayer > (speeds.printing / 2)) {
            speeds.printingFirstLayer = speeds.printing / 2;
        }
        this.speeds = speeds;

        this.totalExtrusion = raft.getCurrentState().get("extrusion").totalDispensed;

        this.dedicatedRetractCommands = dedicatedRetractCommands;

        let printFeatureDetection = raft.getCurrentState().get("printState").value !== Raft.PrintStates.StartSequence;
        this.printFeatureDetection = printFeatureDetection;
        this.solidLayerFeatureComments = solidLayerFeatureComments;

        if (dedicatedRetractCommands) {
            this.retractDistance = 0;
        } else {
            let retractionDistance = 0;
            let retractionFrequency = 0;
            for (let dist in retractDistances) {
                if (retractDistances.hasOwnProperty(dist)) {
                    if (retractDistances[dist] > retractionFrequency) {
                        retractionDistance = parseFloat(dist);
                        retractionFrequency = retractDistances[dist];
                    }
                }
            }
            this.retractDistance = retractionDistance;
        }

        this.raftLayers = raftLayerCount;

        if (DEBUG.console) {
            console.log("detected retract distance = " + this.retractDistance + " mm");
            console.log("detected toolchange retract distance = " + toolChangeRetraction + " mm");
            // console.log("detected extra restart distance = " + extraRestartDistance + " mm");
        }
        if (!calibrationOnly) {
        let toolChangeSettingsDiffer = checkToolchangeRetractionSettings(this.retractDistance, toolChangeRetraction);
            if (toolChangeSettingsDiffer) {
                window.dispatchEvent(new CustomEvent("printWarning", {
                    detail: {
                        message: "Tool Change Settings Not Zero",
                        detail: "Chroma detected that your tool change retractions are not set to zero. This can be changed in your slicer settings.\n\nChroma will process this file, but printing it may result in unintended behavior."
                    }
                }));
            }
        }

        this.drivesUsed = toolsUsed;


        // Step 2. Consolidate the determined print layers

        if (progressBar) {
            await progressBar.increment("Analyzing print layers");
        }

        this.layerInfo = layerStats;

        let isValidLayerHeight = function (z) {
            return (z !== null && z > 0 && z < Infinity && layerStats[z].printLayer);
        };
        if (printer.engine === "tiertime") {
            isValidLayerHeight = function (z) {
                return (z !== null && z < Infinity && layerStats[z].printLayer);
            };
        }

        let printLayerHeights = layerHeights.filter(isValidLayerHeight).sort((a, b) => a - b);

        if (!calibrationOnly && printLayerHeights.length === 0) {
            throw {
                message: "No print layers detected",
                detail: "Chroma failed to detect any print layers.",
                exitCode: 12
            };
        }

        this.printLayerHeights = printLayerHeights;
        for (let i = 0; i < printLayerHeights.length; i++) {
            let thisZ = printLayerHeights[i];
            let prevZ = (i === 0 ? 0 : printLayerHeights[i - 1]);
            this.layerInfo[thisZ].layerThickness = roundTo(thisZ - prevZ, 6);
        }

        if (calibrationOnly) {
            return;
        }


        // Step 3. Determine the bounding box of the print

        if (progressBar) {
            await progressBar.increment("Calculating bounding box");
        }

        raft.rewind();
        await raft.play(async function (instruction, state) {

            if ((instruction instanceof Raft.MoveInstruction) && !(instruction instanceof Raft.HomeInstruction)) {
                if (instruction.x !== null || instruction.y !== null) {
                    let currentZ = state.get("z").position;
                    raft.stepBackward();
                    let previousZ = raft.getCurrentState().get("z").position;
                    raft.stepForward();
                    if (currentZ !== null && previousZ > currentZ
                        && layerStats[previousZ] !== undefined && layerStats[previousZ].printLayer) {
                        boundingBox.xMax = -Infinity;
                        boundingBox.xMin = Infinity;
                        boundingBox.yMax = -Infinity;
                        boundingBox.yMin = Infinity;
                    }
                    if (printLayerHeights.indexOf(currentZ) >= 0) {
                        let currentE = state.get("extrusion").position;
                        raft.stepBackward();
                        let previousE = raft.getCurrentState().get("extrusion").position;
                        raft.stepForward();
                        if (currentE > previousE) {
                            function checkBounds(state) {
                                let currentX = state.get("x").position;
                                let currentY = state.get("y").position;
                                let currentZ = state.get("z").position;
                                if (boundingBox.xInitialized()) {
                                    if (currentX > boundingBox.xMax) {
                                        boundingBox.xMax = currentX;
                                    } else if (currentX < boundingBox.xMin) {
                                        boundingBox.xMin = currentX;
                                    }
                                } else {
                                    boundingBox.xMax = currentX;
                                    boundingBox.xMin = currentX;
                                }
                                if (boundingBox.yInitialized()) {
                                    if (currentY > boundingBox.yMax) {
                                        boundingBox.yMax = currentY;
                                    } else if (currentY < boundingBox.yMin) {
                                        boundingBox.yMin = currentY;
                                    }
                                } else {
                                    boundingBox.yMax = currentY;
                                    boundingBox.yMin = currentY;
                                }
                                if (currentZ > boundingBox.zMax) {
                                    boundingBox.zMax = currentZ;
                                }
                            }
                            checkBounds(state);
                            raft.stepBackward();
                            checkBounds(raft.getCurrentState());
                            raft.stepForward();
                        }
                    }
                }
            }

        });

        if (boundingBox.xInitialized() && boundingBox.yInitialized()) {
            this.boundingBox = boundingBox;
        } else {
            throw {
                message: "Bounding box could not be determined",
                detail: "Chroma failed to determine the bounding box of this print.",
                exitCode: 14
            };
        }


        // Step 4. Determine Z-lift distance of the print, if non-zero

        // a Z-lift is defined as
        // - an upward movement in the Z-axis
        // - with or without X/Y movement afterwards
        // - ending at either
        //   - a downward movement in the Z-axis
        //     - that may or may not return to the original layer
        //   - net forward extrusion
        //   - the end of a print

        if (progressBar) {
            await progressBar.increment("Analyzing Z-lift heights");
        }

        let zLiftHeightCounts = {};

        raft.rewind();
        await raft.play(async function (instruction, state) {

            if ((instruction instanceof Raft.MoveInstruction) && !(instruction instanceof Raft.HomeInstruction)
                && instruction.z !== null) {

                let potentialLiftHeight = instruction.z;
                let delta = 0;

                raft.stepBackward();

                let previousZ = raft.getCurrentState().get("z").position;
                let previousExtrusion = raft.getCurrentState().get("extrusion").totalDispensed;

                raft.stepForward();

                if (previousZ > 0 && layerStats[previousZ] !== undefined
                    && layerStats[previousZ].printLayer && potentialLiftHeight > previousZ) {

                    let stepsForward = 0;
                    while (true) {
                        let stepping = raft.stepForward();
                        if (!stepping) {
                            // the end of a print
                            delta = 0;
                            break;
                        }
                        stepsForward++;

                        let currentInstruction = raft.getCurrentInstruction();
                        if (currentInstruction instanceof Raft.MoveInstruction &&
                            !(currentInstruction instanceof Raft.HomeInstruction)) {

                            if (instruction.z !== null) {
                                let currentZ = raft.getCurrentState().get("z").position;
                                if (currentZ < potentialLiftHeight) {
                                    // downward movement in the Z-axis
                                    delta = roundTo(potentialLiftHeight - currentZ, 5);
                                    break;
                                }
                                let extrusion = raft.getCurrentState().get("extrusion");
                                if (extrusion.retraction === 0 && extrusion.totalDispensed > previousExtrusion) {
                                    // net forward extrusion
                                    break;
                                }
                            }

                        }
                    }
                    if (delta > 0) {
                        if (zLiftHeightCounts.hasOwnProperty(delta)) {
                            zLiftHeightCounts[delta]++;
                        } else {
                            zLiftHeightCounts[delta] = 1;
                        }
                    }
                    while (stepsForward > 0) {
                        raft.stepBackward();
                        stepsForward--;
                    }

                }

            }

        });

        let zLiftHeight = 0;
        let zLiftFrequency = 0;

        for (let height in zLiftHeightCounts) {
            if (zLiftHeightCounts.hasOwnProperty(height)) {
                if (zLiftHeightCounts[height] > 1 && zLiftHeightCounts[height] > zLiftFrequency) {
                    zLiftHeight = parseFloat(height);
                    zLiftFrequency = zLiftHeightCounts[height];
                }
            }
        }

        this.zLiftDistance = zLiftHeight;

        if (DEBUG.console && DEBUG.preflight) {
            console.log ("detected Z-lift height = " + zLiftHeight + " mm");
        }


        // Step 5. Determine transition information by layer

        if (progressBar) {
            await progressBar.increment("Determining transition information");
        }

        let zState = new ZStateMachine();
        let firstPrintLayerReached = false;
        let firstPrintLayerPrinted = false;
        let firstPrintLayerStartExtrusion = 0;
        lastExtrusionZ = 0;
        raft.rewind();
        await raft.play(async function (instruction, state) {

            if (!firstPrintLayerReached) {
                let result = checkFirstPrintLayerReached(raft, instruction, printLayerHeights);
                if (result.firstPrintLayerReached) {
                    firstPrintLayerReached = true;
                    firstPrintLayerStartExtrusion = result.firstPrintLayerStartExtrusion;
                }
            }
            if (!firstPrintLayerPrinted && firstPrintLayerReached) {
                firstPrintLayerPrinted = checkFirstPrintLayerPrinted(raft, instruction, firstPrintLayerStartExtrusion);
            }
            if (firstPrintLayerReached) {
                let result = checkLastExtrusionZ(raft, instruction);
                if (result !== null) {
                    lastExtrusionZ = result;
                }
            }

            if ((instruction instanceof Raft.MoveInstruction) && !(instruction instanceof Raft.HomeInstruction)) {

                let currentZ = state.get("z").position;

                if (printLayerHeights.indexOf(currentZ) >= 0) {
                    let currentE = state.get("extrusion").totalDispensed;
                    if (!layerStats[currentZ].hasOwnProperty("totalPrintExtrusion")) {
                        layerStats[currentZ].totalPrintExtrusion = 0;
                    }
                    if (currentE > layerStats[currentZ].totalPrintExtrusion) {
                        layerStats[currentZ].totalPrintExtrusion = currentE;
                    }
                }

                if (instruction.z !== null) {
                    raft.stepBackward();
                    let previousZ = raft.getCurrentState().get("z").position;
                    raft.stepForward();
                    if (previousZ > currentZ && layerStats[previousZ] !== undefined && layerStats[previousZ].printLayer
                        && lastExtrusionZ === previousZ) {
                        firstPrintLayerReached = false;
                        firstPrintLayerPrinted = false;
                    }

                    zState = zState.getNextState(raft, zLiftHeight);

                }


            } else if (instruction instanceof Raft.ToolChangeInstruction) {
                let currentTool = state.get("toolhead").value;
                raft.stepBackward();
                let previousTool = raft.getCurrentState().get("toolhead").value;
                raft.stepForward();
                if (previousTool === null && firstPrintLayerPrinted) {
                    previousTool = 0;
                }
                if (previousTool !== null && previousTool !== currentTool) {
                    if (DEBUG.preflight && DEBUG.console) {
                        console.log("toolchange at line " + raft.programCounter + " from T" + previousTool + " to T" + currentTool);
                    }
                    let infillDumpAmount = {
                        total: 0,
                        usableTotal: 0,
                        offset: 0,
                        usableOffset: 0
                    };
                    if (printFeatureDetection && solidLayerFeatureComments && printer.canInfillDump()) {
                        infillDumpAmount = checkInfillDump(
                            raft,
                            printer.transitionSettings.useInfillForTransition,
                            printer.transitionSettings.useSupportForTransition
                        );
                    }
                    let transition = {
                        from: previousTool,
                        to: currentTool,
                        totalPrintExtrusion: state.get("extrusion").totalDispensed,
                        infillDumpAmount: infillDumpAmount
                    };
                    let towerLayer = state.get("z").position;
                    if (zLiftHeight > 0 && zState.lifted) {
                        towerLayer = zState.unliftHeight;
                    }
                    layerStats[towerLayer].toolChanges.push(transition);

                }
            }

        });


        // Step 6. Consolidate transition information by print layer

        if (progressBar) {
            await progressBar.increment("Consolidating transition information");
        }

        let transitionInfo = {};
        let totalTransitions = 0;

        printLayerHeights.forEach(function (layer) {
            transitionInfo[layer] = layerStats[layer].toolChanges.filter(function (transition) {
                return transition.from !== transition.to;
            });
            totalTransitions += transitionInfo[layer].length;
        });

        this.transitionInfo = transitionInfo;
        this.totalTransitions = totalTransitions;

        if (totalTransitions === 0) {
            throw {
                message: "No transitions in print",
                detail: "Chroma failed to detect any layers that contain transitions.\n\nIf the loaded print file is not a single-tool print, this is due to either incorrect firmware settings for your printer profile (under the Printer tab) or a processing error.",
                exitCode: 15
            };
        }

    }

    /**
     * Generate transition towers for the print.
     * Results are dependent on the print and the selected printer
     * (eg. print size, print bed dimensions, etc.).
     * The towers produced will be set to `Print._tower`.
     */
    async addTowers(progressBar = null, driveColorStrengths = null) {
        if (this._tower) {
            delete this._tower;
        }
        let tower = new TransitionTower(this);
        await tower.generate(progressBar, driveColorStrengths);
        if (tower.towerLayerHeights.length > 0) {
            this._tower = tower;
        }
    }

    /**
     * Merge the transition tower instructions and ping sequences into the GCode of
     * the print. Towers are integrated at tool change instructions, and pings are
     * integrated into towers. The splice list is also generated at this point.
     */
    async createOutput(colorsUsed, materials, progressBar = null, driveColorStrengths = null) {

        if (global.reduceMemoryUsage) {
            this._outRaft = this._raft;
        } else {
            this._outRaft = this._raft.clone();
        }

        this._outRaft.rewind();
        this._outRaft.insertInstruction(new Raft.EmptyInstruction({
            comment: " Post-processed by Chroma " + require("../package.json").version
        }));

        let msf = MSF.forPrintOutput(this._printerProfile, [
            (this.drivesUsed[0] ? colorsUsed[0] : 0),
            (this.drivesUsed[1] ? colorsUsed[1] : 0),
            (this.drivesUsed[2] ? colorsUsed[2] : 0),
            (this.drivesUsed[3] ? colorsUsed[3] : 0)
        ], [
            (this.drivesUsed[0] ? materials[0] : null),
            (this.drivesUsed[1] ? materials[1] : null),
            (this.drivesUsed[2] ? materials[2] : null),
            (this.drivesUsed[3] ? materials[3] : null)
        ]);

        try {
            if (this._printerProfile.transitionSettings.type === NO_TRANSITIONS) {
                await this._outputNoTransitions(msf, progressBar);
            } else if (this._printerProfile.transitionSettings.type === SIDE_TRANSITIONS) {
                await this._mergeSideTransitions(msf, progressBar, driveColorStrengths);
            } else if (this._printerProfile.transitionSettings.type === TRANSITION_TOWER
                && (this._tower instanceof TransitionTower)) {
                await this._mergeTransitionTowers(msf, progressBar);
            }
        } catch (err) {
            // if (global.env.type === "prebuilt") {
            //     require("fs").writeFileSync(path.join(require("electron").remote.app.getPath("desktop"), "error.msf"), msf.createMSF());
            // }
            throw err;
        }

        if (global.env.oem) {
            await addOEMData(this._outRaft, msf);
        }

        return msf;

    }

    async _mergeTransitionTowers(msf, progressBar = null) {

        const raft = this._outRaft;
        const printer = this._printerProfile;
        const tower = this._tower;
        const printExtruder = this.printExtruder;
        const firmwarePurge = printer.firmwarePurge;
        const PING_EXTRUSION_LENGTH = printer.getPingExtrusionLength();

        const printLayerHeights = this.printLayerHeights;
        let totalPrintLength = this.totalExtrusion;
        for (let z in this._tower.precode) {
            if (this._tower.precode.hasOwnProperty(z)) {
                totalPrintLength += this._tower.precode[z].totalExtrusion;
            }
        }
        let firstLayerReached = false;

        // speed settings
        const speeds = this.speeds;

        const cutterToScrollWheel = (global.env.oem ? 450 : 760);
        const effectiveLoadingOffset = (printer.loadingOffset / printer.getPulsesPerMM()) + cutterToScrollWheel;

        // retraction settings
        const retractDistance = this.retractDistance;
        const pingRetractDistance = (printer.pingRetraction === "auto" ? retractDistance : printer.pingRetraction);
        const useRetracts = (retractDistance > 0);
        const useDedicatedRetracts = this.dedicatedRetractCommands;
        let printIsRetracted = false;
        let lastPrintRetraction = 0;

        // Z-lift settings and flags
        const zLiftDistance = this.zLiftDistance;
        const useZLifts = (zLiftDistance > 0);
        let zState = new ZStateMachine();

        // keep track of various print head positions of interest
        let lastNonTowerX, lastNonTowerY, lastNonTowerZ;
        let currentTowerLayer = null;

        // keep track of the number of tool changes on this layer
        let totalLayerToolChanges = 0;
        let layerToolChangeCounter = 0;
        let currentTool = null;
        let firstPrintLayerReached = false;
        let firstPrintLayerPrinted = false;
        let firstPrintLayerStartExtrusion = 0;

        // keep track of the number of tower instructions on this layer
        const targetTransitionPosition = printer.transitionSettings.targetPosition;
        let totalTowerLayerInstructions = 0;
        let towerLayerInstructionCounter = 0;
        let thisTransitionExtrusion = 0;
        let transitionExtrusionSoFar = 0;
        let lastTowerLayer = tower.towerLayerHeights[0];

        // keep a short history of extrusion values for use with cumulative extrusion and G92 resets
        let lastPrintExtrusionPosition = 0;
        let lastTowerExtrusionPosition = 0;
        let lastExtrusionZ = 0;

        // tower auto-brimming
        let useBrims = tower.brims.count > 0;
        let brimsInserted = false;

        // ping-related constants, counters, and flags
        let lastPingStart = 0;
        let nextPingStart = PING_MIN_SPACING;
        let nextPingEnd = nextPingStart + PING_EXTRUSION_LENGTH;
        let currentlyPinging = false;

        if (DEBUG.console) {
            console.log("");
            console.log("*** OUTPUT GENERATION ***");
            console.log("");
        }

        // initialize to the first tower layer
        await setTowerToLayer(tower.towerLayerHeights[0]);

        function insertJogPause(duration, direction = "north") {
            // duration is measured in milliseconds

            duration /= 1000;

            let currentX = raft.getCurrentState().get("x").position;
            let currentY = raft.getCurrentState().get("y").position;
            let currentZ = raft.getCurrentState().get("z").position;

            // Z-lift up if applicable
            if (useZLifts) {
                raft.insertInstruction(new Raft.LinearMoveInstruction({
                    z: currentZ + zLiftDistance,
                    feedrate: speeds.rapidZ
                }));
            }

            let totalJogs = 5;
            if (printer.postprocessing === "makerbot") {
                totalJogs = 20;
            }

            switch (direction) {
                case "north":
                    for (let i = 0; i < totalJogs; i++) {
                        raft.insertInstruction(new Raft.LinearMoveInstruction({
                            x: currentX,
                            y: currentY + duration,
                            feedrate: 600
                        }));
                        raft.insertInstruction(new Raft.LinearMoveInstruction({
                            x: currentX,
                            y: currentY,
                            feedrate: 600
                        }));
                    }
                    break;
                case "south":
                    for (let i = 0; i < totalJogs; i++) {
                        raft.insertInstruction(new Raft.LinearMoveInstruction({
                            x: currentX,
                            y: currentY - duration,
                            feedrate: 600
                        }));
                        raft.insertInstruction(new Raft.LinearMoveInstruction({
                            x: currentX,
                            y: currentY,
                            feedrate: 600
                        }));
                    }
                    break;
                case "west":
                    for (let i = 0; i < totalJogs; i++) {
                        raft.insertInstruction(new Raft.LinearMoveInstruction({
                            x: currentX - duration,
                            y: currentY,
                            feedrate: 600
                        }));
                        raft.insertInstruction(new Raft.LinearMoveInstruction({
                            x: currentX,
                            y: currentY,
                            feedrate: 600
                        }));
                    }
                    break;
                case "east":
                    for (let i = 0; i < totalJogs; i++) {
                        raft.insertInstruction(new Raft.LinearMoveInstruction({
                            x: currentX + duration,
                            y: currentY,
                            feedrate: 600
                        }));
                        raft.insertInstruction(new Raft.LinearMoveInstruction({
                            x: currentX,
                            y: currentY,
                            feedrate: 600
                        }));
                    }
                    break;
            }

            // Z-lift down if applicable
            if (useZLifts) {
                raft.insertInstruction(new Raft.LinearMoveInstruction({
                    z: currentZ,
                    feedrate: speeds.rapidZ
                }));
            }

        }

        function getPingPausePosition(currentPosition) {
            let pausePosition = {
                x: currentPosition.x,
                y: currentPosition.y
            };
            let extrusionWidth = tower.getExtrusionWidth();
            let edgeTolerance = extrusionWidth;
            let moveDistance = 2 * extrusionWidth;
            // use correct bounding box for layer if ziggurats are used
            let boundingBox = tower.boundingBox;
            if (tower.useZiggurats && tower.towerLayerHeights.indexOf(currentTowerLayer.layerHeight) < tower.zigguratLayerCount) {
                boundingBox = tower.zigguratBoundingBox;
            }
            // move outside brims if necessary
            if (tower.towerLayerHeights.indexOf(currentTowerLayer.layerHeight) === 0 && tower.brims.count > 0) {
                moveDistance += tower.brims.count * extrusionWidth;
                edgeTolerance += tower.brims.count * extrusionWidth;
            }
            // account for perimeters if necessary
            if (tower.precode[currentTowerLayer.layerHeight].perimeterExtrusion > 0) {
                moveDistance += 2 * extrusionWidth;
                edgeTolerance += 2 * extrusionWidth;
            }
            if (Math.abs(currentPosition.x - boundingBox.xMin) < edgeTolerance + 0.01) {
                // pausing at west edge
                pausePosition.x -= moveDistance;
            } else if (Math.abs(currentPosition.x - boundingBox.xMax) < edgeTolerance + 0.01) {
                // pausing at east edge
                pausePosition.x += moveDistance;
            } else if (Math.abs(currentPosition.y - boundingBox.yMax) < edgeTolerance + 0.01) {
                // pausing at north edge
                pausePosition.y += moveDistance;
            } else if (Math.abs(currentPosition.y - boundingBox.yMin) < edgeTolerance + 0.01) {
                // pausing at south edge
                pausePosition.y -= moveDistance;
            }
            return pausePosition;
        }

        function pingStartConditionMet(totalExtrusion) {
            return (totalExtrusion >= nextPingStart
            && (transitionExtrusionSoFar + (PING_EXTRUSION_LENGTH * 1.1) <= thisTransitionExtrusion)
            && (thisTransitionExtrusion < (PING_EXTRUSION_LENGTH * 2.2) || transitionExtrusionSoFar >= PING_EXTRUSION_LENGTH));
        }

        function checkPingSequenceStart() {
            let totalExtrusion = raft.getCurrentState().get("extrusion").totalDispensed;
            if (pingStartConditionMet(totalExtrusion)) {

                // start the ping sequence

                if (useRetracts) {
                    insertRetract(raft, useDedicatedRetracts, pingRetractDistance, speeds.retraction);
                }

                if (DEBUG.comments) {
                    raft.insertInstruction(new Raft.EmptyInstruction({
                        comment: " ping " + (msf.pingList.length + 1) + " pause 1"
                    }));
                    raft.insertInstruction(new Raft.EmptyInstruction({
                        comment: " totalE = " + totalExtrusion
                    }));
                }

                let pingOffTower = printer.pingOffTower;
                let currentPosition = {
                    x: raft.getCurrentState().get("x").position,
                    y: raft.getCurrentState().get("y").position
                };
                let currentFeedrate = raft.getCurrentState().get("feedrate").position;
                if (pingOffTower) {
                    let pausePosition = getPingPausePosition(currentPosition);
                    raft.insertInstruction(new Raft.LinearMoveInstruction({
                        x: pausePosition.x,
                        y: pausePosition.y,
                        feedrate: currentFeedrate
                    }));
                }

                if (printer.jogPauses) {
                    insertJogPause(PING_PAUSE_1_LENGTH);
                } else {
                    insertDwellPause(raft, PING_PAUSE_1_LENGTH);
                }

                if (useRetracts) {
                    insertUnretract(raft, useDedicatedRetracts, pingRetractDistance, speeds.retraction);
                }

                if (pingOffTower) {
                    raft.insertInstruction(new Raft.LinearMoveInstruction({
                        x: currentPosition.x,
                        y: currentPosition.y,
                        feedrate: currentFeedrate
                    }));
                }

                nextPingStart = totalExtrusion;
                nextPingEnd = nextPingStart + PING_EXTRUSION_LENGTH;

                currentlyPinging = true;

            }
        }

        function checkPingSequenceEnd(forceEnd) {

            let totalExtrusion = raft.getCurrentState().get("extrusion").totalDispensed;

            let finishPingSequence = false;
            if (totalExtrusion >= nextPingEnd) {
                finishPingSequence = true;
            } else if (forceEnd) {
                finishPingSequence = true;
            } else {
                if (towerLayerInstructionCounter + 1 < totalTowerLayerInstructions) {
                    let nextTowerInstruction = currentTowerLayer.commands[towerLayerInstructionCounter + 1];
                    if (nextTowerInstruction.extrusion !== undefined) {
                        let nextExtrusion = nextTowerInstruction.extrusion;
                        if (Math.abs(nextPingEnd + 0.5 - totalExtrusion) < Math.abs(totalExtrusion + nextExtrusion - nextPingEnd - 0.5)) {
                            finishPingSequence = true;
                        }
                    }
                }
            }

            if (finishPingSequence) {

                // finish the ping sequence

                if (useRetracts) {
                    insertRetract(raft, useDedicatedRetracts, pingRetractDistance, speeds.retraction);
                }

                if (DEBUG.comments) {
                    raft.insertInstruction(new Raft.EmptyInstruction({
                        comment: " ping " + (msf.pingList.length + 1) + " pause 2"
                    }));
                    raft.insertInstruction(new Raft.EmptyInstruction({
                        comment: " totalE = " + raft.getCurrentState().get("extrusion").totalDispensed
                    }));
                }

                let pingOffTower = printer.pingOffTower;
                let currentPosition = {
                    x: raft.getCurrentState().get("x").position,
                    y: raft.getCurrentState().get("y").position
                };
                let currentFeedrate = raft.getCurrentState().get("feedrate").position;
                if (pingOffTower) {
                    let pausePosition = getPingPausePosition(currentPosition);
                    raft.insertInstruction(new Raft.LinearMoveInstruction({
                        x: pausePosition.x,
                        y: pausePosition.y,
                        feedrate: currentFeedrate
                    }));
                }

                if (printer.jogPauses) {
                    insertJogPause(PING_PAUSE_2_LENGTH);
                } else {
                    insertDwellPause(raft, PING_PAUSE_2_LENGTH);
                }

                if (useRetracts) {
                    insertUnretract(raft, useDedicatedRetracts, pingRetractDistance, speeds.retraction);
                }

                if (pingOffTower) {
                    raft.insertInstruction(new Raft.LinearMoveInstruction({
                        x: currentPosition.x,
                        y: currentPosition.y,
                        feedrate: currentFeedrate
                    }));
                }

                let pingListRetractDistance = retractDistance;
                if (printer.engine === "tiertime") {
                    pingListRetractDistance /= printer.extruderStepsPerMM;
                }

                msf.pingList.push([nextPingStart + firmwarePurge - pingListRetractDistance, totalExtrusion + firmwarePurge]);

                lastPingStart = nextPingStart;
                nextPingStart = getNextPingStartValue(lastPingStart);
                nextPingEnd = nextPingStart + PING_EXTRUSION_LENGTH;
                currentlyPinging = false;

            }

        }

        function checkForPings() {
            let totalExtrusion = raft.getCurrentState().get("extrusion").totalDispensed;
            // account for (1) rounding errors in extrusion tracking, and (2) length changes from ping correction
            if ((totalExtrusion * 0.97) + effectiveLoadingOffset < (totalPrintLength * 1.03)) {
                if (global.env.oem) {
                    if (totalExtrusion >= nextPingStart) {
                        raft.insertInstruction(new Raft.DwellInstruction({
                            duration: 0
                        }));
                        raft.insertInstruction(new Raft.OPingDataInstruction({
                            length: totalExtrusion
                        }));
                        msf.pingList.push([totalExtrusion + firmwarePurge]);
                        lastPingStart = totalExtrusion;
                        nextPingStart = getNextPingStartValue(lastPingStart);
                    }
                } else {
                    if (currentlyPinging) {
                        checkPingSequenceEnd();
                    } else {
                        checkPingSequenceStart();
                    }
                }
            }
        }

        function moveToTower() {
            if (currentTowerLayer === null) {
                if (DEBUG.console) {
                    let match = raft.getCurrentInstruction().comment.match(/line ([0-9]+)/);
                    if (DEBUG.sourceMap && match && match[1]) {
                        console.error("Error at line " + match[1] + " / PC = " + raft.programCounter + ":");
                    } else {
                        console.error("Error at PC = " + raft.programCounter + ":");
                    }
                    console.error("Tower inconsistency occurred:");
                    console.error("Chroma attempted to move to the transition tower but failed.");
                }
                throw {
                    message: "Tower inconsistency occurred",
                    detail: "Chroma attempted to move to the transition tower but failed.\n\nPlease contact support@mosaicmanufacturing.com with your print file and Chroma profile for assistance.",
                    exitCode: 22
                };
            }

            let towerZ = currentTowerLayer.layerHeight;
            let currentRetraction = raft.getCurrentState().get("extrusion").retraction;

            // retract if the print uses retracts, and has not already retracted
            if (useRetracts) {
                printIsRetracted = (currentRetraction > 0);
                lastPrintRetraction = currentRetraction;
                if (!printIsRetracted) {
                    insertRetract(raft, useDedicatedRetracts, retractDistance, speeds.retraction);
                }
            }

            // Z-lift up if the print uses z-lifts, and is not currently in a hop
            if (useZLifts && !zState.lifted) {
                raft.insertInstruction(new Raft.LinearMoveInstruction({
                    z: roundTo(towerZ + zLiftDistance, 4),
                    feedrate: speeds.rapidZ
                }));
            }

            let nextTowerInstruction = currentTowerLayer.commands[towerLayerInstructionCounter];
            raft.insertInstruction(new Raft.LinearMoveInstruction({
                x: roundTo(nextTowerInstruction.x1 + tower.offsets.x, 4),
                y: roundTo(nextTowerInstruction.y1 + tower.offsets.y, 4),
                feedrate: speeds.rapidXY,
                comment: " move to transition tower"
            }));
            towerLayerInstructionCounter++;

            // Z-lift down if the print uses z-lifts or is sequentially printing
            if (useZLifts || towerZ !== lastNonTowerZ) {
                raft.insertInstruction(new Raft.LinearMoveInstruction({
                    z: towerZ,
                    feedrate: speeds.rapidZ
                }));
            }

            // unretract if the print uses retracts
            if (useRetracts) {
                if (printIsRetracted) {
                    insertUnretract(raft, useDedicatedRetracts, lastPrintRetraction, speeds.retraction);
                } else {
                    insertUnretract(raft, useDedicatedRetracts, retractDistance, speeds.retraction);
                }
            }

            let cumulative = raft.getCurrentState().get("extrusion").coordinateMode === Raft.CoordinateModes.Absolute;
            if (cumulative) {
                setExtrusionPosition(raft, 0);
            }

        }

        async function leaveTower() {
            if (currentTowerLayer === null) {
                if (DEBUG.console) {
                    let match = raft.getCurrentInstruction().comment.match(/line ([0-9]+)/);
                    if (DEBUG.sourceMap && match && match[1]) {
                        console.error("Error at line " + match[1] + " / PC = " + raft.programCounter + ":");
                    } else {
                        console.error("Error at PC = " + raft.programCounter + ":");
                    }
                    console.error("Tower inconsistency occurred:");
                    console.error("Chroma attempted to leave the transition tower but failed.");
                }
                throw {
                    message: "Tower inconsistency occurred",
                    detail: "Chroma attempted to leave the transition tower but failed.\n\nPlease contact support@mosaicmanufacturing.com with your print file and Chroma profile for assistance.",
                    exitCode: 22
                };
            }

            if (currentlyPinging) {
                checkPingSequenceEnd(true);
            }

            let towerZ = currentTowerLayer.layerHeight;

            // retract if the print uses retracts
            if (useRetracts) {
                if (printIsRetracted) {
                    insertRetract(raft, useDedicatedRetracts, lastPrintRetraction, speeds.retraction);
                } else {
                    insertRetract(raft, useDedicatedRetracts, retractDistance, speeds.retraction);
                }
            }

            // Z-lift up if the print uses z-lifts or is sequentially printing
            if (useZLifts) {
                raft.insertInstruction(new Raft.LinearMoveInstruction({
                    z: (zState.liftHeight === 0 ? roundTo(towerZ + zLiftDistance, 4) : zState.liftHeight),
                    feedrate: speeds.rapidZ
                }));
            } else if (towerZ !== lastNonTowerZ) {
                raft.insertInstruction(new Raft.LinearMoveInstruction({
                    z: lastNonTowerZ,
                    feedrate: speeds.rapidZ
                }));
            }

            if (DEBUG.comments) {
                raft.insertInstruction(new Raft.EmptyInstruction({
                    comment: " leaving transition tower"
                }));
            }

            // leave tower lookahead
            let lookahead = returnToPrintLookahead(raft, TRANSITION_TOWER, lastNonTowerX, lastNonTowerY, speeds.rapidXY, towerZ);

            // Z-lift down if the print uses z-lifts, and is not currently in a hop
            if (!lookahead.overrideUnhop && useZLifts && !zState.lifted) {
                raft.insertInstruction(new Raft.LinearMoveInstruction({
                    z: (zState.unliftHeight === 0 ? towerZ : zState.unliftHeight),
                    feedrate: speeds.rapidZ
                }));
            }

            // unretract if the print uses retracts, and was not already retracted
            if (useRetracts && !printIsRetracted) {
                insertUnretract(raft, useDedicatedRetracts, retractDistance, speeds.retraction);
            }

            let currentEState = raft.getCurrentState().get("extrusion");
            let cumulative = currentEState.coordinateMode === Raft.CoordinateModes.Absolute;
            if (cumulative) {
                let nextValue = null;
                raft.stepForward();
                let nextInstruction = raft.getCurrentInstruction();
                if (nextInstruction instanceof Raft.SetPositionInstruction) {
                    nextValue = nextInstruction.extrusion;
                }
                raft.stepBackward();
                if (nextValue !== lastPrintExtrusionPosition) {
                    setExtrusionPosition(raft, lastPrintExtrusionPosition);
                }
            }

            if (lookahead.setTowerToLayer && currentTowerLayer && layerToolChangeCounter >= totalLayerToolChanges) {
                await setTowerToLayer(lookahead.setTowerToLayer);
                lastTowerLayer = lookahead.setTowerToLayer;
            }

        }

        function insertNextTowerCommand() {
            if (currentTowerLayer === null) {
                if (DEBUG.console) {
                    let match = raft.getCurrentInstruction().comment.match(/line ([0-9]+)/);
                    if (DEBUG.sourceMap && match && match[1]) {
                        console.error("Error at line " + match[1] + " / PC = " + raft.programCounter + ":");
                    } else {
                        console.error("Error at PC = " + raft.programCounter + ":");
                    }
                    console.error("Tower inconsistency occurred:");
                    console.error("Chroma attempted to insert the next transition tower instruction but failed.");
                }
                throw {
                    message: "Tower inconsistency occurred",
                    detail: "Chroma attempted to insert the next transition tower instruction but failed.\n\nPlease contact support@mosaicmanufacturing.com with your print file and Chroma profile for assistance.",
                    exitCode: 22
                };
            }
            if (DEBUG.console) {
                console.log("insertNextTowerCommand call");
            }
            if (global.pingOptions.usePings) {
                checkForPings();
            }
            let nextTowerCommand = currentTowerLayer.commands[towerLayerInstructionCounter];
            let currentEState = raft.getCurrentState().get("extrusion");
            let cumulative = currentEState.coordinateMode === Raft.CoordinateModes.Absolute;
            let eParam = undefined;
            if (nextTowerCommand.extrusion !== undefined) {
                transitionExtrusionSoFar += nextTowerCommand.extrusion;
                if (cumulative) {
                    eParam = roundTo(transitionExtrusionSoFar, 5);
                } else {
                    eParam = roundTo(nextTowerCommand.extrusion, 5);
                }
                if (printer.engine === "tiertime") {
                    eParam = roundTo(eParam * printer.extruderStepsPerMM, 5);
                }
            }
            raft.insertInstruction(new Raft.LinearMoveInstruction({
                x: roundTo(nextTowerCommand.x2 + tower.offsets.x, 4),
                y: roundTo(nextTowerCommand.y2 + tower.offsets.y, 4),
                extrusion: eParam,
                feedrate: nextTowerCommand.feedrate,
                comment: (nextTowerCommand.comment && DEBUG.comments) ? nextTowerCommand.comment : ""
            }));
            towerLayerInstructionCounter++;
        }

        async function setTowerToLayer(layerHeight, leaveTowerAfter = true) {
            if (DEBUG.console) {
                console.log("setTowerToLayer(" + layerHeight + ") call");
            }

            if (currentTowerLayer !== null && currentTowerLayer.layerHeight >= layerHeight) {
                return;
            }

            // ensure all transitions on the current layer have been printed before moving up
            if (currentTowerLayer !== null && towerLayerInstructionCounter < totalTowerLayerInstructions) {

                if (DEBUG.console) {
                    console.log("finishing sparse tower layer at Z = " + currentTowerLayer.layerHeight);
                    console.log("towerLayerInstructionCounter = " + towerLayerInstructionCounter + " / totalTowerLayerInstructions = " + totalTowerLayerInstructions);
                }
                if (DEBUG.comments) {
                    raft.insertInstruction(new Raft.EmptyInstruction({
                        comment: " finishing sparse tower layer"
                    }));
                }

                if (towerLayerInstructionCounter > 0 || totalLayerToolChanges > 0) {
                    if (DEBUG.console) {
                        let match = raft.getCurrentInstruction().comment.match(/line ([0-9]+)/);
                        if (DEBUG.sourceMap && match && match[1]) {
                            console.error("Error at line " + match[1] + " / PC = " + raft.programCounter + ":");
                        } else {
                            console.error("Error at PC = " + raft.programCounter + ":");
                        }
                        console.error("Transition inconsistency occurred:");
                        console.error("Chroma is failing to handle a toolchange that it recognized in pre-flight.");
                    }
                    throw {
                        message: "Transition inconsistency occurred",
                        detail: "Chroma is failing to handle a toolchange that it recognized in pre-flight.\n\nPlease contact support@mosaicmanufacturing.com with your print file and Chroma profile for assistance.",
                        exitCode: 23
                    };
                }

                moveToTower();
                while (towerLayerInstructionCounter < totalTowerLayerInstructions) {
                    insertNextTowerCommand();
                }
                if (leaveTowerAfter) {
                    await leaveTower();
                }

            }

            if (progressBar) {
                await progressBar.increment("Generating output files");
            }

            layerToolChangeCounter = 0;
            towerLayerInstructionCounter = 0;
            lastTowerExtrusionPosition = 0;
            thisTransitionExtrusion = 0;
            transitionExtrusionSoFar = 0;

            if (layerHeight === null || tower.towerLayerHeights.indexOf(layerHeight) < 0) {
                // a non-tower layer
                // - non-printing Z height, or
                // - no more tower left
                currentTowerLayer = null;
                totalLayerToolChanges = 0;
                totalTowerLayerInstructions = 0;
            } else {
                // a tower layer -- get info for use while on the layer
                currentTowerLayer = {
                    commands: tower.precode[layerHeight].commands,
                    layerHeight: layerHeight
                };
                totalLayerToolChanges = tower.layerStats[layerHeight].transitions.length;
                totalTowerLayerInstructions = currentTowerLayer.commands.length;
                if (totalLayerToolChanges === 0) {
                    thisTransitionExtrusion = tower.precode[layerHeight].totalExtrusion;
                }
            }

        }


        // step through the original list of instructions,
        // making additions and modifications along the way

        raft.rewind();
        await raft.play(async function (currentInstruction, currentState) {

            if (DEBUG.skipModifications) {
                return;
            }

            if (!firstPrintLayerReached) {
                let result = checkFirstPrintLayerReached(raft, raft.getCurrentInstruction(), printLayerHeights);
                if (result.firstPrintLayerReached) {
                    firstPrintLayerReached = true;
                    firstPrintLayerStartExtrusion = result.firstPrintLayerStartExtrusion;
                }
            }
            if (!firstPrintLayerPrinted && firstPrintLayerReached) {
                firstPrintLayerPrinted = checkFirstPrintLayerPrinted(raft, raft.getCurrentInstruction(), firstPrintLayerStartExtrusion);
            }
            if (firstPrintLayerReached) {
                let result = checkLastExtrusionZ(raft, raft.getCurrentInstruction());
                if (result !== null) {
                    lastExtrusionZ = result;
                }
            }

            lastNonTowerX = currentState.get("x").position;
            lastNonTowerY = currentState.get("y").position;
            lastNonTowerZ = currentState.get("z").position;
            lastPrintExtrusionPosition = currentState.get("extrusion").position;

            if ((raft.getCurrentInstruction() instanceof Raft.MoveInstruction)
                && !(raft.getCurrentInstruction() instanceof Raft.HomeInstruction)
                && raft.getCurrentInstruction().z !== null) {

                raft.stepBackward();
                let previousZ = raft.getCurrentState().get("z").position;
                raft.stepForward();

                if (previousZ > currentState.get("z").position && tower.towerLayerHeights.indexOf(previousZ) >= 0
                    && lastExtrusionZ === previousZ) {
                    firstPrintLayerReached = false;
                    firstPrintLayerPrinted = false;
                }

                if (firstLayerReached) {
                    // perform tower layer change handling
                    let changeTowerLayer = false;
                    if (useZLifts) {
                        zState = zState.getNextState(raft, zLiftDistance);
                        if (zState.changeTowerToLayer !== false) {
                            if (layerToolChangeCounter >= totalLayerToolChanges) {
                                changeTowerLayer = true;
                                zState.changeTowerToLayer = false;
                            }
                        }
                    } else {
                        if (layerToolChangeCounter >= totalLayerToolChanges) {
                            changeTowerLayer = true;
                        }
                    }
                    if (changeTowerLayer) {
                        let nextTowerLayer = tower.towerLayerHeights[tower.towerLayerHeights.indexOf(lastTowerLayer) + 1];
                        if (nextTowerLayer === undefined) {
                            nextTowerLayer = null;
                        } else {
                            lastTowerLayer = nextTowerLayer;
                        }
                        if (DEBUG.console) {
                            console.log("setting tower to Z = " + nextTowerLayer);
                        }
                        raft.stepBackward();
                        await setTowerToLayer(nextTowerLayer);
                        raft.stepForward();
                    }
                }

                if (printLayerHeights.indexOf(currentState.get("z").position) === 0) {
                    firstLayerReached = true;
                }

            }

            if (((raft.getCurrentInstruction() instanceof Raft.SetToolheadTemperatureInstruction)
                    || (raft.getCurrentInstruction() instanceof Raft.StabilizeToolheadTemperatureInstruction))
                && raft.getCurrentInstruction().toolhead !== null
                && raft.getCurrentInstruction().toolhead !== printExtruder) {
                raft.stepBackward();
                raft.deleteInstruction();
            }

            if (raft.getCurrentInstruction() instanceof Raft.ToolChangeInstruction) {
                let currentInstruction = raft.getCurrentInstruction();
                let instructionDeleted = false;
                if (currentTool === null) {
                    if (firstPrintLayerPrinted) {
                        currentTool = 0;
                    } else {
                        currentTool = currentInstruction.toolhead;
                    }
                }
                if (currentInstruction.toolhead !== currentTool) {

                    if (totalLayerToolChanges === 0) {
                        let nextTowerIndex = tower.towerLayerHeights.indexOf(lastTowerLayer) + 1;
                        raft.stepBackward();
                        raft.deleteInstruction();
                        instructionDeleted = true;
                        while (true) {
                            let nextTowerLayer = tower.towerLayerHeights[nextTowerIndex];
                            if (nextTowerLayer === undefined) {
                                break;
                            }
                            if (DEBUG.console) {
                                console.log("setting tower to Z = " + nextTowerLayer);
                            }
                            lastTowerLayer = nextTowerLayer;
                            await setTowerToLayer(nextTowerLayer, false);
                            if (tower.layerStats[nextTowerLayer].transitions.length > 0) {
                                break;
                            }
                            nextTowerIndex++;
                        }
                    }

                    let extraTransitionLength = 0;
                    let infillDumpLength = {
                        total: 0,
                        usableTotal: 0,
                        offset: 0,
                        usableOffset: 0
                    };
                    if (totalLayerToolChanges > 0 && layerToolChangeCounter < totalLayerToolChanges) {
                        extraTransitionLength = tower.layerStats[currentTowerLayer.layerHeight].transitions[layerToolChangeCounter].extraPieceLength;
                        thisTransitionExtrusion = getThisTransitionExtrusionForTower(tower, printer, currentTowerLayer.layerHeight, layerToolChangeCounter);
                        if (printer.canInfillDump()) {
                            infillDumpLength = tower.layerStats[currentTowerLayer.layerHeight].transitions[layerToolChangeCounter].infillDumpAmount;
                        }
                    }
                    if (DEBUG.console) {
                        console.log("toolchange at totalE = " + (raft.getCurrentState().get("extrusion").totalDispensed + extraTransitionLength));
                    }

                    let spliceLength = (raft.getCurrentState().get("extrusion").totalDispensed
                        + (targetTransitionPosition * (thisTransitionExtrusion - extraTransitionLength))
                        + extraTransitionLength
                        - infillDumpLength.usableOffset);
                    let shouldAddBrim = false;
                    if (useBrims && !brimsInserted) {
                        spliceLength += tower.brims.extrusion;
                        brimsInserted = true;
                        shouldAddBrim = true;
                    }

                    // insert a splice partway into the transition tower
                    msf.spliceList.push([
                        currentTool,
                        spliceLength + firmwarePurge
                    ]);
                    checkSpliceLength(msf.spliceList);

                    currentTool = currentInstruction.toolhead;

                    if (!instructionDeleted) {
                        raft.stepBackward();
                        raft.deleteInstruction();
                        instructionDeleted = true;
                    }

                    if (DEBUG.comments) {
                        raft.insertInstruction(new Raft.EmptyInstruction({
                            comment: " toolchange at totalE = " + (raft.getCurrentState().get("extrusion").totalDispensed + extraTransitionLength)
                        }));
                        raft.insertInstruction(new Raft.EmptyInstruction({
                            comment: " transition length = " + (thisTransitionExtrusion - extraTransitionLength) + " mm"
                        }));
                        raft.insertInstruction(new Raft.EmptyInstruction({
                            comment: " transition target = " + (targetTransitionPosition * 100) + "%"
                        }));
                    }

                    transitionExtrusionSoFar = 0;
                    layerToolChangeCounter++;
                    if (DEBUG.console) {
                        console.log("layerToolChangeCounter = " + layerToolChangeCounter);
                    }

                    // print the next portion of this layer of the tower
                    if (layerToolChangeCounter > totalLayerToolChanges) {
                        if (DEBUG.console) {
                            let match = raft.getCurrentInstruction().comment.match(/line ([0-9]+)/);
                            if (DEBUG.sourceMap && match && match[1]) {
                                console.error("Error at line " + match[1] + " / PC = " + raft.programCounter + ":");
                            } else {
                                console.error("Error at PC = " + raft.programCounter + ":");
                            }
                            console.error("Transition inconsistency occurred:");
                            console.error("Chroma is attempting to handle a toolchange that it failed to recognize in pre-flight.");
                        }
                        throw {
                            message: "Transition inconsistency occurred",
                            detail: "Chroma is attempting to handle a toolchange that it failed to recognize in pre-flight.\n\nPlease contact support@mosaicmanufacturing.com with your print file and Chroma profile for assistance.",
                            exitCode: 23
                        };
                    } else if (layerToolChangeCounter === totalLayerToolChanges) {
                        // this is the last transition -- print the rest of the tower
                        if (DEBUG.console) {
                            console.log("finishing tower layer at Z = " + currentTowerLayer.layerHeight);
                        }
                        if (DEBUG.comments) {
                            raft.insertInstruction(new Raft.EmptyInstruction({
                                comment: " finishing tower layer"
                            }));
                        }
                        moveToTower();
                        if (shouldAddBrim) {
                            for (let i = 0; i < (tower.brims.count * 5) - 1; i++) {
                                insertNextTowerCommand();
                            }
                        }
                        while (towerLayerInstructionCounter < totalTowerLayerInstructions) {
                            insertNextTowerCommand();
                        }
                        await leaveTower();
                    } else {
                        // not the last transition -- print the next portion of the tower
                        if (DEBUG.console) {
                            console.log("continuing tower layer at Z = " + currentTowerLayer.layerHeight);
                        }
                        if (DEBUG.comments) {
                            raft.insertInstruction(new Raft.EmptyInstruction({
                                comment: " continuing tower layer"
                            }));
                        }
                        moveToTower();
                        if (shouldAddBrim) {
                            for (let i = 0; i < (tower.brims.count * 5) - 1; i++) {
                                insertNextTowerCommand();
                            }
                            transitionExtrusionSoFar = 0;
                            setExtrusionPosition(raft, 0);
                        }
                        while (transitionExtrusionSoFar < thisTransitionExtrusion) {
                            insertNextTowerCommand();
                        }
                        await leaveTower();
                    }

                }
                if (!instructionDeleted) {
                    raft.stepBackward();
                    raft.deleteInstruction();
                }
            }

        });

        if (DEBUG.skipModifications) {
            return msf;
        }

        // add the last splice to the MSF now that the print is finished
        let totalExtrusion = raft.getCurrentState().get("extrusion").totalDispensed;
        addLastSplice(msf, totalExtrusion, currentTool, printer, effectiveLoadingOffset);

        // manually insert a toolchange to the print extruder once processing is complete
        addPrintExtruderChange(raft, printExtruder);

    }

    async _mergeSideTransitions(msf, progressBar = null, driveColorStrengths = null) {

        const raft = this._outRaft;
        const printer = this._printerProfile;
        const printExtruder = this.printExtruder;
        const firmwarePurge = printer.firmwarePurge;
        const PING_EXTRUSION_LENGTH = printer.getPingExtrusionLength();
        const printFeatureDetection = this.printFeatureDetection;
        const solidLayerFeatureComments = this.solidLayerFeatureComments;

        const printLayerHeights = this.printLayerHeights;
        let firstLayerReached = false;

        // speed settings
        const speeds = this.speeds;
        const purgeSpeed = printer.transitionSettings.sideTransitions.purgeSpeed;

        const cutterToScrollWheel = (global.env.oem ? 450 : 760);
        const effectiveLoadingOffset = (printer.loadingOffset / printer.getPulsesPerMM()) + cutterToScrollWheel;

        // retraction settings
        const retractDistance = this.retractDistance;
        const useRetracts = (retractDistance > 0);
        const useDedicatedRetracts = this.dedicatedRetractCommands;
        let printIsRetracted = false;
        let lastPrintRetraction = 0;

        // Z-lift settings and flags
        const zLiftDistance = this.zLiftDistance;
        const useZLifts = (zLiftDistance > 0);
        let zState = new ZStateMachine();

        // keep track of various print head positions of interest
        let lastPrintX, lastPrintY, lastPrintZ;

        // keep track of the current tool
        let currentTool = null;
        let firstPrintLayerReached = false;
        let firstPrintLayerPrinted = false;
        let firstPrintLayerStartExtrusion = 0;

        // bed bounds
        const xBedMin = -printer.printBedDimensions.originOffsets.x;
        const xBedMax = printer.printBedDimensions.x - printer.printBedDimensions.originOffsets.x;
        const yBedMin = -printer.printBedDimensions.originOffsets.y;
        const yBedMax = printer.printBedDimensions.y - printer.printBedDimensions.originOffsets.y;

        // transition-specific settings
        const targetTransitionPosition = printer.transitionSettings.targetPosition;
        const transitionLength = printer.transitionSettings.purgeLength;
        const initialTransitionLength = printer.transitionSettings.initialPurgeLength;
        const purgeInPlace = printer.transitionSettings.sideTransitions.purgeInPlace;
        const purgeCoordinates = printer.transitionSettings.sideTransitions.coordinates;
        const purgeEdge = printer.transitionSettings.sideTransitions.purgeEdge;
        const purgeEdgeOffset = printer.transitionSettings.sideTransitions.purgeEdgeOffset;
        let nextPurgeDirection = null;

        // keep a short history of extrusion values for use with cumulative extrusion and G92 resets
        let lastPrintExtrusionPosition = 0;
        let lastExtrusionZ = 0;
        let highestZ = 0;

        // ping-related constants, counters, and flags
        let lastPingStart = 0;
        let nextPingStart = PING_MIN_SPACING;

        if (DEBUG.console) {
            console.log("");
            console.log("*** OUTPUT GENERATION ***");
            console.log("");
        }

        let purgeInPlaceJogDirection = "north";
        if (purgeInPlace && printer.jogPauses) {
            if (Math.abs(purgeCoordinates.x - xBedMax) === Math.abs(purgeCoordinates.x - xBedMin)) {
                // halfway between west and east edges
                purgeInPlaceJogDirection = "east";
            } else if (Math.abs(purgeCoordinates.x - xBedMax) > Math.abs(purgeCoordinates.x - xBedMin)) {
                // closer to west edge than east edge
                if (Math.abs(purgeCoordinates.y - yBedMax) === Math.abs(purgeCoordinates.y - yBedMin)) {
                    // halfway between north and south edges
                    purgeInPlaceJogDirection = "north";
                } else if (Math.abs(purgeCoordinates.y - yBedMax) < Math.abs(purgeCoordinates.y - yBedMin)) {
                    // closer to north edge than south edge
                    purgeInPlaceJogDirection = "south";
                } else {
                    // closer to south edge than north edge
                    purgeInPlaceJogDirection = "north";
                }
            } else {
                // closer to east edge than west edge
                if (Math.abs(purgeCoordinates.y - yBedMax) === Math.abs(purgeCoordinates.y - yBedMin)) {
                    // halfway between north and south edges
                    purgeInPlaceJogDirection = "north";
                } else if (Math.abs(purgeCoordinates.y - yBedMax) < Math.abs(purgeCoordinates.y - yBedMin)) {
                    // closer to north edge than south edge
                    purgeInPlaceJogDirection = "south";
                } else {
                    // closer to south edge than north edge
                    purgeInPlaceJogDirection = "north";
                }
            }
        }

        function insertJogPause(duration, direction = "north") {
            // duration is measured in milliseconds

            duration /= 1000;

            let currentX = raft.getCurrentState().get("x").position;
            let currentY = raft.getCurrentState().get("y").position;

            if (direction === "north" && currentY + duration > yBedMax - 5) {
                direction = "south";
            } else if (direction === "south" && currentY - duration < yBedMin + 5) {
                direction = "north";
            } else if (direction === "west" && currentX - duration < xBedMin + 5) {
                direction = "east";
            } else if (direction === "east" && currentX + duration > xBedMax - 5) {
                direction = "west";
            }

            let totalJogs = 5;
            if (printer.postprocessing === "makerbot") {
                totalJogs = 20;
            }

            if (direction === "north") {
                for (let i = 0; i < totalJogs; i++) {
                    raft.insertInstruction(new Raft.LinearMoveInstruction({
                        x: currentX,
                        y: roundTo(currentY + duration, 4),
                        feedrate: 600
                    }));
                    raft.insertInstruction(new Raft.LinearMoveInstruction({
                        x: currentX,
                        y: currentY,
                        feedrate: 600
                    }));
                }
            } else if (direction === "south") {
                for (let i = 0; i < totalJogs; i++) {
                    raft.insertInstruction(new Raft.LinearMoveInstruction({
                        x: currentX,
                        y: roundTo(currentY - duration, 4),
                        feedrate: 600
                    }));
                    raft.insertInstruction(new Raft.LinearMoveInstruction({
                        x: currentX,
                        y: currentY,
                        feedrate: 600
                    }));
                }
            } else if (direction === "west") {
                for (let i = 0; i < totalJogs; i++) {
                    raft.insertInstruction(new Raft.LinearMoveInstruction({
                        x: roundTo(currentX - duration, 4),
                        y: currentY,
                        feedrate: 600
                    }));
                    raft.insertInstruction(new Raft.LinearMoveInstruction({
                        x: currentX,
                        y: currentY,
                        feedrate: 600
                    }));
                }
            } else if (direction === "east") {
                for (let i = 0; i < totalJogs; i++) {
                    raft.insertInstruction(new Raft.LinearMoveInstruction({
                        x: roundTo(currentX + duration, 4),
                        y: currentY,
                        feedrate: 600
                    }));
                    raft.insertInstruction(new Raft.LinearMoveInstruction({
                        x: currentX,
                        y: currentY,
                        feedrate: 600
                    }));
                }
            }

        }

        function checkForPings(currentlyTransitioning = false, transitionExtrusionSoFar = 0, totalTransitionExtrusion = 0) {
            let currentE = raft.getCurrentState().get("extrusion");
            let totalExtrusion = currentE.totalDispensed;
            let cumulative = currentE.coordinateMode === Raft.CoordinateModes.Absolute;
            if (global.env.oem) {
                if (totalExtrusion >= nextPingStart) {
                    raft.insertInstruction(new Raft.DwellInstruction({
                        duration: 0
                    }));
                    raft.insertInstruction(new Raft.OPingDataInstruction({
                        length: totalExtrusion
                    }));
                    msf.pingList.push([totalExtrusion + firmwarePurge]);
                    lastPingStart = totalExtrusion;
                    nextPingStart = getNextPingStartValue(lastPingStart);
                }
            } else {
                if (totalExtrusion >= nextPingStart) {
                    if (!currentlyTransitioning) {
                        moveToDumpPosition();
                        currentE = raft.getCurrentState().get("extrusion");
                    }
                    let currentExtrusion = currentE.position;
                    if (purgeInPlace) {
                        if (DEBUG.comments) {
                            raft.insertInstruction(new Raft.EmptyInstruction({
                                comment: " ping " + (msf.pingList.length + 1) + " pause 1"
                            }));
                            raft.insertInstruction(new Raft.EmptyInstruction({
                                comment: " totalE = " + raft.getCurrentState().get("extrusion").totalDispensed
                            }));
                        }
                        let moveDuration = 0;
                        if (!currentlyTransitioning || transitionExtrusionSoFar === 0) {
                            moveDuration = getLineLength(
                                lastPrintX,
                                lastPrintY,
                                raft.getCurrentState().get("x").position,
                                raft.getCurrentState().get("y").position) * 60 * 1000 / speeds.rapidXY;
                        }
                        if (printer.jogPauses) {
                            insertJogPause(Math.round(PING_PAUSE_1_LENGTH - moveDuration), purgeInPlaceJogDirection);
                        } else {
                            insertDwellPause(raft, Math.round(PING_PAUSE_1_LENGTH - moveDuration));
                        }
                        let purgeFeedrate = purgeSpeed * 60;
                        let eParam = (cumulative ? roundTo(currentExtrusion + PING_EXTRUSION_LENGTH, 5) : roundTo(PING_EXTRUSION_LENGTH, 5));
                        if (printer.engine === "tiertime") {
                            eParam = roundTo(eParam * printer.extruderStepsPerMM, 5);
                        }
                        raft.insertInstruction(new Raft.LinearMoveInstruction({
                            extrusion: eParam,
                            feedrate: purgeFeedrate
                        }));

                        raft.insertInstruction(new Raft.LinearMoveInstruction({
                        }));
                        if (DEBUG.comments) {
                            raft.insertInstruction(new Raft.EmptyInstruction({
                                comment: " ping " + (msf.pingList.length + 1) + " pause 2"
                            }));
                            raft.insertInstruction(new Raft.EmptyInstruction({
                                comment: " totalE = " + raft.getCurrentState().get("extrusion").totalDispensed
                            }));
                        }
                        moveDuration = 0;
                        if (!currentlyTransitioning || transitionExtrusionSoFar + PING_EXTRUSION_LENGTH >= totalTransitionExtrusion) {
                            moveDuration = getLineLength(
                                lastPrintX,
                                lastPrintY,
                                raft.getCurrentState().get("x").position,
                                raft.getCurrentState().get("y").position) * 60 * 1000 / speeds.rapidXY;
                        }
                        if (printer.jogPauses) {
                            insertJogPause(Math.round(PING_PAUSE_2_LENGTH - moveDuration), purgeInPlaceJogDirection);
                        } else {
                            insertDwellPause(raft, Math.round(PING_PAUSE_2_LENGTH - moveDuration));
                        }
                    } else {
                        if (nextPurgeDirection === null) {
                            if (purgeEdge === "north" || purgeEdge === "south") {
                                nextPurgeDirection = "east";
                            } else {
                                nextPurgeDirection = "north";
                            }
                        }
                        if (DEBUG.comments) {
                            raft.insertInstruction(new Raft.EmptyInstruction({
                                comment: " ping " + (msf.pingList.length + 1) + " pause 1"
                            }));
                            raft.insertInstruction(new Raft.EmptyInstruction({
                                comment: " totalE = " + raft.getCurrentState().get("extrusion").totalDispensed
                            }));
                        }
                        let moveDuration = 0;
                        if (!currentlyTransitioning || transitionExtrusionSoFar === 0) {
                            moveDuration = getLineLength(
                                lastPrintX,
                                lastPrintY,
                                raft.getCurrentState().get("x").position,
                                raft.getCurrentState().get("y").position) * 60 * 1000 / speeds.rapidXY;
                        }
                        if (printer.jogPauses) {
                            insertJogPause(Math.round(PING_PAUSE_1_LENGTH - moveDuration), nextPurgeDirection);
                        } else {
                            insertDwellPause(raft, Math.round(PING_PAUSE_1_LENGTH - moveDuration));
                        }
                        let currentX = raft.getCurrentState().get("x").position;
                        let currentY = raft.getCurrentState().get("y").position;
                        let nextX = currentX;
                        let nextY = currentY;
                        if (nextPurgeDirection === "north") {
                            nextY = currentY + 5;
                        } else if (nextPurgeDirection === "south") {
                            nextY = currentY - 5;
                        } else if (nextPurgeDirection === "west") {
                            nextX = currentX - 5;
                        } else if (nextPurgeDirection === "east") {
                            nextX = currentX + 5;
                        }
                        let totalJogs = 5;
                        let jogPerTransition = PING_EXTRUSION_LENGTH / 10;
                        let eParam = (cumulative ? (currentExtrusion + jogPerTransition) : jogPerTransition);
                        for (let i = 0; i < totalJogs; i++) {
                            raft.insertInstruction(new Raft.LinearMoveInstruction({
                                x: nextX,
                                y: nextY,
                                extrusion: roundTo(eParam, 5),
                                feedrate: 600
                            }));
                            if (cumulative) {
                                eParam += jogPerTransition;
                            }
                            raft.insertInstruction(new Raft.LinearMoveInstruction({
                                x: currentX,
                                y: currentY,
                                extrusion: roundTo(eParam, 5),
                                feedrate: 600
                            }));
                            if (cumulative) {
                                eParam += jogPerTransition;
                            }
                        }
                        if (DEBUG.comments) {
                            raft.insertInstruction(new Raft.EmptyInstruction({
                                comment: " ping " + (msf.pingList.length + 1) + " pause 2"
                            }));
                            raft.insertInstruction(new Raft.EmptyInstruction({
                                comment: " totalE = " + raft.getCurrentState().get("extrusion").totalDispensed
                            }));
                        }
                        moveDuration = 0;
                        if (!currentlyTransitioning || transitionExtrusionSoFar + PING_EXTRUSION_LENGTH >= totalTransitionExtrusion) {
                            moveDuration = getLineLength(
                                lastPrintX,
                                lastPrintY,
                                raft.getCurrentState().get("x").position,
                                raft.getCurrentState().get("y").position) * 60 * 1000 / speeds.rapidXY;
                        }
                        if (printer.jogPauses) {
                            insertJogPause(Math.round(PING_PAUSE_2_LENGTH - moveDuration), nextPurgeDirection);
                        } else {
                            insertDwellPause(raft, Math.round(PING_PAUSE_2_LENGTH - moveDuration));
                        }
                    }
                    msf.pingList.push([totalExtrusion + firmwarePurge]);
                    lastPingStart = totalExtrusion;
                    nextPingStart = getNextPingStartValue(lastPingStart);
                    if (!currentlyTransitioning) {
                        leaveDumpPosition();
                    }
                }
            }
        }

        function moveToDumpPosition() {
            let currentRetraction = raft.getCurrentState().get("extrusion").retraction;

            // retract if the print uses retracts, and has not already retracted
            if (useRetracts) {
                printIsRetracted = (currentRetraction > 0);
                lastPrintRetraction = currentRetraction;
                if (!printIsRetracted) {
                    insertRetract(raft, useDedicatedRetracts, retractDistance, speeds.retraction);
                }
            }

            // Z-lift up if the print uses z-lifts
            if (useZLifts) {
                raft.insertInstruction(new Raft.LinearMoveInstruction({
                    z: roundTo(lastPrintZ + zLiftDistance, 4),
                    feedrate: speeds.rapidZ
                }));
            }

            let startingPosition = {
                x: lastPrintX,
                y: lastPrintY
            };
            if (purgeInPlace) {
                startingPosition.x = purgeCoordinates.x;
                startingPosition.y = purgeCoordinates.y;
            } else {
                if (purgeEdge === "north") {
                    startingPosition.y = yBedMax + purgeEdgeOffset;
                } else if (purgeEdge === "south") {
                    startingPosition.y = yBedMin - purgeEdgeOffset;
                } else if (purgeEdge === "west") {
                    startingPosition.x = xBedMin - purgeEdgeOffset;
                } else if (purgeEdge === "east") {
                    startingPosition.x = xBedMax + purgeEdgeOffset;
                }
            }

            raft.insertInstruction(new Raft.LinearMoveInstruction({
                x: startingPosition.x,
                y: startingPosition.y,
                feedrate: speeds.rapidXY,
                comment: " move to side"
            }));

            // unretract if the print uses retracts
            if (useRetracts) {
                if (printIsRetracted) {
                    insertUnretract(raft, useDedicatedRetracts, lastPrintRetraction, speeds.retraction);
                } else {
                    insertUnretract(raft, useDedicatedRetracts, retractDistance, speeds.retraction);
                }
            }

            let cumulative = raft.getCurrentState().get("extrusion").coordinateMode === Raft.CoordinateModes.Absolute;
            if (cumulative) {
                setExtrusionPosition(raft, 0);
            }
        }

        function leaveDumpPosition() {

            // retract if the print uses retracts
            if (useRetracts) {
                if (printIsRetracted) {
                    insertRetract(raft, useDedicatedRetracts, lastPrintRetraction, speeds.retraction);
                } else {
                    insertRetract(raft, useDedicatedRetracts, retractDistance, speeds.retraction);
                }
            }

            if (DEBUG.comments) {
                raft.insertInstruction(new Raft.EmptyInstruction({
                    comment: " leaving side"
                }));
            }

            returnToPrintLookahead(raft, SIDE_TRANSITIONS, lastPrintX, lastPrintY, speeds.rapidXY);

            // Z-lift down if the print uses z-lifts
            if (useZLifts) {
                raft.insertInstruction(new Raft.LinearMoveInstruction({
                    z: lastPrintZ,
                    feedrate: speeds.rapidZ
                }));
            }

            // unretract if the print uses retracts, and was not already retracted
            if (useRetracts && !printIsRetracted) {
                insertUnretract(raft, useDedicatedRetracts, retractDistance, speeds.retraction);
            }

            let cumulative = raft.getCurrentState().get("extrusion").coordinateMode === Raft.CoordinateModes.Absolute;
            if (cumulative) {
                let nextValue = null;
                raft.stepForward();
                let nextInstruction = raft.getCurrentInstruction();
                if (nextInstruction instanceof Raft.SetPositionInstruction) {
                    nextValue = nextInstruction.extrusion;
                }
                raft.stepBackward();
                if (nextValue !== lastPrintExtrusionPosition) {
                    setExtrusionPosition(raft, lastPrintExtrusionPosition);
                }
            }
        }

        function sideDumpInPlace(totalPurgeLength) {
            let currentE = raft.getCurrentState().get("extrusion");
            let totalExtrusionAtStart = currentE.totalDispensed;
            let cumulative = currentE.coordinateMode === Raft.CoordinateModes.Absolute;
            let purgeFeedrate = purgeSpeed * 60;
            let purgeSoFar = 0;

            if (global.pingOptions.usePings && totalExtrusionAtStart >= nextPingStart) {
                checkForPings(true, purgeSoFar, totalPurgeLength);
                purgeSoFar += PING_EXTRUSION_LENGTH;
            }
            while (purgeSoFar < totalPurgeLength) {
                let nextPurgeExtrusion = totalPurgeLength - purgeSoFar;
                let shouldPing = false;
                if (global.pingOptions.usePings && totalExtrusionAtStart + purgeSoFar + nextPurgeExtrusion >= nextPingStart) {
                    nextPurgeExtrusion = nextPingStart - (totalExtrusionAtStart + purgeSoFar) + 1;
                    shouldPing = true;
                }
                purgeSoFar += nextPurgeExtrusion;
                let eParam = (cumulative ? roundTo(purgeSoFar, 5) : roundTo(nextPurgeExtrusion, 5));
                raft.insertInstruction(new Raft.LinearMoveInstruction({
                    extrusion: eParam,
                    feedrate: purgeFeedrate
                }));
                if (shouldPing) {
                    checkForPings(true, purgeSoFar, totalPurgeLength);
                    purgeSoFar += PING_EXTRUSION_LENGTH;
                }
            }
        }

        function sideDumpJogs(totalPurgeLength) {
            let currentX = raft.getCurrentState().get("x").position;
            let currentY = raft.getCurrentState().get("y").position;
            let currentE = raft.getCurrentState().get("extrusion");
            let totalExtrusionAtStart = currentE.totalDispensed;
            let cumulative = currentE.coordinateMode === Raft.CoordinateModes.Absolute;
            let purgeFeedrate = speeds.printing / 2;
            let purgeSoFar = 0;

            if (purgeEdge === "north" || purgeEdge === "south") {
                nextPurgeDirection = (xBedMax - currentX >= currentX - xBedMin) ? "east" : "west";
            } else {
                nextPurgeDirection = (yBedMax - currentY >= currentY - yBedMin) ? "north" : "south";
            }
            let nextX = currentX;
            let nextY = currentY;

            if (global.pingOptions.usePings && totalExtrusionAtStart >= nextPingStart) {
                checkForPings(true, purgeSoFar, totalPurgeLength);
                purgeSoFar += PING_EXTRUSION_LENGTH;
            }
            let edgeClearance = 15;
            let dimensionOfInterest;
            if (purgeEdge === "north" || purgeEdge === "south") {
                dimensionOfInterest = printer.printBedDimensions.x;
            } else {
                dimensionOfInterest = printer.printBedDimensions.y;
            }
            if (dimensionOfInterest < 50) {
                edgeClearance = 0;
            } else if (dimensionOfInterest < 80) {
                edgeClearance = 10;
            }
            while (purgeSoFar < totalPurgeLength) {
                if (nextPurgeDirection === "north") {
                    nextY = yBedMax - edgeClearance;
                } else if (nextPurgeDirection === "south") {
                    nextY = yBedMin + edgeClearance;
                } else if (nextPurgeDirection === "west") {
                    nextX = xBedMin + edgeClearance;
                } else if (nextPurgeDirection === "east") {
                    nextX = xBedMax - edgeClearance;
                }
                let lineLength = getLineLength(currentX, currentY, nextX, nextY);
                let nextPurgeExtrusion = lineLength * (purgeSpeed * 60) / purgeFeedrate;
                if (purgeSoFar + nextPurgeExtrusion > totalPurgeLength) {
                    let t = (totalPurgeLength - purgeSoFar) / nextPurgeExtrusion;
                    nextPurgeExtrusion = lerp(0, nextPurgeExtrusion, t);
                    if (nextPurgeDirection === "north" || nextPurgeDirection === "south") {
                        nextY = lerp(currentY, nextY, t);
                    } else {
                        nextX = lerp(currentX, nextX, t);
                    }
                }
                let shouldPing = false;
                if (global.pingOptions && totalExtrusionAtStart + purgeSoFar + nextPurgeExtrusion >= nextPingStart) {
                    shouldPing = true;
                }
                purgeSoFar += nextPurgeExtrusion;
                let eParam = cumulative ? purgeSoFar : nextPurgeExtrusion;
                raft.insertInstruction(new Raft.LinearMoveInstruction({
                    x: roundTo(nextX, 4),
                    y: roundTo(nextY, 4),
                    extrusion: roundTo(eParam, 5),
                    feedrate: purgeFeedrate
                }));
                if (shouldPing) {
                    checkForPings(true, purgeSoFar, totalPurgeLength);
                    purgeSoFar += PING_EXTRUSION_LENGTH;
                }
                currentX = nextX;
                currentY = nextY;
                // reverse direction
                if (nextPurgeDirection === "north") {
                    nextPurgeDirection = "south";
                } else if (nextPurgeDirection === "south") {
                    nextPurgeDirection = "north";
                } else if (nextPurgeDirection === "west") {
                    nextPurgeDirection = "east";
                } else if (nextPurgeDirection === "east") {
                    nextPurgeDirection = "west";
                }
            }
        }

        function insertSideDump(totalPurgeLength) {
            if (purgeInPlace) {
                sideDumpInPlace(totalPurgeLength);
            } else {
                sideDumpJogs(totalPurgeLength);
            }
        }


        // step through the original list of instructions,
        // making additions and modifications along the way

        raft.rewind();
        await raft.play(async function (currentInstruction, currentState) {

            if (DEBUG.skipModifications) {
                return;
            }

            if (!firstPrintLayerReached) {
                let result = checkFirstPrintLayerReached(raft, currentInstruction, printLayerHeights);
                if (result.firstPrintLayerReached) {
                    firstPrintLayerReached = true;
                    firstPrintLayerStartExtrusion = result.firstPrintLayerStartExtrusion;
                }
            }
            if (!firstPrintLayerPrinted && firstPrintLayerReached) {
                firstPrintLayerPrinted = checkFirstPrintLayerPrinted(raft, currentInstruction, firstPrintLayerStartExtrusion);
            }
            if (firstPrintLayerReached) {
                let result = checkLastExtrusionZ(raft, currentInstruction);
                if (result !== null) {
                    lastExtrusionZ = result;
                }
            }

            lastPrintX = currentState.get("x").position;
            lastPrintY = currentState.get("y").position;
            lastPrintZ = currentState.get("z").position;
            lastPrintExtrusionPosition = currentState.get("extrusion").position;

            if ((currentInstruction instanceof Raft.MoveInstruction)
                && !(currentInstruction instanceof Raft.HomeInstruction)
                && currentInstruction.z !== null) {

                let currentZ = currentState.get("z").position;
                raft.stepBackward();
                let previousZ = raft.getCurrentState().get("z").position;
                raft.stepForward();

                if (previousZ > currentZ && printLayerHeights.indexOf(previousZ) >= 0
                    && lastExtrusionZ === previousZ) {
                    firstPrintLayerReached = false;
                    firstPrintLayerPrinted = false;
                }

                if (previousZ !== currentZ) {

                    if (progressBar) {
                        if (currentZ > highestZ) {
                            highestZ = currentZ;
                            await progressBar.increment("Generating output files");
                        }
                    }

                    if (firstLayerReached) {
                        // perform tower layer change handling
                        if (useZLifts) {
                            if (global.pingOptions.usePings) {
                                let stepsForward = 0;
                                let aboutToTransition = false;
                                let currentE = currentState.get("extrusion").totalDispensed;
                                while (true) {
                                    let stepping = raft.stepForward();
                                    if (!stepping) {
                                        break;
                                    }
                                    stepsForward++;
                                    if (raft.getCurrentState().get("extrusion").totalDispensed > currentE) {
                                        break;
                                    }
                                    if (raft.getCurrentInstruction() instanceof Raft.ToolChangeInstruction) {
                                        aboutToTransition = true;
                                        break;
                                    }
                                }
                                while (stepsForward > 0) {
                                    raft.stepBackward();
                                    stepsForward--;
                                }
                                if (!aboutToTransition) {
                                    if (previousZ > currentZ) {
                                        checkForPings();
                                    } else {
                                        raft.stepBackward();
                                        checkForPings();
                                        raft.stepForward();
                                    }
                                }
                            }
                            zState = zState.getNextState(raft, zLiftDistance);
                        } else if (global.pingOptions.usePings) {
                            checkForPings();
                        }
                    }

                    if (printLayerHeights.indexOf(currentState.get("z").position) === 0) {
                        firstLayerReached = true;
                    }

                }

            }

            if (((raft.getCurrentInstruction() instanceof Raft.SetToolheadTemperatureInstruction)
                    || (raft.getCurrentInstruction() instanceof Raft.StabilizeToolheadTemperatureInstruction))
                && raft.getCurrentInstruction().toolhead !== null
                && raft.getCurrentInstruction().toolhead !== printExtruder) {
                raft.stepBackward();
                raft.deleteInstruction();
            }

            if (raft.getCurrentInstruction() instanceof Raft.ToolChangeInstruction) {
                let currentInstruction = raft.getCurrentInstruction();
                let instructionDeleted = false;
                if (currentTool === null) {
                    if (firstPrintLayerPrinted) {
                        currentTool = 0;
                    } else {
                        currentTool = currentInstruction.toolhead;
                    }
                }
                if (currentInstruction.toolhead !== currentTool) {
                    if (DEBUG.console) {
                        console.log("toolchange at totalE = " + raft.getCurrentState().get("extrusion").totalDispensed);
                    }

                    let totalExtrusion = raft.getCurrentState().get("extrusion").totalDispensed;
                    let thisTransitionLength = (totalExtrusion < ZIGGURAT_THRESHOLD) ? initialTransitionLength : transitionLength;
                    if (driveColorStrengths && totalExtrusion >= ZIGGURAT_THRESHOLD
                        && printer.transitionSettings.purgeLength > printer.transitionSettings.minPurgeLength) {
                        thisTransitionLength = printer.interpolatePurgeLengths(
                            driveColorStrengths[currentTool],
                            driveColorStrengths[currentInstruction.toolhead]
                        );
                    }
                    let infillDumpLength = {
                        total: 0,
                        usableTotal: 0,
                        offset: 0,
                        usableOffset: 0
                    };
                    if (printer.canInfillDump() && printFeatureDetection && solidLayerFeatureComments) {
                        infillDumpLength = checkInfillDump(
                            raft,
                            printer.transitionSettings.useInfillForTransition,
                            printer.transitionSettings.useSupportForTransition
                        );
                        if (infillDumpLength.total > thisTransitionLength) {
                            infillDumpLength.total = thisTransitionLength;
                        }
                        if (infillDumpLength.offset > thisTransitionLength) {
                            infillDumpLength.offset = thisTransitionLength;
                        }
                    }
                    let spliceLength = totalExtrusion + thisTransitionLength * targetTransitionPosition - infillDumpLength.offset;
                    thisTransitionLength -= infillDumpLength.total;
                    let firstPieceExtraLength = 0;
                    if (msf.spliceList.length === 0 && spliceLength < FIRST_PIECE_MIN_LENGTH) {
                        firstPieceExtraLength = (FIRST_PIECE_MIN_LENGTH - spliceLength) + 1;
                    } else if (msf.spliceList.length > 0) {
                        let previousSpliceLength = msf.spliceList[msf.spliceList.length - 1][1];
                        if (spliceLength - previousSpliceLength < SPLICE_MIN_LENGTH) {
                            let additionalLength = SPLICE_MIN_LENGTH - (spliceLength - previousSpliceLength);
                            spliceLength += additionalLength;
                            thisTransitionLength += additionalLength;
                        }
                    }

                    // insert a splice partway into the transition tower
                    msf.spliceList.push([
                        currentTool,
                        spliceLength + firstPieceExtraLength + firmwarePurge
                    ]);
                    checkSpliceLength(msf.spliceList);

                    currentTool = currentInstruction.toolhead;

                    raft.stepBackward();
                    raft.deleteInstruction();
                    instructionDeleted = true;

                    if (DEBUG.comments) {
                        raft.insertInstruction(new Raft.EmptyInstruction({
                            comment: " toolchange at totalE = " + totalExtrusion
                        }));
                        raft.insertInstruction(new Raft.EmptyInstruction({
                            comment: " transition length = " + thisTransitionLength + " mm"
                        }));
                        raft.insertInstruction(new Raft.EmptyInstruction({
                            comment: " transition target = " + (targetTransitionPosition * 100) + "%"
                        }));
                    }

                    // perform the next side transition
                    if (thisTransitionLength + firstPieceExtraLength > 0) {
                        moveToDumpPosition();
                        if (DEBUG.comments) {
                            raft.insertInstruction(new Raft.EmptyInstruction({
                                comment: " starting side transition"
                            }));
                        }
                        insertSideDump(thisTransitionLength + firstPieceExtraLength);
                        if (DEBUG.comments) {
                            raft.insertInstruction(new Raft.EmptyInstruction({
                                comment: " finishing side transition"
                            }));
                        }
                        leaveDumpPosition();
                    } else if (global.pingOptions.usePings) {
                        checkForPings();
                    }

                }
                if (!instructionDeleted) {
                    raft.stepBackward();
                    raft.deleteInstruction();
                }
            }

        });

        if (DEBUG.skipModifications) {
            return msf;
        }

        // add the last splice to the MSF now that the print is finished
        let totalExtrusion = raft.getCurrentState().get("extrusion").totalDispensed;
        addLastSplice(msf, totalExtrusion, currentTool, printer, effectiveLoadingOffset);

        // manually insert a toolchange to the print extruder once processing is complete
        addPrintExtruderChange(raft, printExtruder);

    }

    async _outputNoTransitions(msf, progressBar = null) {

        const raft = this._outRaft;
        const printer = this._printerProfile;

        const printLayerHeights = this.printLayerHeights;
        const firmwarePurge = printer.firmwarePurge;
        const cutterToScrollWheel = (global.env.oem ? 450 : 760);
        const effectiveLoadingOffset = (printer.loadingOffset / printer.getPulsesPerMM()) + cutterToScrollWheel;

        let firstPrintLayerReached = false;
        let firstPrintLayerPrinted = false;
        let firstPrintLayerStartExtrusion = 0;
        let lastExtrusionZ = 0;
        let highestPrintZ = 0;
        let currentTool = null;

        raft.rewind();
        await raft.play(async function (currentInstruction, currentState) {

            if (!firstPrintLayerReached) {
                let result = checkFirstPrintLayerReached(raft, currentInstruction, printLayerHeights);
                if (result.firstPrintLayerReached) {
                    firstPrintLayerReached = true;
                    firstPrintLayerStartExtrusion = result.firstPrintLayerStartExtrusion;
                }
            }
            if (!firstPrintLayerPrinted && firstPrintLayerReached) {
                firstPrintLayerPrinted = checkFirstPrintLayerPrinted(raft, currentInstruction, firstPrintLayerStartExtrusion);
            }
            if (firstPrintLayerReached) {
                let result = checkLastExtrusionZ(raft, currentInstruction);
                if (result !== null) {
                    lastExtrusionZ = result;
                }
            }

            if ((raft.getCurrentInstruction() instanceof Raft.MoveInstruction)
                && !(raft.getCurrentInstruction() instanceof Raft.HomeInstruction)
                && raft.getCurrentInstruction().z !== null) {
                raft.stepBackward();
                let previousZ = raft.getCurrentState().get("z").position;
                raft.stepForward();
                let currentZ = raft.getCurrentState().get("z").position;
                if (previousZ > currentZ && lastExtrusionZ === previousZ) {
                    firstPrintLayerReached = false;
                    firstPrintLayerPrinted = false;
                }
                if (progressBar && currentZ > highestPrintZ && printLayerHeights.indexOf(currentZ) >= 0) {
                    highestPrintZ = currentZ;
                    await progressBar.increment("Generating output files");
                }
            }

            if (currentInstruction instanceof Raft.ToolChangeInstruction) {
                if (currentTool === null) {
                    if (firstPrintLayerPrinted) {
                        currentTool = 0;
                    } else {
                        currentTool = currentInstruction.toolhead;
                    }
                }
                if (currentInstruction.toolhead !== currentTool) {
                    let totalExtrusion = currentState.get("extrusion").totalDispensed;
                    if (DEBUG.console) {
                        console.log("toolchange at totalE = " + totalExtrusion);
                    }
                    msf.spliceList.push([
                        currentTool,
                        totalExtrusion + firmwarePurge
                    ]);
                    checkSpliceLength(msf.spliceList);
                }
                currentTool = currentInstruction.toolhead;
                raft.stepBackward();
                raft.deleteInstruction();
            }

        });

        // add the last splice to the MSF now that the print is finished
        let totalExtrusion = raft.getCurrentState().get("extrusion").totalDispensed;
        addLastSplice(msf, totalExtrusion, currentTool, printer, effectiveLoadingOffset);

        // manually insert a toolchange to the print extruder once processing is complete
        addPrintExtruderChange(raft, this.printExtruder);

    }

    getInfillDumpSavings(msf) {
        if (!global.print._printerProfile.canInfillDump()) {
            return null;
        }
        let totalFilament = 0;
        if (msf.spliceList.length > 0) {
            totalFilament = msf.spliceList[msf.spliceList.length - 1][1];
        }
        let totalInfillDump = 0;
        for (let z in this.transitionInfo) {
            if (this.transitionInfo.hasOwnProperty(z)) {
                for (let transition of this.transitionInfo[z]) {
                    totalInfillDump += transition.infillDumpAmount.usableTotal;
                }
            }
        }
        let totalNonPrintExtrusion = totalFilament - this.totalExtrusion;
        return {
            percent: totalInfillDump / (totalNonPrintExtrusion + totalInfillDump),
            total: totalInfillDump
        };
    }

    /**
     * Determine the (approximate) duration of the print
     * 1 hour per 5 metres of filament
     * = 3600 seconds per 5000 mm of filament
     * = 0.72 seconds per mm of filament
     */
    getTimeEstimate() {
        const timePerMM = 0.72;
        return this.totalExtrusion * timePerMM;
    }

    /**
     * Determine the most frequent print layer height in terms of deltas
     */
    getMostFrequentLayerHeight() {
        let layerDeltas = {};
        let previousZ = 0;
        for (let z of this.printLayerHeights) {
            let delta = roundTo(z - previousZ, 5);
            if (!layerDeltas.hasOwnProperty(delta)) {
                layerDeltas[delta] = 0;
            }
            layerDeltas[delta]++;
            previousZ = z;
        }
        let layerHeight = 0;
        let deltaFrequency = 0;
        for (let delta in layerDeltas) {
            if (layerDeltas.hasOwnProperty(delta)) {
                if (layerDeltas[delta] > deltaFrequency) {
                    layerHeight = parseFloat(delta);
                    deltaFrequency = layerDeltas[delta];
                }
            }
        }
        return layerHeight;
    }

    async getMakerbot5thGenMeta() {

        let raft = this._outRaft;

        // generate random UUID
        let uuid = require("uuid/v4")();

        // determine if rafts/supports are used
        // determine extruder and bed temperatures
        let usesSupports = false;
        let usesRaft = false;
        let printTemp = 0;
        let bedTemp = 0;
        raft.rewind();
        await raft.play(async function (instruction, state) {
            if (!usesRaft && state.get("printState").value === Raft.PrintStates.Raft) {
                usesRaft = true;
            }
            if (!usesSupports && state.get("printState").value === Raft.PrintStates.Support) {
                usesSupports = true;
            }
            if (state.get("extruderTemp").position !== null && state.get("extruderTemp").position > printTemp) {
                printTemp = state.get("extruderTemp").position;
            }
            if (state.get("bedTemp").position !== null && state.get("bedTemp").position > bedTemp) {
                bedTemp = state.get("bedTemp").position;
            }
        });

        // determine (approximate) mass of filament used
        const filamentDiameterCM = this._printerProfile.filamentDiameter / 10;  // in cm
        const extrusionCM = this.totalExtrusion / 10;  // in cm
        const plaDensity = 1.25;  // grams / cm^3
        let filamentVolume = Math.PI * Math.pow(filamentDiameterCM / 2, 2) * extrusionCM;  // in cm^3
        let extrusionMass = plaDensity * filamentVolume;  // in grams

        let durationEstimate = this.getTimeEstimate();

        // determine the most frequent print layer height in terms of deltas
        let layerHeight = this.getMostFrequentLayerHeight();
        let meta = {
            uuid: uuid,
            toolhead_0_temperature: printTemp,
            toolhead_1_temperature: 0,
            total_commands: raft.instructions.reduce(function (accumulator, current) {
                return accumulator + ((current instanceof Raft.EmptyInstruction) ? 0 : 1);
            }, 0),
            extrusion_distance_a_mm: roundTo(this.totalExtrusion, 1),
            extrusion_distance_b_mm: 0,
            printer_settings: {
                default_raft_extruder: 0,
                slicer: "CHROMA",
                platform_temp: bedTemp,
                shells: 0,
                default_support_extruder: 0,
                support: usesSupports,
                layer_height: layerHeight,
                travel_speed: this.speeds.rapidXY,
                extruder_temperatures: [
                    printTemp,
                    0
                ],
                materials: [
                    "PLA",
                    "PLA"
                ],
                infill: 0,
                heat_platform: (bedTemp > 0),
                raft: usesRaft,
                do_auto_support: false,
                path: null,
                print_speed: this.speeds.printing,
                do_auto_raft: false,
                extruder: "0"
            },
            extrusion_mass_a_grams: roundTo(extrusionMass, 4),
            extrusion_mass_b_grams: 0,
            duration_s: Math.round(durationEstimate)
        };

        if (this._printerProfile.baseProfile !== "custom") {
            let botType = PrinterPresets.getMakerbotBotType(this._printerProfile.baseProfile);
            if (botType) {
                meta.bot_type = botType;
            }
        }

        return meta;

    }

    async getDremelHeader() {
        let raft = this._outRaft;
        let timeUsed = this.getTimeEstimate();
        let layerHeight = this.getMostFrequentLayerHeight();
        let hasRaft = 0;
        let hasSupport = 0;
        let printTemp = 0;
        let bedTemp = 0;
        let printSpeed = this.speeds.printing;
        await raft.play(async function (instruction, state) {
            if (!hasRaft && state.get("printState").value === Raft.PrintStates.Raft) {
                hasRaft = 1;
            }
            if (!hasSupport && state.get("printState").value === Raft.PrintStates.Support) {
                hasSupport = 1;
            }
            if (state.get("extruderTemp").position !== null && state.get("extruderTemp").position > printTemp) {
                printTemp = state.get("extruderTemp").position;
            }
            if (state.get("bedTemp").position !== null && state.get("bedTemp").position > bedTemp) {
                bedTemp = state.get("bedTemp").position;
            }
        });
        let flags = (1 & 1) + (0 & 2) + (hasRaft & 4) + (hasSupport & 8);

        const img0Addr = 0x3A;
        const img1Addr = 0x38B0;
        const gcodeAddr = img1Addr;
        let buf = Buffer.alloc(gcodeAddr);
        let offset = 0;
        let size = 16;
        buf.write("g3drem 1.0", offset, size);  // magic
        offset += size;
        size = 4;
        buf.writeUInt32LE(img0Addr, offset);  // img0Addr
        offset += size;
        buf.writeUInt32LE(gcodeAddr, offset);  // img1Addr
        offset += size;
        buf.writeUInt32LE(gcodeAddr, offset);  // gcodeAddr
        offset += size;
        buf.writeUInt32LE(Math.round(timeUsed), offset);  // timeUsed
        offset += size;
        buf.writeUInt32LE(Math.round(this.totalExtrusion), offset);  // materialUseds[right]
        offset += size;
        buf.writeUInt32LE(0, offset);  // materialUseds[left]
        offset += size;
        size = 2;
        buf.writeUInt16LE(flags, offset);  // flags
        offset += size;
        buf.writeUInt16LE(Math.round(layerHeight * 1000), offset);  // layerHeight
        offset += size;
        buf.writeUInt16LE(25, offset);  // infill
        offset += size;
        buf.writeUInt16LE(1, offset);  // shellCount
        offset += size;
        buf.writeUInt16LE(Math.floor(printSpeed / 60), offset);  // speed
        offset += size;
        buf.writeUInt16LE(Math.round(bedTemp), offset);  // platformTemp
        offset += size;
        buf.writeUInt16LE(Math.round(printTemp), offset);  // extruderTemps[right]
        offset += size;
        buf.writeUInt16LE(0, offset);  // extruderTemps[left]
        offset += size;
        buf.writeUInt8(1, offset);  // materialTypes[right]
        size = 1;
        offset += size;
        buf.writeUInt8(255, offset);  // materialTypes[left]
        // buf.write("", img0Addr, (img1Addr - img0Addr));  // img0Data
        // buf.write("", img1Addr, (gcodeAddr - img1Addr));  // img1Data
        return buf;
    }

}

module.exports = Print;
module.exports.DEBUG = DEBUG;
