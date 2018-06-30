
const Raft = require("raft-js");

const BoundingBox = require("./bounding-box");

const FIRST_PIECE_MIN_LENGTH = require("./common").FIRST_PIECE_MIN_LENGTH;
const SPLICE_MIN_LENGTH = require("./common").SPLICE_MIN_LENGTH;

const TOWER_MIN_DIMENSION = require("./common").TOWER_MIN_DIMENSION;
const MODEL_EDGE_CLEARANCE = require("./common").MODEL_EDGE_CLEARANCE;
const PRINT_BED_EDGE_CLEARANCE = require("./common").PRINT_BED_EDGE_CLEARANCE;
const MAX_PERIMETER_DENSITY = require("./common").MAX_PERIMETER_DENSITY;
const INFILL_PERIMETER_OVERLAP = require("./common").INFILL_PERIMETER_OVERLAP;
const ZIGGURAT_THRESHOLD = require("./common").ZIGGURAT_THRESHOLD;

const getLineLength = require("./common").getLineLength;


// bed placement functions

function attemptTowerPlacementRectangular(modelBoundingBox, towerX, towerY, bedDimensions, trySides) {

    if (trySides === undefined) {
        trySides = {
            north: true,
            south: true,
            west: true,
            east: true
        }
    }

    // console.log("attempting to place " + towerX.toFixed(1) + " x " + towerY.toFixed(1) + " mm");

    const halfX = towerX / 2;
    const halfY = towerY / 2;

    const midModelX = (modelBoundingBox.xMax - modelBoundingBox.xMin) / 2 + modelBoundingBox.xMin;
    const midModelY = (modelBoundingBox.yMax - modelBoundingBox.yMin) / 2 + modelBoundingBox.yMin;

    const xBedMin = -bedDimensions.originOffsets.x;
    const xBedMax = bedDimensions.x - bedDimensions.originOffsets.x;
    const yBedMin = -bedDimensions.originOffsets.y;
    const yBedMax = bedDimensions.y - bedDimensions.originOffsets.y;

    let boundingBox = new BoundingBox();

    function checkNorthSouthNudge() {
        if (boundingBox.yMin < yBedMin + PRINT_BED_EDGE_CLEARANCE) {
            // if tower extends off south edge of bed, nudge it north
            let nudge = yBedMin - boundingBox.yMin + PRINT_BED_EDGE_CLEARANCE;
            boundingBox.yMin += nudge;
            boundingBox.yMax += nudge;
        } else if (boundingBox.yMax > yBedMax - PRINT_BED_EDGE_CLEARANCE) {
            // if tower extends off north edge of bed, nudge it south
            let nudge = boundingBox.yMax - yBedMax + PRINT_BED_EDGE_CLEARANCE;
            boundingBox.yMin -= nudge;
            boundingBox.yMax -= nudge;
        }
    }

    function checkEastWestNudge() {
        if (boundingBox.xMin < xBedMin + PRINT_BED_EDGE_CLEARANCE) {
            // if tower extends off west edge of bed, nudge it east
            let nudge = xBedMin - boundingBox.xMin + PRINT_BED_EDGE_CLEARANCE;
            boundingBox.xMin += nudge;
            boundingBox.xMax += nudge;
        } else if (boundingBox.xMax > xBedMax - PRINT_BED_EDGE_CLEARANCE) {
            // if tower extends off east edge of bed, nudge it west
            let nudge = boundingBox.xMax - xBedMax + PRINT_BED_EDGE_CLEARANCE;
            boundingBox.xMin -= nudge;
            boundingBox.xMax -= nudge;
        }
    }

    if (trySides.west) {
        if ((modelBoundingBox.xMin - MODEL_EDGE_CLEARANCE - towerX) > (xBedMin + PRINT_BED_EDGE_CLEARANCE)) {
            // we can fit the tower to the west of the part
            boundingBox.xMax = modelBoundingBox.xMin - MODEL_EDGE_CLEARANCE;
            boundingBox.xMin = boundingBox.xMax - towerX;
            boundingBox.yMin = midModelY - halfY;
            boundingBox.yMax = midModelY + halfY;
            checkNorthSouthNudge();
            return boundingBox;
        }
    }

    if (trySides.north) {
        if ((modelBoundingBox.yMax + MODEL_EDGE_CLEARANCE + towerY) < (yBedMax - PRINT_BED_EDGE_CLEARANCE)) {
            // we can fit the tower to the north of the part
            boundingBox.xMin = midModelX - halfX;
            boundingBox.xMax = midModelX + halfX;
            boundingBox.yMin = modelBoundingBox.yMax + MODEL_EDGE_CLEARANCE;
            boundingBox.yMax = boundingBox.yMin + towerY;
            checkEastWestNudge();
            return boundingBox;
        }
    }

    if (trySides.east) {
        if ((modelBoundingBox.xMax + MODEL_EDGE_CLEARANCE + towerX) < (xBedMax - PRINT_BED_EDGE_CLEARANCE)) {
            // we can fit the tower to the east of the part
            boundingBox.xMin = modelBoundingBox.xMax + MODEL_EDGE_CLEARANCE;
            boundingBox.xMax = boundingBox.xMin + towerX;
            boundingBox.yMin = midModelY - halfY;
            boundingBox.yMax = midModelY + halfY;
            checkNorthSouthNudge();
            return boundingBox;
        }
    }

    if (trySides.south) {
        if ((modelBoundingBox.yMin - MODEL_EDGE_CLEARANCE - towerY) > (yBedMin + PRINT_BED_EDGE_CLEARANCE)) {
            // we can fit the tower to the south of the part
            boundingBox.xMin = midModelX - halfX;
            boundingBox.xMax = midModelX + halfX;
            boundingBox.yMax = modelBoundingBox.yMin - MODEL_EDGE_CLEARANCE;
            boundingBox.yMin = boundingBox.yMax - towerY;
            checkEastWestNudge();
            return boundingBox;
        }
    }

    return null;

}

function attemptTowerPlacementCircular(modelBoundingBox, towerX, towerY, bedDimensions, trySides) {

    if (trySides === undefined) {
        trySides = {
            north: true,
            south: true,
            west: true,
            east: true
        }
    }

    // console.log("attempting to place " + towerX.toFixed(1) + " x " + towerY.toFixed(1) + " mm");

    const bedRadius = bedDimensions.diameter / 2;

    const halfX = towerX / 2;
    const halfY = towerY / 2;

    const midBedX = bedRadius - bedDimensions.originOffsets.x;
    const midBedY = bedRadius - bedDimensions.originOffsets.y;

    let tempBoundingBox;
    let furthestCornerDistance;

    if (trySides.west) {
        // try west
        tempBoundingBox = new BoundingBox();
        tempBoundingBox.xMax = modelBoundingBox.xMin - MODEL_EDGE_CLEARANCE;
        tempBoundingBox.xMin = tempBoundingBox.xMax - towerX;
        tempBoundingBox.yMin = midBedY - halfY;
        tempBoundingBox.yMax = midBedY + halfY;
        furthestCornerDistance = Math.max(
            getLineLength(tempBoundingBox.xMin, tempBoundingBox.yMin, midBedX, midBedY),
            getLineLength(tempBoundingBox.xMin, tempBoundingBox.yMax, midBedX, midBedY)
        );
        if (furthestCornerDistance + PRINT_BED_EDGE_CLEARANCE <= bedRadius) {
            return tempBoundingBox;
        }
    }

    if (trySides.north) {
        // try north
        tempBoundingBox = new BoundingBox();
        tempBoundingBox.xMin = midBedX - halfX;
        tempBoundingBox.xMax = midBedX + halfX;
        tempBoundingBox.yMin = modelBoundingBox.yMax + MODEL_EDGE_CLEARANCE;
        tempBoundingBox.yMax = tempBoundingBox.yMin + towerY;
        furthestCornerDistance = Math.max(
            getLineLength(tempBoundingBox.xMin, tempBoundingBox.yMax, midBedX, midBedY),
            getLineLength(tempBoundingBox.xMax, tempBoundingBox.yMax, midBedX, midBedY)
        );
        if (furthestCornerDistance + PRINT_BED_EDGE_CLEARANCE <= bedRadius) {
            return tempBoundingBox;
        }
    }

    if (trySides.east) {
        // try east
        tempBoundingBox = new BoundingBox();
        tempBoundingBox.xMin = modelBoundingBox.xMax + MODEL_EDGE_CLEARANCE;
        tempBoundingBox.xMax = tempBoundingBox.xMin + towerX;
        tempBoundingBox.yMin = midBedY - halfY;
        tempBoundingBox.yMax = midBedY + halfY;
        furthestCornerDistance = Math.max(
            getLineLength(tempBoundingBox.xMax, tempBoundingBox.yMin, midBedX, midBedY),
            getLineLength(tempBoundingBox.xMax, tempBoundingBox.yMax, midBedX, midBedY)
        );
        if (furthestCornerDistance + PRINT_BED_EDGE_CLEARANCE <= bedRadius) {
            return tempBoundingBox;
        }
    }

    if (trySides.south) {
        // try south
        tempBoundingBox = new BoundingBox();
        tempBoundingBox.xMin = midBedX - halfX;
        tempBoundingBox.xMax = midBedX + halfX;
        tempBoundingBox.yMax = modelBoundingBox.yMin - MODEL_EDGE_CLEARANCE;
        tempBoundingBox.yMin = tempBoundingBox.yMax - towerY;
        furthestCornerDistance = Math.max(
            getLineLength(tempBoundingBox.xMin, tempBoundingBox.yMin, midBedX, midBedY),
            getLineLength(tempBoundingBox.xMax, tempBoundingBox.yMin, midBedX, midBedY)
        );
        if (furthestCornerDistance + PRINT_BED_EDGE_CLEARANCE <= bedRadius) {
            return tempBoundingBox;
        }
    }

    return null;

}

