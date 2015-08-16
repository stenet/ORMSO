var express = require("express");
var PublishContext = (function () {
    function PublishContext() {
        this._router = express.Router();
    }
    PublishContext.prototype.addDataModel = function (name, dataModel) {
        this.addDataModelGet(name, dataModel);
        this.addDataModelPost(name, dataModel);
        this.addDataModelPatch(name, dataModel);
        this.addDataModelPut(name, dataModel);
    };
    PublishContext.prototype.addSyncContext = function (name, syncContext) {
        this.addSyncContextGet(name, syncContext);
    };
    PublishContext.prototype.getRouter = function () {
        return this._router;
    };
    PublishContext.prototype.addDataModelGet = function (name, dataModel) {
        this._router.get("/" + name, function (req, res) {
            var selectOptions = req.body;
            if (req.query.options) {
                selectOptions = JSON.parse(req.query.options);
            }
            dataModel.select(selectOptions)
                .then(function (r) {
                res.json(r);
            })
                .done();
        });
        this._router.get("/" + name + "/:id", function (req, res) {
            dataModel.selectById(req.params.id)
                .then(function (r) {
                res.json(r);
            })
                .done();
        });
    };
    PublishContext.prototype.addDataModelPost = function (name, dataModel) {
        this._router.post("/" + name, function (req, res) {
            dataModel.updateOrInsertAndSelect(req.body)
                .then(function (r) {
                res.json(r);
            })
                .done();
        });
    };
    PublishContext.prototype.addDataModelPatch = function (name, dataModel) {
        this._router.patch("/" + name, function (req, res) {
            dataModel.updateAndSelect(req.body)
                .then(function (r) {
                res.json(r);
            })
                .done();
        });
    };
    PublishContext.prototype.addDataModelPut = function (name, dataModel) {
        this._router.put("/" + name, function (req, res) {
            dataModel.insertAndSelect(req.body)
                .then(function (r) {
                res.json(r);
            })
                .done();
        });
    };
    PublishContext.prototype.addSyncContextGet = function (name, syncContext) {
        this._router.get("/" + name + "/start", function (req, res) {
            if (syncContext.isSyncActive()) {
                res.json("Sync already started");
            }
            else {
                syncContext.syncAll();
                res.json("Sync started");
            }
        });
        this._router.get("/" + name + "/status", function (req, res) {
            if (syncContext.isSyncActive()) {
                res.json({
                    isActive: true
                });
            }
            else {
                res.json({
                    isActive: false
                });
            }
        });
    };
    return PublishContext;
})();
exports.PublishContext = PublishContext;
//# sourceMappingURL=PublishContext.js.map