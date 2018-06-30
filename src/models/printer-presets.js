
const Raft = require("raft-js");

let engines = [
    ["reprap",      "RepRap",             "RepRapEngine"],
    ["craftbot",    "Craftbot",           "CraftbotEngine"],
    ["flashforge",  "FlashForge",         "FlashForgeEngine"],
    ["makerbot",    "MakerBot/Sailfish",  "MakerbotEngine"],
    // ["makerbot5",   "MakerBot 5th Gen",   "Makerbot5thGenEngine"],
    ["marlin",      "Marlin",             "MarlinEngine"],
    ["repetier",    "Repetier",           "RepetierEngine"],
    ["smoothie",    "Smoothie",           "SmoothieEngine"],
    ["tiertime",    "Tiertime",           "TiertimeEngine"],
    ["ulti",        "UltiGCode",          "UltiGCodeEngine"]
];

let parsers = [
    ["gcode",     ".gcode",     "GCodeParser"],
    ["gco",       ".gco",       "GCodeParser"],
    ["g",         ".g",         "GParser"],
    ["gx",        ".gx",        "GXParser"],
    ["g3drem",    ".g3drem",    "G3DremParser"],
    ["hvs",       ".hvs",       "HVSParser"],
    // ["makerbot",  ".makerbot",  "MakerbotParser"]
];

let postprocessors = [
    ["makerbot",  "Convert to .makerbot"],
    ["x3g",       "Convert to .x3g"],
    ["g3drem",    "Convert to .g3drem"]
];

let gpxProfiles = [
    ["c3",     "Cupcake Gen3 XYZ, Mk5/6 + Gen4 Extruder"],
    ["c4",     "Cupcake Gen4 XYZ, Mk5/6 + Gen4 Extruder"],
    ["cp4",    "Cupcake Pololu XYZ, Mk5/6 + Gen4 Extruder"],
    ["cpp",    "Cupcake Pololu XYZ, Mk5/6 + Pololu Extruder"],
    ["cxy",    "Core-XY with HBP - single extruder"],
    ["cxysz",  "Core-XY with HBP - single extruder, slow Z"],
    ["cr1",    "Clone R1 Single with heated build plate"],
    ["cr1d",   "Clone R1 Dual with heated build plate"],
    ["r1",     "Replicator 1 - single extruder"],
    ["r1d",    "Replicator 1 - dual extruder"],
    ["r2",     "Replicator 2"],
    ["r2h",    "Replicator 2 with heated build plate"],
    ["r2x",    "Replicator 2X"],
    ["t6",     "TOM Mk6 - single extruder"],
    ["t7",     "TOM Mk7 - single extruder"],
    ["t7d",    "TOM Mk7 - dual extruder"],
    ["z",      "ZYYX - single extruder"],
    ["zd",     "ZYYX - dual extruder"],
    ["fcp",    "FlashForge Creator Pro"],
    ["ini",    "External config file"]
];

let makerbotBotTypes = {
    makerbot_5thgen: "replicator_5",
    makerbot_5thgen_plus: "replicator_b",
    makerbot_mini: "mini_4",
    makerbot_mini_plus: "mini_8",
    makerbot_z18: "z18_6"
};

let customSetupInfoCraftbot = {
    tubeClipText: "Download an STL of the Craftbot custom guide tube clip [here](http://mm3d.co/CraftBot-Tube-Clip)."
};

let customSetupInfoMakerbot5thGen = {
    tubeClipText: "Download an STL of a custom Makerbot guide tube clip [here](http://mm3d.co/5thGen-Tube-Clip)."
};

let customSetupInfoRobo = {
    tubeClipImage: "../assets/onboarding/images/robo-guide-tube-clip.png",
    scrollWheelImage: "../assets/onboarding/images/robo-scroll-wheel.png",
    finalSetupImage: "../assets/onboarding/images/robo-final-setup.png",
    finalSetupText: "See below for an example of a Robo R2 and Palette setup."
};
let customSetupInfoRoboC2 = JSON.parse(JSON.stringify(customSetupInfoRobo));
let customSetupInfoRoboR2 = JSON.parse(JSON.stringify(customSetupInfoRobo));
customSetupInfoRoboR2.slicerText = "Learn how to set up and slice your first multi-color model.\n\nIf this is your first time slicing for Palette, you can watch our tutorial video for [Simplify3D](http://mm3d.co/roboS3D).\n\nUse this [factory file](http://mm3d.co/robo-factory) for setting up Simplify3D.";

let customSetupInfoTypeA = {
    tubeClipImage: "../assets/onboarding/images/typea-guide-tube-clip.png",
    tubeClipText: "Download an STL of the Type A custom guide tube clip [here](http://mm3d.co/TypeA-Tube-Clip).",
    scrollWheelImage: "../assets/onboarding/images/typea-scroll-wheel.png",
    positionPaletteImage: "../assets/onboarding/images/typea-palette-position.png",
    finalSetupImage: "../assets/onboarding/images/typea-final-setup.png",
    finalSetupText: "See below for an example of a Type A and Palette setup."
};

