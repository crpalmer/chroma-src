
const uuid = require("uuid/v4");

const materialTypes = [
    "PLA",
    "PETG",
    "TPU",
    "Soluble",
    "Other"
];

class SpliceSettings {
    constructor(params = {}) {
        this.heatFactor = params.heat || 0;
        this.compressionFactor = params.compression || 0;
        this.reverse = !!params.reverse;
    }
    clone() {
        return new SpliceSettings({
            heat: this.heatFactor,
            compression: this.compressionFactor,
            reverse: this.reverse
        });
    }
    isSet() {
        return (this.heatFactor > 0 && this.compressionFactor > 0);
    }
    equals(other) {
        if (!(other instanceof SpliceSettings)) {
            return false;
        }
        return (this.heatFactor === other.heatFactor
            && this.compressionFactor === other.compressionFactor
            && this.reverse === other.reverse);
    }
}

const defaults = {
    PLA: {
        PLA: new SpliceSettings({
            heat: 2,
            compression: 2,
            reverse: false}),
        TPU: new SpliceSettings({
            heat: 6,
            compression: 3,
            reverse: false}),
        Soluble: new SpliceSettings({
            heat: 6,
            compression: 4,
            reverse: false}),
        Other: new SpliceSettings()
    },
    PETG: {
        PETG: new SpliceSettings({
            heat: 2,
            compression: 2,
            reverse: false
        }),
        Other: new SpliceSettings()
    },
    TPU: {
        PLA: new SpliceSettings({
            heat: 2.5,
            compression: 4,
            reverse: true
        }),
        Other: new SpliceSettings()
    },
    Soluble: {
        PLA: new SpliceSettings({
            heat: 6,
            compression: 4,
            reverse: false
        }),
        Other: new SpliceSettings()
    },
    Other: {
        PLA: new SpliceSettings(),
        PETG: new SpliceSettings(),
        TPU: new SpliceSettings(),
        Soluble: new SpliceSettings(),
        Other: new SpliceSettings()
    }
};

class MaterialMatrix {

    constructor() {
        this.matrix = {};
    }

    clone() {
        let copy = new MaterialMatrix();
        for (let profile of Object.keys(this.matrix)) {
            copy.matrix[profile] = {
                type: this.matrix[profile].type,
                uuid: this.matrix[profile].uuid,
                combinations: {}
            };
            for (let combo of Object.keys(this.matrix[profile].combinations)) {
                if (this.matrix[profile].combinations[combo] === null) {
                    copy.matrix[profile].combinations[combo] = new SpliceSettings();
                } else {
                    copy.matrix[profile].combinations[combo] = this.matrix[profile].combinations[combo].clone();
                }
            }
        }
        return copy;
    }

    equals(other) {
        if (!(other instanceof MaterialMatrix)) {
            return false;
        }
        if (Object.keys(this.matrix).length !== Object.keys(other.matrix).length) {
            return false;
        }
        for (let profile of Object.keys(this.matrix)) {
            if (other.matrix[profile] === undefined) {
                return false;
            }
            if (other.matrix[profile].type !== this.matrix[profile].type) {
                return false;
            }
            for (let combo of Object.keys(this.matrix[profile].combinations)) {
                if (other.matrix[profile].combinations[combo] === undefined) {
                    return false;
                }
                if (this.matrix[profile].combinations[combo] === null) {
                    if (other.matrix[profile].combinations[combo] !== null) {
                        return false;
                    }
                } else {
                    if (!this.matrix[profile].combinations[combo].equals(other.matrix[profile].combinations[combo])) {
                        return false;
                    }
                }
            }
        }
        return true;
    }

    serialize() {
        return this.clone().matrix;
    }

    serializeForDataCollection() {
        let serialized = new MaterialMatrix();
        for (let column in this.matrix) {
            if (this.matrix.hasOwnProperty(column)) {
                let data = this.matrix[column];
                serialized.matrix[data.uuid] = {
                    type: data.type,
                    combinations: {}
                };
                for (let combo in data.combinations) {
                    if (data.combinations.hasOwnProperty(combo)) {
                        let otherUuid = this.matrix[combo].uuid;
                        serialized.matrix[data.uuid].combinations[otherUuid] = this.matrix[column].combinations[combo].clone();
                    }
                }
            }
        }
        return serialized.matrix;
    }

