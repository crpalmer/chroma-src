
const MSF = require("./msf");

class PaletteDataString {

    constructor(opts) {
        this.uuid = opts.uuid;
        this.deviceType = opts.deviceType;
        this.firmwareVersion = opts.firmwareVersion;
        this.filamentUsed = opts.filamentUsed;
        this.spliceCount = opts.spliceCount;
        this.printsStarted = opts.printsStarted;
        this.printsFinished = opts.printsFinished;
        this.ratings5 = opts.ratings5;
        this.ratings4 = opts.ratings4;
        this.ratings3 = opts.ratings3;
        this.ratings2 = opts.ratings2;
        this.ratings1 = opts.ratings1;
        this.ratingsSkipped = opts.ratingsSkipped;
        this.printsCancelled = opts.printsStarted - opts.printsFinished;
    }

    static fromDataStringBuffer(deviceType, firmwareVersion, data) {
        const ID_LENGTH = 4;
        const INT_LENGTH = 4;
        const SPLICE_COUNT_LENGTH = 8;
        let opts = {
            deviceType: deviceType,
            firmwareVersion: firmwareVersion
        };
        let offset = 0;
        opts.uuid = data.substr(offset, ID_LENGTH);
        offset = ID_LENGTH;
        opts.filamentUsed = MSF.hexToInt(data.substr(offset, INT_LENGTH));
        offset += INT_LENGTH;
        opts.spliceCount = MSF.hexToInt(data.substr(offset, SPLICE_COUNT_LENGTH));
        offset += SPLICE_COUNT_LENGTH;
        opts.printsStarted = MSF.hexToInt(data.substr(offset, INT_LENGTH));
        offset += INT_LENGTH;
        opts.printsFinished = MSF.hexToInt(data.substr(offset, INT_LENGTH));
        offset += INT_LENGTH;
        opts.ratings5 = MSF.hexToInt(data.substr(offset, INT_LENGTH));
        offset += INT_LENGTH;
        opts.ratings4 = MSF.hexToInt(data.substr(offset, INT_LENGTH));
        offset += INT_LENGTH;
        opts.ratings3 = MSF.hexToInt(data.substr(offset, INT_LENGTH));
        offset += INT_LENGTH;
        opts.ratings2 = MSF.hexToInt(data.substr(offset, INT_LENGTH));
        offset += INT_LENGTH;
        opts.ratings1 = MSF.hexToInt(data.substr(offset, INT_LENGTH));
        offset += INT_LENGTH;
        opts.ratingsSkipped = MSF.hexToInt(data.substr(offset, INT_LENGTH));
        return new PaletteDataString(opts);
    }

    serialize() {
        return JSON.parse(JSON.stringify(this));
    }

    equals(other) {
        return (this.uuid === other.uuid
            && this.deviceType === other.deviceType
            && this.firmwareVersion === other.firmwareVersion
            && this.filamentUsed === other.filamentUsed
            && this.spliceCount === other.spliceCount
            && this.printsStarted === other.printsStarted
            && this.printsFinished === other.printsFinished
            && this.ratings5 === other.ratings5
            && this.ratings4 === other.ratings4
            && this.ratings3 === other.ratings3
            && this.ratings2 === other.ratings2
            && this.ratings1 === other.ratings1
            && this.ratingsSkipped === other.ratingsSkipped
            && this.printsCancelled === other.printsCancelled);
    }

}

module.exports = PaletteDataString;