function getNonZigguratBoundingBox(zigguratBoundingBox, footprintArea) {
    let boundingBox = new BoundingBox();
    let C = zigguratBoundingBox.x - zigguratBoundingBox.y;
    let bboxX = (-C - Math.sqrt((C * C) + (4 * footprintArea))) / -2;
    let bboxY = footprintArea / bboxX;
    let pX = (zigguratBoundingBox.x - bboxX) / 2;
    let pY = (zigguratBoundingBox.y - bboxY) / 2;
    boundingBox.xMin = zigguratBoundingBox.xMin + pX;
    boundingBox.xMax = zigguratBoundingBox.xMax - pX;
    boundingBox.yMin = zigguratBoundingBox.yMin + pY;
    boundingBox.yMax = zigguratBoundingBox.yMax - pY;
    return boundingBox;
}

function getTowerBrimCount(towerX, towerY, minimumBrimLineLength, extrusionWidth) {
    let totalBrimLines = 0;
    let totalBrimLength = 0;
    let xLength = towerX;
    let yLength = towerY;
    while (totalBrimLength < minimumBrimLineLength) {
        xLength += extrusionWidth * 2;
        yLength += extrusionWidth * 2;
        totalBrimLength += xLength * 2;
        totalBrimLength += yLength * 2;
        totalBrimLines++;
    }
    return totalBrimLines;
}

function getPurgeVolume(filamentDiameter, purgeLength) {
    return (Math.PI * Math.pow((filamentDiameter / 2), 2) * purgeLength);
}


// extrusion calculation functions

function getExtrusionFactor(extrusionAmount, lineLength) {
    return extrusionAmount / lineLength;
}

function getExtrusionAmount(extrusionFactor, lineLength) {
    return extrusionFactor * lineLength;
}


class TransitionTower {

    /**
     * Generate a transition tower for a specific print model and printer.
     * Determines the necessary size (in terms of footprint area) of the towers and the density
     * required on each layer based on the number of transitions in the print at that layer.
     */
    constructor(print) {

        this._print = print;
        const printerProfile = print._printerProfile;
        this.useZiggurats = printerProfile.transitionSettings.purgeLength !== printerProfile.transitionSettings.initialPurgeLength;

        this.boundingBox = new BoundingBox();
        this.boundingBox.zMin = 0;
        this.boundingBox.zMax = print.boundingBox.zMax;
        this.zigguratBoundingBox = new BoundingBox();
        this.zigguratBoundingBox.zMin = 0;
        this.zigguratBoundingBox.zMax = print.boundingBox.zMax;
        this.offsets = {
            x: 0,
            y: 0
        };
        this.brims = {
            extrusion: 0,
            length: 0,
            count: 0
        };
        this.driveColorStrengths = null;

    }

