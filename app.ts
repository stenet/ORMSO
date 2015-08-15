import express = require("express");
import path = require("path");
import favicon = require("serve-favicon");
import logger = require("morgan");
import cookieParser = require("cookie-parser");
import bodyParser = require("body-parser");
import t = require("./tables");
import p = require("./lib/PublishContext");

var pubCtx = new p.PublishContext();
pubCtx.addDataModel("Geschaeftspartner", t.geschaeftspartnerModel);
pubCtx.addDataModel("Person", t.personModel);
pubCtx.addDataModel("Besuch", t.besuchModel);
pubCtx.addSyncContext("Sync", t.syncCtx);

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

app.use((req, res, next): void => {
    var err: any = new Error("Not Found");
    err.status = 404;
    next(err);
});

if (app.get("env") === "development") {
    app.use((err: any, req, res, next): void => {
        res.status(err.status || 500);
        res.render("error", {
            message: err.message,
            error: err
        });
    });
}

app.use((err: any, req, res, next): void => {
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

export = app;
