"use strict";

import dl = require("./DataLayer");
import dc = require("./DataContext");
import h = require("./helpers");
import q = require("q");
import request = require("request");
import moment = require("moment");

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
    .then((): q.Promise<any> => {
        return syncLogModel
            .selectById(1)
            .then((r): q.Promise<any> => {
                if (r) {
                    return q.resolve(true);
                } else {
                    return syncLogModel.updateOrInsert({ Id: 1, LastId: 0, LastSync: new Date() });
                }
            });
    })
    .catch((r): void => {
        console.log(r);
    });

export interface IServerClientColumnMapping {
    columnServer: string;
    columnClient: string;
}
export interface ISyncOptions {
    loadUrl: string;
    postUrl?: string;
    deleteUrl?: string;

    serverPrimaryKey: dl.IColumn;

    maxSyncIntervalMinutes?: number;
    onlySyncOnNewDatabase?: boolean;

    onSyncFromServerBeforeSave?: (row: any) => q.Promise<any>;
    onSyncFromServerAfterSave?: (row: any) => q.Promise<any>;
    onSyncToServerBeforeSave?: (row: any) => q.Promise<any>;
    onSyncToServerAfterSave?: (row: any) => q.Promise<any>;

    primaryKeyServerClientMapping?: IServerClientColumnMapping;
    serverClientMappings?: IServerClientColumnMapping[];
}
interface IDataModelSync {
    dataModel: dc.DataModel;
    syncOptions: ISyncOptions;
    lastSync?: Date;
}
export class SyncContext {
    private _dataModelSyncs: IDataModelSync[] = [];
    private _isSyncActiveAll: boolean = false;
    private _isSyncActive: boolean = false;
    private _currentSelectOptions: dl.ISelectOptionsDataContext = null;
    private _header: any = {};
    private _cookies: request.CookieJar = request.jar();
    private _syncStatus = "";

    constructor() {
        this.getCurrentServerDate = (): q.Promise<Date> => {
            return q.resolve(new Date());
        };
    }

    blockSyncUntil: Date;
    syncLogUrl: string;
    maxLogIdUrl: string;

    addDataModel(dataModel: dc.DataModel, syncOptions: ISyncOptions) {
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
        dataModel.onUpdateSchema((args): q.Promise<any> => {
            return this.resetDataModelSyncState(dataModel);
        });

        this._dataModelSyncs.push(dataModelSync);
        this.alterTable(dataModelSync);
    }
    addRequestHeader(header: any): void {
        h.Helpers.extend(this._header, header);
    }
    resetDataModelSyncState(dataModel: dc.DataModel): q.Promise<any> {
        var dataModelSync = this.getDataModelSync(dataModel);

        if (!dataModelSync) {
            return;
        }

        return this.saveSyncState(dataModelSync, null);
    }

    getCurrentServerDate: () => q.Promise<Date>;

