
const m = require("mithril");
const THREE = require("three-canvas-renderer");
const TrackballControls = require("three-trackballcontrols");
const Raft = require("raft-js");

const menu = require("./menu");
const menuUtils = require("./menu-utils");
const BoundingBox = require("../models/bounding-box");
const MSF = require("../models/msf");
const Printer = require("../models/printer");
const PrinterProfiles = require("../models/printer-profiles");
const TransitionTower = require("../models/transition-tower");

const TRANSITION_TOWER = require("../models/common").TRANSITION_TOWER;
const SIDE_TRANSITIONS = require("../models/common").SIDE_TRANSITIONS;
const TOWER_MIN_DIMENSION = require("../models/common").TOWER_MIN_DIMENSION;
const getLineLength = require("../models/common").getLineLength;
const deg2rad = require("../models/common").deg2rad;

let initialized = false;
let useWebGL;

let container;
let renderer;
let camera;
let controls;
let scene;

let printBedMaterial;
let printBed;
let bedPointLight;
let printBedWireframeMaterial;
let printBedWireframe;
let printBedDimensions;
let printLines = [];
let towerLines;
let sideTransitionLines;
let axes;
let zPlane = {
    mesh: null,
    z: 0,
    printLayerHeights: []
};

let driveColors = ["#4325C6", "#FF7C13", "#0EB7B1", "#FFD213"];

