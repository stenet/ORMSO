"use strict";
var express = require("express");
var q = require("q");
var moment = require("moment");
var PublishContext = (function () {
    function PublishContext() {
        this._router = express.Router();
    }
    PublishContext.prototype.addDataModel = function (name, dataModel) {
        this.addDataModelGet(name, dataModel);
        this.addDataModelPost(name, dataModel);
        this.addDataModelPatch(name, dataModel);
        this.addDataModelPut(name, dataModel);
        this.addDataModelDelete(name, dataModel);
    };
    PublishContext.prototype.addSyncContext = function (name, syncContext) {
        this.addSyncContextGet(name, syncContext);
    };
    PublishContext.prototype.getRouter = function () {
        return this._router;
    };
    PublishContext.prototype.addDataModelGet = function (name, dataModel) {
        var _this = this;
        this._router.get("/" + name, function (req, res) {
            var selectOptions = _this.getSelectOptions(req);
            dataModel.select(selectOptions || {})
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
        var _this = this;
        this._router.post("/" + name, function (req, res) {
            dataModel.updateOrInsertAndSelect(req.body)
                .then(function (r) {
                var selectOptions = _this.getSelectOptions(req);
                if (r && selectOptions && r[dataModel.tableInfo.primaryKey.name]) {
                    selectOptions.where = [dataModel.tableInfo.primaryKey.name, r[dataModel.tableInfo.primaryKey.name]];
                    return dataModel.select(selectOptions);
                }
                else {
                    return q.resolve(r);
                }
            })
                .then(function (r) {
                if (Array.isArray(r)) {
                    var arr = r;
                    if (arr.length > 0) {
                        res.json(arr[0]);
                    }
                    else {
                        res.json(r);
                    }
                }
                else {
                    res.json(r);
                }
            })
                .done();
        });
    };
    PublishContext.prototype.addDataModelPatch = function (name, dataModel) {
        var _this = this;
        this._router.patch("/" + name, function (req, res) {
            dataModel.updateAndSelect(req.body)
                .then(function (r) {
                var selectOptions = _this.getSelectOptions(req);
                if (r && selectOptions && r[dataModel.tableInfo.primaryKey.name]) {
                    selectOptions.where = [dataModel.tableInfo.primaryKey.name, r[dataModel.tableInfo.primaryKey.name]];
                    return dataModel.select(selectOptions);
                }
                else {
                    return q.resolve(r);
                }
            })
                .then(function (r) {
                if (Array.isArray(r)) {
                    var arr = r;
                    if (arr.length > 0) {
                        res.json(arr[0]);
                    }
                    else {
                        res.json(r);
                    }
                }
                else {
                    res.json(r);
                }
            })
                .done();
        });
    };
    PublishContext.prototype.addDataModelPut = function (name, dataModel) {
        var _this = this;
        this._router.put("/" + name, function (req, res) {
            dataModel.insertAndSelect(req.body)
                .then(function (r) {
                var selectOptions = _this.getSelectOptions(req);
                if (r && selectOptions && r[dataModel.tableInfo.primaryKey.name]) {
                    selectOptions.where = [dataModel.tableInfo.primaryKey.name, r[dataModel.tableInfo.primaryKey.name]];
                    return dataModel.select(selectOptions);
                }
                else {
                    return q.resolve(r);
                }
            })
                .then(function (r) {
                if (Array.isArray(r)) {
                    var arr = r;
                    if (arr.length > 0) {
                        res.json(arr[0]);
                    }
                    else {
                        res.json(r);
                    }
                }
                else {
                    res.json(r);
                }
            })
                .done();
        });
    };
    PublishContext.prototype.addDataModelDelete = function (name, dataModel) {
        this._router.delete("/" + name + "/:id", function (req, res) {
            dataModel.selectById(req.params.id)
                .then(function (r) {
                if (r) {
                    dataModel.delete(r)
                        .then(function () {
                        res.json({
                            status: "Item has been deleted"
                        });
                    });
                }
                else {
                    res.status(404);
                    res.json({
                        status: "Item was not found"
                    });
                }
            })
                .done();
        });
    };
    PublishContext.prototype.getSelectOptions = function (req) {
        var selectOptions = null;
        if (req.header("X-Get-Options")) {
            selectOptions = JSON.parse(req.header("X-Get-Options"));
        }
        if (req.query.options) {
            selectOptions = JSON.parse(req.query.options);
        }
        return selectOptions;
    };
    PublishContext.prototype.addSyncContextGet = function (name, syncContext) {
        this._router.get("/" + name + "/start", function (req, res) {
            if (syncContext.isSyncActive()) {
                res.json({
                    status: "Sync already has been started"
                });
            }
            else {
                syncContext.syncAll();
                res.json({
                    status: "Sync has been started"
                });
            }
        });
        this._router.get("/" + name + "/status", function (req, res) {
            if (req.query.blockSyncMinutes) {
                syncContext.blockSyncUntil = moment().add(req.query.blockSyncMinutes, "minutes").toDate();
            }
            if (syncContext.isSyncActive()) {
                res.json({
                    isActive: true,
                    text: syncContext.getSyncStatus()
                });
            }
            else {
                res.json({
                    isActive: false,
                    text: syncContext.getSyncStatus()
                });
            }
        });
    };
    return PublishContext;
})();
exports.PublishContext = PublishContext;
//# sourceMappingURL=PublishContext.js.map