    isSyncActive(): boolean {
        return this._isSyncActive || this._isSyncActiveAll;
    }
    getSyncStatus(): string {
        return this._syncStatus;
    }
    sync(dataModel: dc.DataModel, getOptions?: string): q.Promise<any> {
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
        var syncStart: Date = null;

        return finalizeThen
            .then((): q.Promise<Date> => {
                return this.getCurrentServerDate();
            })
            .then((currentDate: Date): q.Promise<any> => {
                syncStart = currentDate;

                return this.getLastSync(dataModelSync);
            })
            .then((): q.Promise<any> => {
                this._syncStatus = "Speichere " + dataModelSync.dataModel.tableInfo.table.name;
                return this.postData(dataModelSync);
            })
            .then((): q.Promise<string> => {
                if (this.canGetSync(dataModelSync)) {
                    return this.getLoadUrl(dataModelSync, getOptions);
                } else {
                    return q.resolve("");
                }
            })
            .then((r): q.Promise<any[]> => {
                if (this.canGetSync(dataModelSync)) {
                    var selectOptions = null;

                    if (dataModelSync.lastSync) {
                        selectOptions = {
                            "selectDeleted": true
                        }
                    }

                    return this.loadData(r, selectOptions);
                } else {
                    return q.resolve([]);
                }
            })
            .then((r): q.Promise<any> => {
                if (this.canGetSync(dataModelSync)) {
                    return this.saveData(dataModelSync, r);
                } else {
                    return q.resolve(true);
                }
            })
            .then((): q.Promise<any> => {
                if (this.canGetSync(dataModelSync)) {
                    return this.updateClientIds(dataModelSync);
                } else {
                    return q.resolve(true);
                }
            })
            .then((): q.Promise<any> => {
                if (getOptions) {
                    return q.resolve(null);
                } else {
                    dataModelSync.lastSync = syncStart;
                    return this.saveSyncState(dataModelSync, syncStart);
                }
            })
            .then((): q.Promise<any> => {
                this._syncStatus = "";
                this._isSyncActive = false;
                return q.resolve(null);
            })
            .catch((r): q.Promise<any> => {
                this._syncStatus = "Fehler bei Synchronisierung";
                console.log(r);
                this._isSyncActive = false;
                return q.resolve(null);
            });
    }
    syncLogModel(): q.Promise<any> {
        if (!this.syncLogUrl) {
            return q.resolve(true);
        } else {
            return syncLogModel
                .selectById(1)
                .then((r): q.Promise<any> => {
                    if (r.LastId == 0) {
                        var def = q.defer();

                        request(this.getRequestOptions(this.maxLogIdUrl, null, null, null), (err, res, body): void => {
                            if (err) {
                                def.reject(err);
                            } else if (!h.Helpers.wasRequestSuccessful(res)) {
                                def.reject(h.Helpers.getRequestError(res));
                            } else {
                                r.LastId = body;

                                syncLogModel
                                    .update(r)
                                    .then((): void => {
                                        def.resolve(r);
                                    })
                                    .catch((x) => {
                                        def.reject(x);
                                    });
                            }
                        });

                        return def.promise;
                    } else {
                        return q.resolve(r);
                    }
                })
                .then((r): q.Promise<any[]> => {
                    var def = q.defer<any[]>();

                    var url = this.syncLogUrl + "?take=500&lastId=" + r.LastId;
                    request(this.getRequestOptions(url, null, null, null), (err, res, body): void => {
                        if (err) {
                            def.reject(err);
                        } else if (!h.Helpers.wasRequestSuccessful(res)) {
                            def.reject(h.Helpers.getRequestError(res));
                        } else {
                            def.resolve(JSON.parse(body));
                        }
                    });

                    return def.promise;
                })
                .then((r: any[]): q.Promise<any> => {
                    return h.Helpers.qSequential(r, (item): q.Promise<any> => {
                        this._syncStatus = "Bearbeite Log " + item.Id;

                        return this.doSyncLog(item)
                            .then((): q.Promise<any> => {
                                return syncLogModel.selectById(1)
                                    .then((r): q.Promise<any> => {
                                        r.LastId = item.Id;
                                        r.LastSync = new Date();
                                        return syncLogModel.update(r);
                                    })
                            })
                    });
                })
                .then((): q.Promise<any> => {
                    this._syncStatus = "";
                    return q.resolve(true);
                });
        }
    }
    syncAll(checkSyncBlock?: boolean): q.Promise<any> {
        if (this._isSyncActiveAll) {
            throw Error("Sync already started");
        }
        if (checkSyncBlock && this.blockSyncUntil && this.blockSyncUntil > new Date()) {
            return q.resolve(null);
        }

        this._isSyncActiveAll = true;

        return h.Helpers.qSequential(this._dataModelSyncs, (item: IDataModelSync) => {
            return this.sync(item.dataModel);
        })
            .then((): q.Promise<any> => {
                return this.syncLogModel();
            })
            .then((): q.Promise<any> => {
                this._isSyncActiveAll = false;
                return q.resolve(null);
            })
            .catch((r): q.Promise<any> => {
                this._isSyncActiveAll = false;
                console.log(r);
                return q.resolve(null);
            });
    }

