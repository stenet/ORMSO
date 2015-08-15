var express = require("express");
var path = require("path");
var logger = require("morgan");
var cookieParser = require("cookie-parser");
var bodyParser = require("body-parser");
var t = require("./tables");
var p = require("./lib/PublishContext");
var pubCtx = new p.PublishContext();
pubCtx.addDataModel("Geschaeftspartner", t.geschaeftspartnerModel);
pubCtx.addDataModel("Person", t.personModel);
pubCtx.addDataModel("Besuch", t.besuchModel);
var app = express();
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "jade");
//app.use(favicon(path.join(__dirname, "public", "favicon.ico")));
app.use(logger("dev"));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));
app.use("/api", pubCtx.getRouter());
app.use(function (req, res, next) {
    var err = new Error("Not Found");
    err.status = 404;
    next(err);
});
if (app.get("env") === "development") {
    app.use(function (err, req, res, next) {
        res.status(err.status || 500);
        res.render("error", {
            message: err.message,
            error: err
        });
    });
}
app.use(function (err, req, res, next) {
    res.status(err.status || 500);
    res.render("error", {
        message: err.message,
        error: {}
    });
});
var server = app.listen(3000, function () {
    var host = server.address().address;
    var port = server.address().port;
    console.log("App listening at http://%s:%s", host, port);
});
module.exports = app;
//# sourceMappingURL=app.js.map