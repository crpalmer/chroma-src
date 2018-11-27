
const uuid = require("uuid/v4");

const materialTypes = {
    Rigid: [
        "PLA",
        "ABS",
        "Nylon",
        "PET",
        "PETG"
    ],
    Flexible: [
        "TPU",
        "TPE"
    ],
    Soluble: [
        "Soluble",
        "PVA",
        "PVB",
        "HIPS"
    ],
    other: null
};

const materialTypesFlat = [
    "PLA",
    "ABS",
    "Nylon",
    "PET",
    "PETG",
    "TPU",
    "TPE",
    "Soluble",
    "PVA",
    "PVB",
    "HIPS",
    "Other"
];

const spliceCores = {
    P: "P",
    SC: "SC",
    SCP: "SCP"
};

const spliceCoreLabels = {
    P: "Palette/Palette+",
    SC: "Splice Core (Palette 2)",
    SCP: "Splice Core Pro (Palette 2 Pro)"
};

const defaultSpliceCore = spliceCores.P;

class SpliceSettings {
    constructor(params = {}) {
        this.spliceCore = params.spliceCore || defaultSpliceCore;
        this.heatFactor = params.heat || 0;
        this.compressionFactor = params.compression || 0;
        this.coolingFactor = params.cooling || 0;
        this.reverse = !!params.reverse;
    }
    clone() {
        return new SpliceSettings({
            spliceCore: this.spliceCore,
            heat: this.heatFactor,
            compression: this.compressionFactor,
            cooling: this.coolingFactor,
            reverse: this.reverse
        });
    }
    // TODO find and replace usages of isSet()
    isUsable() {
        if (this.spliceCore === spliceCores.P) {
            return (this.heatFactor > 0 && this.compressionFactor > 0);
        }
        return true;
    }
    equals(other) {
        if (!(other instanceof SpliceSettings)) {
            return false;
        }
        return (this.spliceCore === other.spliceCore
            && this.heatFactor === other.heatFactor
            && this.compressionFactor === other.compressionFactor
            && this.coolingFactor === other.coolingFactor
            && this.reverse === other.reverse);
    }
}

const defaultSpliceSettingsP = {
    PLA: {
        PLA: new SpliceSettings({ heat: 2, compression: 2 }),
        TPU: new SpliceSettings({ heat: 6, compression: 3 }),
        Soluble: new SpliceSettings({ heat: 6, compression: 4 }),
    },
    PETG: {
        PETG: new SpliceSettings({ heat: 2, compression: 2 }),
    },
    TPU: {
        PLA: new SpliceSettings({ heat: 2.5, compression: 4, reverse: true }),
    },
    Soluble: {
        PLA: new SpliceSettings({ heat: 6, compression: 4 }),
    },
};

const defaultSpliceSettingsSC = {
    PLA: {},
    PETG: {},
    TPU: {},
    Soluble: {},
};

const defaultSpliceSettingsSCP = {
    PLA: {},
    PETG: {},
    TPU: {},
    Soluble: {},
};

const defaultSpliceSettings = {
    P: defaultSpliceSettingsP,
    SC: defaultSpliceSettingsSC,
    SCP: defaultSpliceSettingsSCP,
};

const getDefaultMatrixGeneric = (spliceCore) => ({
    "Default PLA": {
        type: "PLA",
        uuid: uuid(),
        combinations: {
            "Default PLA": new SpliceSettings({ spliceCore }),
            "Default PETG": new SpliceSettings({ spliceCore }),
            "Default TPU": new SpliceSettings({ spliceCore }),
            "Default Soluble": new SpliceSettings({ spliceCore }),
        }
    },
    "Default PETG": {
        type: "PETG",
        uuid: uuid(),
        combinations: {
            "Default PLA": new SpliceSettings({ spliceCore }),
            "Default PETG": new SpliceSettings({ spliceCore }),
            "Default TPU": new SpliceSettings({ spliceCore }),
            "Default Soluble": new SpliceSettings({ spliceCore }),
        }
    },
    "Default TPU": {
        type: "PETG",
        uuid: uuid(),
        combinations: {
            "Default PLA": new SpliceSettings({ spliceCore }),
            "Default PETG": new SpliceSettings({ spliceCore }),
            "Default TPU": new SpliceSettings({ spliceCore }),
            "Default Soluble": new SpliceSettings({ spliceCore }),
        }
    },
    "Default Soluble": {
        type: "Soluble",
        uuid: uuid(),
        combinations: {
            "Default PLA": new SpliceSettings({ spliceCore }),
            "Default PETG": new SpliceSettings({ spliceCore }),
            "Default TPU": new SpliceSettings({ spliceCore }),
            "Default Soluble": new SpliceSettings({ spliceCore }),
        }
    }
});

