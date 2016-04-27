"use strict";
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
var syncLogModel = ctx.createDataModel({
    name: "sync_log_status",
    columns: [
        { name: "Id", dataType: dl.DataTypes.int, isPrimaryKey: true },
        { name: "LastId", dataType: dl.DataTypes.int },
        { name: "LastSync", dataType: dl.DataTypes.date }
    ]
});
var finalizeThen = ctx.finalizeInitialize()
    .then(function () {
    return syncLogModel
        .selectById(1)
        .then(function (r) {
        if (r) {
            return q.resolve(true);
        }
        else {
            return syncLogModel.updateOrInsert({ Id: 1, LastId: 0, LastSync: new Date() });
        }
    });
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
        var _this = this;
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
        dataModel.onUpdateSchema(function (args) {
            return _this.resetDataModelSyncState(dataModel);
        });
        this._dataModelSyncs.push(dataModelSync);
        this.alterTable(dataModelSync);
    };
    SyncContext.prototype.addRequestHeader = function (header) {
        h.Helpers.extend(this._header, header);
    };
    SyncContext.prototype.resetDataModelSyncState = function (dataModel) {
        var dataModelSync = this.getDataModelSync(dataModel);
        if (!dataModelSync) {
            return;
        }
        return this.saveSyncState(dataModelSync, null);
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
            if (_this.canGetSync(dataModelSync)) {
                return _this.getLoadUrl(dataModelSync, getOptions);
            }
            else {
                return q.resolve("");
            }
        })
            .then(function (r) {
            if (_this.canGetSync(dataModelSync)) {
                var selectOptions = null;
                if (dataModelSync.lastSync) {
                    selectOptions = {
                        "selectDeleted": true
                    };
                }
                return _this.loadData(r, selectOptions);
            }
            else {
                return q.resolve([]);
            }
        })
            .then(function (r) {
            if (_this.canGetSync(dataModelSync)) {
                return _this.saveData(dataModelSync, r);
            }
            else {
                return q.resolve(true);
            }
        })
            .then(function () {
            if (_this.canGetSync(dataModelSync)) {
                return _this.updateClientIds(dataModelSync);
            }
            else {
                return q.resolve(true);
            }
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
    SyncContext.prototype.syncLogModel = function () {
        var _this = this;
        if (!this.syncLogUrl) {
            return q.resolve(true);
        }
        else {
            return syncLogModel
                .selectById(1)
                .then(function (r) {
                if (r.LastId == 0) {
                    var def = q.defer();
                    request(_this.getRequestOptions(_this.maxLogIdUrl, null, null, null), function (err, res, body) {
                        if (err) {
                            def.reject(err);
                        }
                        else if (!h.Helpers.wasRequestSuccessful(res)) {
                            def.reject(h.Helpers.getRequestError(res));
                        }
                        else {
                            r.LastId = body;
                            syncLogModel
                                .update(r)
                                .then(function () {
                                def.resolve(r);
                            })
                                .catch(function (x) {
                                def.reject(x);
                            });
                        }
                    });
                    return def.promise;
                }
                else {
                    return q.resolve(r);
                }
            })
                .then(function (r) {
                var def = q.defer();
                var url = _this.syncLogUrl + "?take=500&lastId=" + r.LastId;
                request(_this.getRequestOptions(url, null, null, null), function (err, res, body) {
                    if (err) {
                        def.reject(err);
                    }
                    else if (!h.Helpers.wasRequestSuccessful(res)) {
                        def.reject(h.Helpers.getRequestError(res));
                    }
                    else {
                        def.resolve(JSON.parse(body));
                    }
                });
                return def.promise;
            })
                .then(function (r) {
                return h.Helpers.qSequential(r, function (item) {
                    _this._syncStatus = "Bearbeite Log " + item.Id;
                    return _this.doSyncLog(item)
                        .then(function () {
                        return syncLogModel.selectById(1)
                            .then(function (r) {
                            r.LastId = item.Id;
                            r.LastSync = new Date();
                            return syncLogModel.update(r);
                        });
                    });
                });
            })
                .then(function () {
                _this._syncStatus = "";
                return q.resolve(true);
            });
        }
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
            return _this.syncLogModel();
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
    SyncContext.prototype.getDataModel = function (tableName) {
        var results = this._dataModelSyncs.filter(function (item) {
            return item.dataModel.tableInfo.table.name == tableName;
        });
        if (results.length == 1) {
            return results[0].dataModel;
        }
        else {
            return null;
        }
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
            else {
                dataModelSync.lastSync = null;
            }
            return q.resolve(null);
        });
    };
    SyncContext.prototype.canGetSync = function (dataModelSync) {
        return !dataModelSync.syncOptions.onlySyncOnNewDatabase || !dataModelSync.lastSync;
    };
    SyncContext.prototype.doSyncLog = function (item) {
        var _this = this;
        var dataModel = this.getDataModel(item.TableName);
        if (!dataModel) {
            return q.resolve(true);
        }
        if (item.ChangeType == 0) {
            if (!item.Data) {
                return q.resolve(true);
            }
            var dataModelSync = this.getDataModelSync(dataModel);
            return this
                .saveData(dataModelSync, [JSON.parse(item.Data)])
                .then(function () {
                return _this.updateClientIds(dataModelSync);
            });
        }
        else if (item.ChangeType == 1) {
            var dataModelSync = this.getDataModelSync(dataModel);
            var selectOptions = {
                where: [dataModelSync.syncOptions.serverPrimaryKey.name, item.Key]
            };
            return dataModel
                .select(selectOptions)
                .then(function (r) {
                if (r && r.length > 0) {
                    r.forEach(function (item) {
                        item.__IsDeleted = true;
                    });
                    return _this.saveData(dataModelSync, r);
                }
                else {
                    return q.resolve(true);
                }
            });
        }
        else if (item.ChangeType == 2) {
            return dataModel.dataContext.dataLayer
                .executeNonQuery("delete from " + dataModel.tableInfo.table.name)
                .then(function () {
                return syncModel.select({
                    where: [ColTable, dataModel.tableInfo.table.name]
                }).then(function (r) {
                    if (!r || r.length == 0) {
                        return q.resolve(true);
                    }
                    else {
                        return syncModel.delete(r[0]);
                    }
                });
            })
                .then(function () {
                return _this.sync(dataModel);
            });
        }
        else {
            return q.resolve(true);
        }
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
        var beginFunc = function () {
            if (rows.length == 0) {
                return q.resolve(true);
            }
            else {
                return dataModelSync.dataModel.dataContext.dataLayer.beginTransaction();
            }
        };
        var commitFunc = function () {
            if (rows.length == 0) {
                return q.resolve(true);
            }
            else {
                return dataModelSync.dataModel.dataContext.dataLayer.commitTransaction();
            }
        };
        if (rows.length > 0) {
            console.log(dataModelSync.dataModel.tableInfo.table.name + ": Get " + rows.length + " Datensätze");
        }
        return beginFunc()
            .then(function () {
            var existingIds = {};
            return _this.getExistingIds(dataModelSync, rows)
                .then(function (r) {
                existingIds = r;
                return q.resolve(true);
            }).then(function () {
                return h.Helpers.qSequential(rows, function (row) {
                    index++;
                    _this._syncStatus = "Lade " + dataModelSync.dataModel.tableInfo.table.name + " (" + index + "/" + rows.length + ")";
                    row._isSyncFromServer = true;
                    var where = [dataModelSync.syncOptions.serverPrimaryKey.name, row[dataModelSync.syncOptions.serverPrimaryKey.name]];
                    var exists = existingIds[row[dataModelSync.syncOptions.serverPrimaryKey.name]] != undefined;
                    return q.resolve(exists)
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
            });
        })
            .finally(function () {
            return commitFunc();
        });
    };
    SyncContext.prototype.getExistingIds = function (dataModelSync, rows) {
        var selectOptions = {
            columns: [dataModelSync.syncOptions.serverPrimaryKey.name]
        };
        this._currentSelectOptions = selectOptions;
        if (rows.length == 1) {
            selectOptions.where = [dataModelSync.syncOptions.serverPrimaryKey.name, rows[0][dataModelSync.syncOptions.serverPrimaryKey.name]];
        }
        return dataModelSync.dataModel.select(selectOptions)
            .then(function (r) {
            var result = {};
            r.forEach(function (item) {
                result[item[dataModelSync.syncOptions.serverPrimaryKey.name]] = true;
            });
            return q.resolve(result);
        });
    };
    SyncContext.prototype.updateClientIds = function (dataModelSync) {
        var _this = this;
        if (dataModelSync.lastSync) {
            return q.resolve(null);
        }
        return q.resolve(true)
            .then(function () {
            if (!dataModelSync.syncOptions.serverClientMappings) {
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
        }).then(function () {
            return h.Helpers.qSequential(dataModelSync.dataModel.tableInfo.relationsToChild, function (relation) {
                if (!dataModelSync.syncOptions.primaryKeyServerClientMapping) {
                    return q.resolve(true);
                }
                var childDataModel = _this.getDataModel(relation.childTableInfo.table.name);
                if (!childDataModel) {
                    return q.resolve(true);
                }
                var childDataModelSync = _this.getDataModelSync(childDataModel);
                if (!childDataModelSync) {
                    return q.resolve(true);
                }
                if (!childDataModelSync.syncOptions.serverClientMappings) {
                    return q.resolve(true);
                }
                var mapping = childDataModelSync.syncOptions.serverClientMappings.filter(function (item) {
                    return item.columnClient == relation.childColumn.name;
                });
                if (mapping.length != 1) {
                    return q.resolve(true);
                }
                var stmt = "update " + relation.childTableInfo.table.name
                    + " set " + relation.childColumn.name
                    + " = (select " + relation.parentPrimaryKey.name
                    + " from " + relation.parentTableInfo.table.name
                    + " where " + dataModelSync.syncOptions.primaryKeyServerClientMapping.columnServer
                    + " = "
                    + relation.childTableInfo.table.name + "." + mapping[0].columnServer + ")"
                    + " where " + mapping[0].columnServer + " is not null";
                return dataModelSync.dataModel.getDataLayer().executeNonQuery(stmt);
            });
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
            if (!childSyncContext.syncOptions.serverClientMappings) {
                return q.resolve(null);
            }
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
            if (!childSyncContext.syncOptions.serverClientMappings) {
                return q.resolve(null);
            }
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
            if (r.length > 0) {
                console.log(dataModelSync.dataModel.tableInfo.table.name + ": Post " + r.length + " Datensätze");
            }
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
            data[ColDoSync] = false;
            data._isSyncToServer = true;
            dataModelSync
                .dataModel
                .update(data)
                .then(function () {
                def.resolve(true);
            })
                .catch(function (r) {
                def.reject(r);
            });
            return def.promise;
        }
        var url = isDeleted
            ? dataModelSync.syncOptions.postUrl + "/" + data[dataModelSync.syncOptions.serverPrimaryKey.name]
            : dataModelSync.syncOptions.postUrl;
        var hasServerPrimaryKey = data[dataModelSync.syncOptions.serverPrimaryKey.name] != undefined
            && data[dataModelSync.syncOptions.serverPrimaryKey.name] != null
            && data[dataModelSync.syncOptions.serverPrimaryKey.name] != 0
            && data[dataModelSync.syncOptions.serverPrimaryKey.name] != "";
        this.executeTrigger(dataModelSync, "onSyncToServerBeforeSave", data)
            .then(function () {
            var body = isDeleted
                ? null
                : JSON.stringify(data);
            request(_this.getRequestOptions(url, method, body), function (err, res, r) {
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
                    if (hasServerPrimaryKey) {
                        r.__insertedOnServer = false;
                    }
                    else {
                        r.__insertedOnServer = true;
                    }
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
        })
            .catch(function (r) {
            def.reject(r);
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
                if (date) {
                    item[ColLastSync] = date;
                    return syncModel.update(item);
                }
                else {
                    return syncModel.delete(item);
                }
            }
            else {
                if (date) {
                    var item = {};
                    item[ColTable] = dataModelSync.dataModel.tableInfo.table.name;
                    item[ColLastSync] = date;
                    return syncModel.insert(item);
                }
                else {
                    return q.resolve(true);
                }
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
            if (args.item.__IsDeleted != undefined) {
                if (args.item.__IsDeleted) {
                    args.item[ColMarkedAsDeleted] = true;
                }
                else {
                    args.item[ColMarkedAsDeleted] = false;
                }
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
}());
exports.SyncContext = SyncContext;
//# sourceMappingURL=SyncContext.js.map