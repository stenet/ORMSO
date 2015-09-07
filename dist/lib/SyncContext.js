var dl = require("./DataLayer");
var dc = require("./DataContext");
var h = require("./helpers");
var q = require("q");
var request = require("request");
var moment = require("moment");
var ColDoSync = "DoSync";
var ColMarkedAsDeleted = "MarkAsDeleted";
var ColTable = "TableName";
var ColLastSync = "LastSync";
var ctx = new dc.DataContext(new dl.Sqlite3DataLayer("sync.db"));
var syncModel = ctx.createDataModel({
    name: "sync_status",
    columns: [
        { name: "Id", dataType: dl.DataTypes.int, isPrimaryKey: true, isAutoIncrement: true },
        { name: ColTable, dataType: dl.DataTypes.text },
        { name: "LastSync", dataType: dl.DataTypes.date }
    ]
});
var finalizeThen = ctx.finalizeInitialize()
    .then(function () {
    console.log("Initialize for synchronisation models done");
    return q.resolve(null);
})
    .catch(function (r) {
    console.log(r);
});
var SyncContext = (function () {
    function SyncContext() {
        this._dataModelSyncs = [];
        this._isSyncActiveAll = false;
        this._isSyncActive = false;
    }
    SyncContext.prototype.addDataModel = function (dataModel, syncOptions) {
        var dataModelSync = this.getDataModelSync(dataModel);
        if (dataModelSync) {
            throw Error("DataModel for table " + dataModel.tableInfo.table.name + " has already been added");
        }
        if (dataModel.dataContext.hasFinalizeDone()) {
            throw Error("SyncContext configuration should be done before DataContext.finalizeInitialize");
        }
        this._dataModelSyncs.push({
            dataModel: dataModel,
            syncOptions: syncOptions
        });
        this.alterTable(dataModel);
    };
    SyncContext.prototype.isSyncActive = function () {
        return this._isSyncActive || this._isSyncActiveAll;
    };
    SyncContext.prototype.sync = function (dataModel) {
        var _this = this;
        if (this._isSyncActive) {
            throw Error("Sync already started");
        }
        this._isSyncActive = true;
        var dataModelSync = this.getDataModelSync(dataModel);
        if (!dataModelSync) {
            throw Error("DataModel for table " + dataModel.tableInfo.table.name + " is not configured for sync");
        }
        var syncStart = new Date();
        return finalizeThen
            .then(function () {
            return _this.postData(dataModelSync);
        })
            .then(function () {
            return _this.getLoadUrl(dataModelSync);
        })
            .then(function (r) {
            return _this.loadData(r);
        })
            .then(function (r) {
            return _this.saveData(dataModelSync, r);
        })
            .then(function () {
            return _this.saveSyncState(dataModelSync, syncStart);
        })
            .then(function () {
            _this._isSyncActive = false;
            return q.resolve(null);
        })
            .catch(function (r) {
            console.log(r);
            _this._isSyncActive = false;
            return q.resolve(null);
        });
    };
    SyncContext.prototype.syncAll = function () {
        var _this = this;
        if (this._isSyncActiveAll) {
            throw Error("Sync already started");
        }
        this._isSyncActiveAll = true;
        return h.Helpers.qSequential(this._dataModelSyncs, function (item) {
            return _this.sync(item.dataModel);
        })
            .then(function () {
            _this._isSyncActiveAll = false;
            return q.resolve(null);
        })
            .catch(function (r) {
            _this._isSyncActiveAll = false;
            console.log(r);
            return q.resolve(null);
        });
    };
    SyncContext.prototype.alterTable = function (dataModel) {
        dataModel.tableInfo.table.columns.push({
            name: ColDoSync,
            dataType: dl.DataTypes.bool,
            defaultValue: false
        });
        dataModel.tableInfo.table.columns.push({
            name: ColMarkedAsDeleted,
            dataType: dl.DataTypes.bool,
            defaultValue: false
        });
        dataModel.appendFixedWhere([ColMarkedAsDeleted, false]);
        dataModel.onBeforeInsert(this.checkSyncState);
        dataModel.onBeforeUpdate(this.checkSyncState);
        dataModel.onBeforeDelete(function (args) {
            args.item[ColMarkedAsDeleted] = true;
            args.cancel = true;
            return dataModel.update(args.item);
        });
    };
    SyncContext.prototype.getDataModelSync = function (dataModel) {
        var items = this._dataModelSyncs.filter(function (item) {
            return item.dataModel === dataModel;
        });
        if (items.length === 0) {
            return null;
        }
        return items[0];
    };
    SyncContext.prototype.getLoadUrl = function (dataModelSync) {
        return syncModel.select({
            where: [ColTable, dataModelSync.dataModel.tableInfo.table.name]
        })
            .then(function (r) {
            var loadUrl = dataModelSync.syncOptions.loadUrl;
            if (r.length > 0) {
                if (loadUrl.indexOf("?") > 0) {
                    loadUrl += "&";
                }
                else {
                    loadUrl += "?";
                }
                return q.resolve(loadUrl + "changedSince=" + encodeURIComponent(moment(r[0].LastSync).format()));
            }
            else {
                return q.resolve(loadUrl);
            }
        });
    };
    SyncContext.prototype.loadData = function (url) {
        var def = q.defer();
        request(url, function (err, res, body) {
            if (err) {
                def.reject(err);
            }
            else {
                var result = JSON.parse(body);
                if (!Array.isArray(result)) {
                    result = [result];
                }
                def.resolve(result);
            }
        });
        return def.promise;
    };
    SyncContext.prototype.saveData = function (dataModelSync, rows) {
        var _this = this;
        return h.Helpers.qSequential(rows, function (row) {
            var where = [dataModelSync.syncOptions.serverPrimaryKey.name, row[dataModelSync.syncOptions.serverPrimaryKey.name]];
            return dataModelSync.dataModel.select({
                where: where
            })
                .then(function (r) {
                return _this.executeTrigger(dataModelSync, "onSyncFromServerBeforeSave", row);
            })
                .then(function (r) {
                row._isSyncActive = true;
                if (r.length === 1) {
                    return dataModelSync.dataModel.updateItems(row, where);
                }
                else {
                    return dataModelSync.dataModel.insert(row);
                }
            })
                .then(function (r) {
                return _this.executeTrigger(dataModelSync, "onSyncFromServerAfterSave", row);
            })
                .then(function () {
                delete row._isSyncActive;
                return q.resolve(null);
            });
        });
    };
    SyncContext.prototype.postData = function (dataModelSync) {
        var _this = this;
        if (!dataModelSync.syncOptions.postUrl) {
            return q.resolve(null);
        }
        var selectOptions = {
            where: [ColDoSync, true]
        };
        return dataModelSync
            .dataModel
            .select(selectOptions)
            .then(function (r) {
            return h.Helpers.qSequential(r, function (item) {
                return _this.postDataToServer(dataModelSync, item);
            });
        });
    };
    SyncContext.prototype.postDataToServer = function (dataModelSync, data) {
        var _this = this;
        var def = q.defer();
        var method = data[ColMarkedAsDeleted] == true
            ? "DELETE"
            : "POST";
        request({
            method: "POST",
            url: dataModelSync.syncOptions.postUrl,
            body: JSON.stringify(data)
        }, function (err, res, body) {
            if (err) {
                def.resolve(err);
                return;
            }
            body = JSON.parse(body);
            body[dataModelSync.dataModel.tableInfo.primaryKey.name] = data[dataModelSync.dataModel.tableInfo.primaryKey.name];
            body[ColDoSync] = false;
            body._isSyncActive = true;
            dataModelSync
                .dataModel
                .updateAndSelect(body)
                .then(function (r) {
                return _this.executeTrigger(dataModelSync, "onSyncToServerAfterSave", r);
            })
                .then(function (r) {
                def.resolve(true);
            })
                .catch(function (r) {
                def.reject(r);
            });
        });
        return def.promise;
    };
    SyncContext.prototype.executeTrigger = function (dataModelSync, triggerName, row) {
        if (!dataModelSync.syncOptions[triggerName]) {
            return q.resolve(row);
        }
        var promise = dataModelSync.syncOptions[triggerName](row);
        return promise
            .then(function () {
            return row;
        });
    };
    SyncContext.prototype.saveSyncState = function (dataModelSync, date) {
        return syncModel.select({
            where: [ColTable, dataModelSync.dataModel.tableInfo.table.name]
        })
            .then(function (r) {
            if (r.length === 1) {
                var item = r[0];
                item[ColLastSync] = date;
                return syncModel.update(item);
            }
            else {
                var item = {};
                item[ColTable] = dataModelSync.dataModel.tableInfo.table.name;
                item[ColLastSync] = date;
                return syncModel.insert(item);
            }
        });
    };
    SyncContext.prototype.checkSyncState = function (args) {
        if (args.item._isSyncActive) {
            args.item[ColDoSync] = false;
        }
        else {
            args.item[ColDoSync] = true;
        }
        return q.resolve(null);
    };
    return SyncContext;
})();
exports.SyncContext = SyncContext;
//# sourceMappingURL=SyncContext.js.map