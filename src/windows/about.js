(function () {

    const m = require("mithril");
    const packageJson = require("../package.json");

    const env = JSON.parse(require("fs").readFileSync(require("path").join(__dirname, "..", "env.json"), "utf8"));
    const appVersion = packageJson.version;
    const gpxVersion = "2.5.2";
    const copyright = "Copyright &copy; 2016–" + new Date().getFullYear() + " Mosaic Manufacturing Ltd.";

    const webFrame = require("electron").webFrame;
    webFrame.setZoomFactor(1);
    webFrame.setVisualZoomLevelLimits(1, 1);

    function versionGTE(version, target) {
        let versionSplit = version.split(".");
        let targetSplit = target.split(".");
        if (versionSplit.length < targetSplit.length) {
            for (let i = 0; i < targetSplit.length - versionSplit.length; i++) {
                versionSplit.push("0");
            }
        }
        for (let i = 0; i < targetSplit.length; i++) {
            if (versionSplit[i] > targetSplit[i]) {
                return true;
            }
            if (versionSplit[i] < targetSplit[i]) {
                return false;
            }
        }
        return true;
    }

    let osPrettyName = "";
    if (process.platform === "darwin") {
        osPrettyName = versionGTE(require("os").release(), "16.0.0") ? "macOS" : "Mac OS X";
    } else if (process.platform === "linux") {
        osPrettyName = "Linux";
    } else {
        osPrettyName = "Windows (" + (process.arch === "x64" ? "64" : "32") + "-bit)";
    }

    let buildName = env.displayName;

    let contributors = [
        {name: "Brandon Bloch",  thumbnail: "brandon-bloch.png"},
        {name: "Bobby Wood",     thumbnail: "bobby-wood.jpg"},
        {name: "Derek Vogt",     thumbnail: "derek-vogt.png"},
        {name: "Jon Lim",        thumbnail: "jon-lim.png"},
        {name: "Tom Kittner",    thumbnail: "tom-kittner.png"},
    ];

    let specialThanks = [
        "Jetguy",
        "Michael Hackney"
    ];

    m.render(document.getElementById("about"), [
        m("div.aboutContent", [
            m("div.aboutLogo"),
            m("h1", [
                "Chroma",
                m("span.version", appVersion)
            ]),
            (buildName ? m("h3.build", buildName) : []),
            m("p", m.trust(copyright)),
            m("table", [
                m("tbody", [
                    m("tr", [
                        m("th", "Platform"),
                        m("td", osPrettyName)
                    ]),
                    m("tr", [
                        m("th", "GPX version"),
                        m("td", gpxVersion)
                    ]),
                    m("tr", [
                        m("th", "Contributors"),
                        m("td", [
                            m("ul", contributors.map(function (person) {
                                if (person.thumbnail) {
                                    return m("li.contributor.contributorThumbnail", {
                                        style: {
                                            "background-image": "url('../assets/contributors/" + person.thumbnail + "')"
                                        }
                                    }, person.name);
                                }
                                return m("li.contributor", person.name);
                            }))
                        ])
                    ]),
                    m("tr", [
                        m("th", "Special Thanks"),
                        m("td", [
                            m("ul", specialThanks.map(function (person) {
                                return m("li.specialThanks", person);
                            }))
                        ])
                    ])
                ])
            ])
        ])
    ]);

    document.ondragover = document.ondrop = function (event) {
        event.preventDefault();
    };

    document.body.ondrop = function (event) {
        event.preventDefault();
    };

})();