let presets = [
    {
        name: "Anycubic",
        prefixNameToModels: false,
        models: [
            {
                name: "Anycubic Delta",
                uid: "anycubic_delta",
                inputParsers: ["gcode"],
                engine: "marlin",
                postprocessing: false,
                volumetric: false,
                extruderCount: 1,
                printBed: {
                    circular: true,
                    diameter: 180,
                    origin: "middle"
                },
                filamentDiameter: 1.75,
                nozzleDiameter: 0.4,
                bowdenTube: 1500,
                gpxProfile: false
            }, {
                name: "Anycubic Delta Linear Plus",
                uid: "anycubic_deltalinearplus",
                inputParsers: ["gcode"],
                engine: "marlin",
                postprocessing: false,
                volumetric: false,
                extruderCount: 1,
                printBed: {
                    circular: true,
                    diameter: 230,
                    origin: "middle"
                },
                filamentDiameter: 1.75,
                nozzleDiameter: 0.4,
                bowdenTube: 1500,
                gpxProfile: false
            }, {
                name: "Anycubic i3 MEGA",
                uid: "anycubic_i3mega",
                inputParsers: ["gcode"],
                engine: "marlin",
                postprocessing: false,
                volumetric: false,
                extruderCount: 1,
                printBed: {
                    circular: false,
                    x: 210,
                    y: 210,
                    origin: "bottomleft"
                },
                filamentDiameter: 1.75,
                nozzleDiameter: 0.4,
                bowdenTube: 1500,
                gpxProfile: false
            }
        ]
    }, {
        name: "Aleph Objects",
        prefixNameToModels: false,
        models: [
            {
                name: "LulzBot TAZ 5 (1.75 mm upgrade, 0.35 mm nozzle)",
                uid: "lulzbot_taz5_035",
                inputParsers: ["gcode"],
                engine: "marlin",
                postprocessing: false,
                volumetric: false,
                extruderCount: 1,
                printBed: {
                    circular: false,
                    x: 298,
                    y: 275,
                    origin: "bottomleft"
                },
                filamentDiameter: 1.75,
                nozzleDiameter: 0.35,
                bowdenTube: false,
                gpxProfile: false
            }, {
                name: "LulzBot TAZ 5 (1.75 mm upgrade, 0.5 mm nozzle)",
                uid: "lulzbot_taz5_05",
                inputParsers: ["gcode"],
                engine: "marlin",
                postprocessing: false,
                volumetric: false,
                extruderCount: 1,
                printBed: {
                    circular: false,
                    x: 298,
                    y: 275,
                    origin: "bottomleft"
                },
                filamentDiameter: 1.75,
                nozzleDiameter: 0.5,
                bowdenTube: false,
                gpxProfile: false
            }, {
                name: "LulzBot TAZ 6 (1.75 mm upgrade)",
                uid: "lulzbot_taz6",
                inputParsers: ["gcode"],
                engine: "marlin",
                postprocessing: false,
                volumetric: false,
                extruderCount: 1,
                printBed: {
                    circular: false,
                    x: 298,
                    y: 275,
                    origin: "bottomleft"
                },
                filamentDiameter: 1.75,
                nozzleDiameter: 0.5,
                bowdenTube: false,
                gpxProfile: false
            }, {
                name: "LulzBot Mini (1.75 mm upgrade)",
                uid: "lulzbot_mini",
                inputParsers: ["gcode"],
                engine: "marlin",
                postprocessing: false,
                volumetric: false,
                extruderCount: 1,
                printBed: {
                    circular: false,
                    x: 152,
                    y: 152,
                    origin: "bottomleft"
                },
                filamentDiameter: 1.75,
                nozzleDiameter: 0.5,
                bowdenTube: false,
                gpxProfile: false
            }
        ]
    }, {
        name: "Bibo",
        prefixNameToModels: false,
        models: [
            {
                name: "Bibo 2 Touch",
                uid: "bibo_2touch",
                inputParsers: ["gcode"],
                engine: "marlin",
                postprocessing: false,
                volumetric: false,
                extruderCount: 2,
                printBed: {
                    circular: false,
                    x: 214,
                    y: 186,
                    origin: "middle"
                },
                filamentDiameter: 1.75,
                nozzleDiameter: 0.4,
                bowdenTube: false,
                gpxProfile: false
            }
        ]
    }, {
        name: "Blue Eagle Labs",
        prefixNameToModels: true,
        models: [
            {
                name: "Kossel Clear",
                uid: "blueeagle_kosselclear",
                inputParsers: ["gcode"],
                engine: "marlin",
                postprocessing: false,
                volumetric: false,
                extruderCount: 1,
                printBed: {
                    circular: false,
                    x: 200,
                    y: 200,
                    origin: "middle"
                },
                filamentDiameter: 1.75,
                nozzleDiameter: 0.4,
                bowdenTube: 600,
                gpxProfile: false
            }
        ]
    }, {
        name: "BQ",
        prefixNameToModels: true,
        models: [
            {
                name: "Witbox 2",
                uid: "bq_witbox2",
                inputParsers: ["gcode"],
                engine: "marlin",
                postprocessing: false,
                volumetric: false,
                extruderCount: 1,
                printBed: {
                    circular: false,
                    x: 297,
                    y: 210,
                    origin: "bottomleft"
                },
                filamentDiameter: 1.75,
                nozzleDiameter: 0.4,
                bowdenTube: false,
                gpxProfile: false
            }
        ]
    }, {
        name: "CraftUnique",
        prefixNameToModels: true,
        models: [
            {
                name: "Craftbot",
                uid: "craftbot",
                inputParsers: ["gcode"],
                engine: "craftbot",
                postprocessing: false,
                volumetric: false,
                extruderCount: 1,
                printBed: {
                    circular: false,
                    x: 250,
                    y: 200,
                    origin: "custom",
                    originOffsets: {
                        x: -7,
                        y: 0
                    }
                },
                filamentDiameter: 1.75,
                nozzleDiameter: 0.4,
                bowdenTube: false,
                gpxProfile: false,
                customSetupInfo: customSetupInfoCraftbot
            }, {
                name: "Craftbot 2",
                uid: "craftbot2",
                inputParsers: ["gcode"],
                engine: "craftbot",
                postprocessing: false,
                volumetric: false,
                extruderCount: 1,
                printBed: {
                    circular: false,
                    x: 250,
                    y: 200,
                    origin: "custom",
                    originOffsets: {
                        x: -7,
                        y: 0
                    }
                },
                filamentDiameter: 1.75,
                nozzleDiameter: 0.4,
                bowdenTube: false,
                gpxProfile: false,
                customSetupInfo: customSetupInfoCraftbot
            }, {
                name: "Craftbot PLUS",
                uid: "craftbotplus",
                inputParsers: ["gcode"],
                engine: "craftbot",
                postprocessing: false,
                volumetric: false,
                extruderCount: 1,
                printBed: {
                    circular: false,
                    x: 250,
                    y: 200,
                    origin: "custom",
                    originOffsets: {
                        x: -7,
                        y: 0
                    }
                },
                filamentDiameter: 1.75,
                nozzleDiameter: 0.4,
                bowdenTube: false,
                gpxProfile: false,
                customSetupInfo: customSetupInfoCraftbot
            }, {
                name: "Craftbot XL",
                uid: "craftbotxl",
                inputParsers: ["gcode"],
                engine: "craftbot",
                postprocessing: false,
                volumetric: false,
                extruderCount: 1,
                printBed: {
                    circular: false,
                    x: 300,
                    y: 200,
                    origin: "custom",
                    originOffsets: {
                        x: -7,
                        y: 0
                    }
                },
                filamentDiameter: 1.75,
                nozzleDiameter: 0.4,
                bowdenTube: false,
                gpxProfile: false,
                customSetupInfo: customSetupInfoCraftbot
            }
        ]
    }, {
        name: "Creality",
        prefixNameToModels: true,
        models: [
            {
                name: "CR-10",
                uid: "creality_cr10",
                inputParsers: ["gcode"],
                engine: "marlin",
                postprocessing: false,
                volumetric: false,
                extruderCount: 1,
                printBed: {
                    circular: false,
                    x: 300,
                    y: 300,
                    origin: "bottomleft"
                },
                filamentDiameter: 1.75,
                nozzleDiameter: 0.4,
                bowdenTube: 600,
                gpxProfile: false
            }, {
                name: "CR-10S",
                uid: "creality_cr10s",
                inputParsers: ["gcode"],
                engine: "marlin",
                postprocessing: false,
                volumetric: false,
                extruderCount: 1,
                printBed: {
                    circular: false,
                    x: 300,
                    y: 300,
                    origin: "bottomleft"
                },
                filamentDiameter: 1.75,
                nozzleDiameter: 0.4,
                bowdenTube: 800,
                gpxProfile: false
            }, {
                name: "CR-10 S4",
                uid: "creality_cr10s4",
                inputParsers: ["gcode"],
                engine: "marlin",
                postprocessing: false,
                volumetric: false,
                extruderCount: 1,
                printBed: {
                    circular: false,
                    x: 400,
                    y: 400,
                    origin: "bottomleft"
                },
                filamentDiameter: 1.75,
                nozzleDiameter: 0.4,
                bowdenTube: 800,
                gpxProfile: false
            }, {
                name: "CR-10 S5",
                uid: "creality_cr10s5",
                inputParsers: ["gcode"],
                engine: "marlin",
                postprocessing: false,
                volumetric: false,
                extruderCount: 1,
                printBed: {
                    circular: false,
                    x: 500,
                    y: 500,
                    origin: "bottomleft"
                },
                filamentDiameter: 1.75,
                nozzleDiameter: 0.4,
                bowdenTube: 800,
                gpxProfile: false
            }, {
                name: "CR-10 MINI",
                uid: "creality_cr10mini",
                inputParsers: ["gcode"],
                engine: "marlin",
                postprocessing: false,
                volumetric: false,
                extruderCount: 1,
                printBed: {
                    circular: false,
                    x: 300,
                    y: 220,
                    origin: "bottomleft"
                },
                filamentDiameter: 1.75,
                nozzleDiameter: 0.4,
                bowdenTube: 600,
                gpxProfile: false
            }
        ]
    }, {
        name: "DreamMaker",
        prefixNameToModels: true,
        models: [
            {
                name: "Overlord",
                uid: "dreammaker_overlord",
                inputParsers: ["gcode"],
                engine: "ulti",
                postprocessing: false,
                volumetric: true,
                extruderCount: 1,
                printBed: {
                    circular: true,
                    diameter: 150,
                    origin: "middle"
                },
                filamentDiameter: 1.75,
                nozzleDiameter: 0.4,
                bowdenTube: 1500,
                gpxProfile: false
            }, {
                name: "Overlord Pro",
                uid: "dreammaker_overlordpro",
                inputParsers: ["gcode"],
                engine: "ulti",
                postprocessing: false,
                volumetric: true,
                extruderCount: 1,
                printBed: {
                    circular: true,
                    diameter: 170,
                    origin: "middle"
                },
                filamentDiameter: 1.75,
                nozzleDiameter: 0.4,
                bowdenTube: 1500,
                gpxProfile: false
            }
        ]
    }, {
        name: "Dremel 3D",
        prefixNameToModels: "Dremel",
        models: [
            {
                name: "Idea Builder 3D20",
                uid: "dremel_3d20",
                inputParsers: ["g3drem"],
                engine: "flashforge",
                postprocessing: false,
                volumetric: false,
                extruderCount: 1,
                printBed: {
                    circular: false,
                    x: 228,
                    y: 150,
                    origin: "middle"
                },
                filamentDiameter: 1.75,
                nozzleDiameter: 0.4,
                bowdenTube: false,
                gpxProfile: false,
                jogPauses: true,
                independentExtruderAxes: true
            }, {
                name: "Idea Builder 3D40",
                uid: "dremel_3d40",
                inputParsers: ["g3drem"],
                engine: "flashforge",
                postprocessing: false,
                volumetric: false,
                extruderCount: 1,
                printBed: {
                    circular: false,
                    x: 254,
                    y: 152,
                    origin: "middle"
                },
                filamentDiameter: 1.75,
                nozzleDiameter: 0.4,
                bowdenTube: false,
                gpxProfile: false,
                jogPauses: true,
                independentExtruderAxes: true
            }
        ]
    },
    {
        name: "FlashForge",
        prefixNameToModels: true,
        models: [
            {
                name: "Creator Pro",
                uid: "flashforge_creatorpro",
                inputParsers: ["gcode"],
                engine: "makerbot",
                postprocessing: "x3g",
                volumetric: false,
                extruderCount: 2,
                printBed: {
                    circular: false,
                    x: 225,
                    y: 150,
                    origin: "middle"
                },
                filamentDiameter: 1.75,
                nozzleDiameter: 0.4,
                bowdenTube: false,
                gpxProfile: "fcp",
                independentExtruderAxes: true
            }, {
                name: "Dreamer",
                uid: "flashforge_dreamer",
                inputParsers: ["g", "gx", "gcode"],
                engine: "flashforge",
                postprocessing: false,
                volumetric: false,
                extruderCount: 2,
                printBed: {
                    circular: false,
                    x: 230,
                    y: 150,
                    origin: "middle"
                },
                filamentDiameter: 1.75,
                nozzleDiameter: 0.4,
                bowdenTube: false,
                gpxProfile: false,
                jogPauses: true,
                independentExtruderAxes: true
            }, {
                name: "Finder",
                uid: "flashforge_finder",
                inputParsers: ["g", "gx", "gcode"],
                engine: "flashforge",
                postprocessing: false,
                volumetric: false,
                extruderCount: 1,
                printBed: {
                    circular: false,
                    x: 140,
                    y: 140,
                    origin: "middle"
                },
                filamentDiameter: 1.75,
                nozzleDiameter: 0.4,
                bowdenTube: false,
                gpxProfile: false,
                jogPauses: true,
                independentExtruderAxes: true
            }
        ]
    },
    {
        name: "Folger Technologies",
        prefixNameToModels: false,
        models: [
            {
                uid: "folgertech_ft5",
                name: "Folger Tech FT-5",
                inputParsers: ["gcode"],
                engine: "marlin",
                postprocessing: false,
                volumetric: false,
                extruderCount: 1,
                printBed: {
                    circular: false,
                    x: 300,
                    y: 300,
                    origin: "bottomleft"
                },
                filamentDiameter: 1.75,
                nozzleDiameter: 0.4,
                bowdenTube: false,
                gpxProfile: false
            }
        ]
    }, {
        name: "Formbot",
        prefixNameToModels: true,
        models: [
            {
                uid: "formbot_trex2",
                name: "T-Rex 2",
                inputParsers: ["gcode"],
                engine: "marlin",
                postprocessing: false,
                volumetric: false,
                extruderCount: 2,
                printBed: {
                    circular: false,
                    x: 400,
                    y: 400,
                    origin: "bottomleft"
                },
                filamentDiameter: 1.75,
                nozzleDiameter: 0.4,
                bowdenTube: false,
                gpxProfile: false
            }, {
                uid: "formbot_trex2plus",
                name: "T-Rex 2+",
                inputParsers: ["gcode"],
                engine: "marlin",
                postprocessing: false,
                volumetric: false,
                extruderCount: 2,
                printBed: {
                    circular: false,
                    x: 400,
                    y: 400,
                    origin: "bottomleft"
                },
                filamentDiameter: 1.75,
                nozzleDiameter: 0.4,
                bowdenTube: false,
                gpxProfile: false
            }
        ]
    }, {
        name: "Fusion3",
        prefixNameToModels: false,
        models: [
            {
                uid: "fusion3_f400s_0_4",
                name: "Fusion3 F400-S (0.4 mm)",
                inputParsers: ["gcode"],
                engine: "reprap",
                postprocessing: false,
                volumetric: false,
                extruderCount: 1,
                printBed: {
                    circular: false,
                    x: 355,
                    y: 355,
                    origin: "bottomleft"
                },
                filamentDiameter: 1.75,
                nozzleDiameter: 0.4,
                bowdenTube: 700,
                gpxProfile: false
            }, {
                uid: "fusion3_f400s_0_6",
                name: "Fusion3 F400-S (0.6 mm)",
                inputParsers: ["gcode"],
                engine: "reprap",
                postprocessing: false,
                volumetric: false,
                extruderCount: 1,
                printBed: {
                    circular: false,
                    x: 355,
                    y: 355,
                    origin: "bottomleft"
                },
                filamentDiameter: 1.75,
                nozzleDiameter: 0.6,
                bowdenTube: 700,
                gpxProfile: false
            }
        ]
    }, {
        name: "gCreate",
        prefixNameToModels: true,
        models: [
            {
                uid: "gcreate_gmax15plus",
                name: "gMax 1.5+",
                inputParsers: ["gcode"],
                engine: "marlin",
                postprocessing: false,
                volumetric: false,
                extruderCount: 1,
                printBed: {
                    circular: false,
                    x: 410,
                    y: 410,
                    origin: "bottomleft"
                },
                filamentDiameter: 1.75,
                nozzleDiameter: 0.4,
                bowdenTube: false,
                gpxProfile: false
            }, {
                uid: "gcreate_gmax15xtplus",
                name: "gMax 1.5 XT+",
                inputParsers: ["gcode"],
                engine: "marlin",
                postprocessing: false,
                volumetric: false,
                extruderCount: 1,
                printBed: {
                    circular: false,
                    x: 410,
                    y: 410,
                    origin: "bottomleft"
                },
                filamentDiameter: 1.75,
                nozzleDiameter: 0.4,
                bowdenTube: false,
                gpxProfile: false
            }
        ]
    }, {
        name: "Hyvision Systems",
        prefixNameToModels: "Hyvision",
        models: [
            {
                name: "Cubicon Single (3DP-110F)",
                uid: "cubicon_single",
                inputParsers: ["hvs"],
                engine: "reprap",
                postprocessing: false,
                volumetric: false,
                extruderCount: 1,
                printBed: {
                    circular: false,
                    x: 240,
                    y: 190,
                    origin: "custom",
                    originOffsets: {
                        x: -16.7,
                        y: -4
                    }
                },
                filamentDiameter: 1.75,
                nozzleDiameter: 0.4,
                bowdenTube: false,
                gpxProfile: false,
                jogPauses: true
            }, {
                name: "Cubicon Single Plus",
                uid: "cubicon_singleplus",
                inputParsers: ["hvs"],
                engine: "reprap",
                postprocessing: false,
                volumetric: false,
                extruderCount: 1,
                printBed: {
                    circular: false,
                    x: 240,
                    y: 190,
                    origin: "custom",
                    originOffsets: {
                        x: -16.7,
                        y: -4
                    }
                },
                filamentDiameter: 1.75,
                nozzleDiameter: 0.4,
                bowdenTube: false,
                gpxProfile: false,
                jogPauses: true
            }, {
                name: "Cubicon Style (3DP-210F)",
                uid: "cubicon_style",
                inputParsers: ["hvs"],
                engine: "reprap",
                postprocessing: false,
                volumetric: false,
                extruderCount: 1,
                printBed: {
                    circular: false,
                    x: 150,
                    y: 150,
                    origin: "custom",
                    originOffsets: {
                        x: -7.2,
                        y: -5.8
                    }
                },
                filamentDiameter: 1.75,
                nozzleDiameter: 0.4,
                bowdenTube: false,
                gpxProfile: false,
                jogPauses: true,
                firmwarePurge: 45
            }
        ]
    }, {
        name: "MakerBot",
        prefixNameToModels: true,
        models: [
            {
                name: "Replicator 2",
                uid: "makerbot_rep2",
                inputParsers: ["gcode"],
                engine: "makerbot",
                postprocessing: "x3g",
                volumetric: false,
                extruderCount: 1,
                printBed: {
                    circular: false,
                    x: 285,
                    y: 153,
                    origin: "middle"
                },
                filamentDiameter: 1.75,
                nozzleDiameter: 0.4,
                bowdenTube: false,
                gpxProfile: "r2"
            }, {
                name: "Replicator 2X",
                uid: "makerbot_rep2x",
                inputParsers: ["gcode"],
                engine: "makerbot",
                postprocessing: "x3g",
                volumetric: false,
                extruderCount: 2,
                printBed: {
                    circular: false,
                    x: 246,
                    y: 152,
                    origin: "middle"
                },
                filamentDiameter: 1.75,
                nozzleDiameter: 0.4,
                bowdenTube: false,
                gpxProfile: "r2x"
            }, {
                name: "Replicator (5th Gen)",
                uid: "makerbot_5thgen",
                inputParsers: ["gcode"],
                engine: "reprap",
                postprocessing: "makerbot",
                volumetric: false,
                extruderCount: 1,
                printBed: {
                    circular: false,
                    x: 252,
                    y: 199,
                    origin: "middle"
                },
                filamentDiameter: 1.75,
                nozzleDiameter: 0.4,
                bowdenTube: false,
                gpxProfile: false,
                jogPauses: true,
                customSetupInfo: customSetupInfoMakerbot5thGen
            }, {
                name: "Replicator+ (5th Gen)",
                uid: "makerbot_5thgen_plus",
                inputParsers: ["gcode"],
                engine: "reprap",
                postprocessing: "makerbot",
                volumetric: false,
                extruderCount: 1,
                printBed: {
                    circular: false,
                    x: 295,
                    y: 195,
                    origin: "middle"
                },
                filamentDiameter: 1.75,
                nozzleDiameter: 0.4,
                bowdenTube: false,
                gpxProfile: false,
                jogPauses: true,
                customSetupInfo: customSetupInfoMakerbot5thGen
            }, {
                name: "Replicator Mini",
                uid: "makerbot_mini",
                inputParsers: ["gcode"],
                engine: "reprap",
                postprocessing: "makerbot",
                volumetric: false,
                extruderCount: 1,
                printBed: {
                    circular: false,
                    x: 100,
                    y: 100,
                    origin: "middle"
                },
                filamentDiameter: 1.75,
                nozzleDiameter: 0.4,
                bowdenTube: false,
                gpxProfile: false,
                jogPauses: true,
                customSetupInfo: customSetupInfoMakerbot5thGen
            }, {
                name: "Replicator Mini+",
                uid: "makerbot_mini_plus",
                inputParsers: ["gcode"],
                engine: "reprap",
                postprocessing: "makerbot",
                volumetric: false,
                extruderCount: 1,
                printBed: {
                    circular: false,
                    x: 101,
                    y: 126,
                    origin: "middle"
                },
                filamentDiameter: 1.75,
                nozzleDiameter: 0.4,
                bowdenTube: false,
                gpxProfile: false,
                jogPauses: true,
                customSetupInfo: customSetupInfoMakerbot5thGen
            }, {
                name: "Replicator Z18",
                uid: "makerbot_z18",
                inputParsers: ["gcode"],
                engine: "reprap",
                postprocessing: "makerbot",
                volumetric: false,
                extruderCount: 1,
                printBed: {
                    circular: false,
                    x: 300,
                    y: 305,
                    origin: "middle"
                },
                filamentDiameter: 1.75,
                nozzleDiameter: 0.4,
                bowdenTube: false,
                gpxProfile: false,
                jogPauses: true,
                customSetupInfo: customSetupInfoMakerbot5thGen
            }
        ]
    }, {
        name: "MakerGear",
        prefixNameToModels: true,
        models: [
            {
                name: "M2",
                uid: "makergear_m2",
                inputParsers: ["gcode"],
                engine: "marlin",
                postprocessing: false,
                volumetric: false,
                extruderCount: 1,
                printBed: {
                    circular: false,
                    x: 203,
                    y: 254,
                    origin: "bottomleft"
                },
                filamentDiameter: 1.75,
                nozzleDiameter: 0.35,
                bowdenTube: false,
                gpxProfile: false
            },
            {
                name: "M3 (Single Extruder)",
                uid: "makergear_m3",
                inputParsers: ["gcode"],
                engine: "marlin",
                postprocessing: false,
                volumetric: false,
                extruderCount: 1,
                printBed: {
                    circular: false,
                    x: 203,
                    y: 254,
                    origin: "bottomleft"
                },
                filamentDiameter: 1.75,
                nozzleDiameter: 0.35,
                bowdenTube: false,
                gpxProfile: false
            }
        ]
    }, {
        name: "Monoprice",
        prefixNameToModels: true,
        models: [
            {
                name: "Select Mini",
                uid: "monoprice_mp_select_mini",
                inputParsers: ["gcode"],
                engine: "marlin",
                postprocessing: false,
                volumetric: false,
                extruderCount: 1,
                printBed: {
                    circular: false,
                    x: 120,
                    y: 120,
                    origin: "bottomleft"
                },
                filamentDiameter: 1.75,
                nozzleDiameter: 0.4,
                bowdenTube: 500,
                gpxProfile: false
            }, {
                name: "Maker Select",
                uid: "monoprice_maker_select",
                inputParsers: ["gcode"],
                engine: "repetier",
                postprocessing: false,
                volumetric: false,
                extruderCount: 1,
                printBed: {
                    circular: false,
                    x: 200,
                    y: 200,
                    origin: "bottomleft"
                },
                filamentDiameter: 1.75,
                nozzleDiameter: 0.4,
                bowdenTube: false,
                gpxProfile: false
            }, {
                name: "Maker Select Plus",
                uid: "monoprice_maker_select_plus",
                inputParsers: ["gcode"],
                engine: "repetier",
                postprocessing: false,
                volumetric: false,
                extruderCount: 1,
                printBed: {
                    circular: false,
                    x: 200,
                    y: 200,
                    origin: "bottomleft"
                },
                filamentDiameter: 1.75,
                nozzleDiameter: 0.4,
                bowdenTube: false,
                gpxProfile: false
            }, {
                name: "Maker Ultimate",
                uid: "monoprice_maker_ultimate",
                inputParsers: ["gcode"],
                engine: "marlin",
                postprocessing: false,
                volumetric: false,
                extruderCount: 1,
                printBed: {
                    circular: false,
                    x: 200,
                    y: 200,
                    origin: "bottomleft"
                },
                filamentDiameter: 1.75,
                nozzleDiameter: 0.4,
                bowdenTube: false,
                gpxProfile: false
            }
        ]
    }, {
        name: "Printrbot",
        prefixNameToModels: true,
        models: [
            {
                name: "Simple Pro",
                uid: "printrbot_simplepro",
                inputParsers: ["gcode"],
                engine: "marlin",
                postprocessing: false,
                volumetric: false,
                extruderCount: 1,
                printBed: {
                    circular: false,
                    x: 215,
                    y: 152,
                    origin: "bottomleft"
                },
                filamentDiameter: 1.75,
                nozzleDiameter: 0.3,
                bowdenTube: false,
                gpxProfile: false
            }
        ]
    }, {
        name: "Prusa",
        prefixNameToModels: false,
        models: [
            {
                name: "Prusa i3 MK2",
                uid: "prusa_i3mk2",
                inputParsers: ["gcode"],
                engine: "marlin",
                postprocessing: false,
                volumetric: false,
                extruderCount: 1,
                printBed: {
                    circular: false,
                    x: 250,
                    y: 210,
                    origin: "bottomleft"
                },
                filamentDiameter: 1.75,
                nozzleDiameter: 0.4,
                bowdenTube: false,
                gpxProfile: false
            }, {
                name: "Prusa i3 MK2S",
                uid: "prusa_i3mk2s",
                inputParsers: ["gcode"],
                engine: "marlin",
                postprocessing: false,
                volumetric: false,
                extruderCount: 1,
                printBed: {
                    circular: false,
                    x: 250,
                    y: 210,
                    origin: "bottomleft"
                },
                filamentDiameter: 1.75,
                nozzleDiameter: 0.4,
                bowdenTube: false,
                gpxProfile: false
            }
        ]
    }, {
        name: "Qidi Tech",
        prefixNameToModels: true,
        models: [
            {
                name: "X-One",
                uid: "qidi_xone",
                inputParsers: ["gcode"],
                engine: "marlin",
                postprocessing: false,
                volumetric: false,
                extruderCount: 1,
                printBed: {
                    circular: false,
                    x: 150,
                    y: 150,
                    origin: "bottomleft"
                },
                filamentDiameter: 1.75,
                nozzleDiameter: 0.4,
                bowdenTube: false,
                gpxProfile: false
            }
        ]
    }, {
        name: "Raise3D",
        prefixNameToModels: false,
        models: [
            {
                name: "Raise3D N2 (Single)",
                uid: "raise3d_n2",
                inputParsers: ["gcode"],
                engine: "marlin",
                postprocessing: false,
                volumetric: false,
                extruderCount: 1,
                printBed: {
                    circular: false,
                    x: 305,
                    y: 305,
                    origin: "bottomleft"
                },
                filamentDiameter: 1.75,
                nozzleDiameter: 0.4,
                bowdenTube: false,
                gpxProfile: false
            }, {
                name: "Raise3D N2 (Dual)",
                uid: "raise3d_n2d",
                inputParsers: ["gcode"],
                engine: "marlin",
                postprocessing: false,
                volumetric: false,
                extruderCount: 1,
                printBed: {
                    circular: false,
                    x: 305,
                    y: 305,
                    origin: "bottomleft"
                },
                filamentDiameter: 1.75,
                nozzleDiameter: 0.4,
                bowdenTube: false,
                gpxProfile: false
            }, {
                name: "Raise3D N2 Plus (Single)",
                uid: "raise3d_n2plus",
                inputParsers: ["gcode"],
                engine: "marlin",
                postprocessing: false,
                volumetric: false,
                extruderCount: 1,
                printBed: {
                    circular: false,
                    x: 305,
                    y: 305,
                    origin: "bottomleft"
                },
                filamentDiameter: 1.75,
                nozzleDiameter: 0.4,
                bowdenTube: false,
                gpxProfile: false
            }, {
                name: "Raise3D N2 Plus (Dual)",
                uid: "raise3d_n2plusd",
                inputParsers: ["gcode"],
                engine: "marlin",
                postprocessing: false,
                volumetric: false,
                extruderCount: 1,
                printBed: {
                    circular: false,
                    x: 305,
                    y: 305,
                    origin: "bottomleft"
                },
                filamentDiameter: 1.75,
                nozzleDiameter: 0.4,
                bowdenTube: false,
                gpxProfile: false
            }
        ]
    }, {
        name: "Robo 3D",
        prefixNameToModels: false,
        models: [
            {
                name: "Robo R1",
                uid: "robo_r1",
                inputParsers: ["gcode"],
                engine: "marlin",
                postprocessing: false,
                volumetric: false,
                extruderCount: 1,
                printBed: {
                    circular: false,
                    x: 254,
                    y: 228.6,
                    origin: "bottomleft"
                },
                filamentDiameter: 1.75,
                nozzleDiameter: 0.4,
                bowdenTube: false,
                gpxProfile: false,
                customSetupInfo: customSetupInfoRoboC2
            }, {
                name: "Robo R1+",
                uid: "robo_r1plus",
                inputParsers: ["gcode"],
                engine: "marlin",
                postprocessing: false,
                volumetric: false,
                extruderCount: 1,
                printBed: {
                    circular: false,
                    x: 254,
                    y: 228.6,
                    origin: "bottomleft"
                },
                filamentDiameter: 1.75,
                nozzleDiameter: 0.4,
                bowdenTube: false,
                gpxProfile: false,
                customSetupInfo: customSetupInfoRoboC2
            }, {
                name: "Robo R2",
                uid: "robo_r2",
                inputParsers: ["gcode"],
                engine: "marlin",
                postprocessing: false,
                volumetric: false,
                extruderCount: 1,
                printBed: {
                    circular: false,
                    x: 203.2,
                    y: 203.2,
                    origin: "bottomleft"
                },
                filamentDiameter: 1.75,
                nozzleDiameter: 0.4,
                bowdenTube: false,
                gpxProfile: false,
                firmwarePurge: 15,
                customSetupInfo: customSetupInfoRoboR2
            }, {
                name: "Robo C2",
                uid: "robo_c2",
                inputParsers: ["gcode"],
                engine: "marlin",
                postprocessing: false,
                volumetric: false,
                extruderCount: 1,
                printBed: {
                    circular: false,
                    x: 127,
                    y: 127,
                    origin: "bottomleft"
                },
                filamentDiameter: 1.75,
                nozzleDiameter: 0.4,
                bowdenTube: false,
                gpxProfile: false,
                firmwarePurge: 15,
                customSetupInfo: customSetupInfoRoboC2
            }
        ]
    }, {
        name: "SeeMeCNC",
        prefixNameToModels: true,
        models: [
            {
                name: "Artemis 300",
                uid: "seemecnc_artemis300",
                inputParsers: ["gcode"],
                engine: "reprap",
                postprocessing: false,
                volumetric: false,
                extruderCount: 1,
                printBed: {
                    circular: true,
                    diameter: 290,
                    origin: "middle"
                },
                filamentDiameter: 1.75,
                nozzleDiameter: 0.5,
                bowdenTube: 750,
                gpxProfile: false
            }, {
                name: "Orion",
                uid: "seemecnc_orion",
                inputParsers: ["gcode"],
                engine: "repetier",
                postprocessing: false,
                volumetric: false,
                extruderCount: 1,
                printBed: {
                    circular: true,
                    diameter: 150,
                    origin: "middle"
                },
                filamentDiameter: 1.75,
                nozzleDiameter: 0.5,
                bowdenTube: 1500,
                gpxProfile: false
            }, {
                name: "Rostock MAX v2",
                uid: "seemecnc_rostockmaxv2",
                inputParsers: ["gcode"],
                engine: "repetier",
                postprocessing: false,
                volumetric: false,
                extruderCount: 1,
                printBed: {
                    circular: true,
                    diameter: 280,
                    origin: "middle"
                },
                filamentDiameter: 1.75,
                nozzleDiameter: 0.5,
                bowdenTube: 650,
                gpxProfile: false
            }, {
                name: "Rostock MAX v3",
                uid: "seemecnc_rostockmaxv3",
                inputParsers: ["gcode"],
                engine: "repetier",
                postprocessing: false,
                volumetric: false,
                extruderCount: 1,
                printBed: {
                    circular: true,
                    diameter: 265,
                    origin: "middle"
                },
                filamentDiameter: 1.75,
                nozzleDiameter: 0.5,
                bowdenTube: 750,
                gpxProfile: false
            }
        ]
    }, {
        name: "TEVO 3D",
        prefixNameToModels: "TEVO",
        models: [
            {
                name: "Black Widow",
                uid: "tevo_blackwidow",
                inputParsers: ["gcode"],
                engine: "marlin",
                postprocessing: false,
                volumetric: false,
                extruderCount: 1,
                printBed: {
                    circular: false,
                    x: 370,
                    y: 250,
                    origin: "bottomleft"
                },
                filamentDiameter: 1.75,
                nozzleDiameter: 0.4,
                bowdenTube: false,
                gpxProfile: false
            }, {
                name: "Little Monster",
                uid: "tevo_littlemonster",
                inputParsers: ["gcode"],
                engine: "smoothie",
                postprocessing: false,
                volumetric: false,
                extruderCount: 1,
                printBed: {
                    circular: true,
                    diameter: 280,
                    origin: "middle"
                },
                filamentDiameter: 1.75,
                nozzleDiameter: 0.4,
                bowdenTube: 1500,
                gpxProfile: false
            }, {
                name: "Tornado",
                uid: "tevo_tornado",
                inputParsers: ["gcode"],
                engine: "marlin",
                postprocessing: false,
                volumetric: false,
                extruderCount: 1,
                printBed: {
                    circular: false,
                    x: 300,
                    y: 300,
                    origin: "bottomleft"
                },
                filamentDiameter: 1.75,
                nozzleDiameter: 0.4,
                bowdenTube: 600,
                gpxProfile: false
            }
        ]
    }, {
        name: "Type A Machines",
        prefixNameToModels: "Type A",
        models: [
            {
                name: "Series 1",
                uid: "typea_series1",
                inputParsers: ["gcode"],
                engine: "marlin",
                postprocessing: false,
                volumetric: false,
                extruderCount: 1,
                printBed: {
                    circular: false,
                    x: 305,
                    y: 305,
                    origin: "bottomleft"
                },
                filamentDiameter: 1.75,
                nozzleDiameter: 0.4,
                bowdenTube: false,
                gpxProfile: false,
                customSetupInfo: customSetupInfoTypeA
            }, {
                name: "Series 1 Pro",
                uid: "typea_series1pro",
                inputParsers: ["gcode"],
                engine: "marlin",
                postprocessing: false,
                volumetric: false,
                extruderCount: 1,
                printBed: {
                    circular: false,
                    x: 305,
                    y: 305,
                    origin: "bottomleft"
                },
                filamentDiameter: 1.75,
                nozzleDiameter: 0.4,
                bowdenTube: false,
                gpxProfile: false,
                customSetupInfo: customSetupInfoTypeA
            }
        ]
    }, {
        name: "Wanhao",
        prefixNameToModels: true,
        models: [
            {
                name: "Duplicator 4 (Single)",
                uid: "wanhao_duplicator4",
                inputParsers: ["gcode"],
                engine: "makerbot",
                postprocessing: "x3g",
                volumetric: false,
                extruderCount: 1,
                printBed: {
                    circular: false,
                    x: 220,
                    y: 140,
                    origin: "middle"
                },
                filamentDiameter: 1.75,
                nozzleDiameter: 0.4,
                bowdenTube: false,
                gpxProfile: "r1"
            }, {
                name: "Duplicator 4 (Dual)",
                uid: "wanhao_duplicator4d",
                inputParsers: ["gcode"],
                engine: "makerbot",
                postprocessing: "x3g",
                volumetric: false,
                extruderCount: 2,
                printBed: {
                    circular: false,
                    x: 220,
                    y: 140,
                    origin: "middle"
                },
                filamentDiameter: 1.75,
                nozzleDiameter: 0.4,
                bowdenTube: false,
                gpxProfile: "r1d"
            }, {
                name: "Duplicator 6",
                uid: "wanhao_duplicator6",
                inputParsers: ["gcode"],
                engine: "marlin",
                postprocessing: false,
                volumetric: false,
                extruderCount: 1,
                printBed: {
                    circular: false,
                    x: 200,
                    y: 200,
                    origin: "bottomleft"
                },
                filamentDiameter: 1.75,
                nozzleDiameter: 0.4,
                bowdenTube: false,
                gpxProfile: false
            }
        ]
    }
];