    static getDefault() {
        let m = new MaterialMatrix();
        m.matrix = {
            "Default PLA": {
                type: "PLA",
                uuid: uuid(),
                combinations: {
                    "Default PLA": defaults.PLA.PLA.clone(),
                    "Default PETG": new SpliceSettings(),
                    "Default Soluble": defaults.PLA.Soluble.clone()
                }
            },
            "Default PETG": {
                type: "PETG",
                uuid: uuid(),
                combinations: {
                    "Default PLA": new SpliceSettings(),
                    "Default PETG": defaults.PETG.PETG.clone(),
                    "Default Soluble": new SpliceSettings()
                }
            },
            "Default Soluble": {
                type: "Soluble",
                uuid: uuid(),
                combinations: {
                    "Default PLA": defaults.Soluble.PLA.clone(),
                    "Default PETG": new SpliceSettings(),
                    "Default Soluble": new SpliceSettings()
                }
            }
        };
        return m;
    }

    static unserialize(contents, includeDefaults = true) {
        let m = (includeDefaults ? MaterialMatrix.getDefault() : new MaterialMatrix());
        m.needsSaveForUUIDs = false;
        for (let column in contents) {
            if (contents.hasOwnProperty(column)) {
                let materialUUID = contents[column].uuid;
                if (!materialUUID) {
                    materialUUID = uuid();
                    m.needsSaveForUUIDs = true;
                }
                m.matrix[column] = {
                    type: contents[column].type,
                    uuid: materialUUID,
                    combinations: {}
                };
                for (let row in contents[column].combinations) {
                    if (contents[column].combinations.hasOwnProperty(row)) {
                        if (contents[column].combinations[row] === null) {
                            m.matrix[column].combinations[row] = new SpliceSettings();
                        } else {
                            m.matrix[column].combinations[row] = new SpliceSettings({
                                heat: contents[column].combinations[row].heatFactor,
                                compression: contents[column].combinations[row].compressionFactor,
                                reverse: contents[column].combinations[row].reverse
                            });
                        }
                    }
                }
            }
        }
        return m;
    }

    static isDefaultProfile(name) {
        let defaultNames = Object.keys(MaterialMatrix.getDefault().matrix);
        return (defaultNames.indexOf(name) >= 0);
    }

    profileNameTaken(name) {
        for (let profileName of Object.keys(this.matrix)) {
            if (profileName === name) {
                return true;
            }
        }
        return false;
    }

    addEmptyProfile(name) {
        if (this.profileNameTaken(name)) {
            return false;
        }
        this.matrix[name] = {
            type: "PLA",
            uuid: uuid(),
            combinations: {}
        };
        for (let profileName of Object.keys(this.matrix)) {
            this.matrix[name].combinations[profileName] = null;
            this.matrix[profileName].combinations[name] = new SpliceSettings();
        }
        return true;
    }

    renameProfile(oldName, newName) {
        this.matrix[newName] = this.matrix[oldName];
        delete this.matrix[oldName];
        for (let existing of Object.keys(this.matrix)) {
            this.matrix[existing].combinations[newName] = this.matrix[existing].combinations[oldName];
            delete this.matrix[existing].combinations[oldName];
        }
    }

    deleteProfile(name) {
        delete this.matrix[name];
        for (let existing of Object.keys(this.matrix)) {
            delete this.matrix[existing].combinations[name];
        }
    }

    changeProfileType(name, newType) {
        this.matrix[name].type = newType;
        for (let combo of Object.keys(this.matrix[name].combinations)) {
            // update this entry to reflect new type compatibility
            if (!(this.matrix[name].combinations[combo] instanceof SpliceSettings)) {
                if (defaults[newType] && defaults[newType][this.matrix[combo].type]) {
                    this.matrix[name].combinations[combo] = defaults[newType][this.matrix[combo].type].clone();
                } else {
                    this.matrix[name].combinations[combo] = new SpliceSettings();
                }
            }
        }
        for (let existing of Object.keys(this.matrix)) {
            if (existing !== name) {
                // update entries to reflect new type compatibility
                if (!(this.matrix[existing].combinations[name] instanceof SpliceSettings)) {
                    if (defaults[this.matrix[existing]] && defaults[this.matrix[existing]][newType]) {
                        this.matrix[existing].combinations[name] = defaults[this.matrix[existing].type][newType].clone();
                    } else {
                        this.matrix[existing].combinations[name] = new SpliceSettings();
                    }
                }
            }
        }
    }

    checkCompatibility(material1, material2) {
        return (this.matrix[material1].combinations[material2].isSet()
            && this.matrix[material2].combinations[material1].isSet());
    }

    toString() {
        return JSON.stringify(this.matrix, null, 4);
    }

}

let matrix = MaterialMatrix.getDefault();

module.exports = MaterialMatrix;
module.exports.matrix = matrix;
module.exports.materialTypes = materialTypes;
module.exports.defaults = defaults;
