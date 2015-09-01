﻿import dl = require("./DataLayer");
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
})
var finalizeThen = ctx.finalizeInitialize()
    .then((): q.Promise<any> => {
        console.log("Initialize for synchronisation models done");
        return q.resolve(null);
    })
    .catch((r): void => {
        console.log(r);
    });

export interface ISyncOptions {
    loadUrl: string;
    postUrl?: string;
    deleteUrl?: string;

    serverPrimaryKey: dl.IColumn;

    onSyncFromServerBeforeSave?: (row: any) => q.Promise<any>;
    onSyncFromServerAfterSave?: (row: any) => q.Promise<any>;
}
interface IDataModelSync {
    dataModel: dc.DataModel;
    syncOptions: ISyncOptions;
}
export class SyncContext {
    private _dataModelSyncs: IDataModelSync[] = [];
    private _isSyncActiveAll: boolean = false;
    private _isSyncActive: boolean = false;

    constructor() {
    }

    addDataModel(dataModel: dc.DataModel, syncOptions: ISyncOptions) {
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
    }

    isSyncActive(): boolean {
        return this._isSyncActive || this._isSyncActiveAll;
    }
    sync(dataModel: dc.DataModel): q.Promise<any> {
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
            .then((): q.Promise<string> => {
                return this.getLoadUrl(dataModelSync);
            }).then((r): q.Promise<any[]> => {
                return this.loadData(r);
            })
            .then((r): q.Promise<any> => {
                return this.saveData(dataModelSync, r);
            })
            .then((): q.Promise<any> => {
                return this.saveSyncState(dataModelSync, syncStart);
            })
            .then((): q.Promise<any> => {
                this._isSyncActive = false;
                return q.resolve(null);
            });
    }
    syncAll(): q.Promise<any> {
        if (this._isSyncActiveAll) {
            throw Error("Sync already started");
        }

        this._isSyncActiveAll = true;

        return h.Helpers.qSequential(this._dataModelSyncs, (item: IDataModelSync) => {
            return this.sync(item.dataModel);
        })
            .then((): q.Promise<any> => {
                this._isSyncActiveAll = false;
                return q.resolve(null);
            });
    }

    private alterTable(dataModel: dc.DataModel): void {
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
        dataModel.onBeforeDelete((args): q.Promise<any> => {
            args.item[ColMarkedAsDeleted] = true;
            args.cancel = true;

            return dataModel.delete(args.item);
        });
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
    private getLoadUrl(dataModelSync: IDataModelSync): q.Promise<string> {
        return syncModel.select({
            where: [ColTable, dataModelSync.dataModel.tableInfo.table.name]
        })
            .then((r): q.Promise<string> => {
                var loadUrl = dataModelSync.syncOptions.loadUrl;

                if (r.length > 0) {
                    if (loadUrl.indexOf("?") > 0) {
                        loadUrl += "&";
                    } else {
                        loadUrl += "?";
                    }

                    return q.resolve(loadUrl + "changedSince=" + moment(r[0].LastSync).format());
                } else {
                    return q.resolve(loadUrl);
                }
            });
    }

    private loadData(url: string): q.Promise<any[]> {
        var def = q.defer<any[]>();

        request(url, (err, res, body): void => {
            if (err) {
                def.reject(err);
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
        return h.Helpers.qSequential(rows, (row) => {
            var where = [dataModelSync.syncOptions.serverPrimaryKey.name, row[dataModelSync.syncOptions.serverPrimaryKey.name]];

            return dataModelSync.dataModel.select({
                where: where
            })
                .then((r): q.Promise<any> => {
                    return this.executeTrigger(dataModelSync, "onSyncFromServerBeforeSave", row);
                })
                .then((r): q.Promise<any> => {
                    row._isSyncActive = true;

                    if (r.length === 1) {
                        return dataModelSync.dataModel.updateItems(row, where);
                    } else {
                        return dataModelSync.dataModel.insert(row);
                    }
                })
                .then((r): q.Promise<any> => {
                    return this.executeTrigger(dataModelSync, "onSyncFromServerAfterSave", row);
                })
                .then((): q.Promise<any> => {
                    delete row._isSyncActive;
                    return q.resolve(null);
                });
        });
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
                    item[ColLastSync] = date;

                    return syncModel.update(item);
                } else {
                    let item = {};
                    item[ColTable] = dataModelSync.dataModel.tableInfo.table.name;
                    item[ColLastSync] = date;

                    return syncModel.insert(item);
                }
            })
    }
    private checkSyncState(args: dc.ITriggerArgs): q.Promise<any> {
        if (args.item._isSyncActive) {
            args.item[ColDoSync] = false;
        } else {
            args.item[ColDoSync] = true;
        }

        return q.resolve(null);
    }
}