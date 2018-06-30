(function () {

    const fs = require("fs");
    const m = require("mithril");
    const path = require("path");
    const packageJson = require("../package.json");

    const env = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "env.json"), "utf8"));
    const appVersion = packageJson.version;
    const copyright = "Copyright &copy; 2016–" + new Date().getFullYear() + " Mosaic Manufacturing Ltd.";

    const webFrame = require("electron").webFrame;
    webFrame.setZoomFactor(1);
    webFrame.setVisualZoomLevelLimits(1, 1);

    let buildName = env.displayName;

    m.render(document.getElementById("splash"), [
        m("div.splashContent", [
            m("div.splashLogo"),
            m("h1", [
                "Chroma",
                m("span.version", appVersion)
            ]),
            (buildName ? m("h2.build", buildName) : []),
            m("p.bottom", m.trust(copyright))
        ])

    ]);

    document.ondragover = document.ondrop = function (event) {
        event.preventDefault();
    };

    document.body.ondrop = function (event) {
        event.preventDefault();
    };

})();