function getPresetByUID(uid) {
    for (let maker in presets) {
        if (presets.hasOwnProperty(maker)) {
            for (let model in presets[maker].models) {
                if (presets[maker].models.hasOwnProperty(model)) {
                    if (presets[maker].models[model].uid === uid) {
                        return presets[maker].models[model];
                    }
                }
            }
        }
    }
    return null;
}

function getManufacturerByPreset(uid) {
    for (let maker in presets) {
        if (presets.hasOwnProperty(maker)) {
            for (let model in presets[maker].models) {
                if (presets[maker].models.hasOwnProperty(model)) {
                    if (presets[maker].models[model].uid === uid) {
                        return presets[maker];
                    }
                }
            }
        }
    }
    return null;
}

function getEngineInfo(engineID) {
    for (let i = 0; i < engines.length; i++) {
        if (engines[i][0] === engineID) {
            return {
                id: engines[i][0],
                displayName: engines[i][1],
                name: engines[i][2]
            };
        }
    }
    return null;
}

function getParserInfo(parserID) {
    for (let i = 0; i < parsers.length; i++) {
        if (parsers[i][0] === parserID) {
            return {
                id: parsers[i][0],
                displayName: parsers[i][1],
                name: parsers[i][2]
            };
        }
    }
    return null;
}

