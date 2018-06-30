
const roundTo = require("./common").roundTo;

/*
 *                1___Z1___2
 *   A    ___Z0___|        |___Z2___
 *
 *
 *                1___Z1___2
 *   B            |        |___Z2___
 *        ___Z0___|
 *
 *
 *                1___Z1____________
 *   C    ___Z0___|
 *
 *
 *                         2___Z2___
 *   D            1___Z1___|
 *        ___Z0___|
 *
 *
 *                         2___Z2___3
 *                1___Z1___|        |
 *                |                 |___Z3___
 *   E    ___Z0___|
 *
 */


function A1(newZState, Z0, Z1, Z2) {
    newZState.type = "A";
    newZState.state = 1;
    newZState.Z1 = Z1;
    newZState.Z2 = Z2;
    newZState.lifted = true;
    newZState.liftHeight = Z1;
    newZState.unliftHeight = Z0;  // Z0 === Z2
}
function B1(newZState, Z0, Z1, Z2) {
    newZState.type = "B";
    newZState.state = 1;
    newZState.Z1 = Z1;
    newZState.Z2 = Z2;
    newZState.lifted = true;
    newZState.liftHeight = Z1;
    newZState.unliftHeight = Z0;
}
function C1(newZState, defaultZLift, Z1) {
    newZState.liftHeight = roundTo(Z1 + defaultZLift, 4);
    newZState.unliftHeight = Z1;
    newZState.changeTowerToLayer = Z1;
}
function D1(newZState, Z0, Z1, Z2) {
    newZState.type = "D";
    newZState.state = 1;
    newZState.Z1 = Z1;
    newZState.Z2 = Z2;
    newZState.lifted = true;
    newZState.liftHeight = Z1;
    newZState.unliftHeight = Z0;
}
function E1(newZState, Z0, Z1, Z2, Z3) {
    // console.log("E1 -- Z1 = " + Z1 + ", Z2 = " + Z2 + ", Z3 = " + Z3);
    newZState.type = "E";
    newZState.state = 1;
    newZState.Z1 = Z1;
    newZState.Z2 = Z2;
    newZState.Z3 = Z3;
    newZState.lifted = true;
    newZState.liftHeight = Z1;
    newZState.unliftHeight = Z3;
}

class ZStateMachine {

    constructor() {
        this.type = null;
        this.state = null;
        this.Z1 = null;
        this.Z2 = null;
        this.Z3 = null;
        this.lifted = false;
        this.liftHeight = 0;
        this.unliftHeight = 0;
        this.changeTowerToLayer = false;
    }

    clone() {
        let copy = new ZStateMachine();
        copy.type = this.type;
        copy.state = this.state;
        copy.Z1 = this.Z1;
        copy.Z2 = this.Z2;
        copy.Z3 = this.Z3;
        copy.lifted = this.lifted;
        copy.liftHeight = this.liftHeight;
        copy.unliftHeight = this.unliftHeight;
        copy.changeTowerToLayer = this.changeTowerToLayer;
        return copy;
    }

    getNextState(raft, defaultZLift) {

        let newZState = new ZStateMachine();

        if (this.lifted) {
            let currentZ = raft.getCurrentState().get("z").position;
            if (this.type === "A") {
                if (this.state === 1 && currentZ === this.Z1) {
                    // still A1
                    return this;
                }
                // A2
                return newZState;
            } else if (this.type === "B") {
                if (this.state === 1 && currentZ === this.Z1) {
                    // still B1
                    return this;
                }
                // B2
                newZState.changeTowerToLayer = this.Z2;
                return newZState;
            } else if (this.type === "D") {
                if (this.state === 1 && currentZ === this.Z1) {
                    // still D1
                    return this;
                }
                // D2
                newZState.changeTowerToLayer = this.Z2;
                return newZState;
            } else {
                // E2 or E3
                if (this.state === 1) {
                    if (currentZ === this.Z1) {
                        // still E1
                        return this;
                    }
                    // E2
                    newZState = this.clone();
                    newZState.state = 2;
                    newZState.changeTowerToLayer = this.Z3;
                    newZState.liftHeight = this.Z2;
                    newZState.unliftHeight = this.Z3;
                    return newZState;
                } else {
                    if (this.state === 2 && currentZ === this.Z2) {
                        // still E2
                        return this;
                    }
                    // E3
                    return newZState;
                }
            }
        } else {
            raft.stepBackward();
            let Z0 = raft.getCurrentState().get("z").position;
            raft.stepForward();
            let Z1 = raft.getCurrentState().get("z").position;
            let stepsForward = 0;
            let currentE = raft.getCurrentState().get("extrusion").totalDispensed;
            while (true) {
                let stepping = raft.stepForward();
                if (!stepping) {
                    // end of print before Z2 reached
                    C1(newZState, defaultZLift, Z1);
                    break;
                }
                stepsForward++;
                let Z2 = raft.getCurrentState().get("z").position;
                if (Z2 !== Z1) {
                    // no extrusion before Z2 reached
                    if (Z2 === Z0) {
                        A1(newZState, Z0, Z1, Z2);
                        break;
                    } else {
                        while (true) {
                            let futureE = raft.getCurrentState().get("extrusion").totalDispensed;
                            if (futureE > currentE) {
                                // extrusion before Z3 reached
                                if (Z1 > Z2) {
                                    B1(newZState, Z0, Z1, Z2);
                                    break;
                                } else {
                                    D1(newZState, Z0, Z1, Z2);
                                    break;
                                }
                            }
                            let Z3 = raft.getCurrentState().get("z").position;
                            if (Z3 !== Z2) {
                                if (Z3 === Z1 || Z2 < Z3) {
                                    if (Z1 > Z2) {
                                        B1(newZState, Z0, Z1, Z2);
                                    } else {
                                        C1(newZState, defaultZLift, Z1);
                                    }
                                } else {
                                    E1(newZState, Z0, Z1, Z2, Z3);
                                }
                                break;
                            }
                            let stepping = raft.stepForward();
                            if (!stepping) {
                                // end of print before Z3 reached
                                if (Z1 > Z2) {
                                    B1(newZState, Z0, Z1, Z2);
                                    break;
                                } else {
                                    D1(newZState, Z0, Z1, Z2);
                                    break;
                                }
                            }
                            stepsForward++;
                        }
                        break;
                    }
                }
                let futureE = raft.getCurrentState().get("extrusion").totalDispensed;
                if (futureE > currentE) {
                    // extrusion before Z2 reached
                    C1(newZState, defaultZLift, Z1);
                    break;
                }
            }
            while (stepsForward > 0) {
                raft.stepBackward();
                stepsForward--;
            }
            return newZState;
        }
    }

}

module.exports = ZStateMachine;