const getDefaultMatrixP = () => ({
    "Default PLA": {
        type: "PLA",
        uuid: uuid(),
        combinations: {
            "Default PLA": defaultSpliceSettingsP.PLA.PLA.clone(),
            "Default PETG": new SpliceSettings(),
            "Default TPU": defaultSpliceSettingsP.PLA.TPU.clone(),
            "Default Soluble": defaultSpliceSettingsP.PLA.Soluble.clone(),
        }
    },
    "Default PETG": {
        type: "PETG",
        uuid: uuid(),
        combinations: {
            "Default PLA": new SpliceSettings(),
            "Default PETG": defaultSpliceSettingsP.PETG.PETG.clone(),
            "Default TPU": new SpliceSettings(),
            "Default Soluble": new SpliceSettings(),
        }
    },
    "Default TPU": {
        type: "PETG",
        uuid: uuid(),
        combinations: {
            "Default PLA": defaultSpliceSettingsP.TPU.PLA.clone(),
            "Default PETG": new SpliceSettings(),
            "Default TPU": new SpliceSettings(),
            "Default Soluble": new SpliceSettings(),
        }
    },
    "Default Soluble": {
        type: "Soluble",
        uuid: uuid(),
        combinations: {
            "Default PLA": defaultSpliceSettingsP.Soluble.PLA.clone(),
            "Default PETG": new SpliceSettings(),
            "Default TPU": new SpliceSettings(),
            "Default Soluble": new SpliceSettings(),
        }
    }
});

const getDefaultMatrixSC = () => getDefaultMatrixGeneric(spliceCores.SC);

const getDefaultMatrixSCP = () => getDefaultMatrixGeneric(spliceCores.SCP);

const unserializeSingleSpliceCoreMatrix = (serializedMatrix) => {
    const matrix = {};
    let needsSaveForUUIDs = false;
    for (let column in serializedMatrix) {
        if (serializedMatrix.hasOwnProperty(column)) {
            let materialUUID = serializedMatrix[column].uuid;
            if (!materialUUID) {
                materialUUID = uuid();
                needsSaveForUUIDs = true;
            }
            matrix[column] = {
                type: serializedMatrix[column].type,
                uuid: materialUUID,
                combinations: {}
            };
            for (let row in serializedMatrix[column].combinations) {
                if (serializedMatrix[column].combinations.hasOwnProperty(row)) {
                    if (serializedMatrix[column].combinations[row] === null) {
                        matrix[column].combinations[row] = new SpliceSettings();
                    } else {
                        matrix[column].combinations[row] = new SpliceSettings({
                            spliceCore: serializedMatrix[column].combinations[row].spliceCore,
                            heat: serializedMatrix[column].combinations[row].heatFactor,
                            compression: serializedMatrix[column].combinations[row].compressionFactor,
                            cooling: serializedMatrix[column].combinations[row].coolingFactor,
                            reverse: serializedMatrix[column].combinations[row].reverse
                        });
                    }
                }
            }
        }
    }
    return { matrix, needsSaveForUUIDs };
};

class MaterialMatrix {

    constructor() {
        this.version = 2;
        this.matrix = {
            P: {},
            SC: {},
            SCP: {}
        };
    }

    clone() {
        const copy = new MaterialMatrix();
        for (let spliceCore of Object.keys(this.matrix)) {
            for (let profile of Object.keys(this.matrix[spliceCore])) {
                copy.matrix[spliceCore][profile] = {
                    type: this.matrix[spliceCore][profile].type,
                    uuid: this.matrix[spliceCore][profile].uuid,
                    combinations: {}
                };
                for (let combo of Object.keys(this.matrix[spliceCore][profile].combinations)) {
                    if (this.matrix[spliceCore][profile].combinations[combo] === null) {
                        copy.matrix[spliceCore][profile].combinations[combo] = new SpliceSettings();
                    } else {
                        copy.matrix[spliceCore][profile].combinations[combo] = this.matrix[spliceCore][profile].combinations[combo].clone();
                    }
                }
            }
        }
        return copy;
    }

    equals(other) {
        if (!(other instanceof MaterialMatrix)) {
            return false;
        }
        if (this.matrix.version !== other.matrix.version) {
            return false;
        }
        if (Object.keys(this.matrix).length !== Object.keys(other.matrix).length) {
            return false;
        }
        for (let spliceCore of Object.keys(this.matrix)) {
            for (let profile of Object.keys(this.matrix[spliceCore])) {
                if (other.matrix[spliceCore][profile] === undefined) {
                    return false;
                }
                if (other.matrix[spliceCore][profile].type !== this.matrix[spliceCore][profile].type) {
                    return false;
                }
                for (let combo of Object.keys(this.matrix[spliceCore][profile].combinations)) {
                    if (other.matrix[spliceCore][profile].combinations[combo] === undefined) {
                        return false;
                    }
                    if (this.matrix[spliceCore][profile].combinations[combo] === null) {
                        if (other.matrix[spliceCore][profile].combinations[combo] !== null) {
                            return false;
                        }
                    } else {
                        if (!this.matrix[spliceCore][profile].combinations[combo]
                            .equals(other.matrix[spliceCore][profile].combinations[combo])) {
                            return false;
                        }
                    }
                }
            }
        }
        return true;
    }

    serialize() {
        return {
            version: this.version,
            matrix: this.clone().matrix,
        };
    }

