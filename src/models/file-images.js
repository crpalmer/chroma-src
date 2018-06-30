
const Jimp = require("jimp");
const Visualizer = require("../views/visualizer");

function addMakerbotImages(outRaft, callback) {

    Visualizer.resetCameraPosition();
    setTimeout(function () {
        let screenshot = Visualizer.getScreenshotBuffer();
        let imageSizes = [
            { name: "thumbnailSmall",  width: 55,  height: 40  },
            { name: "thumbnailMedium", width: 110, height: 80  },
            { name: "thumbnailLarge",  width: 320, height: 200 }
        ];
        Jimp.read(screenshot, function (err, image) {
            let doneCount = 0;
            for (let size of imageSizes) {
                let copy = image.clone();
                copy.cover(size.width, size.height);
                copy.getBuffer(Jimp.MIME_PNG, function (err, data) {
                    if (err) {
                        callback(err);
                    }
                    doneCount++;
                    outRaft.parser[size.name] = data;
                    if (doneCount === 3) {
                        callback(null, outRaft);
                    }
                });
            }
        });
    }, 0);

}

function addImageToDremelHeader(header, callback) {
    const img0Addr = 0x3A;
    const img1Addr = 0x38B0;
    Visualizer.resetCameraPosition();
    setTimeout(function () {
        let screenshot = Visualizer.getScreenshotBuffer();
        Jimp.read(screenshot, function (err, image) {
            image.cover(80, 60);
            image.getBuffer(Jimp.MIME_BMP, function (err, data) {
                if (err) {
                    callback(err);
                }
                data.copy(header, img0Addr, 0, img1Addr - img0Addr);
                callback(null, header);
            });
        });
    }, 0);
}

exports.addMakerbotImages = addMakerbotImages;
exports.addImageToDremelHeader = addImageToDremelHeader;
