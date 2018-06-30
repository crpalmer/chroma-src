
function getAppDisplayVersion(versionString) {
    let displayVersion = versionString;
    if (displayVersion.endsWith(".0")) {
        let split = displayVersion.split(".");
        split.pop();
        displayVersion = split.join(".");
    }
    return displayVersion;
}

function checkInternetConnection(callback) {
    require("dns").lookup("google.com", function (err) {
        if (err && (err.code === "ENOTFOUND" || err.code === "ECONNREFUSED")) {
            callback(false);
        } else {
            callback(true);
        }
    });
}

function contrastColorUseWhite(r, g, b) {
    let white = false;
    // calculate the perceptive luminance
    // - the human eye favors green
    let pl = 1 - (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    if (pl >= 0.5) {
        white = true;
    }
    return white;
}

const noInternetConnectionMessage = {
    message: "Could not connect to network",
    detail: "Chroma could not connect to the Internet. Please double-check your Internet connection, and consider investigating your firewall/proxy settings."
};

exports.getAppDisplayVersion = getAppDisplayVersion;
exports.checkInternetConnection = checkInternetConnection;
exports.noInternetConnectionMessage = noInternetConnectionMessage;
exports.contrastColorUseWhite = contrastColorUseWhite;