    serializeForDataCollection() {
        let serialized = new MaterialMatrix();
        for (let spliceCore of Object.keys(this.matrix)) {
            for (let column of Object.keys(this.matrix[spliceCore])) {
                let data = this.matrix[spliceCore][column];
                serialized.matrix[spliceCore][data.uuid] = {
                    type: data.type,
                    combinations: {}
                };
                for (let combo of Object.keys(data.combinations)) {
                    if (data.combinations.hasOwnProperty(combo)) {
                        let otherUuid = this.matrix[spliceCore][combo].uuid;
                        serialized.matrix[spliceCore][data.uuid].combinations[otherUuid]
                            = this.matrix[spliceCore][column].combinations[combo].clone();
                    }
                }
            }
        }
        return serialized.matrix;
    }

    static getDefault() {
        let m = new MaterialMatrix();
        m.matrix.P = getDefaultMatrixP();
        m.matrix.SC = getDefaultMatrixSC();
        m.matrix.SCP = getDefaultMatrixSCP();
        return m;
    }

    static unserialize(contents, includeDefaults = true) {
        let m = (includeDefaults ? MaterialMatrix.getDefault() : new MaterialMatrix());
        if (Object.keys(contents).length === 2
            && contents.hasOwnProperty("version")
            && contents.hasOwnProperty("matrix")) {
            switch (contents.version) {
                case 2:
                default:
                    Object.keys(spliceCores).forEach((core) => {
                        const { matrix, needsSaveForUUIDs } = unserializeSingleSpliceCoreMatrix(contents.matrix[core]);
                        m.matrix[core] = matrix;
                        if (needsSaveForUUIDs) {
                            m.needsSaveForUUIDs = true;
                        }
                    });
            }
        } else {
            // version 1
            const { matrix, needsSaveForUUIDs } = unserializeSingleSpliceCoreMatrix(contents);
            m.matrix.P = matrix;
            if (needsSaveForUUIDs) {
                m.needsSaveForUUIDs = true;
            }
        }
        return m;
    }

    static isDefaultProfile(spliceCore, name) {
        let defaultNames = Object.keys(MaterialMatrix.getDefault().matrix[spliceCore]);
        return (defaultNames.indexOf(name) >= 0);
    }

    profileNameTaken(spliceCore, name) {
        for (let profileName of Object.keys(this.matrix[spliceCore])) {
            if (profileName === name) {
                return true;
            }
        }
        return false;
    }

    addEmptyProfile(spliceCore, name) {
        if (this.profileNameTaken(spliceCore, name)) {
            return false;
        }
        this.matrix[spliceCore][name] = {
            type: "PLA",
            uuid: uuid(),
            combinations: {}
        };
        for (let profileName of Object.keys(this.matrix[spliceCore])) {
            this.matrix[spliceCore][name].combinations[profileName] = null;
            this.matrix[spliceCore][profileName].combinations[name] =
                new SpliceSettings({ spliceCore });
        }
        return true;
    }

    renameProfile(spliceCore, oldName, newName) {
        this.matrix[spliceCore][newName] = this.matrix[spliceCore][oldName];
        delete this.matrix[spliceCore][oldName];
        for (let existing of Object.keys(this.matrix[spliceCore])) {
            this.matrix[spliceCore][existing].combinations[newName] =
                this.matrix[spliceCore][existing].combinations[oldName];
            delete this.matrix[spliceCore][existing].combinations[oldName];
        }
    }

    deleteProfile(spliceCore, name) {
        delete this.matrix[spliceCore][name];
        for (let existing of Object.keys(this.matrix[spliceCore])) {
            delete this.matrix[spliceCore][existing].combinations[name];
        }
    }

    changeProfileType(spliceCore, name, newType) {
        this.matrix[spliceCore][name].type = newType;
        for (let combo of Object.keys(this.matrix[spliceCore][name].combinations)) {
            // update this entry to reflect new type compatibility
            if (!(this.matrix[spliceCore][name].combinations[combo] instanceof SpliceSettings)) {
                this.matrix[spliceCore][name].combinations[combo] = new SpliceSettings({ spliceCore });
            }
        }
        for (let existing of Object.keys(this.matrix[spliceCore])) {
            if (existing !== name) {
                // update entries to reflect new type compatibility
                if (!(this.matrix[spliceCore][existing].combinations[name] instanceof SpliceSettings)) {
                    this.matrix[spliceCore][existing].combinations[name] = new SpliceSettings({ spliceCore });
                }
            }
        }
    }

    checkCompatibility(spliceCore, material1, material2) {
        return (this.matrix[spliceCore][material1].combinations[material2].isUsable()
            && this.matrix[spliceCore][material2].combinations[material1].isUsable());
    }

    toString() {
        return JSON.stringify(this.matrix, null, 4);
    }

}

module.exports = MaterialMatrix;
module.exports.globalMatrix = MaterialMatrix.getDefault();
module.exports.defaults = defaultSpliceSettings;
module.exports.materialTypes = materialTypes;
module.exports.spliceCores = spliceCores;
module.exports.spliceCoreLabels = spliceCoreLabels;
