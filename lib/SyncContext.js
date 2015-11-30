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
        this._currentSelectOptions = null;
        this._header = {};
        this._cookies = request.jar();
        this._syncStatus = "";
        this.getCurrentServerDate = function () {
            return q.resolve(new Date());
        };
    }
    SyncContext.prototype.addDataModel = function (dataModel, syncOptions) {
        var dataModelSync = this.getDataModelSync(dataModel);
        if (dataModelSync) {
            throw Error("DataModel for table " + dataModel.tableInfo.table.name + " has already been added");
        }
        if (dataModel.dataContext.hasFinalizeDone()) {
            throw Error("SyncContext configuration should be done before DataContext.finalizeInitialize");
        }
        dataModelSync = {
            dataModel: dataModel,
            syncOptions: syncOptions
        };
        this._dataModelSyncs.push(dataModelSync);
        this.alterTable(dataModelSync);
    };
    SyncContext.prototype.addRequestHeader = function (header) {
        h.Helpers.extend(this._header, header);
    };
    SyncContext.prototype.isSyncActive = function () {
        return this._isSyncActive || this._isSyncActiveAll;
    };
    SyncContext.prototype.getSyncStatus = function () {
        return this._syncStatus;
    };
    SyncContext.prototype.sync = function (dataModel, getOptions) {
        var _this = this;
        if (this._isSyncActive) {
            throw Error("Sync already started");
        }
        var dataModelSync = this.getDataModelSync(dataModel);
        if (!dataModelSync) {
            throw Error("DataModel for table " + dataModel.tableInfo.table.name + " is not configured for sync");
        }
        if (!getOptions
            && dataModelSync.lastSync
            && dataModelSync.syncOptions.maxSyncIntervalMinutes
            && moment(dataModelSync.lastSync).add(dataModelSync.syncOptions.maxSyncIntervalMinutes, "m").toDate() > new Date()) {
            return;
        }
        this._isSyncActive = true;
        var syncStart = null;
        return finalizeThen
            .then(function () {
            return _this.getCurrentServerDate();
        })
            .then(function (currentDate) {
            syncStart = currentDate;
            return _this.getLastSync(dataModelSync);
        })
            .then(function () {
            _this._syncStatus = "Speichere " + dataModelSync.dataModel.tableInfo.table.name;
            return _this.postData(dataModelSync);
        })
            .then(function () {
            return _this.getLoadUrl(dataModelSync, getOptions);
        })
            .then(function (r) {
            var selectOptions = null;
            if (dataModelSync.lastSync) {
                selectOptions = {
                    "selectDeleted": true
                };
            }
            return _this.loadData(r, selectOptions);
        })
            .then(function (r) {
            return _this.saveData(dataModelSync, r);
        })
            .then(function () {
            return _this.updateClientIds(dataModelSync);
        })
            .then(function () {
            if (getOptions) {
                return q.resolve(null);
            }
            else {
                dataModelSync.lastSync = syncStart;
                return _this.saveSyncState(dataModelSync, syncStart);
            }
        })
            .then(function () {
            _this._syncStatus = "";
            _this._isSyncActive = false;
            return q.resolve(null);
        })
            .catch(function (r) {
            _this._syncStatus = "Fehler bei Synchronisierung";
            console.log(r);
            _this._isSyncActive = false;
            return q.resolve(null);
        });
    };
    SyncContext.prototype.syncAll = function (checkSyncBlock) {
        var _this = this;
        if (this._isSyncActiveAll) {
            throw Error("Sync already started");
        }
        if (checkSyncBlock && this.blockSyncUntil && this.blockSyncUntil > new Date()) {
            return q.resolve(null);
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
    SyncContext.prototype.alterTable = function (dataModelSync) {
        var _this = this;
        var dataModel = dataModelSync.dataModel;
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
        dataModel.registerAdditionalWhere(function (selectOptions) {
            if (_this._isSyncActive && _this._currentSelectOptions == selectOptions) {
                return null;
            }
            return [ColMarkedAsDeleted, false];
        });
        dataModel.onBeforeInsert(function (args) { return _this.checkSyncState(dataModelSync, args); });
        dataModel.onBeforeUpdate(function (args) { return _this.checkSyncState(dataModelSync, args); });
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
    SyncContext.prototype.getLoadUrl = function (dataModelSync, getOptions) {
        return syncModel.select({
            where: [ColTable, dataModelSync.dataModel.tableInfo.table.name]
        })
            .then(function (r) {
            var loadUrl = dataModelSync.syncOptions.loadUrl;
            if (getOptions) {
                if (loadUrl.indexOf("?") > 0) {
                    loadUrl += "&";
                }
                else {
                    loadUrl += "?";
                }
                return q.resolve(loadUrl + getOptions);
            }
            else if (r.length > 0) {
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
    SyncContext.prototype.getLastSync = function (dataModelSync) {
        return syncModel.select({
            where: [ColTable, dataModelSync.dataModel.tableInfo.table.name]
        })
            .then(function (r) {
            if (r && r.length > 0) {
                dataModelSync.lastSync = r[0].LastSync;
            }
            return q.resolve(null);
        });
    };
    SyncContext.prototype.loadData = function (url, selectOptions) {
        var def = q.defer();
        request(this.getRequestOptions(url, null, null, selectOptions), function (err, res, body) {
            if (err) {
                def.reject(err);
            }
            else if (!h.Helpers.wasRequestSuccessful(res)) {
                def.reject(h.Helpers.getRequestError(res));
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
        var index = 0;
        return h.Helpers.qSequential(rows, function (row) {
            index++;
            _this._syncStatus = "Lade " + dataModelSync.dataModel.tableInfo.table.name + " (" + index + "/" + rows.length + ")";
            row._isSyncFromServer = true;
            var where = [dataModelSync.syncOptions.serverPrimaryKey.name, row[dataModelSync.syncOptions.serverPrimaryKey.name]];
            return _this.rowExists(dataModelSync, where)
                .then(function (r) {
                return _this
                    .executeTrigger(dataModelSync, "onSyncFromServerBeforeSave", row)
                    .then(function () {
                    return _this.onSyncFromServerBeforeSave(dataModelSync, row);
                })
                    .then(function () {
                    return q.resolve(r);
                });
            })
                .then(function (r) {
                if (r) {
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
                return _this.onSyncFromServerAfterSave(dataModelSync, row);
            })
                .then(function () {
                delete row._isSyncFromServer;
                return q.resolve(null);
            });
        });
    };
    SyncContext.prototype.rowExists = function (dataModelSync, where) {
        if (!dataModelSync.lastSync) {
            return q.resolve(false);
        }
        return dataModelSync.dataModel.select({
            where: where
        })
            .then(function (r) {
            return q.resolve(r && r.length > 0);
        });
    };
    SyncContext.prototype.updateClientIds = function (dataModelSync) {
        var _this = this;
        if (dataModelSync.lastSync) {
            return q.resolve(null);
        }
        return h.Helpers.qSequential(dataModelSync.syncOptions.serverClientMappings, function (mapping) {
            var serverColumn = dataModelSync.dataModel.getColumn(mapping.columnServer);
            var clientColumn = dataModelSync.dataModel.getColumn(mapping.columnClient);
            var parentDataModel = dataModelSync.dataModel.dataContext.getDataModel(clientColumn.relation.parentTable);
            var parentDataModelSync = _this.getDataModelSync(parentDataModel);
            var stmt = "update " + dataModelSync.dataModel.tableInfo.table.name
                + " set " + clientColumn.name
                + " = (select " + parentDataModel.tableInfo.primaryKey.name
                + " from " + parentDataModel.tableInfo.table.name
                + " where " + parentDataModelSync.syncOptions.primaryKeyServerClientMapping.columnServer
                + " = "
                + dataModelSync.dataModel.tableInfo.table.name + "." + serverColumn.name + ")";
            return dataModelSync.dataModel.getDataLayer().executeNonQuery(stmt);
        });
    };
    SyncContext.prototype.onSyncFromServerBeforeSave = function (dataModelSync, row) {
        var _this = this;
        if (!dataModelSync.lastSync) {
            return q.resolve(null);
        }
        if (!dataModelSync.syncOptions.serverClientMappings) {
            return q.resolve(null);
        }
        return h.Helpers.qSequential(dataModelSync.syncOptions.serverClientMappings, function (mapping) {
            var column = dataModelSync.dataModel.getColumn(mapping.columnClient);
            if (!column) {
                q.reject("Column " + column + " not found");
            }
            else if (!column.relation) {
                q.reject("Column " + column + " needs a relation");
            }
            var parentDataModel = dataModelSync.dataModel.dataContext.getDataModel(column.relation.parentTable);
            var parentSyncContext = _this.getDataModelSync(parentDataModel);
            return parentDataModel
                .select({
                where: [parentSyncContext.syncOptions.primaryKeyServerClientMapping.columnServer, row[mapping.columnServer]]
            })
                .then(function (r) {
                if (r.length == 0) {
                    return q.resolve(null);
                }
                row[mapping.columnClient] = r[0][parentSyncContext.syncOptions.primaryKeyServerClientMapping.columnClient];
                return q.resolve(null);
            });
        });
    };
    SyncContext.prototype.onSyncFromServerAfterSave = function (dataModelSync, row) {
        var _this = this;
        if (!dataModelSync.lastSync) {
            return q.resolve(null);
        }
        return h.Helpers.qSequential(dataModelSync.dataModel.tableInfo.relationsToChild, function (relationInfo) {
            var childDataModel = dataModelSync.dataModel.dataContext.getDataModel(relationInfo.childTableInfo.table);
            var childSyncContext = _this.getDataModelSync(childDataModel);
            var relationClientColumns = childSyncContext.syncOptions.serverClientMappings.filter(function (column) {
                return column.columnClient === relationInfo.childColumn.name;
            });
            if (relationClientColumns.length === 0) {
                return q.resolve(null);
            }
            var relationClientColumn = relationClientColumns[0];
            return childDataModel
                .select({
                where: [relationClientColumn.columnServer, row[dataModelSync.syncOptions.primaryKeyServerClientMapping.columnServer]]
            })
                .then(function (r) {
                return h.Helpers.qSequential(r, function (item) {
                    item[relationClientColumn.columnClient] = row[dataModelSync.syncOptions.primaryKeyServerClientMapping.columnClient];
                    item._isConstraintAdapting = true;
                    return childDataModel.update(item);
                });
            });
        });
    };
    SyncContext.prototype.onSyncToServerAfterSave = function (dataModelSync, row) {
        var _this = this;
        return h.Helpers.qSequential(dataModelSync.dataModel.tableInfo.relationsToChild, function (relationInfo) {
            var childDataModel = dataModelSync.dataModel.dataContext.getDataModel(relationInfo.childTableInfo.table);
            var childSyncContext = _this.getDataModelSync(childDataModel);
            var relationClientColumns = childSyncContext.syncOptions.serverClientMappings.filter(function (column) {
                return column.columnClient === relationInfo.childColumn.name;
            });
            if (relationClientColumns.length === 0) {
                return q.resolve(null);
            }
            var relationClientColumn = relationClientColumns[0];
            return childDataModel
                .select({
                where: [relationClientColumn.columnClient, row[dataModelSync.syncOptions.primaryKeyServerClientMapping.columnClient]]
            })
                .then(function (r) {
                return h.Helpers.qSequential(r, function (item) {
                    item[relationClientColumn.columnServer] = row[dataModelSync.syncOptions.primaryKeyServerClientMapping.columnServer];
                    item._isConstraintAdapting = true;
                    return childDataModel.update(item);
                });
            });
        });
    };
    SyncContext.prototype.onSaving = function (dataModelSync, row) {
        var _this = this;
        if (row._isSyncFromServer) {
            return q.resolve(null);
        }
        if (!dataModelSync.syncOptions.serverClientMappings) {
            return q.resolve(null);
        }
        return h.Helpers.qSequential(dataModelSync.syncOptions.serverClientMappings, function (mapping) {
            var column = dataModelSync.dataModel.getColumn(mapping.columnClient);
            if (!column) {
                q.reject("Column " + column + " not found");
            }
            else if (!column.relation) {
                q.reject("Column " + column + " needs a relation");
            }
            var parentDataModel = dataModelSync.dataModel.dataContext.getDataModel(column.relation.parentTable);
            var parentSyncContext = _this.getDataModelSync(parentDataModel);
            return parentDataModel
                .select({
                where: [parentSyncContext.syncOptions.primaryKeyServerClientMapping.columnClient, row[mapping.columnClient]]
            })
                .then(function (r) {
                if (r.length == 0) {
                    return q.resolve(null);
                }
                row[mapping.columnServer] = r[0][parentSyncContext.syncOptions.primaryKeyServerClientMapping.columnServer];
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
        this._currentSelectOptions = selectOptions;
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
        var isDeleted = data[ColMarkedAsDeleted] == true;
        var method = isDeleted
            ? "DELETE"
            : "POST";
        if (isDeleted && !data[dataModelSync.syncOptions.serverPrimaryKey.name]) {
            def.resolve(true);
            return;
        }
        var url = isDeleted
            ? dataModelSync.syncOptions.postUrl + "/" + data[dataModelSync.syncOptions.serverPrimaryKey.name]
            : dataModelSync.syncOptions.postUrl;
        var body = isDeleted
            ? null
            : JSON.stringify(data);
        request(this.getRequestOptions(url, method, body), function (err, res, r) {
            if (err) {
                def.resolve(err);
                return;
            }
            else if (!h.Helpers.wasRequestSuccessful(res)) {
                def.reject(h.Helpers.getRequestError(res));
                return;
            }
            if (r) {
                r = JSON.parse(r);
            }
            else {
                r = data;
            }
            r[dataModelSync.dataModel.tableInfo.primaryKey.name] = data[dataModelSync.dataModel.tableInfo.primaryKey.name];
            r[ColDoSync] = false;
            r._isSyncToServer = true;
            dataModelSync
                .dataModel
                .updateAndSelect(r)
                .then(function (r) {
                return _this.executeTrigger(dataModelSync, "onSyncToServerAfterSave", r);
            })
                .then(function () {
                return _this.onSyncToServerAfterSave(dataModelSync, r);
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
    SyncContext.prototype.checkSyncState = function (dataModelSync, args) {
        if (!args.item._isConstraintAdapting) {
            if (args.item._isSyncFromServer || args.item._isSyncToServer) {
                args.item[ColDoSync] = false;
            }
            else {
                args.item[ColDoSync] = true;
            }
            if (args.item.__IsDeleted) {
                args.item[ColMarkedAsDeleted] = true;
            }
        }
        return this.onSaving(dataModelSync, args.item);
    };
    SyncContext.prototype.getRequestOptions = function (url, method, body, selectOptions) {
        var header = {};
        h.Helpers.extend(header, this._header);
        if (selectOptions) {
            header["X-Get-Options"] = JSON.stringify(selectOptions);
        }
        return {
            method: method || "GET",
            url: url,
            body: body,
            headers: header,
            jar: this._cookies
        };
    };
    return SyncContext;
})();
exports.SyncContext = SyncContext;
//# sourceMappingURL=SyncContext.js.map