// tower manual adjustment handling
let towerBoundingBox;
let towerPlaceholder;
let clickCoords = {
    x: 0,
    y: 0
};
let buttonsDown = {
    moveNorth: false,
    moveSouth: false,
    moveEast: false,
    moveWest: false
};
let clickDuration = 0;
let towerFootprintDimensions = {
    x: 0,
    y: 0
};
function getIntersects(x, y) {
    let mouse = new THREE.Vector2();
    let raycaster = new THREE.Raycaster();
    raycaster.linePrecision = 2;
    mouse.x = (x / window.innerWidth) * 2 - 1;
    mouse.y = -(y / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    let intersects = raycaster.intersectObjects(scene.children, true);
    let objectIntersected = {
        print: false,
        tower: false,
        sideTransition: false,
        printBed: false
    };
    for (let i = 0; i < intersects.length; i++) {
        if (intersects[i].object === towerLines) {
            objectIntersected.tower = true;
            break;
        } else if (intersects[i].object === printBed || intersects[i].object === printBedWireframe) {
            objectIntersected.printBed = true;
            break;
        } else if (printLines.indexOf(intersects[i].object) >= 0) {
            objectIntersected.print = true;
            break;
        } else if (intersects[i].object === sideTransitionLines) {
            objectIntersected.sideTransition = true;
            break;
        }
    }
    return objectIntersected;
}
function onMouseDown(event) {
    if (global.advancedMode) {
        if (event.button === 0) {
            clickCoords.x = event.clientX;
            clickCoords.y = event.clientY;
        }
    }
}
function onMouseUp(event) {
    if (global.advancedMode) {
        let intersected = getIntersects(event.clientX, event.clientY);
        let dist = getLineLength(clickCoords.x, clickCoords.y, event.clientX, event.clientY);
        if (intersected.tower && dist === 0) {
            if (!towerBoundingBox) {
                let bbox = new THREE.Box3().setFromObject(towerLines);
                bbox.min.x -= 2;
                bbox.min.y -= 2;
                bbox.min.z = 0;
                bbox.max.x += 2;
                bbox.max.y += 2;
                bbox.max.z += 2;
                let geometry = new THREE.BoxGeometry(
                    bbox.max.x - bbox.min.x,
                    bbox.max.y - bbox.min.y,
                    bbox.max.z - bbox.min.z
                );
                let wireframe = new THREE.EdgesGeometry(geometry);
                let material = new THREE.LineBasicMaterial({
                    color: 0x000000,
                    linewidth: 2
                });
                towerBoundingBox = new THREE.LineSegments(wireframe, material);
                towerBoundingBox.position.x = ((bbox.max.x - bbox.min.x) / 2) + bbox.min.x;
                towerBoundingBox.position.y = ((bbox.max.y - bbox.min.y) / 2) + bbox.min.y;
                towerBoundingBox.position.z = ((bbox.max.z - bbox.min.z) / 2) + bbox.min.z;
                towerBoundingBox.material.depthTest = false;
                towerBoundingBox.material.opacity = 0.5;
                towerBoundingBox.material.transparent = true;
                scene.add(towerBoundingBox);
                render();
                towerFootprintDimensions.x = global.print._tower.zigguratBoundingBox.x || global.print._tower.boundingBox.x;
                towerFootprintDimensions.y = global.print._tower.zigguratBoundingBox.y || global.print._tower.boundingBox.y;
                showManualTowerAdjustmentUI();
                document.addEventListener("keydown", onKeyDown, false);
            }
        }
    }
}
function onMouseMove(event) {
    if (!sideTransitionLines) {
        return;
    }
    let intersects = getIntersects(event.clientX, event.clientY);
    let el = document.getElementById("sideDumpTooltip");
    if (intersects.sideTransition) {
        el.style.display = null;
        el.style.top = (event.clientY - 10) + "px";
        el.style.left = (event.clientX + 10) + "px";
    } else {
        el.style.display = "none";
    }
}
function towerMoveReset() {
    towerLines.position.x -= global.print._tower.offsets.x;
    towerLines.position.y -= global.print._tower.offsets.y;
    towerBoundingBox.position.x -= global.print._tower.offsets.x;
    towerBoundingBox.position.y -= global.print._tower.offsets.y;
    if (towerPlaceholder) {
        towerPlaceholder.position.x -= global.print._tower.offsets.x;
        towerPlaceholder.position.y -= global.print._tower.offsets.y;
    }
    global.print._tower.offsets.x = 0;
    global.print._tower.offsets.y = 0;
    render();
}
function towerMoveNorth() {
    let dist = (clickDuration > 10) ? 5 : 1;
    global.print._tower.offsets.y += dist;
    towerLines.position.y += dist;
    towerBoundingBox.position.y += dist;
    if (towerPlaceholder) {
        towerPlaceholder.position.y += dist;
    }
    render();
    setTimeout(function () {
        if (buttonsDown.moveNorth) {
            clickDuration++;
            towerMoveNorth();
        }
    }, 100);
}
function towerMoveSouth() {
    let dist = (clickDuration > 10) ? 5 : 1;
    global.print._tower.offsets.y -= dist;
    towerLines.position.y -= dist;
    towerBoundingBox.position.y -= dist;
    if (towerPlaceholder) {
        towerPlaceholder.position.y -= dist;
    }
    render();
    setTimeout(function () {
        if (buttonsDown.moveSouth) {
            clickDuration++;
            towerMoveSouth();
        }
    }, 100);
}
function towerMoveWest() {
    let dist = (clickDuration > 10) ? 5 : 1;
    global.print._tower.offsets.x -= dist;
    towerLines.position.x -= dist;
    towerBoundingBox.position.x -= dist;
    if (towerPlaceholder) {
        towerPlaceholder.position.x -= dist;
    }
    render();
    setTimeout(function () {
        if (buttonsDown.moveWest) {
            clickDuration++;
            towerMoveWest();
        }
    }, 100);
}
function towerMoveEast() {
    let dist = (clickDuration > 10) ? 5 : 1;
    global.print._tower.offsets.x += dist;
    towerLines.position.x += dist;
    towerBoundingBox.position.x += dist;
    if (towerPlaceholder) {
        towerPlaceholder.position.x += dist;
    }
    render();
    setTimeout(function () {
        if (buttonsDown.moveEast) {
            clickDuration++;
            towerMoveEast();
        }
    }, 100);
}
function towerStretchReset() {
    if (towerPlaceholder) {
        scene.remove(towerPlaceholder);
        scene.add(towerLines);
        towerBoundingBox.visible = true;
        towerPlaceholder = null;
        towerFootprintDimensions.x = global.print._tower.zigguratBoundingBox.x || global.print._tower.boundingBox.x;
        towerFootprintDimensions.y = global.print._tower.zigguratBoundingBox.y || global.print._tower.boundingBox.y;
        render();
    }
}
function getTowerPlaceholderMesh() {
    let bbox = new THREE.Box3().setFromObject(towerLines);
    let geometry = new THREE.BoxGeometry(
        bbox.max.x - bbox.min.x,
        bbox.max.y - bbox.min.y,
        bbox.max.z - bbox.min.z
    );
    let material = new THREE.MeshBasicMaterial({
        color: 0x92c1d3
    });
    let mesh = new THREE.Mesh(geometry, material);
    mesh.position.x = ((bbox.max.x - bbox.min.x) / 2) + bbox.min.x;
    mesh.position.y = ((bbox.max.y - bbox.min.y) / 2) + bbox.min.y;
    mesh.position.z = ((bbox.max.z - bbox.min.z) / 2) + bbox.min.z;
    return mesh;
}
function towerStretchNorthSouth() {
    if (!towerPlaceholder) {
        towerPlaceholder = getTowerPlaceholderMesh();
        scene.remove(towerLines);
        scene.add(towerPlaceholder);
        towerBoundingBox.visible = false;
    }
    if (towerFootprintDimensions.x * 0.9 >= TOWER_MIN_DIMENSION) {
        towerFootprintDimensions.x *= 0.9;
        towerFootprintDimensions.y /= 0.9;
        towerPlaceholder.scale.x *= 0.9;
        towerPlaceholder.scale.y /= 0.9;
    }
    render();
}
function towerStretchEastWest() {
    if (!towerPlaceholder) {
        towerPlaceholder = getTowerPlaceholderMesh();
        scene.remove(towerLines);
        scene.add(towerPlaceholder);
        towerBoundingBox.visible = false;
    }
    if (towerFootprintDimensions.y * 0.9 >= TOWER_MIN_DIMENSION) {
        towerFootprintDimensions.x /= 0.9;
        towerFootprintDimensions.y *= 0.9;
        towerPlaceholder.scale.x /= 0.9;
        towerPlaceholder.scale.y *= 0.9;
    }
    render();
}
function onKeyDown(event) {
    if (event.keyCode === 27) {
        // ESC
        resetTowerChanges();
    }
}
async function saveTowerChanges() {
    scene.remove(towerBoundingBox);
    towerBoundingBox = null;
    let regenerateTower = false;
    let bbox;
    if (towerPlaceholder) {
        regenerateTower = true;
        bbox = new THREE.Box3().setFromObject(towerPlaceholder);
        scene.remove(towerPlaceholder);
        towerPlaceholder = null;
        scene.add(towerLines);
    }
    hideManualTowerAdjustmentUI();
    document.removeEventListener("keydown", onKeyDown, false);
    if (regenerateTower) {
        let dimensions = new BoundingBox();
        dimensions.xMin = bbox.min.x;
        dimensions.xMax = bbox.max.x;
        dimensions.yMin = bbox.min.y;
        dimensions.yMax = bbox.max.y;
        global.print._tower.offsets.x = 0;
        global.print._tower.offsets.y = 0;
        await global.print._tower.regenerateWithDimensions(dimensions);
        drawTransitionTower(global.print, true);
        render();
    } else {
        render();
    }
}
function resetTowerChanges() {
    towerMoveReset();
    towerStretchReset();
    scene.remove(towerBoundingBox);
    towerBoundingBox = null;
    if (towerPlaceholder) {
        scene.remove(towerPlaceholder);
        towerPlaceholder = null;
        scene.add(towerLines);
    }
    render();
    hideManualTowerAdjustmentUI();
    document.removeEventListener("keydown", onKeyDown, false);
}
// end tower movement handling

function webGLIsAvailable() {
    try {
        let canvas = document.createElement("canvas");
        return !!(window.WebGLRenderingContext && (canvas.getContext("webgl") || canvas.getContext("experimental-webgl")));
    } catch (e) {
        return false;
    }
}

function interpolate(aRGB, bRGB, t, minCutoff, maxCutoff) {

    if (minCutoff === undefined) {
        minCutoff = 0.4;
    } else if (minCutoff < 0) {
        minCutoff = 0;
    }

    if (maxCutoff === undefined) {
        maxCutoff = 0.8;
    } else if (maxCutoff > 1) {
        maxCutoff = 1;
    }

    if (t < minCutoff) return aRGB;
    if (t > maxCutoff) return bRGB;

    t = (t - minCutoff) * (1 / (maxCutoff - minCutoff));

    if (typeof aRGB === "string") {
        aRGB = parseInt(aRGB.substr(1), 16);
    }
    aRGB = {
        r: (aRGB & 0xff0000) >> 16,
        g: (aRGB & 0xff00) >> 8,
        b: aRGB & 0xff
    };

    if (typeof bRGB === "string") {
        bRGB = parseInt(bRGB.substr(1), 16);
    }
    bRGB = {
        r: (bRGB & 0xff0000) >> 16,
        g: (bRGB & 0xff00) >> 8,
        b: bRGB & 0xff
    };

    let tRGB = {
        r: Math.round(aRGB.r + (bRGB.r - aRGB.r) * t),
        g: Math.round(aRGB.g + (bRGB.g - aRGB.g) * t),
        b: Math.round(aRGB.b + (bRGB.b - aRGB.b) * t)
    };

    return "#" + MSF.intToHex(tRGB.r, 2) + MSF.intToHex(tRGB.g, 2) + MSF.intToHex(tRGB.b, 2);
}

function initialize(domElement) {

    if (initialized) {
        return;
    }

    // create the renderer and associated objects

    useWebGL = webGLIsAvailable();

    container = domElement;
    if (useWebGL) {
        renderer = new THREE.WebGLRenderer({
            antialias: true,
            preserveDrawingBuffer: true
        });
    } else {
        renderer = new THREE.CanvasRenderer();
    }
    camera = new THREE.PerspectiveCamera(
        50,     // view angle
        window.innerWidth / window.innerHeight,   // aspect ratio
        1,      // near
        10000   // far
    );
    controls = new TrackballControls(camera, container);
    scene = new THREE.Scene();

    // set up the scene

    scene.add(camera);
    scene.fog = new THREE.FogExp2(0xFFFFFF, 0.00025);
    camera.position.x = 0;
    camera.position.y = -150;
    camera.position.z = 120;
    camera.up.set(0, 0, 1);
    camera.lookAt(0, 0, 0);

    controls.target.set(0, 0, 0);
    controls.rotateSpeed = 4.5;
    controls.zoomSpeed = 2;
    controls.panSpeed = 2.0;

    controls.staticMoving = true;
    controls.dynamicDampingFactor = 0.3;
    controls.keys = [65, 83, 68];

    controls.addEventListener("change", render);

    renderer.setClearColor(scene.fog.color);
    renderer.setSize(window.innerWidth, window.innerHeight);
    if (useWebGL) {
        renderer.setPixelRatio(window.devicePixelRatio ? window.devicePixelRatio : 1);
        renderer.setViewport(0, 0, window.innerWidth, window.innerHeight);
        renderer.shadowMap.enabled = true;
    }

    container.appendChild(renderer.domElement);

    // create the print bed materials, which will be reused

    printBedMaterial = new THREE.MeshBasicMaterial({
        color: 0xd8d8d8
    });
    printBedWireframeMaterial = new THREE.MeshBasicMaterial({
        color: 0xc0c0c0,
        wireframe: true,
        side: THREE.DoubleSide
    });

    // create visualizer buttons

    let buttonTray = document.createElement("div");
    buttonTray.classList.add("visualizer-buttons-bottom-right");
    container.appendChild(buttonTray);

    let resetButton = document.createElement("button");
    resetButton.setAttribute("title", "Reset Camera Position");
    resetButton.classList.add("visualizer-button");
    resetButton.style.backgroundImage = "url('../assets/visualizer/axes.svg')";
    resetButton.style.backgroundSize = "25px";
    resetButton.addEventListener("mousedown", function (e) {
        e.stopPropagation();
    });
    resetButton.addEventListener("click", function (e) {
        e.target.blur();
        e.stopPropagation();
        resetCameraPosition();
    });
    buttonTray.appendChild(resetButton);

    let screenshotButton = document.createElement("button");
    screenshotButton.setAttribute("title", "Save Bed Preview...");
    screenshotButton.classList.add("visualizer-button");
    screenshotButton.style.backgroundImage = "url('../assets/visualizer/camera.svg')";
    screenshotButton.addEventListener("mousedown", function (e) {
        e.stopPropagation();
    });
    screenshotButton.addEventListener("click", function (e) {
        e.target.blur();
        e.stopPropagation();
        menuUtils.saveBedPreview();
    });
    buttonTray.appendChild(screenshotButton);

    let zPlaneHeight = document.createElement("div");
    zPlaneHeight.id = "zPlaneHeightPreview";
    zPlaneHeight.style.display = "none";
    container.appendChild(zPlaneHeight);

    initialized = true;

    addEventListener("resize", resizeScene);

    toggleOriginAxes(global.displayOriginAxes, false);

    render();
    animate();

    if (PrinterProfiles.getActiveProfileIndex() > 0) {
        drawPrintBed(PrinterProfiles.getActiveProfile());
    } else {
        let dummy = new Printer();
        dummy.printBedDimensions.x = 250;
        dummy.printBedDimensions.y = 140;
        drawPrintBed(dummy);
    }

    initializeManualTowerAdjustmentUI(buttonTray);

}

function initializeManualTowerAdjustmentUI(buttonTray) {
    let moveInfo = document.createElement("div");
    moveInfo.id = "towerMoveInstructions";
    moveInfo.style.display = "none";
    moveInfo.addEventListener("mousedown", function (e) {
        e.stopPropagation();
    });
    buttonTray.appendChild(moveInfo);
    m.render(moveInfo, [
        m("h3.tooltip", {
            "data-tooltip": "Print bed boundaries and intersections with your print will not be checked. Please examine the placement of the tower to ensure these conditions will not affect your print."
        }, "Manual Tower Adjustment"),
        m("div", {
            style: {
                position: "absolute",
                bottom: "5px",
                right: "20px"
            }
        }, [
            m("button", {
                style: {
                    "margin-right": "10px"
                },
                onclick: resetTowerChanges
            }, "Cancel"),
            m("button.confirm", {
                onclick: saveTowerChanges
            }, "Save")
        ]),
        m("table", {
            style: {
                "table-layout": "fixed",
                "text-align": "center"
            }
        }, [
            m("thead", [
                m("tr", [
                    m("th", "Position"),
                    m("th", "Dimensions")
                ])
            ]),
            m("tbody", [
                m("tr", [
                    m("td", [
                        m("table", [
                            m("tbody", [
                                m("tr", [
                                    m("td"),
                                    m("td", m("button.visualizer-button", {
                                        title: "Move North",
                                        style: {
                                            "background-image": "url('../assets/visualizer/arrow.svg')",
                                            "transform": "rotate(90deg)"
                                        },
                                        onmousedown: function () {
                                            buttonsDown.moveNorth = true;
                                            towerMoveNorth();
                                        },
                                        onmouseup: function () {
                                            clickDuration = 0;
                                            buttonsDown.moveNorth = false;
                                        },
                                        onmouseout: function () {
                                            clickDuration = 0;
                                            buttonsDown.moveNorth = false;
                                        }
                                    })),
                                    m("td")
                                ]),
                                m("tr", [
                                    m("td", m("button.visualizer-button", {
                                        title: "Move West",
                                        style: {
                                            "background-image": "url('../assets/visualizer/arrow.svg')"
                                        },
                                        onmousedown: function () {
                                            buttonsDown.moveWest = true;
                                            towerMoveWest();
                                        },
                                        onmouseup: function () {
                                            clickDuration = 0;
                                            buttonsDown.moveWest = false;
                                        },
                                        onmouseout: function () {
                                            clickDuration = 0;
                                            buttonsDown.moveWest = false;
                                        }
                                    })),
                                    m("td", m("button.visualizer-button.visualizer-button-reset", {
                                        title: "Reset Position",
                                        onclick: towerMoveReset
                                    })),
                                    m("td", m("button.visualizer-button", {
                                        title: "Move East",
                                        style: {
                                            "background-image": "url('../assets/visualizer/arrow.svg')",
                                            "transform": "rotate(180deg)"
                                        },
                                        onmousedown: function () {
                                            buttonsDown.moveEast = true;
                                            towerMoveEast();
                                        },
                                        onmouseup: function () {
                                            clickDuration = 0;
                                            buttonsDown.moveEast = false;
                                        },
                                        onmouseout: function () {
                                            clickDuration = 0;
                                            buttonsDown.moveEast = false;
                                        }
                                    }))
                                ]),
                                m("tr", [
                                    m("td"),
                                    m("td", m("button.visualizer-button", {
                                        title: "Move South",
                                        style: {
                                            "background-image": "url('../assets/visualizer/arrow.svg')",
                                            "transform": "rotate(270deg)"
                                        },
                                        onmousedown: function () {
                                            buttonsDown.moveSouth = true;
                                            towerMoveSouth();
                                        },
                                        onmouseup: function () {
                                            clickDuration = 0;
                                            buttonsDown.moveSouth = false;
                                        },
                                        onmouseout: function () {
                                            clickDuration = 0;
                                            buttonsDown.moveSouth = false;
                                        }
                                    })),
                                    m("td")
                                ])
                            ])
                        ])
                    ]),
                    m("td", {
                        style: {
                            "vertical-align": "top"
                        }
                    }, [
                        m("table", [
                            m("tbody", [
                                m("tr", [
                                    m("td", m("button.visualizer-button", {
                                        title: "Stretch East/West",
                                        style: {
                                            "background-image": "url('../assets/visualizer/scale.svg')"
                                        },
                                        onclick: towerStretchEastWest
                                    })),
                                    m("td", m("button.visualizer-button.visualizer-button-reset", {
                                        title: "Reset Dimensions",
                                        onclick: towerStretchReset
                                    })),
                                    m("td", m("button.visualizer-button", {
                                        title: "Stretch North/South",
                                        style: {
                                            "background-image": "url('../assets/visualizer/scale.svg')",
                                            "transform": "rotate(90deg)"
                                        },
                                        onclick: towerStretchNorthSouth
                                    }))
                                ])
                            ])
                        ])
                    ])
                ])
            ])
        ])
    ]);
    let sideDumpTooltip = document.createElement("div");
    sideDumpTooltip.id = "sideDumpTooltip";
    sideDumpTooltip.classList.add("tooltip");
    sideDumpTooltip.style.display = "none";
    buttonTray.appendChild(sideDumpTooltip);
    container.addEventListener("mousedown", onMouseDown, false);
    container.addEventListener("mouseup", onMouseUp, false);
    container.addEventListener("mousemove", onMouseMove, false);
}
function showManualTowerAdjustmentUI() {
    document.getElementById("towerMoveInstructions").style.display = "";
    document.getElementById("editActivePrinter").disabled = true;
    document.getElementById("loadCode").disabled = true;
    document.getElementById("processCode").disabled = true;
    document.getElementById("drive1button").disabled = true;
    document.getElementById("drive2button").disabled = true;
    document.getElementById("drive3button").disabled = true;
    document.getElementById("drive4button").disabled = true;
    menu.disableModalActions();
}
function hideManualTowerAdjustmentUI() {
    document.getElementById("towerMoveInstructions").style.display = "none";
    document.getElementById("editActivePrinter").disabled = false;
    document.getElementById("loadCode").disabled = false;
    document.getElementById("processCode").disabled = false;
    document.getElementById("drive1button").disabled = false;
    document.getElementById("drive2button").disabled = false;
    document.getElementById("drive3button").disabled = false;
    document.getElementById("drive4button").disabled = false;
    menu.enableModalActions();
}

function createAxes(length) {
    let axes = new THREE.Object3D();
    axes.add(buildAxis(new THREE.Vector3(0, 0, 0), new THREE.Vector3(length, 0, 0), 0xFF0000, false )); // +X
    axes.add(buildAxis(new THREE.Vector3(0, 0, 0), new THREE.Vector3(-length, 0, 0), 0xFF0000, true)); // -X
    axes.add(buildAxis(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, length, 0), 0x00FF00, false )); // +Y
    axes.add(buildAxis(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -length, 0), 0x00FF00, true )); // -Y
    axes.add(buildAxis(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, length), 0x0000FF, false )); // +Z
    axes.add(buildAxis(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -length), 0x0000FF, true )); // -Z
    return axes;
}
function buildAxis(src, dst, colorHex, dashed) {
    let geometry = new THREE.Geometry();
    let material;

    if (dashed) {
        material = new THREE.LineDashedMaterial({
            linewidth: 1,
            color: colorHex,
            dashSize: 3,
            gapSize: 3
        });
    } else {
        material = new THREE.LineBasicMaterial({
            linewidth: 1,
            color: colorHex
        });
    }

    geometry.vertices.push(src.clone());
    geometry.vertices.push(dst.clone());
    geometry.computeLineDistances();
    return new THREE.Line(geometry, material, THREE.LineSegments);
}

