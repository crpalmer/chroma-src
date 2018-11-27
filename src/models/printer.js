
const MSF = require('./msf');

const TRANSITION_TOWER = require("./common").TRANSITION_TOWER;
const BOWDEN_NONE = require("./common").BOWDEN_NONE;
const PING_EXTRUSION_COUNTS = require("./common").PING_EXTRUSION_COUNTS;

const FIRST_PIECE_MIN_LENGTH = require("./common").FIRST_PIECE_MIN_LENGTH;
const FIRST_PIECE_MIN_LENGTH_P2 = require("./common").FIRST_PIECE_MIN_LENGTH_P2;

const DEFAULT_PPM = require("./common").DEFAULT_PPM;

const lerp = require("./common").lerp;

const PaletteTypes = {
    Palette: "Palette/Palette+",
    Palette2: "Palette 2",
    Palette2Pro: "Palette 2 Pro"
};

class Printer {

    constructor() {

        this.uuid = null;
        this.version = 2;
        this.profileName = "";
        this.baseProfile = "custom";
        this.gpxProfile = false;
        this.gpxConfigPath = "";
        this.inputParsers = ["gcode"];
        this.engine = "reprap";
        this.postprocessing = false;
        this.volumetric = false;
        this.independentExtruderAxes = false;
        this.extruderStepsPerMM = 0;
        this.paletteType = PaletteTypes.Palette;
        this.integrated = false;

        this.filamentDiameter = 1.75;
        this.nozzleDiameter = 0.4;
        this.extruderCount = 1;
        this.printExtruder = false;
        this.printBedDimensions = {
            circular: false,
            x: 0,
            y: 0,
            diameter: 0,
            origin: "bottomleft",
            originOffsets: {
                x: 0,
                y: 0
            }
        };
        this.bowdenTube = false;
        this.firmwarePurge = 0;

        this.transitionSettings = {
            type: TRANSITION_TOWER,
            purgeLength: 130,
            minPurgeLength: 130,
            initialPurgeLength: 130,
            targetPosition: 0.4,
            useInfillForTransition: false,
            useSupportForTransition: false,
            towers: {
                printSpeed: "auto",
                extrusionWidth: "auto",
                minDensity: 0.05,
                minFirstLayerDensity: 0.8,
                maxDensity: 1,
                perimeterSpeedMultiplier: 0.5,
                forceBottomPerimeter: true,
                infillPerimeterOverlap: "auto"
            },
            sideTransitions: {
                purgeSpeed: 4,
                purgeInPlace: false,
                coordinates: {
                    x: 0,
                    y: 0
                },
                purgeEdge: "west",
                purgeEdgeOffset: 2
            }
        };
        this.mechanicalPingGCode = "";
        this.jogPauses = false;
        this.pingRetraction = "auto";
        this.pingOffTower = false;

        this.loadingOffset = 0;
        this.printValue = 0;
        this.calibrationGCodeLength = 0;

    }

    isPalette2() {
        return (this.paletteType === PaletteTypes.Palette2
            || this.paletteType === PaletteTypes.Palette2Pro);
    }

    getSpliceCore() {
        switch (this.paletteType) {
            case PaletteTypes.Palette2:
                return "SC";
            case PaletteTypes.Palette2Pro:
                return "SCP";
            default:
                return "P";
        }
    }

    isIntegratedMSF() {
        return this.isPalette2() && this.integrated;
    }

    getMSFVersion() {
        return this.isPalette2() ? 2.0 : 1.4;
    }

    getMSFExtension(allowIntegrated = true) {
        if (this.isPalette2()) {
            return (allowIntegrated && this.isIntegratedMSF()) ? "mcf" : "maf";
        }
        return "msf";
    }

    getMSF2PrinterID() {
        if (!this.uuid) {
            return MSF.intToHex(1, 16);
        }
        return this.uuid.replace(/-/g, "").slice(-16);
    }

    getMinFirstPieceLength() {
        if (this.isPalette2()) {
            return FIRST_PIECE_MIN_LENGTH_P2;
        }
        return FIRST_PIECE_MIN_LENGTH;
    }

