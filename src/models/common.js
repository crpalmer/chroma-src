

module.exports = {};

/**
 * SHARED CONSTANTS
 */

// general-purpose constants
module.exports.ROUNDING_FACTOR = 100000;      // used to round off floating point-based error

// splice constants
module.exports.FIRST_PIECE_MIN_LENGTH = 140;     // minimum length of first splice for Palette/Palette+
module.exports.FIRST_PIECE_MIN_LENGTH_P2 = 100;  // minimum length of first splice for Palette 2
module.exports.SPLICE_MIN_LENGTH = 80;           // minimum length of all other splices
module.exports.DEFAULT_PPM = 30;                 // ideal PPM around which some calculations are based

// ping constants
module.exports.PING_EXTRUSION_LENGTH = 20;    // target extrusion between ping sequence pauses, in mm
module.exports.PING_EXTRUSION_COUNTS = 600;   // target extrusion between ping sequence pauses, in scroll wheel counts
module.exports.PING_PAUSE_1_LENGTH = 13000;   // duration of first ping sequence pause
module.exports.PING_PAUSE_2_LENGTH = 7000;    // duration of second ping sequence pause
module.exports.PING_MIN_SPACING = 350;        // minimum distance (extrusion, in mm) between pings
module.exports.PING_MAX_SPACING = 3000;       // maximum distance (extrusion, in mm) between pings
module.exports.PING_SPREAD_FACTOR = 1.03;     // exponential spacing factor between pings

// tower constants
module.exports.TOWER_MIN_DIMENSION = 15;         // towers must be at least 15 mm wide on their short edge
module.exports.MODEL_EDGE_CLEARANCE = 5;         // towers must be at least 5 mm from the printed model
module.exports.PRINT_BED_EDGE_CLEARANCE = 8;     // towers must be at least 8 mm from the edge of the print bed
module.exports.MAX_PERIMETER_DENSITY = 0.2;      // tower layers this dense or less will be printed with perimeters
module.exports.INFILL_PERIMETER_OVERLAP = 0.15;  // overlap percentage of perimeters and infill, if using perimeters
module.exports.ZIGGURAT_THRESHOLD = 5000;        // amount of extrusion below which ziggurat towers will be used

// printer constants
module.exports.BOWDEN_NONE = 150;             // extra length for last splice if printer is direct-drive
module.exports.BOWDEN_DEFAULT = 1500;         // extra length for last splice if printer is Bowden-drive

// transition modes
module.exports.NO_TRANSITIONS = 0;
module.exports.TRANSITION_TOWER = 1;
module.exports.SIDE_TRANSITIONS = 2;

// transition options
module.exports.TRANSITION_MIN_LENGTH = 80;
module.exports.TRANSITION_MAX_LENGTH = 180;
module.exports.TRANSITION_MIN_LENGTH_ADVANCED = 30;
module.exports.TRANSITION_MAX_LENGTH_ADVANCED = 230;


/**
 * SHARED FUNCTIONS
 */

function roundTo(number, decimalPlaces) {
    let factor = Math.pow(10, decimalPlaces);
    return Math.round(number * factor) / factor;
}
module.exports.roundTo = roundTo;

function getLineLength(x1, y1, x2, y2) {
    return Math.sqrt(Math.pow(y2 - y1, 2) + Math.pow(x2 - x1, 2));
}
module.exports.getLineLength = getLineLength;

function lerp(start, end, t) {
    return start + t * (end - start);
}
module.exports.lerp = lerp;

function deg2rad(degs) {
    return degs * (Math.PI / 180);
}
module.exports.deg2rad = deg2rad;

function rad2deg(rads) {
    return rads * (180 / Math.PI);
}
module.exports.rad2deg = rad2deg;