function toggleOriginAxes(enable, renderAfter) {
    if (enable) {
        if (!axes) {
            axes = createAxes(20);
            scene.add(axes);
        }
    } else {
        if (axes) {
            scene.remove(axes);
            axes = null;
        }
    }
    if (renderAfter) {
        render();
    }
}

let shiftHeld = 0;
function onZPlaneKeyDown(event) {
    if (event.keyCode === 16) { // if Shift is pressed
        shiftHeld++;
        if (shiftHeld > 2) shiftHeld = 2;
    }
}
function onZPlaneKeyUp(event) {
    if (event.keyCode === 16) { // if Shift is released
        shiftHeld--;
        if (shiftHeld < 0) {
            shiftHeld = 0;
        }
    }
}
function zPlaneMoveUp(event) {
    if (event.keyCode !== 38) {
        return;
    }
    if (shiftHeld) {
        zPlane.z += 10;
    } else {
        zPlane.z++;
    }
    if (zPlane.z >= zPlane.printLayerHeights.length) {
        zPlane.z = zPlane.printLayerHeights.length - 1;
    }
    let height = zPlane.printLayerHeights[zPlane.z];
    zPlane.mesh.position.z = height;
    document.getElementById("zPlaneHeightPreview").innerText = "Z = " + height;
    render();
}
function zPlaneMoveDown(event) {
    if (event.keyCode !== 40) {
        return;
    }
    if (shiftHeld) {
        zPlane.z -= 10;
    } else {
        zPlane.z--;
    }
    if (zPlane.z < 0) zPlane.z = 0;
    let height = zPlane.printLayerHeights[zPlane.z];
    zPlane.mesh.position.z = height;
    document.getElementById("zPlaneHeightPreview").innerText = "Z = " + height;
    render();
}
function toggleZPlane(print) {
    if (zPlane.mesh) {
        scene.remove(zPlane.mesh);
        zPlane.z = 0;
        zPlane.mesh = null;
        zPlane.printLayerHeights = [];
        render();
        document.getElementById("zPlaneHeightPreview").style.display = "none";
        window.removeEventListener("keydown", zPlaneMoveUp);
        window.removeEventListener("keydown", zPlaneMoveDown);
        window.removeEventListener("keydown", onZPlaneKeyDown);
        window.removeEventListener("keyup", onZPlaneKeyUp);
        shiftHeld = 0;
        return;
    }
    if (!print) {
        return;
    }
    let towerBBox = null;
    if (print._tower) {
        if (print._tower.useZiggurats) {
            towerBBox = print._tower.zigguratBoundingBox;
        } else {
            towerBBox = print._tower.boundingBox;
        }
    }
    let bbox;
    if (towerBBox) {
        bbox = print.boundingBox.combine(towerBBox);
    } else {
        bbox = print.boundingBox;
    }

    zPlane.printLayerHeights = print.printLayerHeights.slice();
    zPlane.mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(
            bbox.x + 20,  // width
            bbox.y + 20   // height
        ),
        new THREE.MeshBasicMaterial({
            color: 0xd80000,
            transparent: true,
            opacity: 0.5,
            side: THREE.DoubleSide
        })
    );
    zPlane.mesh.translateX(bbox.x / 2 + bbox.xMin);
    zPlane.mesh.translateY(bbox.y / 2 + bbox.yMin);
    zPlane.mesh.position.z = zPlane.printLayerHeights[zPlane.z];
    scene.add(zPlane.mesh);
    render();
    document.getElementById("zPlaneHeightPreview").innerText = "Z = " + zPlane.mesh.position.z;
    document.getElementById("zPlaneHeightPreview").style.display = "";
    window.addEventListener("keydown", zPlaneMoveUp);
    window.addEventListener("keydown", zPlaneMoveDown);
    window.addEventListener("keydown", onZPlaneKeyDown);
    window.addEventListener("keyup", onZPlaneKeyUp);
}