    getPulsesPerMM() {
        if (this.isPalette2()) {
            return DEFAULT_PPM;
        }
        if (this.printValue === 0 || this.calibrationGCodeLength === 0) {
            return 0;
        }
        return this.printValue / (this.calibrationGCodeLength + this.firmwarePurge);
    }

    getPingExtrusionLength() {
        const ppm = this.getPulsesPerMM();
        if (ppm === 0) {
            return 0;
        }
        return PING_EXTRUSION_COUNTS / ppm;
    }

    interpolatePurgeLengths(fromStrength, toStrength) {
        //  0 = weak
        //  1 = normal
        //  2 = strong
        //  t =         0     1     2      (to)
        //            |------------------
        //          0 | 0.5   0.25  0
        //  (from)  1 | 0.75  0.5   0.25
        //          2 | 1     0.75  0.5
        let min = this.transitionSettings.minPurgeLength;
        let max = this.transitionSettings.purgeLength;
        if (min >= max) {
            return max;
        }
        let t = (fromStrength - toStrength + 2) / 4;
        return lerp(min, max, t);

    }

    canInfillDump() {
        return (global.advancedMode && (this.transitionSettings.useInfillForTransition
            || this.transitionSettings.useSupportForTransition));
    }

    clone() {
        let clone = new Printer();
        clone.assignValues(this);
        return clone;
    }

    assignValues(other) {
        if (!(other instanceof Printer)) {
            return;
        }
        this.uuid = other.uuid;
        this.profileName = other.profileName;
        this.baseProfile = other.baseProfile;
        this.gpxProfile = other.gpxProfile;
        this.gpxConfigPath = other.gpxConfigPath;
        this.inputParsers = other.inputParsers.slice();
        this.engine = other.engine;
        this.postprocessing = other.postprocessing;
        this.volumetric = other.volumetric;
        this.independentExtruderAxes = other.independentExtruderAxes;
        this.extruderStepsPerMM = other.extruderStepsPerMM;
        this.paletteType = other.paletteType;
        this.integrated = other.integrated;

        this.filamentDiameter = other.filamentDiameter;
        this.nozzleDiameter = other.nozzleDiameter;
        this.extruderCount = other.extruderCount;
        this.printExtruder = other.printExtruder;
        this.printBedDimensions.circular = other.printBedDimensions.circular;
        this.printBedDimensions.x = other.printBedDimensions.x;
        this.printBedDimensions.y = other.printBedDimensions.y;
        this.printBedDimensions.diameter = other.printBedDimensions.diameter;
        this.printBedDimensions.origin = other.printBedDimensions.origin;
        this.printBedDimensions.originOffsets.x = other.printBedDimensions.originOffsets.x;
        this.printBedDimensions.originOffsets.y = other.printBedDimensions.originOffsets.y;
        this.bowdenTube = other.bowdenTube;
        this.firmwarePurge = other.firmwarePurge;

        this.transitionSettings.type = other.transitionSettings.type;
        this.transitionSettings.purgeLength = other.transitionSettings.purgeLength;
        this.transitionSettings.minPurgeLength = other.transitionSettings.minPurgeLength;
        this.transitionSettings.initialPurgeLength = other.transitionSettings.initialPurgeLength;
        this.transitionSettings.targetPosition = other.transitionSettings.targetPosition;
        this.transitionSettings.useInfillForTransition = other.transitionSettings.useInfillForTransition;
        this.transitionSettings.useSupportForTransition = other.transitionSettings.useSupportForTransition;
        this.transitionSettings.towers.printSpeed = other.transitionSettings.towers.printSpeed;
        this.transitionSettings.towers.extrusionWidth = other.transitionSettings.towers.extrusionWidth;
        this.transitionSettings.towers.minDensity = other.transitionSettings.towers.minDensity;
        this.transitionSettings.towers.minFirstLayerDensity = other.transitionSettings.towers.minFirstLayerDensity;
        this.transitionSettings.towers.perimeterSpeedMultiplier = other.transitionSettings.towers.perimeterSpeedMultiplier;
        this.transitionSettings.towers.forceBottomPerimeter = other.transitionSettings.towers.forceBottomPerimeter;
        this.transitionSettings.towers.infillPerimeterOverlap = other.transitionSettings.towers.infillPerimeterOverlap;
        this.transitionSettings.towers.maxDensity = other.transitionSettings.towers.maxDensity;
        this.transitionSettings.sideTransitions.purgeSpeed = other.transitionSettings.sideTransitions.purgeSpeed;
        this.transitionSettings.sideTransitions.purgeInPlace = other.transitionSettings.sideTransitions.purgeInPlace;
        this.transitionSettings.sideTransitions.coordinates.x = other.transitionSettings.sideTransitions.coordinates.x;
        this.transitionSettings.sideTransitions.coordinates.y = other.transitionSettings.sideTransitions.coordinates.y;
        this.transitionSettings.sideTransitions.purgeEdge = other.transitionSettings.sideTransitions.purgeEdge;
        this.transitionSettings.sideTransitions.purgeEdgeOffset = other.transitionSettings.sideTransitions.purgeEdgeOffset;
        this.mechanicalPingGCode = other.mechanicalPingGCode;
        this.jogPauses = other.jogPauses;
        this.pingRetraction = other.pingRetraction;
        this.pingOffTower = other.pingOffTower;
        this.gpxProfile = other.gpxProfile;
        this.gpxConfigPath = other.gpxConfigPath;

        this.loadingOffset = other.loadingOffset;
        this.printValue = other.printValue;
        this.calibrationGCodeLength = other.calibrationGCodeLength;
    }