    async generate(progressBar = null, driveColorStrengths = null) {

        const print = this._print;
        const printerProfile = this._print._printerProfile;

        this.driveColorStrengths = driveColorStrengths;


        // Step 1a. Determine the number of transitions required for each print layer
        // Step 1b. Calculate the thickness of each layer
        // Step 1c. Determine the total volume of transition material on each layer
        // Step 1d. Determine the 2D area required by each layer
        // Step 1e. Determine the overall footprint size of the tower

        if (progressBar) {
            await progressBar.increment("Preparing transition tower");
        }

        // the length (in mm) required to purge one transition
        const purgeLength = printerProfile.transitionSettings.purgeLength;
        const zigguratPurgeLength = printerProfile.transitionSettings.initialPurgeLength;
        const pingExtrusionLength = printerProfile.getPingExtrusionLength();

        // the volume (in mm^3) required to purge one transition
        const singlePurgeVolume = getPurgeVolume(printerProfile.filamentDiameter, purgeLength);
        const singleZigguratPurgeVolume = getPurgeVolume(printerProfile.filamentDiameter, zigguratPurgeLength);
        const minimumPurgeVolume = getPurgeVolume(printerProfile.filamentDiameter, pingExtrusionLength);

        const printLayerHeights = print.printLayerHeights;
        let towerLayerHeights = printLayerHeights.slice();

        const maxDensity = printerProfile.transitionSettings.towers.maxDensity;

        const targetPosition = printerProfile.transitionSettings.targetPosition;
        let totalExtrusionOfPrint = 0;
        let totalExtrusionAtCurrentTransition = 0;
        let totalExtrusionAtLastTransition = 0;
        let zigguratLayers = 0;
        let largestFootprintArea = 0;
        let largestZigguratFootprintArea = 0;
        let extraFirstPieceLength = 0;
        let layerStats = {};
        let lastLayerPurgeLength = 0;
        let lastExtraTransitionLength = 0;

        for (let i = 0; i < printLayerHeights.length; i++) {
            let thisZ = printLayerHeights[i];
            let prevZ = (i === 0 ? 0 : printLayerHeights[i - 1]);
            let requiredFootprintArea = 0;
            let layerTransitionCount = print.transitionInfo[thisZ].length;
            let layerThickness = print.layerInfo[thisZ].layerThickness;
            let isZigguratLayer = false;
            if (this.useZiggurats && totalExtrusionOfPrint < ZIGGURAT_THRESHOLD) {
                zigguratLayers++;
                isZigguratLayer = true;
            }
            let totalInfillDump = 0;
            if (layerTransitionCount > 0) {
                let layerPurgeLength = (isZigguratLayer ? zigguratPurgeLength : purgeLength);
                let requiredPurgeVolume = 0;
                for (let transition of print.transitionInfo[thisZ]) {
                    if (global.advancedMode && !isZigguratLayer && driveColorStrengths
                        && printerProfile.transitionSettings.purgeLength > printerProfile.transitionSettings.minPurgeLength) {
                        layerPurgeLength = printerProfile.interpolatePurgeLengths(
                            driveColorStrengths[transition.from],
                            driveColorStrengths[transition.to]
                        );
                    }
                    totalExtrusionAtLastTransition = totalExtrusionAtCurrentTransition;
                    totalExtrusionAtCurrentTransition = transition.totalPrintExtrusion;
                    let extrusionDelta = (totalExtrusionAtCurrentTransition - totalExtrusionAtLastTransition) + ((1 - targetPosition) * lastLayerPurgeLength) + (targetPosition * layerPurgeLength);
                    let infillDumpLength = 0;
                    if (printerProfile.canInfillDump()
                        && print.printFeatureDetection && print.solidLayerFeatureComments
                        && transition.infillDumpAmount && transition.infillDumpAmount.total > 0) {
                        if (transition.infillDumpAmount.offset > 0) {
                            if (lastExtraTransitionLength > 0) {
                                transition.infillDumpAmount.usableOffset = 0;
                                transition.infillDumpAmount.usableTotal = Math.min(transition.infillDumpAmount.total - transition.infillDumpAmount.offset, layerPurgeLength);
                            } else {
                                // lastExtraTransitionLength === 0
                                let offsetLimit = Math.min(Math.max(0, extrusionDelta - SPLICE_MIN_LENGTH), transition.infillDumpAmount.offset);
                                transition.infillDumpAmount.usableOffset = Math.min(layerPurgeLength, Math.max(transition.infillDumpAmount.offset, offsetLimit));
                                transition.infillDumpAmount.usableTotal = Math.min(layerPurgeLength, transition.infillDumpAmount.total)
                                    - (transition.infillDumpAmount.offset - transition.infillDumpAmount.usableOffset);
                            }
                        } else {
                            // transition.infillDumpAmount.offset === 0
                            transition.infillDumpAmount.usableTotal = Math.min(transition.infillDumpAmount.total, layerPurgeLength);
                        }
                        infillDumpLength = transition.infillDumpAmount.usableTotal;
                    }
                    totalExtrusionOfPrint += (totalExtrusionAtCurrentTransition - totalExtrusionAtLastTransition);
                    let extraRequiredLength = 0;
                    if (infillDumpLength > 0 && transition.infillDumpAmount.usableOffset > 0) {
                        extrusionDelta -= transition.infillDumpAmount.usableOffset;
                    }
                    if (layerPurgeLength < SPLICE_MIN_LENGTH + 10 && extrusionDelta < SPLICE_MIN_LENGTH + 10) {
                        extraRequiredLength = Math.max(0, Math.min(SPLICE_MIN_LENGTH + 10 - extrusionDelta, SPLICE_MIN_LENGTH + 10));
                        extrusionDelta += extraRequiredLength;
                    }
                    totalExtrusionOfPrint += (layerPurgeLength - infillDumpLength + extraRequiredLength);
                    lastLayerPurgeLength = layerPurgeLength;
                    lastExtraTransitionLength = extraRequiredLength;
                    transition.extraPieceLength = extraRequiredLength;
                    if (totalExtrusionAtLastTransition === 0) {
                        extraFirstPieceLength = FIRST_PIECE_MIN_LENGTH - (totalExtrusionAtCurrentTransition + extraRequiredLength
                            + (layerPurgeLength * targetPosition));
                        extraFirstPieceLength = Math.max(0, extraFirstPieceLength);
                        totalExtrusionOfPrint += extraFirstPieceLength;
                    }
                    totalInfillDump += infillDumpLength;
                    let transitionPurgeVolume = (isZigguratLayer ? singleZigguratPurgeVolume : singlePurgeVolume);
                    if (global.advancedMode && !isZigguratLayer && driveColorStrengths
                        && printerProfile.transitionSettings.purgeLength > printerProfile.transitionSettings.minPurgeLength) {
                        transitionPurgeVolume = getPurgeVolume(printerProfile.filamentDiameter, layerPurgeLength);
                    }
                    if (extraRequiredLength > 0) {
                        transitionPurgeVolume += getPurgeVolume(printerProfile.filamentDiameter, extraRequiredLength);
                    }
                    if (infillDumpLength > 0) {
                        transitionPurgeVolume -= getPurgeVolume(printerProfile.filamentDiameter, infillDumpLength);
                    }
                    requiredPurgeVolume += transitionPurgeVolume;
                }
                if (maxDensity < 1) {
                    requiredPurgeVolume /= maxDensity;
                }
                if (requiredPurgeVolume < minimumPurgeVolume) {
                    requiredPurgeVolume = minimumPurgeVolume;
                }
                requiredFootprintArea = requiredPurgeVolume / layerThickness;
                if (isZigguratLayer) {
                    if (requiredFootprintArea > largestZigguratFootprintArea) {
                        largestZigguratFootprintArea = requiredFootprintArea;
                    }
                } else {
                    if (requiredFootprintArea > largestFootprintArea) {
                        largestFootprintArea = requiredFootprintArea;
                    }
                }
            } else {
                if (isZigguratLayer) {
                    totalExtrusionOfPrint += print.layerInfo[thisZ].totalPrintExtrusion
                        - (prevZ === 0 ? 0 : print.layerInfo[prevZ].totalPrintExtrusion)
                        + pingExtrusionLength;
                }
            }
            layerStats[thisZ] = {
                layerHeight: thisZ,
                layerThickness: layerThickness,
                raftLayer: (i < print.raftLayers),
                transitions: print.transitionInfo[thisZ],
                minFootprintArea: requiredFootprintArea,
                density: null,
                visitsToLayer: print.layerInfo[thisZ].visitsToLayer,
                extrusionFactor: null,
                totalExtraPieceLength: print.transitionInfo[thisZ].reduce((accumulator, transition) => (accumulator + transition.extraPieceLength), 0),
                totalInfillDumpLength: totalInfillDump
            };
        }

        this.footprintArea = largestFootprintArea;
        this.zigguratLayerCount = zigguratLayers;
        this.zigguratFootprintArea = largestZigguratFootprintArea;
        if (this.useZiggurats) {
            if (largestZigguratFootprintArea === 0) {
                this.useZiggurats = false;
            } else if (largestZigguratFootprintArea < largestFootprintArea) {
                largestZigguratFootprintArea = largestFootprintArea;
                this.zigguratFootprintArea = largestZigguratFootprintArea;
            }
        }
        this.brims.extrusion = extraFirstPieceLength;


        // Step 2. Starting from the top and working down, discard sparse layers
        //         until a layer with more than zero transitions is reached

        for (let i = towerLayerHeights.length - 1; i >= 0; i--) {
            let z = towerLayerHeights[i];
            if (layerStats[z].transitions.length > 0) {
                break;
            }
            delete layerStats[z];
            towerLayerHeights.pop();
        }

        if (towerLayerHeights.length === 0) {
            throw {
                message: "No dense layers in transition tower",
                detail: "Chroma failed to detect any layers that contain transitions.\n\nIf the loaded print file is not a single-tool print, this is due to either incorrect firmware settings for your printer profile (under the Printer tab) or a processing error.",
                exitCode: 15
            };
        }


        // Step 3. Reverse-engineer extrusion variables to use for tower extrusion formulas

        if (progressBar) {
            await progressBar.increment("Analyzing print extrusion");
        }

        let raft = print._raft;
        let extrusionFactorsByLayer = {};
        let globalExtrusionFactors = [];
        raft.rewind();
        await raft.play(async function (instruction, state) {
            let printState = state.get("printState").value;
            let z = state.get("z").position;
            if ((instruction instanceof Raft.MoveInstruction)
                && (instruction.x !== null || instruction.y !== null)
                && instruction.extrusion !== null
                && print.printLayerHeights.indexOf(z) >= 0
                && printState !== Raft.PrintStates.Skirt
                && printState !== Raft.PrintStates.Brim
                && printState !== Raft.PrintStates.Support) {
                let currentX = state.get("x").position;
                let currentY = state.get("y").position;
                let currentE = state.get("extrusion").totalDispensed;
                raft.stepBackward();
                let previousX = raft.getCurrentState().get("x").position;
                let previousY = raft.getCurrentState().get("y").position;
                let previousE = raft.getCurrentState().get("extrusion").totalDispensed;
                raft.stepForward();
                if (currentE > previousE && (currentX !== previousX || currentY !== previousY)) {
                    let lineLength = getLineLength(previousX, previousY, currentX, currentY);
                    let extrusionFactor = getExtrusionFactor(currentE - previousE, lineLength);
                    if (printState === Raft.PrintStates.Raft
                        || (towerLayerHeights.indexOf(z) >= 0 && towerLayerHeights.indexOf(z) <= print.raftLayers)) {
                        if (!isNaN(extrusionFactor) && extrusionFactor > 0) {
                            if (!extrusionFactorsByLayer.hasOwnProperty(z)) {
                                extrusionFactorsByLayer[z] = [];
                            }
                            extrusionFactorsByLayer[z].push(extrusionFactor);
                        }
                    } else {
                        extrusionFactor /= print.layerInfo[z].layerThickness;
                        if (!isNaN(extrusionFactor) && extrusionFactor > 0) {
                            globalExtrusionFactors.push(extrusionFactor);
                        }
                    }
                }
            }
        });

        let tenPercent = Math.floor(globalExtrusionFactors.length / 10);
        globalExtrusionFactors.sort((a, b) => a - b);
        globalExtrusionFactors.splice(0, tenPercent);
        globalExtrusionFactors.splice(-tenPercent);
        let sum = globalExtrusionFactors.reduce((a, b) => a + b, 0);
        let globalExtrusionFactor = sum / globalExtrusionFactors.length;

        for (let z of towerLayerHeights) {
            if (extrusionFactorsByLayer[z] === undefined) {
                extrusionFactorsByLayer[z] = [];
            }
            extrusionFactorsByLayer[z].sort((a, b) => a - b);
            let tenPercent = Math.floor(extrusionFactorsByLayer[z].length / 10);
            extrusionFactorsByLayer[z].splice(0, tenPercent);
            extrusionFactorsByLayer[z].splice(-tenPercent);
            if (extrusionFactorsByLayer[z].length === 0) {
                layerStats[z].extrusionFactor = 0;
            } else {
                let sum = extrusionFactorsByLayer[z].reduce((a, b) => a + b, 0);
                layerStats[z].extrusionFactor = sum / extrusionFactorsByLayer[z].length;
            }
        }

        this.defaultExtrusionFactor = globalExtrusionFactor;
        if (this.defaultExtrusionFactor === 0) {
            throw {
                message: "Could not analyze print extrusion",
                detail: "Chroma could not determine enough information from your print to generate transition towers.",
                exitCode: 16
            };
        }
        const firstLayerExtrusionFactor = (
            layerStats[towerLayerHeights[0]].extrusionFactor === 0
                ? this.defaultExtrusionFactor / layerStats[towerLayerHeights[0]].layerThickness
                : layerStats[towerLayerHeights[0]].extrusionFactor
        );
        this.brims.length = extraFirstPieceLength / firstLayerExtrusionFactor;

        let raftBaseLayers = 0;
        for (let i = 0; i < print.raftLayers; i++) {
            let layerEFactor = layerStats[towerLayerHeights[i]].extrusionFactor;
            let defaultEFactor = this.defaultExtrusionFactor * layerStats[towerLayerHeights[i]].layerThickness;
            if (layerEFactor > defaultEFactor * 1.25) {
                raftBaseLayers++;
            } else {
                break;
            }
        }
        this.rafts = {
            useRaft: (print.raftLayers > 0),
            raftLayers: print.raftLayers,
            baseLayers: raftBaseLayers,
            topLayers: print.raftLayers - raftBaseLayers
        };

        this.towerLayerHeights = towerLayerHeights;
        this.layerStats = layerStats;


        // Step 4. set the density each layer of the tower will be given when printing

        if (progressBar) {
            await progressBar.increment("Setting tower layer densities");
        }

        this.setLayerDensities();


        // Step 5. Perform first pass of tower placement and generation
        // - position the tower on the bed
        // - perform rasterization of tower layers

        if (progressBar) {
            await progressBar.increment("Positioning transition tower");
        }

        this.precode = {};
        this.positionOnBed();
        this.createInstructions();

        await this.correctLayerError(progressBar);

    }