function enableSceneControls() {
    controls.enabled = true;
}

function disableSceneControls() {
    controls.enabled = false;
}

function resizeScene() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setViewport(0, 0, window.innerWidth, window.innerHeight);
    controls.update();
    render();
}

function resetCameraPosition() {
    let bedMiddle = {
        x: (printBedDimensions.x) / 2 - printBedDimensions.offsetX,
        y: (printBedDimensions.y) / 2 - printBedDimensions.offsetY,
        z: 0
    };
    let cameraPosition = {
        x: 0,
        y: 0,
        z: 0
    };
    const boundingSphere = new THREE.Box3().setFromObject(printBedWireframe).getBoundingSphere();

    cameraPosition.x = bedMiddle.x;
    cameraPosition.y = bedMiddle.y - (boundingSphere.radius * 1.25);
    cameraPosition.z = (bedMiddle.y - cameraPosition.y) * Math.tan(45 * Math.PI / 180);

    camera.up.set(0, 0, 1);
    camera.position.x = cameraPosition.x;
    camera.position.y = cameraPosition.y;
    camera.position.z = cameraPosition.z;
    controls.target.set(bedMiddle.x, bedMiddle.y, bedMiddle.z);
    controls.maxDistance = boundingSphere.radius * 4;
    camera.lookAt(bedMiddle.x, bedMiddle.y, bedMiddle.z);
}