    equals(other) {
        if (!(other instanceof Printer)) {
            return false;
        }
        if (this.inputParsers.length !== other.inputParsers.length) {
            return false;
        }
        for (let i = 0; i < this.inputParsers.length; i++) {
            if (this.inputParsers[i] !== other.inputParsers[i]) {
                return false;
            }
        }
        return (this.uuid === other.uuid
            && this.profileName === other.profileName
            && this.baseProfile === other.baseProfile
            && this.gpxProfile === other.gpxProfile
            && this.gpxConfigPath === other.gpxConfigPath
            && this.engine === other.engine
            && this.postprocessing === other.postprocessing
            && this.volumetric === other.volumetric
            && this.independentExtruderAxes === other.independentExtruderAxes
            && this.extruderStepsPerMM === other.extruderStepsPerMM
            && this.paletteType === other.paletteType
            && this.integrated === other.integrated
            && this.filamentDiameter === other.filamentDiameter
            && this.nozzleDiameter === other.nozzleDiameter
            && this.extruderCount === other.extruderCount
            && this.printExtruder === other.printExtruder
            && this.printBedDimensions.circular === other.printBedDimensions.circular
            && this.printBedDimensions.x === other.printBedDimensions.x
            && this.printBedDimensions.y === other.printBedDimensions.y
            && this.printBedDimensions.diameter === other.printBedDimensions.diameter
            && this.printBedDimensions.origin === other.printBedDimensions.origin
            && this.printBedDimensions.originOffsets.x === other.printBedDimensions.originOffsets.x
            && this.printBedDimensions.originOffsets.y === other.printBedDimensions.originOffsets.y
            && this.bowdenTube === other.bowdenTube
            && this.firmwarePurge === other.firmwarePurge
            && this.transitionSettings.type === other.transitionSettings.type
            && this.transitionSettings.purgeLength === other.transitionSettings.purgeLength
            && this.transitionSettings.minPurgeLength === other.transitionSettings.minPurgeLength
            && this.transitionSettings.initialPurgeLength === other.transitionSettings.initialPurgeLength
            && this.transitionSettings.targetPosition === other.transitionSettings.targetPosition
            && this.transitionSettings.useInfillForTransition === other.transitionSettings.useInfillForTransition
            && this.transitionSettings.useSupportForTransition === other.transitionSettings.useSupportForTransition
            && this.transitionSettings.towers.printSpeed === other.transitionSettings.towers.printSpeed
            && this.transitionSettings.towers.extrusionWidth === other.transitionSettings.towers.extrusionWidth
            && this.transitionSettings.towers.minDensity === other.transitionSettings.towers.minDensity
            && this.transitionSettings.towers.minFirstLayerDensity === other.transitionSettings.towers.minFirstLayerDensity
            && this.transitionSettings.towers.perimeterSpeedMultiplier === other.transitionSettings.towers.perimeterSpeedMultiplier
            && this.transitionSettings.towers.forceBottomPerimeter === other.transitionSettings.towers.forceBottomPerimeter
            && this.transitionSettings.towers.infillPerimeterOverlap === other.transitionSettings.towers.infillPerimeterOverlap
            && this.transitionSettings.towers.maxDensity === other.transitionSettings.towers.maxDensity
            && this.transitionSettings.sideTransitions.purgeSpeed === other.transitionSettings.sideTransitions.purgeSpeed
            && this.transitionSettings.sideTransitions.purgeInPlace === other.transitionSettings.sideTransitions.purgeInPlace
            && this.transitionSettings.sideTransitions.coordinates.x === other.transitionSettings.sideTransitions.coordinates.x
            && this.transitionSettings.sideTransitions.coordinates.y === other.transitionSettings.sideTransitions.coordinates.y
            && this.transitionSettings.sideTransitions.purgeEdge === other.transitionSettings.sideTransitions.purgeEdge
            && this.transitionSettings.sideTransitions.purgeEdgeOffset === other.transitionSettings.sideTransitions.purgeEdgeOffset
            && this.mechanicalPingGCode === other.mechanicalPingGCode
            && this.jogPauses === other.jogPauses
            && this.pingRetraction === other.pingRetraction
            && this.pingOffTower === other.pingOffTower
            && this.loadingOffset === other.loadingOffset
            && this.printValue === other.printValue
            && this.calibrationGCodeLength === other.calibrationGCodeLength);
    }