    async regenerateWithDimensions(boundingBox, progressBar = null) {

        if (progressBar) {
            await progressBar.increment("Setting tower layer densities");
        }

        const extrusionWidth = this.getExtrusionWidth();
        const brimCount = this.brims.count;

        if (this.useZiggurats) {
            this.zigguratBoundingBox.xMin = boundingBox.xMin + (brimCount * extrusionWidth);
            this.zigguratBoundingBox.xMax = boundingBox.xMax - (brimCount * extrusionWidth);
            this.zigguratBoundingBox.yMin = boundingBox.yMin + (brimCount * extrusionWidth);
            this.zigguratBoundingBox.yMax = boundingBox.yMax - (brimCount * extrusionWidth);
            this.boundingBox = getNonZigguratBoundingBox(boundingBox, this.footprintArea);
        } else {
            this.zigguratBoundingBox.xMin = 0;
            this.zigguratBoundingBox.xMax = 0;
            this.zigguratBoundingBox.yMin = 0;
            this.zigguratBoundingBox.yMax = 0;
            this.boundingBox.xMin = boundingBox.xMin + (brimCount * extrusionWidth);
            this.boundingBox.xMax = boundingBox.xMax - (brimCount * extrusionWidth);
            this.boundingBox.yMin = boundingBox.yMin + (brimCount * extrusionWidth);
            this.boundingBox.yMax = boundingBox.yMax - (brimCount * extrusionWidth);
        }

        await this.correctLayerError(progressBar);
        this.createInstructions();

    }

    async correctLayerError(progressBar = null) {

        const print = this._print;
        const driveColorStrengths = this.driveColorStrengths;

        const purgeLength = print._printerProfile.transitionSettings.purgeLength;
        const zigguratPurgeLength = print._printerProfile.transitionSettings.initialPurgeLength;
        const pingExtrusionLength = print._printerProfile.getPingExtrusionLength();
        const minTowerDensity = print._printerProfile.transitionSettings.towers.minDensity;

        // Step 6. Determine the amount of error in transition generation for each layer
        // - if too low, increase the layer's density accordingly
        // - if too high, decrease the layer's volume accordingly

        if (progressBar) {
            await progressBar.increment("Creating tower toolpaths");
        }

        let towerUpdated = false;
        let updatedLayers = {};

        if (this.rafts.useRaft) {
            let z = this.towerLayerHeights[this.rafts.raftLayers];
            let layerTransitionCount = this.layerStats[z].transitions.length;
            let layerPurgeLength = ((this.rafts.raftLayers < this.zigguratLayerCount) ? zigguratPurgeLength : purgeLength)
                + this.layerStats[z].totalExtraPieceLength;
            let requiredPurgeLength = layerPurgeLength * layerTransitionCount;
            if (global.advancedMode && (this.rafts.raftLayers < this.zigguratLayerCount) && driveColorStrengths
                && print._printerProfile.transitionSettings.purgeLength > print._printerProfile.transitionSettings.minPurgeLength) {
                requiredPurgeLength = print.layerInfo[z].toolChanges.reduce(function (accumulator, current) {
                    return accumulator + print._printerProfile.interpolatePurgeLengths(
                        driveColorStrengths[current.from],
                        driveColorStrengths[current.to]
                    );
                }, 0);
            }
            requiredPurgeLength -= this.precode[z].perimeterExtrusion;
            requiredPurgeLength += this.layerStats[z].totalExtraPieceLength;
            requiredPurgeLength -= this.layerStats[z].totalInfillDumpLength;
            let infillExtrusion = this.precode[z].totalExtrusion - this.precode[z].perimeterExtrusion;
            let error = (infillExtrusion - requiredPurgeLength) / requiredPurgeLength;
            this.layerStats[z].minFootprintArea = this.layerStats[z].minFootprintArea / (1 - Math.abs(error));
            if (this.useZiggurats && this.rafts.raftLayers <= this.zigguratLayerCount) {
                this.zigguratFootprintArea = Math.max(this.zigguratFootprintArea, this.layerStats[z].minFootprintArea);
            } else {
                this.footprintArea = Math.max(this.footprintArea, this.layerStats[z].minFootprintArea);
            }
            this.setLayerDensities();
            this.positionOnBed();
            this.createInstructions();
        }

        for (let i = 0; i < this.towerLayerHeights.length; i++) {
            let z = this.towerLayerHeights[i];
            updatedLayers[z] = false;
            let layerTransitionCount = this.layerStats[z].transitions.length;
            if (layerTransitionCount > 0) {
                let layerPurgeLength = (i < this.zigguratLayerCount) ? zigguratPurgeLength : purgeLength;
                let requiredPurgeLength = layerPurgeLength * layerTransitionCount;
                if (global.advancedMode && (i >= this.zigguratLayerCount) && driveColorStrengths
                    && print._printerProfile.transitionSettings.purgeLength > print._printerProfile.transitionSettings.minPurgeLength) {
                    requiredPurgeLength = print.layerInfo[z].toolChanges.reduce(function (accumulator, current) {
                        return accumulator + print._printerProfile.interpolatePurgeLengths(
                            driveColorStrengths[current.from],
                            driveColorStrengths[current.to]
                        );
                    }, 0);
                }
                requiredPurgeLength -= this.precode[z].perimeterExtrusion;
                requiredPurgeLength += this.layerStats[z].totalExtraPieceLength;
                requiredPurgeLength -= this.layerStats[z].totalInfillDumpLength;
                requiredPurgeLength = Math.max(pingExtrusionLength, requiredPurgeLength);
                if (requiredPurgeLength < 0) {
                    this.layerStats[z].density = minTowerDensity;
                    updatedLayers[z] = true;
                    towerUpdated = true;
                } else {
                    let infillExtrusion = this.precode[z].totalExtrusion - this.precode[z].perimeterExtrusion;
                    let error = (infillExtrusion - requiredPurgeLength) / requiredPurgeLength;
                    if (error < -0.001) {
                        // not enough material -- increase the layer's density accordingly
                        this.layerStats[z].density = this.layerStats[z].density / (1 - Math.abs(error));
                        updatedLayers[z] = true;
                        towerUpdated = true;
                    } else if (error > 0.001) {
                        // too much material -- decrease the layer's density accordingly
                        this.layerStats[z].density = this.layerStats[z].density / (1 + Math.abs(error));
                        updatedLayers[z] = true;
                        towerUpdated = true;
                    }
                }
                if (this.layerStats[z].density < minTowerDensity) {
                    this.layerStats[z].density = minTowerDensity;
                    updatedLayers[z] = true;
                    towerUpdated = true;
                }
            } else if (!global.env.oem) {
                if (this.precode[z].totalExtrusion < pingExtrusionLength * 1.3) {
                    let requiredLength = (pingExtrusionLength * 1.3) - this.precode[z].perimeterExtrusion;
                    let infillExtrusion = this.precode[z].totalExtrusion - this.precode[z].perimeterExtrusion;
                    let error = (infillExtrusion - requiredLength) / requiredLength;
                    if (error < -0.001) {
                        // not enough material to ping -- increase density to facilitate pings
                        this.layerStats[z].density = this.layerStats[z].density / (1 - Math.abs(error));
                        updatedLayers[z] = true;
                        towerUpdated = true;
                    }
                }
            }
        }


        // Step 7. Perform second pass of tower placement and generation
        // - if necessary, re-perform rasterization of changed tower layers

        if (towerUpdated) {
            this.createInstructions(updatedLayers);
        }

    }