function render() {
    renderer.render(scene, camera);
}

function animate() {
    requestAnimationFrame(animate);
    controls.update();
}

function drawPrintBed(printer) {

    if (!initialized) {
        initialize();
    }

    let renderSideTransitions = false;
    if (printer.transitionSettings.type === SIDE_TRANSITIONS) {
        drawSideTransitions(printer, false);
        renderSideTransitions = true;
    } else if (sideTransitionLines) {
        scene.remove(sideTransitionLines);
        sideTransitionLines = null;
        renderSideTransitions = true;
    }

    if (printBedDimensions && printBed !== null) {
        if (printBedDimensions.circular === printer.printBedDimensions.circular) {
            if (printer.printBedDimensions.circular) {
                if (printBedDimensions.diameter === printer.printBedDimensions.diameter) {
                    if (printBedDimensions.offsetX === printer.printBedDimensions.originOffsets.x &&
                        printBedDimensions.offsetY === printer.printBedDimensions.originOffsets.y) {
                        if (renderSideTransitions) {
                            render();
                        }
                        return;
                    }
                }
            } else {
                if (printBedDimensions.x === printer.printBedDimensions.x && printBedDimensions.y === printer.printBedDimensions.y) {
                    if (printBedDimensions.offsetX === printer.printBedDimensions.originOffsets.x &&
                        printBedDimensions.offsetY === printer.printBedDimensions.originOffsets.y) {
                        if (renderSideTransitions) {
                            render();
                        }
                        return;
                    }
                }
            }
        }
        if (useWebGL) {
            scene.remove(printBed);
        }
        scene.remove(printBedWireframe);
        scene.remove(bedPointLight);
        printBed = null;
        printBedWireframe = null;
        bedPointLight = null;
    }

    if (printer.printBedDimensions.circular) {
        if (useWebGL) {
            printBed = new THREE.Mesh(
                new THREE.CircleGeometry(
                    printer.printBedDimensions.diameter / 2,    // radius
                    64                                          // number of triangular segments
                ),
                printBedMaterial
            );
        }
        printBedWireframe = new THREE.Mesh(
            new THREE.RingGeometry(
                10,                                             // inner radius
                printer.printBedDimensions.diameter / 2,        // outer radius
                64,                                             // number of triangular segments
                Math.floor(printer.printBedDimensions.diameter / 10)   // number of rings
            ),
            printBedWireframeMaterial
        );
    } else {
        if (useWebGL) {
            printBed = new THREE.Mesh(
                new THREE.PlaneGeometry(
                    printer.printBedDimensions.x,               // width
                    printer.printBedDimensions.y               // height
                ),
                printBedMaterial
            );
        }
        printBedWireframe = new THREE.Mesh(
            new THREE.PlaneGeometry(
                printer.printBedDimensions.x,                   // width
                printer.printBedDimensions.y,                   // height
                Math.floor(printer.printBedDimensions.x / 10),  // width segments
                Math.floor(printer.printBedDimensions.y / 10)   // height segments
            ),
            printBedWireframeMaterial
        )
    }

    printBedDimensions = {
        circular: printer.printBedDimensions.circular,
        x: (printer.printBedDimensions.circular ? printer.printBedDimensions.diameter : printer.printBedDimensions.x),
        y: (printer.printBedDimensions.circular ? printer.printBedDimensions.diameter : printer.printBedDimensions.y),
        offsetX: printer.printBedDimensions.originOffsets.x,
        offsetY: printer.printBedDimensions.originOffsets.y
    };

    if (useWebGL) {
        printBed.translateX(printBedDimensions.x / 2 - printBedDimensions.offsetX);
        printBed.translateY(printBedDimensions.y / 2 - printBedDimensions.offsetY);
    }
    printBedWireframe.translateX(printBedDimensions.x / 2 - printBedDimensions.offsetX);
    printBedWireframe.translateY(printBedDimensions.y / 2 - printBedDimensions.offsetY);

    printBedWireframe.geometry.computeBoundingBox();
    resetCameraPosition();

    let bedMiddle = {
        x: (printBedDimensions.x) / 2 - printBedDimensions.offsetX,
        y: (printBedDimensions.y) / 2 - printBedDimensions.offsetY,
        z: 0
    };
    bedPointLight = new THREE.PointLight(0xFFFFFF);
    bedPointLight.position.x = bedMiddle.x + 10;
    bedPointLight.position.y = bedMiddle.y + 50;
    bedPointLight.position.z = 130;
    scene.add(bedPointLight);

    if (useWebGL) {
        scene.add(printBed);
    }
    scene.add(printBedWireframe);

    render();

}