    serialize() {
        return {
            version: 2,
            uuid: this.uuid,
            name: this.profileName,
            preset: this.baseProfile,
            gpxProfile: this.gpxProfile,
            gpxConfigPath: this.gpxConfigPath,
            inputs: this.inputParsers,
            engine: this.engine,
            postprocessing: this.postprocessing,
            volumetric: this.volumetric,
            independentExtruderAxes: this.independentExtruderAxes,
            extruderStepsPerMM: this.extruderStepsPerMM,
            paletteType: this.paletteType,
            integrated: this.integrated,
            filamentDiameter: this.filamentDiameter,
            nozzleDiameter: this.nozzleDiameter,
            extruderCount: this.extruderCount,
            printExtruder: this.printExtruder,
            printBed: {
                circular: this.printBedDimensions.circular,
                x: this.printBedDimensions.x,
                y: this.printBedDimensions.y,
                diameter: this.printBedDimensions.diameter,
                origin: this.printBedDimensions.origin,
                originOffsets: {
                    x: this.printBedDimensions.originOffsets.x,
                    y: this.printBedDimensions.originOffsets.y
                },
            },
            bowdenTube: this.bowdenTube,
            firmwarePurge: this.firmwarePurge,
            transitions: {
                method: this.transitionSettings.type,
                purgeLength: this.transitionSettings.purgeLength,
                minPurgeLength: this.transitionSettings.minPurgeLength,
                initialPurgeLength: this.transitionSettings.initialPurgeLength,
                purgeTarget: this.transitionSettings.targetPosition,
                transitionInInfill: this.transitionSettings.useInfillForTransition,
                transitionInSupport: this.transitionSettings.useSupportForTransition,
                towers: {
                    printSpeed: this.transitionSettings.towers.printSpeed,
                    extrusionWidth: this.transitionSettings.towers.extrusionWidth,
                    minDensity: this.transitionSettings.towers.minDensity,
                    minBottomDensity: this.transitionSettings.towers.minFirstLayerDensity,
                    maxDensity: this.transitionSettings.towers.maxDensity,
                    perimeterSpeedMultiplier: this.transitionSettings.towers.perimeterSpeedMultiplier,
                    forceBottomPerimeter: this.transitionSettings.towers.forceBottomPerimeter,
                    infillPerimeterOverlap: this.transitionSettings.towers.infillPerimeterOverlap
                },
                sideTransitions: {
                    purgeSpeed: this.transitionSettings.sideTransitions.purgeSpeed,
                    purgeInPlace: this.transitionSettings.sideTransitions.purgeInPlace,
                    coordinates: {
                        x: this.transitionSettings.sideTransitions.coordinates.x,
                        y: this.transitionSettings.sideTransitions.coordinates.y
                    },
                    purgeEdge: this.transitionSettings.sideTransitions.purgeEdge,
                    purgeEdgeOffset: this.transitionSettings.sideTransitions.purgeEdgeOffset
                }
            },
            pings: {
                jogPauses: this.jogPauses,
                retraction: this.pingRetraction,
                pingOffTower: this.pingOffTower,
                mechanicalPingGCode: this.mechanicalPingGCode,
            },
            calibration: {
                loadingOffset: this.loadingOffset,
                printValue: this.printValue,
                calibrationGCodeLength: this.calibrationGCodeLength
            }
        };
    }

