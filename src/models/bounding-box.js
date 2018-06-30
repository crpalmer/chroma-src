
class BoundingBox {

    constructor() {
        this.xMin = Infinity;
        this.xMax = -Infinity;
        this.yMin = Infinity;
        this.yMax = -Infinity;
        this.zMin = Infinity;
        this.zMax = -Infinity;
    }

    get x() {
        return this.xMax - this.xMin;
    }
    get y() {
        return this.yMax - this.yMin;
    }
    get z() {
        return this.zMax - this.zMin;
    }

    xInitialized() {
        return (this.xMin !== Infinity && this.xMax !== -Infinity);
    }
    yInitialized() {
        return (this.yMin !== Infinity && this.yMax !== -Infinity);
    }
    zInitialized() {
        return (this.zMin !== Infinity && this.zMax !== -Infinity);
    }

    clone() {
        let bbox = new BoundingBox();
        bbox.xMin = this.xMin;
        bbox.xMax = this.xMax;
        bbox.yMin = this.yMin;
        bbox.yMax = this.yMax;
        bbox.zMin = this.zMin;
        bbox.zMax = this.zMax;
        return bbox;
    }

    combine(other) {
        if (!(other instanceof BoundingBox)) {
            throw new Error("Invalid BoundingBox instanceprovided to BoundingBox.combine");
        }
        let bbox = new BoundingBox();
        bbox.xMin = Math.min(this.xMin, other.xMin);
        bbox.xMax = Math.max(this.xMax, other.xMax);
        bbox.yMin = Math.min(this.yMin, other.yMin);
        bbox.yMax = Math.max(this.yMax, other.yMax);
        bbox.zMin = Math.min(this.zMin, other.zMin);
        bbox.zMax = Math.max(this.zMax, other.zMax);
        return bbox;
    }

}

module.exports = BoundingBox;