function getMaterialForDrive(driveNumber) {
    return new THREE.LineBasicMaterial({
        color: (driveColors[driveNumber] === "transparent" ? 0xffffff : driveColors[driveNumber]),
        linewidth: 2,
        opacity: (driveColors[driveNumber] === "transparent" ? 0.35 : 1),
        transparent: (driveColors[driveNumber] === "transparent")
    });
}

function getArcMoveSegments(instruction, previousPosition, currentPosition) {
    const oneDegreeInRadians = deg2rad(1);
    const z = currentPosition.z;
    const clockwise = instruction.clockwise;
    const start = {
        x: previousPosition.x,
        y: previousPosition.y
    };
    const end = {
        x: currentPosition.x,
        y: currentPosition.y
    };
    const center = {
        x: start.x + instruction.i,
        y: start.y + instruction.j
    };
    const radius = getLineLength(start.x, start.y, center.x, center.y);
    const startAngle = Math.atan2(start.y - center.y, start.x - center.x);
    const endAngle = Math.atan2(end.y - center.y, end.x - center.x);
    let previousPoint = start;
    let currentAngle = startAngle;
    let segments = [];
    while (clockwise ? (currentAngle > endAngle) : (currentAngle < endAngle)) {
        if (clockwise) {
            currentAngle -= oneDegreeInRadians;
            if (currentAngle < endAngle) currentAngle = endAngle;
        } else {
            currentAngle += oneDegreeInRadians;
            if (currentAngle > endAngle) currentAngle = endAngle;
        }
        let nextPoint = {
            x: (radius * Math.cos(currentAngle)) + center.x,
            y: (radius * Math.sin(currentAngle)) + center.y
        };
        segments.push([
            new THREE.Vector3(previousPoint.x, previousPoint.y, z),
            new THREE.Vector3(nextPoint.x, nextPoint.y, z)
        ]);
        previousPoint = nextPoint;
    }
    return segments;
}