    static unserialize(name, json) {
        if (json === undefined) {
            json = name;
            name = undefined;
        }
        let printer = new Printer();
        switch (json.version) {
            case 1:
            case undefined:
                printer.version = 1;
                printer.profileName = (name ? name : json.name);
                printer.gpxProfile = (json.gpxProfile ? json.gpxProfile : false);

                printer.nozzleDiameter = 0;
                printer.printBedDimensions.circular = json.printBedCircular;
                printer.printBedDimensions.x = json.printBedX;
                printer.printBedDimensions.y = json.printBedY;
                printer.printBedDimensions.diameter = json.printBedDiameter;
                printer.printBedDimensions.origin = json.printBedOriginMiddle ? "middle" : "bottomleft";
                printer.printBedDimensions.originOffsets.x = (json.printBedOriginMiddle ? json.printBedX / 2 : 0);
                printer.printBedDimensions.originOffsets.y = (json.printBedOriginMiddle ? json.printBedY / 2 : 0);
                printer.bowdenTube = (json.bowdenTubeLength === BOWDEN_NONE ? false : json.bowdenTubeLength);

                printer.transitionSettings.purgeLength = json.purgeFactor;
                printer.transitionSettings.minPurgeLength = json.purgeFactor;
                printer.transitionSettings.targetPosition = json.purgeTarget;
                printer.transitionSettings.towers.minDensity = json.minTowerDensity;
                printer.transitionSettings.towers.minFirstLayerDensity = json.minTowerBottomDensity;
                printer.transitionSettings.towers.maxDensity = json.maxTowerDensity;
                printer.transitionSettings.towers.perimeterSpeedMultiplier = json.towerPerimeterSpeedMultiplier;
                printer.transitionSettings.towers.forceBottomPerimeter = json.forceTowerBottomPerimeter;
                printer.transitionSettings.sideTransitions.purgeSpeed = json.sideTransitionPurgeSpeed;
                printer.jogPauses = json.jogPauses;
                printer.mechanicalPingGCode = json.mechanicalPingGCode;
                printer.gpxProfile = (json.gpxProfile ? json.gpxProfile : false);

                printer.loadingOffset = json.loadingOffset;
                printer.printValue = json.printValue;
                printer.calibrationGCodeLength = json.calibrationGCodeLength;
                break;
            case 2:
            default:
                printer.version = 2;
                printer.uuid = (json.uuid === undefined ? null : json.uuid);
                printer.profileName = (name ? name : json.name);
                printer.baseProfile = (json.preset === undefined ? "custom" : json.preset);
                printer.gpxProfile = (json.gpxProfile ? json.gpxProfile : false);
                printer.gpxConfigPath = (json.gpxConfigPath ? json.gpxConfigPath : "");
                printer.inputParsers = (json.inputs === undefined ? ["gcode"] : json.inputs);
                printer.engine = (json.engine === undefined ? "reprap" : json.engine);
                printer.postprocessing = (json.postprocessing === undefined ? (json.gpxProfile ? "x3g" : false) : json.postprocessing);
                printer.volumetric = !!json.volumetric;
                printer.independentExtruderAxes = !!json.independentExtruderAxes;
                printer.extruderStepsPerMM = (json.extruderStepsPerMM || 0);
                printer.paletteType = (json.paletteType || PaletteTypes.Palette);
                printer.integrated = !!json.integrated;

                printer.filamentDiameter = json.filamentDiameter;
                printer.nozzleDiameter = json.nozzleDiameter;
                printer.extruderCount = json.extruderCount;
                printer.printExtruder = (json.printExtruder === undefined ? false : json.printExtruder);
                printer.printBedDimensions.circular = json.printBed.circular;
                printer.printBedDimensions.x = json.printBed.x;
                printer.printBedDimensions.y = json.printBed.y;
                printer.printBedDimensions.diameter = json.printBed.diameter;
                printer.printBedDimensions.origin = json.printBed.origin;
                printer.printBedDimensions.originOffsets.x = json.printBed.originOffsets.x;
                printer.printBedDimensions.originOffsets.y = json.printBed.originOffsets.y;
                printer.bowdenTube = json.bowdenTube;
                printer.firmwarePurge = (json.firmwarePurge || 0);

                printer.transitionSettings.type = json.transitions.method;
                printer.transitionSettings.purgeLength = json.transitions.purgeLength;
                printer.transitionSettings.minPurgeLength = (json.transitions.minPurgeLength === undefined ? json.transitions.purgeLength : json.transitions.minPurgeLength);
                printer.transitionSettings.initialPurgeLength = (json.transitions.initialPurgeLength === undefined ? json.transitions.purgeLength : json.transitions.initialPurgeLength);
                printer.transitionSettings.targetPosition = json.transitions.purgeTarget;
                printer.transitionSettings.useInfillForTransition = !!json.transitions.transitionInInfill;
                printer.transitionSettings.useSupportForTransition = !!json.transitions.transitionInSupport;
                printer.transitionSettings.towers.printSpeed = (json.transitions.towers.printSpeed === undefined ? "auto" : json.transitions.towers.printSpeed);
                printer.transitionSettings.towers.extrusionWidth = (json.transitions.towers.extrusionWidth === undefined ? "auto" : json.transitions.towers.extrusionWidth);
                printer.transitionSettings.towers.minDensity = json.transitions.towers.minDensity;
                printer.transitionSettings.towers.minFirstLayerDensity = json.transitions.towers.minBottomDensity;
                printer.transitionSettings.towers.maxDensity = json.transitions.towers.maxDensity;
                printer.transitionSettings.towers.perimeterSpeedMultiplier = json.transitions.towers.perimeterSpeedMultiplier;
                printer.transitionSettings.towers.forceBottomPerimeter = json.transitions.towers.forceBottomPerimeter;
                printer.transitionSettings.towers.infillPerimeterOverlap = (json.transitions.towers.infillPerimeterOverlap === undefined ? "auto" : json.transitions.towers.infillPerimeterOverlap);
                printer.transitionSettings.sideTransitions.purgeSpeed = json.transitions.sideTransitions.purgeSpeed;
                printer.transitionSettings.sideTransitions.purgeInPlace = !!json.transitions.sideTransitions.purgeInPlace;
                printer.transitionSettings.sideTransitions.coordinates.x = (json.transitions.sideTransitions.coordinates === undefined ? 0 : json.transitions.sideTransitions.coordinates.x);
                printer.transitionSettings.sideTransitions.coordinates.y = (json.transitions.sideTransitions.coordinates === undefined ? 0 : json.transitions.sideTransitions.coordinates.y);
                printer.transitionSettings.sideTransitions.purgeEdge = (json.transitions.sideTransitions.purgeEdge === undefined ? "west" : json.transitions.sideTransitions.purgeEdge);
                printer.transitionSettings.sideTransitions.purgeEdgeOffset = (json.transitions.sideTransitions.purgeEdgeOffset === undefined ? 2 : json.transitions.sideTransitions.purgeEdgeOffset);
                printer.jogPauses = json.pings.jogPauses;
                printer.pingRetraction = (json.pings.retraction === undefined ? "auto" : json.pings.retraction);
                printer.pingOffTower = (json.pings.pingOffTower ? json.pings.pingOffTower : false);
                printer.mechanicalPingGCode = json.pings.mechanicalPingGCode;

                printer.loadingOffset = json.calibration.loadingOffset;
                printer.printValue = json.calibration.printValue;
                printer.calibrationGCodeLength = json.calibration.calibrationGCodeLength;
                break;
        }

        return printer;
    }

}

const DEFAULTS = new Printer();

module.exports = Printer;

module.exports.PaletteTypes = PaletteTypes;
module.exports.DEFAULTS = DEFAULTS;