    setLayerDensities() {
        const printerProfile = this._print._printerProfile;
        const minDensity = printerProfile.transitionSettings.towers.minDensity;
        const minFirstLayerDensity = printerProfile.transitionSettings.towers.minFirstLayerDensity;
        const maxDensity = printerProfile.transitionSettings.towers.maxDensity;

        for (let i = 0; i < this.towerLayerHeights.length; i++) {
            let z = this.towerLayerHeights[i];
            let footprintArea = (this.useZiggurats && i < this.zigguratLayerCount) ? this.zigguratFootprintArea : this.footprintArea;
            let density;
            if (this.useZiggurats && i === this.zigguratLayerCount - 1) {
                density = Math.max(this.layerStats[z].minFootprintArea / footprintArea, 0.5);
            } else if (i === 0) {
                density = Math.max(this.layerStats[z].minFootprintArea / footprintArea, minFirstLayerDensity);
            } else {
                density = Math.max(this.layerStats[z].minFootprintArea / footprintArea, minDensity);
            }
            density = Math.min(density, maxDensity);
            if (this.rafts.useRaft && i < this.rafts.raftLayers && this.layerStats[z].transitions.length === 0) {
                if (i < this.rafts.baseLayers) {
                    density = 0.1;
                } else {
                    density = Math.max(density, 0.2);
                }
            }
            this.layerStats[z].density = density;
        }
    }

    getStartingTowerDimensions() {
        const squareLength = Math.sqrt(this.useZiggurats ? this.zigguratFootprintArea : this.footprintArea);
        let goldenRatio = (1 + Math.sqrt(5)) / 2;
        let goldenSqrt = Math.sqrt(goldenRatio);
        return {
            longSide: squareLength * goldenSqrt,
            shortSide: squareLength / goldenSqrt
        };
    }