async function drawPrint(printModel) {

    if (!initialized) {
        initialize();
    }

    if (printLines) {
        printLines.forEach(function (mesh) {
            scene.remove(mesh);
        });
        printLines = [];
    }
    if (towerLines) {
        scene.remove(towerLines);
        towerLines = null;
    }

    let geometries = [
        new THREE.Geometry(),
        new THREE.Geometry(),
        new THREE.Geometry(),
        new THREE.Geometry()
    ];

    let lineMaterials = [
        getMaterialForDrive(0),
        getMaterialForDrive(1),
        getMaterialForDrive(2),
        getMaterialForDrive(3)
    ];

    let raft = printModel._raft;
    let firstLayerReached = false;

    const zOffset = (printModel._printerProfile.engine === "tiertime" ? -printModel.printLayerHeights[0] + 0.1 : 0);

    raft.rewind();
    await raft.play(async function (instruction, state) {

        if ((instruction instanceof Raft.MoveInstruction) && !(instruction instanceof Raft.HomeInstruction)
            && printModel.printLayerHeights.indexOf(state.get("z").position) >= 0) {

            if (printModel.printLayerHeights.indexOf(state.get("z").position) === 0) {
                firstLayerReached = true;
            }

            if (firstLayerReached) {
                let extrusion = state.get("extrusion");
                if (extrusion.retraction === 0 && extrusion.totalDispensed > 0 && instruction.extrusion !== null) {
                    if (instruction.x !== null || instruction.y !== null || instruction.z !== null) {
                        let currentPosition = {
                            x: state.get("x").position,
                            y: state.get("y").position,
                            z: state.get("z").position,
                            extrusion: state.get("extrusion").totalDispensed
                        };
                        let currentTool = state.get("toolhead").value;
                        raft.stepBackward();
                        let previousPosition = {
                            x: raft.getCurrentState().get("x").position,
                            y: raft.getCurrentState().get("y").position,
                            z: raft.getCurrentState().get("z").position,
                            extrusion: raft.getCurrentState().get("extrusion").totalDispensed
                        };
                        let previousTool = raft.getCurrentState().get("toolhead").value;
                        raft.stepForward();
                        if (currentTool === null) {
                            currentTool = 0;
                        }
                        if (previousTool === null) {
                            previousTool = currentTool;
                        }
                        if (currentPosition.extrusion > previousPosition.extrusion
                            && (previousPosition.x !== currentPosition.x || previousPosition.y !== currentPosition.y)
                            && previousPosition.z <= currentPosition.z) {
                            if (instruction instanceof Raft.LinearMoveInstruction) {
                                geometries[previousTool].vertices.push(new THREE.Vector3(
                                    previousPosition.x,
                                    previousPosition.y,
                                    previousPosition.z + zOffset
                                ));
                                geometries[currentTool].vertices.push(new THREE.Vector3(
                                    currentPosition.x,
                                    currentPosition.y,
                                    currentPosition.z + zOffset
                                ));
                            } else if (instruction instanceof Raft.ArcMoveInstruction) {
                                let arcSegments = getArcMoveSegments(instruction, previousPosition, currentPosition);
                                for (let segment of arcSegments) {
                                    geometries[previousTool].vertices.push(segment[0]);
                                    geometries[currentTool].vertices.push(segment[1]);
                                }
                            }
                        }
                    }
                }
            }
        }
    });

    let segments;
    for (let i = 0; i < geometries.length; i++) {
        segments = new THREE.LineSegments(geometries[i], lineMaterials[i]);
        printLines.push(segments);
        scene.add(segments);
    }

    if (printModel.totalTransitions > 0
        && printModel._printerProfile.transitionSettings.type === TRANSITION_TOWER
        && printModel._tower instanceof TransitionTower) {
        drawTransitionTower(printModel, false);
    } else if (printModel.totalTransitions > 0
        && printModel._printerProfile.transitionSettings.type === SIDE_TRANSITIONS) {
        drawSideTransitions(printModel._printerProfile, false);
    }

    render();

}

function drawTransitionTower(printModel, renderAfter) {

    if (towerLines) {
        scene.remove(towerLines);
        towerLines = null;
    }
    if (towerBoundingBox) {
        scene.remove(towerBoundingBox);
        towerBoundingBox = null;
        hideManualTowerAdjustmentUI();
    }

    let printer = printModel._printerProfile;
    let tower = printModel._tower;

    const zOffset = (printer.engine === "tiertime" ? -printModel.printLayerHeights[0] + 0.1 : 0);

    let towerGeometry = new THREE.Geometry();

    let towerLineMaterial = new THREE.LineBasicMaterial({
        color: 0xffffff,
        linewidth: 2,
        vertexColors: THREE.VertexColors
    });

    let fromColor;
    let toColor;
    for (let z of tower.towerLayerHeights) {
        if (tower.layerStats[z].transitions.length > 0) {
            fromColor = driveColors[tower.layerStats[z].transitions[0].from];
            toColor = fromColor;
            break;
        }
    }
    if (fromColor === "transparent") {
        fromColor = 0xeeeeee;
    }
    if (toColor === "transparent") {
        toColor = 0xeeeeee;
    }

    for (let z of tower.towerLayerHeights) {

        let layerTransitions = tower.layerStats[z].transitions;
        let totalLayerTransitions = layerTransitions.length;
        let precode = tower.precode[z].commands.filter(function (cmd) {
            return cmd.hasOwnProperty("extrusion");
        });

        let currentTransition = 0;
        if (totalLayerTransitions > 0) {
            fromColor = driveColors[layerTransitions[currentTransition].from];
            toColor = driveColors[layerTransitions[currentTransition].to];
            if (fromColor === "transparent") fromColor = 0xeeeeee;
            if (toColor === "transparent") toColor = 0xeeeeee;
        } else {
            fromColor = toColor;
        }

        let totalPrintLines = precode.length;
        let transitionLines = Math.ceil(totalPrintLines / Math.max(totalLayerTransitions, 1));
        let currentLine = 0;
        let lastTransitionLines = 0;
        if (tower.brims.count > 0 && tower.towerLayerHeights.indexOf(z) === 0) {
            let brimLines = tower.brims.count * 4;
            transitionLines = Math.ceil((totalPrintLines - brimLines) / Math.max(totalLayerTransitions, 1));
            currentLine = brimLines;
            lastTransitionLines = brimLines;
            for (let j = 0; j < brimLines; j++) {
                let cmd = precode[j];
                towerGeometry.vertices.push(new THREE.Vector3(
                    cmd.x1 + tower.offsets.x,
                    cmd.y1 + tower.offsets.y,
                    z + zOffset
                ));
                towerGeometry.colors.push(new THREE.Color(fromColor));
                towerGeometry.vertices.push(new THREE.Vector3(
                    cmd.x2 + tower.offsets.x,
                    cmd.y2 + tower.offsets.y,
                    z + zOffset
                ));
                towerGeometry.colors.push(new THREE.Color(fromColor));
            }
        }
        for (let i = currentLine; i < precode.length; i++) {

            let cmd = precode[i];

            if (currentLine - lastTransitionLines > transitionLines) {
                currentTransition++;
                fromColor = driveColors[layerTransitions[currentTransition].from];
                toColor = driveColors[layerTransitions[currentTransition].to];
                if (fromColor === "transparent") fromColor = 0xeeeeee;
                if (toColor === "transparent") toColor = 0xeeeeee;
                lastTransitionLines = currentLine;
            }

            let lineColor = new THREE.Color(interpolate(
                fromColor,
                toColor,
                (currentLine - lastTransitionLines) / transitionLines,
                printer.transitionSettings.targetPosition - 0.1,
                printer.transitionSettings.targetPosition + 0.35
            ));
            towerGeometry.vertices.push(new THREE.Vector3(
                cmd.x1,
                cmd.y1,
                z + zOffset
            ));
            towerGeometry.colors.push(lineColor);
            towerGeometry.vertices.push(new THREE.Vector3(
                cmd.x2,
                cmd.y2,
                z + zOffset
            ));
            towerGeometry.colors.push(lineColor);

            currentLine++;

        }
    }

    towerLines = new THREE.LineSegments(towerGeometry, towerLineMaterial);
    scene.add(towerLines);

    if (renderAfter) {
        render();
    }

}