    private alterTable(dataModelSync: IDataModelSync): void {
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

        dataModel.registerAdditionalWhere((selectOptions): any[] => {
            if (this._isSyncActive && this._currentSelectOptions == selectOptions) {
                return null;
            }

            return [ColMarkedAsDeleted, false];
        });

        dataModel.onBeforeInsert((args) => this.checkSyncState(dataModelSync, args));
        dataModel.onBeforeUpdate((args) => this.checkSyncState(dataModelSync, args));
        dataModel.onBeforeDelete((args): q.Promise<any> => {
            args.item[ColMarkedAsDeleted] = true;
            args.cancel = true;

            return dataModel.update(args.item);
        });
    }

    private getDataModel(tableName: string): dc.DataModel {
        var results = this._dataModelSyncs.filter((item): boolean => {
            return item.dataModel.tableInfo.table.name == tableName;
        });

        if (results.length == 1) {
            return results[0].dataModel;
        } else {
            return null;
        }
    }
    private getDataModelSync(dataModel: dc.DataModel): IDataModelSync {
        var items = this._dataModelSyncs.filter((item): boolean => {
            return item.dataModel === dataModel;
        });

        if (items.length === 0) {
            return null
        }

        return items[0];
    }
    private getLoadUrl(dataModelSync: IDataModelSync, getOptions: string): q.Promise<string> {
        return syncModel.select({
            where: [ColTable, dataModelSync.dataModel.tableInfo.table.name]
        })
            .then((r): q.Promise<string> => {
                var loadUrl = dataModelSync.syncOptions.loadUrl;

                if (getOptions) {
                    if (loadUrl.indexOf("?") > 0) {
                        loadUrl += "&";
                    } else {
                        loadUrl += "?";
                    }

                    return q.resolve(loadUrl + getOptions);
                } else if (r.length > 0) {
                    if (loadUrl.indexOf("?") > 0) {
                        loadUrl += "&";
                    } else {
                        loadUrl += "?";
                    }

                    return q.resolve(loadUrl + "changedSince=" + encodeURIComponent(moment(r[0].LastSync).format()));
                } else {
                    return q.resolve(loadUrl);
                }
            });
    }
    private getLastSync(dataModelSync: IDataModelSync): q.Promise<any> {
        return syncModel.select({
            where: [ColTable, dataModelSync.dataModel.tableInfo.table.name]
        })
            .then((r): q.Promise<any> => {
                if (r && r.length > 0) {
                    dataModelSync.lastSync = r[0].LastSync;
                } else {
                    dataModelSync.lastSync = null;
                }

                return q.resolve(null);
            });
    }
    private canGetSync(dataModelSync: IDataModelSync): boolean {
        return !dataModelSync.syncOptions.onlySyncOnNewDatabase || !dataModelSync.lastSync;
    }
    private doSyncLog(item: any): q.Promise<any> {
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
                .then((): q.Promise<any> => {
                    return this.updateClientIds(dataModelSync);
                });
        } else if (item.ChangeType == 1) {
            var dataModelSync = this.getDataModelSync(dataModel);

            var selectOptions = {
                where: [dataModelSync.syncOptions.serverPrimaryKey.name, item.Key]
            };
                            
            return dataModel
                .select(selectOptions)
                .then((r: any[]): q.Promise<any> => {
                    if (r && r.length > 0) {
                        r.forEach((item) => {
                            item.__IsDeleted = true;
                        });

                        return this.saveData(dataModelSync, r);
                    } else {
                        return q.resolve(true);
                    }
                });
        } else if (item.ChangeType == 2) {
            return dataModel.dataContext.dataLayer
                .executeNonQuery("delete from " + dataModel.tableInfo.table.name)
                .then((): q.Promise<any> => {
                    return syncModel.select({
                        where: [ColTable, dataModel.tableInfo.table.name]
                    }).then((r): q.Promise<any> => {
                        if (!r || r.length == 0) {
                            return q.resolve(true);
                        } else {
                            return syncModel.delete(r[0]);
                        }
                    })
                })
                .then((): q.Promise<any> => {
                    return this.sync(dataModel);
                });
        } else {
            return q.resolve(true);
        }
    }

    private loadData(url: string, selectOptions: any): q.Promise<any[]> {
        var def = q.defer<any[]>();

        request(this.getRequestOptions(url, null, null, selectOptions), (err, res, body): void => {
            if (err) {
                def.reject(err);
            } else if (!h.Helpers.wasRequestSuccessful(res)) {
                def.reject(h.Helpers.getRequestError(res));
            } else {
                var result = JSON.parse(body);
                if (!Array.isArray(result)) {
                    result = [result];
                }

                def.resolve(result);
            }
        });

        return def.promise;
    }
    private saveData(dataModelSync: IDataModelSync, rows: any[]): q.Promise<any> {
        var index = 0;

        var beginFunc = (): q.Promise<any> => {
            if (rows.length == 0) {
                return q.resolve(true);
            } else {
                return dataModelSync.dataModel.dataContext.dataLayer.beginTransaction();
            }
        };
        var commitFunc = (): q.Promise<any> => {
            if (rows.length == 0) {
                return q.resolve(true);
            } else {
                return dataModelSync.dataModel.dataContext.dataLayer.commitTransaction();
            }
        };

        if (rows.length > 0) {
            console.log(dataModelSync.dataModel.tableInfo.table.name + ": Get " + rows.length + " Datensätze");
        }

        return beginFunc()
            .then((): q.Promise<any> => {
                var existingIds = {};

                return this.getExistingIds(dataModelSync, rows)
                    .then((r): q.Promise<any> => {
                        existingIds = r;
                        return q.resolve(true);
                    }).then((): q.Promise<any> => {
                        return h.Helpers.qSequential(rows, (row) => {
                            index++;
                            this._syncStatus = "Lade " + dataModelSync.dataModel.tableInfo.table.name + " (" + index + "/" + rows.length + ")";

                            row._isSyncFromServer = true;

                            var where = [dataModelSync.syncOptions.serverPrimaryKey.name, row[dataModelSync.syncOptions.serverPrimaryKey.name]];
                            var exists = existingIds[row[dataModelSync.syncOptions.serverPrimaryKey.name]] != undefined;

                            return q.resolve(exists)
                                .then((r): q.Promise<boolean> => {
                                    return this
                                        .executeTrigger(dataModelSync, "onSyncFromServerBeforeSave", row)
                                        .then((): q.Promise<any> => {
                                            return this.onSyncFromServerBeforeSave(dataModelSync, row);
                                        })
                                        .then((): q.Promise<boolean> => {
                                            return q.resolve(r);
                                        });
                                })
                                .then((r): q.Promise<any> => {
                                    if (r) {
                                        return dataModelSync.dataModel.updateItems(row, where);
                                    } else {
                                        return dataModelSync.dataModel.insert(row);
                                    }
                                })
                                .then((r): q.Promise<any> => {
                                    return this.executeTrigger(dataModelSync, "onSyncFromServerAfterSave", row);
                                })
                                .then((): q.Promise<any> => {
                                    return this.onSyncFromServerAfterSave(dataModelSync, row);
                                })
                                .then((): q.Promise<any> => {
                                    delete row._isSyncFromServer;
                                    return q.resolve(null);
                                });
                        });
                })
            })
            .finally((): q.Promise<any> => {
                return commitFunc();
            });
    }
    private getExistingIds(dataModelSync: IDataModelSync, rows: any[]): q.Promise<any> {
        var selectOptions: dl.ISelectOptionsDataContext = {
            columns: [dataModelSync.syncOptions.serverPrimaryKey.name]
        };
        this._currentSelectOptions = selectOptions;

        if (rows.length == 1) {
            selectOptions.where = [dataModelSync.syncOptions.serverPrimaryKey.name, rows[0][dataModelSync.syncOptions.serverPrimaryKey.name]];
        }

        return dataModelSync.dataModel.select(selectOptions)
            .then((r: any[]): q.Promise<any> => {
                var result = {};

                r.forEach((item): void => {
                    result[item[dataModelSync.syncOptions.serverPrimaryKey.name]] = true;
                });

                return q.resolve(result);
            });
    }
    private updateClientIds(dataModelSync: IDataModelSync): q.Promise<any> {
        if (dataModelSync.lastSync) {
            return q.resolve(null);
        }

        return q.resolve(true)
            .then((): q.Promise<any> => {
                if (!dataModelSync.syncOptions.serverClientMappings) {
                    return q.resolve(null);
                }

                return h.Helpers.qSequential(dataModelSync.syncOptions.serverClientMappings, (mapping: IServerClientColumnMapping) => {
                    var serverColumn = dataModelSync.dataModel.getColumn(mapping.columnServer);
                    var clientColumn = dataModelSync.dataModel.getColumn(mapping.columnClient);
                    var parentDataModel = dataModelSync.dataModel.dataContext.getDataModel(clientColumn.relation.parentTable);
                    var parentDataModelSync = this.getDataModelSync(parentDataModel);

                    var stmt = "update " + dataModelSync.dataModel.tableInfo.table.name
                        + " set " + clientColumn.name
                        + " = (select " + parentDataModel.tableInfo.primaryKey.name
                        + " from " + parentDataModel.tableInfo.table.name
                        + " where " + parentDataModelSync.syncOptions.primaryKeyServerClientMapping.columnServer
                        + " = "
                        + dataModelSync.dataModel.tableInfo.table.name + "." + serverColumn.name + ")";

                    return dataModelSync.dataModel.getDataLayer().executeNonQuery(stmt);
                })
            }).then((): q.Promise<any> => {
            return h.Helpers.qSequential(dataModelSync.dataModel.tableInfo.relationsToChild, (relation: dl.IRelationInfo) => {
                if (!dataModelSync.syncOptions.primaryKeyServerClientMapping) {
                    return q.resolve(true);
                }

                var childDataModel = this.getDataModel(relation.childTableInfo.table.name);
                if (!childDataModel) {
                    return q.resolve(true);
                }
                var childDataModelSync = this.getDataModelSync(childDataModel);
                if (!childDataModelSync) {
                    return q.resolve(true);
                }
                if (!childDataModelSync.syncOptions.serverClientMappings) {
                    return q.resolve(true);
                }

                var mapping = childDataModelSync.syncOptions.serverClientMappings.filter((item): boolean => {
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
    }

    private onSyncFromServerBeforeSave(dataModelSync: IDataModelSync, row: any): q.Promise<any> {
        if (!dataModelSync.lastSync) {
            return q.resolve(null);
        }
        if (!dataModelSync.syncOptions.serverClientMappings) {
            return q.resolve(null);
        }

        return h.Helpers.qSequential(dataModelSync.syncOptions.serverClientMappings, (mapping: IServerClientColumnMapping) => {
            var column = dataModelSync.dataModel.getColumn(mapping.columnClient);

            if (!column) {
                q.reject("Column " + column + " not found");
            } else if (!column.relation) {
                q.reject("Column " + column + " needs a relation");
            }

            var parentDataModel = dataModelSync.dataModel.dataContext.getDataModel(column.relation.parentTable);
            var parentSyncContext = this.getDataModelSync(parentDataModel);

            return parentDataModel
                .select({
                    where: [parentSyncContext.syncOptions.primaryKeyServerClientMapping.columnServer, row[mapping.columnServer]]
                })
                .then((r: any[]): q.Promise<any> => {
                    if (r.length == 0) {
                        return q.resolve(null);
                    }

                    row[mapping.columnClient] = r[0][parentSyncContext.syncOptions.primaryKeyServerClientMapping.columnClient];
                    return q.resolve(null);
                });
        });
    }
    private onSyncFromServerAfterSave(dataModelSync: IDataModelSync, row: any): q.Promise<any> {
        if (!dataModelSync.lastSync) {
            return q.resolve(null);
        }

        return h.Helpers.qSequential(dataModelSync.dataModel.tableInfo.relationsToChild, (relationInfo: dl.IRelationInfo) => {
            var childDataModel = dataModelSync.dataModel.dataContext.getDataModel(relationInfo.childTableInfo.table);
            var childSyncContext = this.getDataModelSync(childDataModel);

            if (!childSyncContext.syncOptions.serverClientMappings) {
                return q.resolve(null);
            }

            var relationClientColumns = childSyncContext.syncOptions.serverClientMappings.filter((column) => {
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
                .then((r: any[]): q.Promise<any> => {
                    return h.Helpers.qSequential(r, (item) => {
                        item[relationClientColumn.columnClient] = row[dataModelSync.syncOptions.primaryKeyServerClientMapping.columnClient];
                        item._isConstraintAdapting = true;
                        return childDataModel.update(item);
                    });
                });
        });
    }
    private onSyncToServerAfterSave(dataModelSync: IDataModelSync, row: any): q.Promise<any> {
        return h.Helpers.qSequential(dataModelSync.dataModel.tableInfo.relationsToChild, (relationInfo: dl.IRelationInfo) => {
            var childDataModel = dataModelSync.dataModel.dataContext.getDataModel(relationInfo.childTableInfo.table);
            var childSyncContext = this.getDataModelSync(childDataModel);

            if (!childSyncContext.syncOptions.serverClientMappings) {
                return q.resolve(null);
            }

            var relationClientColumns = childSyncContext.syncOptions.serverClientMappings.filter((column) => {
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
                .then((r: any[]): q.Promise<any> => {
                    return h.Helpers.qSequential(r, (item) => {
                        item[relationClientColumn.columnServer] = row[dataModelSync.syncOptions.primaryKeyServerClientMapping.columnServer];
                        item._isConstraintAdapting = true;
                        return childDataModel.update(item);
                    });
                });
        });
    }
    private onSaving(dataModelSync: IDataModelSync, row: any): q.Promise<any> {
        if (row._isSyncFromServer) {
            return q.resolve(null);
        }

        if (!dataModelSync.syncOptions.serverClientMappings) {
            return q.resolve(null);
        }

        return h.Helpers.qSequential(dataModelSync.syncOptions.serverClientMappings, (mapping: IServerClientColumnMapping) => {
            var column = dataModelSync.dataModel.getColumn(mapping.columnClient);

            if (!column) {
                q.reject("Column " + column + " not found");
            } else if (!column.relation) {
                q.reject("Column " + column + " needs a relation");
            }

            var parentDataModel = dataModelSync.dataModel.dataContext.getDataModel(column.relation.parentTable);
            var parentSyncContext = this.getDataModelSync(parentDataModel);

            return parentDataModel
                .select({
                    where: [parentSyncContext.syncOptions.primaryKeyServerClientMapping.columnClient, row[mapping.columnClient]]
                })
                .then((r: any[]): q.Promise<any> => {
                    if (r.length == 0) {
                        return q.resolve(null);
                    }

                    row[mapping.columnServer] = r[0][parentSyncContext.syncOptions.primaryKeyServerClientMapping.columnServer];
                    return q.resolve(null);
                });
        });
    }

    private postData(dataModelSync: IDataModelSync): q.Promise<any> {
        if (!dataModelSync.syncOptions.postUrl) {
            return q.resolve(null);
        }

        var selectOptions: dl.ISelectOptionsDataContext = {
            where: [ColDoSync, true]
        };

        this._currentSelectOptions = selectOptions;

        return dataModelSync
            .dataModel
            .select(selectOptions)
            .then((r: any[]): q.Promise<any> => {
                if (r.length > 0) {
                    console.log(dataModelSync.dataModel.tableInfo.table.name + ": Post " + r.length + " Datensätze");
                }

                return h.Helpers.qSequential(r, (item): q.Promise<any> => {
                    return this.postDataToServer(dataModelSync, item);
                });
            });
    }
    private postDataToServer(dataModelSync: IDataModelSync, data: any): q.Promise<any> {
        var def = q.defer<any>();

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

        var hasServerPrimaryKey = data[dataModelSync.syncOptions.serverPrimaryKey.name] != undefined
            && data[dataModelSync.syncOptions.serverPrimaryKey.name] != null
            && data[dataModelSync.syncOptions.serverPrimaryKey.name] != 0
            && data[dataModelSync.syncOptions.serverPrimaryKey.name] != "";

        this.executeTrigger(dataModelSync, "onSyncToServerBeforeSave", data)
            .then(() => {
                var body = isDeleted
                    ? null
                    : JSON.stringify(data);

                request(
                    this.getRequestOptions(url, method, body),
                    (err, res, r): void => {
                        if (err) {
                            def.resolve(err);
                            return;
                        } else if (!h.Helpers.wasRequestSuccessful(res)) {
                            def.reject(h.Helpers.getRequestError(res));
                            return;
                        }

                        if (r) {
                            r = JSON.parse(r);
                        } else {
                            r = data;
                        }

                        r[dataModelSync.dataModel.tableInfo.primaryKey.name] = data[dataModelSync.dataModel.tableInfo.primaryKey.name];
                        r[ColDoSync] = false;

                        r._isSyncToServer = true;

                        dataModelSync
                            .dataModel
                            .updateAndSelect(r)
                            .then((r): q.Promise<any> => {
                                if (hasServerPrimaryKey) {
                                    r.__insertedOnServer = false;
                                } else {
                                    r.__insertedOnServer = true;
                                }

                                return this.executeTrigger(dataModelSync, "onSyncToServerAfterSave", r);
                            })
                            .then((): q.Promise<any> => {
                                return this.onSyncToServerAfterSave(dataModelSync, r);
                            })
                            .then((r) => {
                                def.resolve(true);
                            })
                            .catch((r): void => {
                                def.reject(r);
                            });
                    });
            })
            .catch((r): void => {
                def.reject(r);
            });

        return def.promise;
    }

    private executeTrigger(dataModelSync: IDataModelSync, triggerName: string, row: any): q.Promise<any> {
        if (!dataModelSync.syncOptions[triggerName]) {
            return q.resolve(row);
        }

        var promise: q.Promise<any> = dataModelSync.syncOptions[triggerName](row);

        return promise
            .then((): q.Promise<any> => {
                return row;
            });
    }

    private saveSyncState(dataModelSync: IDataModelSync, date: Date): q.Promise<any> {
        return syncModel.select({
            where: [ColTable, dataModelSync.dataModel.tableInfo.table.name]
        })
            .then((r): q.Promise<any> => {
                if (r.length === 1) {
                    let item = r[0];

                    if (date) {
                        item[ColLastSync] = date;

                        return syncModel.update(item);
                    } else {
                        return syncModel.delete(item);
                    }
                } else {
                    if (date) {
                        let item = {};
                        item[ColTable] = dataModelSync.dataModel.tableInfo.table.name;
                        item[ColLastSync] = date;

                        return syncModel.insert(item);
                    } else {
                        return q.resolve(true);
                    }
                }
            })
    }
    private checkSyncState(dataModelSync: IDataModelSync, args: dc.ITriggerArgs): q.Promise<any> {
        if (!args.item._isConstraintAdapting) {
            if (args.item._isSyncFromServer || args.item._isSyncToServer) {
                args.item[ColDoSync] = false;
            } else {
                args.item[ColDoSync] = true;
            }

            if (args.item.__IsDeleted) {
                args.item[ColMarkedAsDeleted] = true;
            }
        }

        return this.onSaving(dataModelSync, args.item);
    }

    private getRequestOptions(url: string, method?: string, body?: string, selectOptions?: any): request.Options {
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
        }
    }
}