function getEngineIndex(engineID) {
    for (let i = 0; i < engines.length; i++) {
        if (engines[i][0] === engineID) {
            return i;
        }
    }
    return -1;
}

function getParserIndex(parserID) {
    for (let i = 0; i < parsers.length; i++) {
        if (parsers[i][0] === parserID) {
            return i;
        }
    }
    return -1;
}

function getPostprocessorIndex(postprocessorID) {
    for (let i = 0; i < postprocessors.length; i++) {
        if (postprocessors[i][0] === postprocessorID) {
            return i;
        }
    }
    return -1;
}

function getGPXIndex(profile) {
    for (let i = 0; i < gpxProfiles.length; i++) {
        if (gpxProfiles[i][0] === profile) {
            return i;
        }
    }
    return -1;
}

function parserListEquals(parserList, uid) {
    if (!parserList) {
        return false;
    }
    let preset = getPresetByUID(uid);
    if (preset === null) {
        return false;
    }
    if (preset.inputParsers.length !== parserList.length) {
        return false;
    }
    for (let i = 0; i < parserList.length; i++) {
        if (preset.inputParsers[i] !== parserList[i]) {
            return false;
        }
    }
    return true;
}

function getFullModelName(maker, model) {
    if (maker === undefined || model === undefined) {
        return "";
    }
    if (maker.prefixNameToModels) {
        if (maker.prefixNameToModels === true) {
            return maker.name + " " + model.name;
        } else {
            return maker.prefixNameToModels + " " + model.name;
        }
    } else {
        return model.name;
    }
}

function getMakerbotBotType(uid) {
    if (makerbotBotTypes.hasOwnProperty(uid)) {
        return makerbotBotTypes[uid];
    }
    return null;
}

exports.engines = engines;
exports.parsers = parsers;
exports.postprocessors = postprocessors;
exports.gpxProfiles = gpxProfiles;
exports.presets = presets;
exports.getPresetByUID = getPresetByUID;
exports.getManufacturerByPreset = getManufacturerByPreset;
exports.getEngineInfo = getEngineInfo;
exports.getParserInfo = getParserInfo;
exports.getEngineIndex = getEngineIndex;
exports.getParserIndex = getParserIndex;
exports.getPostprocessorIndex = getPostprocessorIndex;
exports.getGPXIndex = getGPXIndex;
exports.parserListEquals = parserListEquals;
exports.getFullModelName = getFullModelName;
exports.getMakerbotBotType = getMakerbotBotType;