function drawSideTransitions(printer, renderAfter) {
    if (sideTransitionLines) {
        scene.remove(sideTransitionLines);
        sideTransitionLines = null;
    }
    let material = new THREE.MeshBasicMaterial({
        color: 0x9d29db
    });
    if (printer.transitionSettings.sideTransitions.purgeInPlace) {
        let nozzleRadius = printer.filamentDiameter * 2;
        let cylinderHeight = 2;
        let segments = 16;
        let geometry = new THREE.CylinderGeometry(nozzleRadius, nozzleRadius, cylinderHeight, segments);
        sideTransitionLines = new THREE.Mesh(geometry, material);
        sideTransitionLines.rotation.x = Math.PI / 2;
        sideTransitionLines.position.x = printer.transitionSettings.sideTransitions.coordinates.x;
        sideTransitionLines.position.y = printer.transitionSettings.sideTransitions.coordinates.y;
        sideTransitionLines.position.z = sideTransitionLines.position.z - (cylinderHeight / 2) + 1;
        scene.add(sideTransitionLines);
    } else {
        let nozzleRadius = printer.nozzleDiameter;
        let segments = 8;
        let xBedMin = -printer.printBedDimensions.originOffsets.x;
        let xBedMax = printer.printBedDimensions.x - printer.printBedDimensions.originOffsets.x;
        let yBedMin = -printer.printBedDimensions.originOffsets.y;
        let yBedMax = printer.printBedDimensions.y - printer.printBedDimensions.originOffsets.y;
        let geometry;
        if (printer.transitionSettings.sideTransitions.purgeEdge === "west"
            || printer.transitionSettings.sideTransitions.purgeEdge === "east") {
            geometry = new THREE.CylinderGeometry(nozzleRadius, nozzleRadius, yBedMax - yBedMin - 30, segments);
        } else {
            geometry = new THREE.CylinderGeometry(nozzleRadius, nozzleRadius, xBedMax - xBedMin - 30, segments);
        }
        sideTransitionLines = new THREE.Mesh(geometry, material);
        if (printer.transitionSettings.sideTransitions.purgeEdge === "west") {
            sideTransitionLines.position.x = xBedMin - printer.transitionSettings.sideTransitions.purgeEdgeOffset;
            sideTransitionLines.position.y = (yBedMax + yBedMin) / 2;
        } else if (printer.transitionSettings.sideTransitions.purgeEdge === "east") {
            sideTransitionLines.position.x = xBedMax + printer.transitionSettings.sideTransitions.purgeEdgeOffset;
            sideTransitionLines.position.y = (yBedMax + yBedMin) / 2;
        } else if (printer.transitionSettings.sideTransitions.purgeEdge === "north") {
            sideTransitionLines.rotation.z = Math.PI / 2;
            sideTransitionLines.position.x = (xBedMax + xBedMin) / 2;
            sideTransitionLines.position.y = yBedMax + printer.transitionSettings.sideTransitions.purgeEdgeOffset;
        } else { // south
            sideTransitionLines.rotation.z = Math.PI / 2;
            sideTransitionLines.position.x = (xBedMax + xBedMin) / 2;
            sideTransitionLines.position.y = yBedMin - printer.transitionSettings.sideTransitions.purgeEdgeOffset;
        }
        scene.add(sideTransitionLines);
    }
    if (renderAfter) {
        render();
    }
}

function undrawPrint() {

    if (!initialized) {
        initialize();
    }

    if (printLines) {
        printLines.forEach(function (mesh) {
            scene.remove(mesh);
        });
        printLines = [];
    }
    undrawTransitionTower(false);
    if (zPlane.mesh) {
        toggleZPlane();
    } else {
        render();
    }


}

function undrawTransitionTower(renderAfter = true) {

    if (!initialized) {
        initialize();
    }

    if (towerLines) {
        scene.remove(towerLines);
        towerLines = null;
    }
    if (towerBoundingBox) {
        scene.remove(towerBoundingBox);
        towerBoundingBox = null;
        hideManualTowerAdjustmentUI();
    }
    if (towerPlaceholder) {
        scene.remove(towerPlaceholder);
        towerPlaceholder = null;
        hideManualTowerAdjustmentUI();
    }

    if (renderAfter) {
        render();
    }

}

function changeDriveColor(driveNumber, colorInfo) {
    driveColors[driveNumber] = (colorInfo.transparent ? "transparent" : colorInfo.color);
    if (printLines.length > 0) {
        printLines[driveNumber].material = getMaterialForDrive(driveNumber);
        if (towerLines) {
            drawTransitionTower(global.print, false);
        } else if (sideTransitionLines) {
            drawSideTransitions(global.print._printerProfile, false);
        }
        render();
    }
}

function getCanvasBitmap(mimeType) {
    return renderer.domElement.toDataURL(mimeType);
}

function getScreenshot(format = "png") {
    if (!(format === "png" || format === "jpg" || format === "bmp")) {
        throw new Error("Invalid screenshot format " + format + " provided to Visualizer.getScreenshot.");
    }
    let regex = new RegExp("^data:image/" + format + ";base64,");
    return getCanvasBitmap("image/" + format).replace(regex, "");
}

function getScreenshotBuffer(format = "png") {
    return Buffer.from(getScreenshot(format), "base64");
}

exports.initialize = initialize;
exports.drawPrintBed = drawPrintBed;
exports.drawPrint = drawPrint;
exports.undrawPrint = undrawPrint;
exports.undrawTransitionTower = undrawTransitionTower;
exports.changeDriveColor = changeDriveColor;
exports.resetCameraPosition = resetCameraPosition;
exports.getScreenshot = getScreenshot;
exports.getScreenshotBuffer = getScreenshotBuffer;
exports.toggleOriginAxes = toggleOriginAxes;
exports.toggleZPlane = toggleZPlane;