    /**
     * Determine the bounding box and bed position of the tower based on available space.
     */
    positionOnBed() {

        const print = this._print;
        const printerProfile = print._printerProfile;

        let {longSide, shortSide} = this.getStartingTowerDimensions();

        let boundingBox = null;

        let extrusionWidth = this.getExtrusionWidth();
        let brimCount;

        // try west/east with initial tower size
        if (printerProfile.printBedDimensions.circular) {
            if (longSide + 2 * PRINT_BED_EDGE_CLEARANCE <= printerProfile.printBedDimensions.diameter) {
                brimCount = getTowerBrimCount(shortSide, longSide, this.brims.length, extrusionWidth);
                boundingBox = attemptTowerPlacementCircular(
                    print.boundingBox,
                    shortSide + (brimCount * 2 * extrusionWidth),
                    longSide + (brimCount * 2 * extrusionWidth),
                    printerProfile.printBedDimensions,
                    {
                        north: false,
                        south: false,
                        west: true,
                        east: true
                    }
                );
            }
        } else {
            if (longSide + 2 * PRINT_BED_EDGE_CLEARANCE <= printerProfile.printBedDimensions.y) {
                brimCount = getTowerBrimCount(shortSide, longSide, this.brims.length, extrusionWidth);
                boundingBox = attemptTowerPlacementRectangular(
                    print.boundingBox,
                    shortSide + (brimCount * 2 * extrusionWidth),
                    longSide + (brimCount * 2 * extrusionWidth),
                    printerProfile.printBedDimensions,
                    {
                        north: false,
                        south: false,
                        west: true,
                        east: true
                    }
                );
            }
        }
        if (boundingBox !== null) {
            this.brims.count = brimCount;
            if (this.useZiggurats) {
                this.zigguratBoundingBox.xMin = boundingBox.xMin + (brimCount * extrusionWidth);
                this.zigguratBoundingBox.xMax = boundingBox.xMax - (brimCount * extrusionWidth);
                this.zigguratBoundingBox.yMin = boundingBox.yMin + (brimCount * extrusionWidth);
                this.zigguratBoundingBox.yMax = boundingBox.yMax - (brimCount * extrusionWidth);
                this.boundingBox = getNonZigguratBoundingBox(boundingBox, this.footprintArea);
            } else {
                this.zigguratBoundingBox.xMin = 0;
                this.zigguratBoundingBox.xMax = 0;
                this.zigguratBoundingBox.yMin = 0;
                this.zigguratBoundingBox.yMax = 0;
                this.boundingBox.xMin = boundingBox.xMin + (brimCount * extrusionWidth);
                this.boundingBox.xMax = boundingBox.xMax - (brimCount * extrusionWidth);
                this.boundingBox.yMin = boundingBox.yMin + (brimCount * extrusionWidth);
                this.boundingBox.yMax = boundingBox.yMax - (brimCount * extrusionWidth);
            }
            return;
        }

        // try north/south with initial tower size
        if (printerProfile.printBedDimensions.circular) {
            if (longSide + 2 * PRINT_BED_EDGE_CLEARANCE <= printerProfile.printBedDimensions.diameter) {
                brimCount = getTowerBrimCount(longSide, shortSide, this.brims.length, extrusionWidth);
                boundingBox = attemptTowerPlacementCircular(
                    print.boundingBox,
                    longSide + (brimCount * 2 * extrusionWidth),
                    shortSide + (brimCount * 2 * extrusionWidth),
                    printerProfile.printBedDimensions,
                    {
                        north: true,
                        south: true,
                        west: false,
                        east: false
                    }
                );
            }
        } else {
            if (longSide + 2 * PRINT_BED_EDGE_CLEARANCE <= printerProfile.printBedDimensions.x) {
                brimCount = getTowerBrimCount(longSide, shortSide, this.brims.length, extrusionWidth);
                boundingBox = attemptTowerPlacementRectangular(
                    print.boundingBox,
                    longSide + (brimCount * 2 * extrusionWidth),
                    shortSide + (brimCount * 2 * extrusionWidth),
                    printerProfile.printBedDimensions,
                    {
                        north: true,
                        south: true,
                        west: false,
                        east: false
                    }
                );
            }
        }
        if (boundingBox !== null) {
            this.brims.count = brimCount;
            if (this.useZiggurats) {
                this.zigguratBoundingBox.xMin = boundingBox.xMin + (brimCount * extrusionWidth);
                this.zigguratBoundingBox.xMax = boundingBox.xMax - (brimCount * extrusionWidth);
                this.zigguratBoundingBox.yMin = boundingBox.yMin + (brimCount * extrusionWidth);
                this.zigguratBoundingBox.yMax = boundingBox.yMax - (brimCount * extrusionWidth);
                this.boundingBox = getNonZigguratBoundingBox(boundingBox, this.footprintArea);
            } else {
                this.zigguratBoundingBox.xMin = 0;
                this.zigguratBoundingBox.xMax = 0;
                this.zigguratBoundingBox.yMin = 0;
                this.zigguratBoundingBox.yMax = 0;
                this.boundingBox.xMin = boundingBox.xMin + (brimCount * extrusionWidth);
                this.boundingBox.xMax = boundingBox.xMax - (brimCount * extrusionWidth);
                this.boundingBox.yMin = boundingBox.yMin + (brimCount * extrusionWidth);
                this.boundingBox.yMax = boundingBox.yMax - (brimCount * extrusionWidth);
                this.boundingBox.position = boundingBox.position;
            }
            return;
        }

        let tryPortrait = true;
        let tryLandscape = true;

        while (true) {

            if (!tryPortrait && !tryLandscape) {
                break;
            }

            longSide = longSide / 0.9;
            shortSide = shortSide * 0.9;

            // the minimum thickness of the tower is 1.5 cm
            if (longSide < TOWER_MIN_DIMENSION || shortSide < TOWER_MIN_DIMENSION) {
                break;
            }

            if (tryPortrait) {
                if (printerProfile.printBedDimensions.circular) {
                    if (longSide + 2 * PRINT_BED_EDGE_CLEARANCE > printerProfile.printBedDimensions.diameter) {
                        tryPortrait = false;
                    } else {
                        brimCount = getTowerBrimCount(shortSide, longSide, this.brims.length, extrusionWidth);
                        boundingBox = attemptTowerPlacementCircular(
                            print.boundingBox,
                            shortSide + (brimCount * 2 * extrusionWidth),
                            longSide + (brimCount * 2 * extrusionWidth),
                            printerProfile.printBedDimensions
                        );
                    }
                } else {
                    if (longSide + 2 * PRINT_BED_EDGE_CLEARANCE > printerProfile.printBedDimensions.y) {
                        tryPortrait = false;
                    } else {
                        brimCount = getTowerBrimCount(shortSide, longSide, this.brims.length, extrusionWidth);
                        boundingBox = attemptTowerPlacementRectangular(
                            print.boundingBox,
                            shortSide + (brimCount * 2 * extrusionWidth),
                            longSide + (brimCount * 2 * extrusionWidth),
                            printerProfile.printBedDimensions
                        );
                    }
                }
                if (boundingBox !== null) {
                    this.brims.count = brimCount;
                    if (this.useZiggurats) {
                        this.zigguratBoundingBox.xMin = boundingBox.xMin + (brimCount * extrusionWidth);
                        this.zigguratBoundingBox.xMax = boundingBox.xMax - (brimCount * extrusionWidth);
                        this.zigguratBoundingBox.yMin = boundingBox.yMin + (brimCount * extrusionWidth);
                        this.zigguratBoundingBox.yMax = boundingBox.yMax - (brimCount * extrusionWidth);
                        this.boundingBox = getNonZigguratBoundingBox(boundingBox, this.footprintArea);
                    } else {
                        this.zigguratBoundingBox.xMin = 0;
                        this.zigguratBoundingBox.xMax = 0;
                        this.zigguratBoundingBox.yMin = 0;
                        this.zigguratBoundingBox.yMax = 0;
                        this.boundingBox.xMin = boundingBox.xMin + (brimCount * extrusionWidth);
                        this.boundingBox.xMax = boundingBox.xMax - (brimCount * extrusionWidth);
                        this.boundingBox.yMin = boundingBox.yMin + (brimCount * extrusionWidth);
                        this.boundingBox.yMax = boundingBox.yMax - (brimCount * extrusionWidth);
                    }
                    return;
                }
            }

            if (tryLandscape) {
                if (printerProfile.printBedDimensions.circular) {
                    if (longSide + 2 * PRINT_BED_EDGE_CLEARANCE > printerProfile.printBedDimensions.diameter) {
                        tryLandscape = false;
                    } else {
                        brimCount = getTowerBrimCount(longSide, shortSide, this.brims.length, extrusionWidth);
                        boundingBox = attemptTowerPlacementCircular(
                            print.boundingBox,
                            longSide + (brimCount * 2 * extrusionWidth),
                            shortSide + (brimCount * 2 * extrusionWidth),
                            printerProfile.printBedDimensions
                        );
                    }
                } else {
                    if (longSide + 2 * PRINT_BED_EDGE_CLEARANCE > printerProfile.printBedDimensions.x) {
                        tryLandscape = false;
                    } else {
                        brimCount = getTowerBrimCount(longSide, shortSide, this.brims.length, extrusionWidth);
                        boundingBox = attemptTowerPlacementRectangular(
                            print.boundingBox,
                            longSide + (brimCount * 2 * extrusionWidth),
                            shortSide + (brimCount * 2 * extrusionWidth),
                            printerProfile.printBedDimensions
                        );
                    }
                }
                if (boundingBox !== null) {
                    this.brims.count = brimCount;
                    if (this.useZiggurats) {
                        this.zigguratBoundingBox.xMin = boundingBox.xMin + (brimCount * extrusionWidth);
                        this.zigguratBoundingBox.xMax = boundingBox.xMax - (brimCount * extrusionWidth);
                        this.zigguratBoundingBox.yMin = boundingBox.yMin + (brimCount * extrusionWidth);
                        this.zigguratBoundingBox.yMax = boundingBox.yMax - (brimCount * extrusionWidth);
                        this.boundingBox = getNonZigguratBoundingBox(boundingBox, this.footprintArea);
                    } else {
                        this.zigguratBoundingBox.xMin = 0;
                        this.zigguratBoundingBox.xMax = 0;
                        this.zigguratBoundingBox.yMin = 0;
                        this.zigguratBoundingBox.yMax = 0;
                        this.boundingBox.xMin = boundingBox.xMin + (brimCount * extrusionWidth);
                        this.boundingBox.xMax = boundingBox.xMax - (brimCount * extrusionWidth);
                        this.boundingBox.yMin = boundingBox.yMin + (brimCount * extrusionWidth);
                        this.boundingBox.yMax = boundingBox.yMax - (brimCount * extrusionWidth);
                    }
                    return;
                }
            }

        }

        let errorMessage = "Cannot position tower";
        let errorDetail = "The transition tower could not be placed next to your model anywhere on the print bed.";
        if (global.advancedMode) {
            let {longSide, shortSide} = this.getStartingTowerDimensions();
            let xBedMin = -printerProfile.printBedDimensions.originOffsets.x;
            const midModelY = (print.boundingBox.y / 2) + print.boundingBox.yMin;
            if (this.useZiggurats) {
                this.zigguratBoundingBox.xMax = xBedMin - 5;
                this.zigguratBoundingBox.xMin = this.zigguratBoundingBox.xMax - shortSide;
                this.zigguratBoundingBox.yMin = midModelY - (longSide / 2);
                this.zigguratBoundingBox.yMax = midModelY + (longSide / 2);
                this.boundingBox = getNonZigguratBoundingBox(this.zigguratBoundingBox, this.footprintArea);
            } else {
                this.zigguratBoundingBox.xMin = 0;
                this.zigguratBoundingBox.xMax = 0;
                this.zigguratBoundingBox.yMin = 0;
                this.zigguratBoundingBox.yMax = 0;
                this.boundingBox.xMax = xBedMin - 5;
                this.boundingBox.xMin = this.boundingBox.xMax - shortSide;
                this.boundingBox.yMin = midModelY - (longSide / 2);
                this.boundingBox.yMax = midModelY + (longSide / 2);
            }
            errorDetail += "\n\nYou can attempt to position the tower manually by clicking on it and adjusting it using the on-screen controls.";
            window.dispatchEvent(new CustomEvent("printWarning", {
                detail: {
                    message: errorMessage,
                    detail: errorDetail
                }
            }));
        } else {
            throw {
                message: errorMessage,
                detail: errorDetail,
                exitCode: 17
            };
        }

    }

    getExtrusionWidth() {
        if (this._print._printerProfile.transitionSettings.towers.extrusionWidth === "auto") {
            return this._print._printerProfile.nozzleDiameter * 1.2;
        }
        return this._print._printerProfile.transitionSettings.towers.extrusionWidth;
    }

    /**
     * Generate perimeter and infill geometry for each layer.
     * Determine the amount of extrusion that should be associated with each print line.
     */
    createInstructions(rasterizeLayers) {

        if (rasterizeLayers === undefined) {
            rasterizeLayers = {};
            for (let z of this.towerLayerHeights) {
                rasterizeLayers[z] = true;
            }
        }

        const printer = this._print._printerProfile;
        const speeds = this._print.speeds;
        const infillPerimeterOverlap = (printer.transitionSettings.towers.infillPerimeterOverlap === "auto"
            ? INFILL_PERIMETER_OVERLAP
            : printer.transitionSettings.towers.infillPerimeterOverlap);

        const vertices = {
            northwest: {
                x: this.boundingBox.xMin,
                y: this.boundingBox.yMax
            },
            southwest: {
                x: this.boundingBox.xMin,
                y: this.boundingBox.yMin
            },
            northeast: {
                x: this.boundingBox.xMax,
                y: this.boundingBox.yMax
            },
            southeast: {
                x: this.boundingBox.xMax,
                y: this.boundingBox.yMin
            }
        };
        const zigguratVertices = {
            northwest: {
                x: this.zigguratBoundingBox.xMin,
                y: this.zigguratBoundingBox.yMax
            },
            southwest: {
                x: this.zigguratBoundingBox.xMin,
                y: this.zigguratBoundingBox.yMin
            },
            northeast: {
                x: this.zigguratBoundingBox.xMax,
                y: this.zigguratBoundingBox.yMax
            },
            southeast: {
                x: this.zigguratBoundingBox.xMax,
                y: this.zigguratBoundingBox.yMin
            }
        };

        const extrusionWidth = this.getExtrusionWidth();

        let precode = {};

        for (let i = 0; i < this.towerLayerHeights.length; i++) {

            const z = this.towerLayerHeights[i];
            if (rasterizeLayers[z]) {

                const layerVertices = (this.useZiggurats && i < this.zigguratLayerCount) ? zigguratVertices : vertices;

                const firstLayer = (i === 0);
                const extrusionFactor = (
                    (((this.rafts.useRaft && i <= this.rafts.raftLayers) || firstLayer) && this.layerStats[z].extrusionFactor !== 0)
                        ? this.layerStats[z].extrusionFactor
                        : this.defaultExtrusionFactor * this.layerStats[z].layerThickness
                );
                const usePerimeters = this.layerStats[z].density <= MAX_PERIMETER_DENSITY
                    || (firstLayer && printer.transitionSettings.towers.forceBottomPerimeter)
                    || (this.rafts.useRaft && i < this.rafts.raftLayers);
                const useInnerPerimeter = !(this.rafts.useRaft && i < this.rafts.baseLayers);

                let reverseInfillDirection = (i % 2 === 0);

                // outerPerimeter, innerPerimeter, and infill are lists of PreCode objects
                let precodeLayer = {
                    layerHeight: z,
                    commands: [],
                    perimeterExtrusion: 0,
                    totalExtrusion: 0
                };

                let x1, y1, x2, y2, lineLength, extrusionAmount;

                let infillSpeed = speeds.printing;
                if (this.rafts.useRaft && i <= this.rafts.raftLayers) {
                    infillSpeed = speeds.printingByLayer[z];
                } else if (firstLayer) {
                    infillSpeed = speeds.printingFirstLayer;
                } else {
                    if (printer.transitionSettings.towers.printSpeed === "auto") {
                        let slowestLayerPrintSpeed = Infinity;
                        for (let transition of this.layerStats[z].transitions) {
                            if (speeds.printingByTool[transition.to] > 0
                                && speeds.printingByTool[transition.to] < slowestLayerPrintSpeed) {
                                slowestLayerPrintSpeed = speeds.printingByTool[transition.to];
                            }
                            if (speeds.printingByTool[transition.from] > 0
                                && speeds.printingByTool[transition.from] < slowestLayerPrintSpeed) {
                                slowestLayerPrintSpeed = speeds.printingByTool[transition.from];
                            }
                        }
                        if (slowestLayerPrintSpeed < infillSpeed) {
                            infillSpeed = slowestLayerPrintSpeed;
                        }
                    } else {
                        infillSpeed = printer.transitionSettings.towers.printSpeed * 60;
                    }
                }
                if (infillSpeed === 0 || (firstLayer && infillSpeed > (speeds.printing / 2))) {
                    infillSpeed = speeds.printing / 2;
                }
                let outerPerimeterSpeed = infillSpeed * this._print._printerProfile.transitionSettings.towers.perimeterSpeedMultiplier;
                let innerPerimeterSpeed = (infillSpeed + outerPerimeterSpeed) / 2;
                let outerPerimeterMoveSpeed = speeds.rapidXY;

                if (firstLayer && this.brims.count > 0) {
                    let brimCount = this.brims.count;
                    let firstBrimMoved = false;
                    outerPerimeterMoveSpeed = outerPerimeterSpeed;
                    this.brims.extrusion = 0;
                    while (brimCount > 0) {

                        // AUTO BRIM

                        let brimMoveSpeed = outerPerimeterSpeed;
                        let brimComment = " move to next brim";
                        if (!firstBrimMoved) {
                            brimMoveSpeed = speeds.rapidXY;
                            brimComment = " move to brim start";
                            firstBrimMoved = true;
                        }

                        x1 = layerVertices.southeast.x + (brimCount * extrusionWidth);
                        y1 = layerVertices.southeast.y - (brimCount * extrusionWidth);
                        x2 = layerVertices.northeast.x + (brimCount * extrusionWidth);
                        y2 = layerVertices.northeast.y + (brimCount * extrusionWidth);
                        precodeLayer.commands.push({x1: x1, y1: y1, x2: x1, y2: y1, feedrate: brimMoveSpeed, comment: brimComment});
                        lineLength = getLineLength(x1, y1, x2, y2);
                        extrusionAmount = getExtrusionAmount(extrusionFactor, lineLength);
                        precodeLayer.commands.push({x1: x1, y1: y1, x2: x2, y2: y2, extrusion: extrusionAmount, feedrate: outerPerimeterSpeed});
                        this.brims.extrusion += extrusionAmount;

                        x1 = layerVertices.northeast.x + (brimCount * extrusionWidth);
                        y1 = layerVertices.northeast.y + (brimCount * extrusionWidth);
                        x2 = layerVertices.northwest.x - (brimCount * extrusionWidth);
                        y2 = layerVertices.northwest.y + (brimCount * extrusionWidth);
                        lineLength = getLineLength(x1, y1, x2, y2);
                        extrusionAmount = getExtrusionAmount(extrusionFactor, lineLength);
                        precodeLayer.commands.push({x1: x1, y1: y1, x2: x2, y2: y2, extrusion: extrusionAmount, feedrate: outerPerimeterSpeed});
                        this.brims.extrusion += extrusionAmount;

                        x1 = layerVertices.northwest.x - (brimCount * extrusionWidth);
                        y1 = layerVertices.northwest.y + (brimCount * extrusionWidth);
                        x2 = layerVertices.southwest.x - (brimCount * extrusionWidth);
                        y2 = layerVertices.southwest.y - (brimCount * extrusionWidth);
                        lineLength = getLineLength(x1, y1, x2, y2);
                        extrusionAmount = getExtrusionAmount(extrusionFactor, lineLength);
                        precodeLayer.commands.push({x1: x1, y1: y1, x2: x2, y2: y2, extrusion: extrusionAmount, feedrate: outerPerimeterSpeed});
                        this.brims.extrusion += extrusionAmount;

                        x1 = layerVertices.southwest.x - (brimCount * extrusionWidth);
                        y1 = layerVertices.southwest.y - (brimCount * extrusionWidth);
                        x2 = layerVertices.southeast.x + (brimCount * extrusionWidth);
                        y2 = layerVertices.southeast.y - (brimCount * extrusionWidth);
                        lineLength = getLineLength(x1, y1, x2, y2);
                        extrusionAmount = getExtrusionAmount(extrusionFactor, lineLength);
                        precodeLayer.commands.push({x1: x1, y1: y1, x2: x2, y2: y2, extrusion: extrusionAmount, feedrate: outerPerimeterSpeed});
                        this.brims.extrusion += extrusionAmount;

                        brimCount--;

                    }
                }

                if (usePerimeters) {

                    // FIRST (OUTER) PERIMETER

                    x1 = layerVertices.southeast.x;
                    y1 = layerVertices.southeast.y;
                    x2 = layerVertices.northeast.x;
                    y2 = layerVertices.northeast.y;
                    precodeLayer.commands.push({x1: x1, y1: y1, x2: x1, y2: y1, feedrate: outerPerimeterMoveSpeed, comment: " move to tower outer perimeter"});
                    lineLength = getLineLength(x1, y1, x2, y2);
                    extrusionAmount = getExtrusionAmount(extrusionFactor, lineLength);
                    precodeLayer.commands.push({x1: x1, y1: y1, x2: x2, y2: y2, extrusion: extrusionAmount, feedrate: outerPerimeterSpeed});
                    precodeLayer.perimeterExtrusion += extrusionAmount;
                    precodeLayer.totalExtrusion += extrusionAmount;

                    x1 = layerVertices.northeast.x;
                    y1 = layerVertices.northeast.y;
                    x2 = layerVertices.northwest.x;
                    y2 = layerVertices.northwest.y;
                    lineLength = getLineLength(x1, y1, x2, y2);
                    extrusionAmount = getExtrusionAmount(extrusionFactor, lineLength);
                    precodeLayer.commands.push({x1: x1, y1: y1, x2: x2, y2: y2, extrusion: extrusionAmount, feedrate: outerPerimeterSpeed});
                    precodeLayer.perimeterExtrusion += extrusionAmount;
                    precodeLayer.totalExtrusion += extrusionAmount;

                    x1 = layerVertices.northwest.x;
                    y1 = layerVertices.northwest.y;
                    x2 = layerVertices.southwest.x;
                    y2 = layerVertices.southwest.y;
                    lineLength = getLineLength(x1, y1, x2, y2);
                    extrusionAmount = getExtrusionAmount(extrusionFactor, lineLength);
                    precodeLayer.commands.push({x1: x1, y1: y1, x2: x2, y2: y2, extrusion: extrusionAmount, feedrate: outerPerimeterSpeed});
                    precodeLayer.perimeterExtrusion += extrusionAmount;
                    precodeLayer.totalExtrusion += extrusionAmount;

                    x1 = layerVertices.southwest.x;
                    y1 = layerVertices.southwest.y;
                    x2 = layerVertices.southeast.x;
                    y2 = layerVertices.southeast.y;
                    lineLength = getLineLength(x1, y1, x2, y2);
                    extrusionAmount = getExtrusionAmount(extrusionFactor, lineLength);
                    precodeLayer.commands.push({x1: x1, y1: y1, x2: x2, y2: y2, extrusion: extrusionAmount, feedrate: outerPerimeterSpeed});
                    precodeLayer.perimeterExtrusion += extrusionAmount;
                    precodeLayer.totalExtrusion += extrusionAmount;

                    if (useInnerPerimeter) {


                        // SECOND (INNER) PERIMETER

                        x1 = layerVertices.southeast.x - extrusionWidth;
                        y1 = layerVertices.southeast.y + extrusionWidth;
                        x2 = layerVertices.northeast.x - extrusionWidth;
                        y2 = layerVertices.northeast.y - extrusionWidth;
                        precodeLayer.commands.push({x1: x1, y1: y1, x2: x1, y2: y1, feedrate: innerPerimeterSpeed, comment: " move to tower inner perimeter"});
                        lineLength = getLineLength(x1, y1, x2, y2);
                        extrusionAmount = getExtrusionAmount(extrusionFactor, lineLength);
                        precodeLayer.commands.push({x1: x1, y1: y1, x2: x2, y2: y2, extrusion: extrusionAmount, feedrate: innerPerimeterSpeed});
                        precodeLayer.perimeterExtrusion += extrusionAmount;
                        precodeLayer.totalExtrusion += extrusionAmount;

                        x1 = layerVertices.northeast.x - extrusionWidth;
                        y1 = layerVertices.northeast.y - extrusionWidth;
                        x2 = layerVertices.northwest.x + extrusionWidth;
                        y2 = layerVertices.northwest.y - extrusionWidth;
                        lineLength = getLineLength(x1, y1, x2, y2);
                        extrusionAmount = getExtrusionAmount(extrusionFactor, lineLength);
                        precodeLayer.commands.push({x1: x1, y1: y1, x2: x2, y2: y2, extrusion: extrusionAmount, feedrate: innerPerimeterSpeed});
                        precodeLayer.perimeterExtrusion += extrusionAmount;
                        precodeLayer.totalExtrusion += extrusionAmount;

                        x1 = layerVertices.northwest.x + extrusionWidth;
                        y1 = layerVertices.northwest.y - extrusionWidth;
                        x2 = layerVertices.southwest.x + extrusionWidth;
                        y2 = layerVertices.southwest.y + extrusionWidth;
                        lineLength = getLineLength(x1, y1, x2, y2);
                        extrusionAmount = getExtrusionAmount(extrusionFactor, lineLength);
                        precodeLayer.commands.push({x1: x1, y1: y1, x2: x2, y2: y2, extrusion: extrusionAmount, feedrate: innerPerimeterSpeed});
                        precodeLayer.perimeterExtrusion += extrusionAmount;
                        precodeLayer.totalExtrusion += extrusionAmount;

                        x1 = layerVertices.southwest.x + extrusionWidth;
                        y1 = layerVertices.southwest.y + extrusionWidth;
                        x2 = layerVertices.southeast.x - extrusionWidth;
                        y2 = layerVertices.southeast.y + extrusionWidth;
                        lineLength = getLineLength(x1, y1, x2, y2);
                        extrusionAmount = getExtrusionAmount(extrusionFactor, lineLength);
                        precodeLayer.commands.push({x1: x1, y1: y1, x2: x2, y2: y2, extrusion: extrusionAmount, feedrate: innerPerimeterSpeed});
                        precodeLayer.perimeterExtrusion += extrusionAmount;
                        precodeLayer.totalExtrusion += extrusionAmount;

                    }

                }

                // INFILL FOR LAYER

                let xLeftBound = layerVertices.northwest.x;
                let xRightBound = layerVertices.southeast.x;
                let yBottomBound = layerVertices.southeast.y;
                let yTopBound = layerVertices.northwest.y;
                if (usePerimeters) {
                    if (useInnerPerimeter) {
                        xLeftBound = xLeftBound + (extrusionWidth * (2 - infillPerimeterOverlap));
                        xRightBound = xRightBound - (extrusionWidth * (2 - infillPerimeterOverlap));
                        yBottomBound = yBottomBound + (extrusionWidth * (2 - infillPerimeterOverlap));
                        yTopBound = yTopBound - (extrusionWidth * (2 - infillPerimeterOverlap));
                    } else {
                        xLeftBound = xLeftBound + (extrusionWidth * (1 - infillPerimeterOverlap));
                        xRightBound = xRightBound - (extrusionWidth * (1 - infillPerimeterOverlap));
                        yBottomBound = yBottomBound + (extrusionWidth * (1 - infillPerimeterOverlap));
                        yTopBound = yTopBound - (extrusionWidth * (1 - infillPerimeterOverlap));
                    }
                }

                let infillPercentage = this.layerStats[z].density;
                let infillInterval = (1 / infillPercentage) * extrusionWidth;
                let infillIncrement = Math.sqrt(infillInterval * infillInterval * 2);

                let needsMoreLines = true;

                let xBoundReached = false;
                let yBoundReached = false;

                // assume infill is drawn southwest/northeast
                // (X coordinates will be mirrored if reverseInfillDirection is true)

                let printSouthwest = true;

                let northeastX = xRightBound;
                let northeastY = yBottomBound;
                let southwestX = xRightBound;
                let southwestY = yBottomBound;

                while (needsMoreLines) {

                    if (xBoundReached) {
                        // move the southwest corner north
                        southwestY += infillIncrement;
                    } else {
                        // move the southwest corner west
                        southwestX -= infillIncrement;
                    }
                    if (yBoundReached) {
                        // move the northeast corner west
                        northeastX -= infillIncrement;
                    } else {
                        // move the northeast corner north
                        northeastY += infillIncrement;
                    }

                    // check if we passed the x bound (ie. we reached the southwest corner)
                    if (!xBoundReached && southwestX < xLeftBound) {
                        southwestY = yBottomBound + (xLeftBound - southwestX);
                        southwestX = xLeftBound;
                        xBoundReached = true;
                    }

                    // check if we passed the y bound (ie. we reached the northeast corner)
                    if (!yBoundReached && northeastY > yTopBound) {
                        northeastX = xRightBound - (northeastY - yTopBound);
                        northeastY = yTopBound;
                        yBoundReached = true;
                    }

                    if (printSouthwest) {
                        x1 = northeastX;
                        y1 = northeastY;
                        x2 = southwestX;
                        y2 = southwestY;
                    } else {
                        x1 = southwestX;
                        y1 = southwestY;
                        x2 = northeastX;
                        y2 = northeastY;
                    }
                    if (reverseInfillDirection) {
                        x1 = xRightBound + xLeftBound - x1;
                        x2 = xRightBound + xLeftBound - x2;
                    }
                    precodeLayer.commands.push({x1: x1, y1: y1, x2: x1, y2: y1, feedrate: infillSpeed});  // move from last line end to this line start
                    lineLength = getLineLength(x1, y1, x2, y2);
                    extrusionAmount = getExtrusionAmount(extrusionFactor, lineLength);
                    precodeLayer.commands.push({x1: x1, y1: y1, x2: x2, y2: y2, extrusion: extrusionAmount, feedrate: infillSpeed});
                    precodeLayer.totalExtrusion += extrusionAmount;

                    // check whether we should continue generating infill
                    if (Math.abs(northeastX - xLeftBound) < infillIncrement) {
                        needsMoreLines = false;
                    } else if (Math.abs(yTopBound - southwestY) < infillIncrement) {
                        needsMoreLines = false;
                    } else {
                        printSouthwest = !printSouthwest;
                    }

                }

                precode[z] = precodeLayer;

            }


        }

        for (let z in precode) {
            this.precode[z] = precode[z];
        }

    }

}

module.exports = TransitionTower;
