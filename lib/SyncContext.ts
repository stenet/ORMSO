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
})
var finalizeThen = ctx.finalizeInitialize()
    .then((): q.Promise<any> => {
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
    onSyncToServerAfterSave?: (row: any) => q.Promise<any>;
}
interface IDataModelSync {
    dataModel: dc.DataModel;
    syncOptions: ISyncOptions;
}
export class SyncContext {
    private _dataModelSyncs: IDataModelSync[] = [];
    private _isSyncActiveAll: boolean = false;
    private _isSyncActive: boolean = false;
    private _header: any = {};
    private _cookies: request.CookieJar = request.jar();

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
    addRequestHeader(header: any): void {
        h.Helpers.extend(this._header, header);
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
            .then((): q.Promise<any> => {
                return this.postData(dataModelSync);
            })
            .then((): q.Promise<string> => {
                return this.getLoadUrl(dataModelSync);
            })
            .then((r): q.Promise<any[]> => {
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
            })
            .catch((r): q.Promise<any> => {
                console.log(r);
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
            })
            .catch((r): q.Promise<any> => {
                this._isSyncActiveAll = false;
                console.log(r);
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

            return dataModel.update(args.item);
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

                    return q.resolve(loadUrl + "changedSince=" + encodeURIComponent(moment(r[0].LastSync).format()));
                } else {
                    return q.resolve(loadUrl);
                }
            });
    }

    private loadData(url: string): q.Promise<any[]> {
        var def = q.defer<any[]>();

        request(this.getRequestOptions(url), (err, res, body): void => {
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
        return h.Helpers.qSequential(rows, (row) => {
            var where = [dataModelSync.syncOptions.serverPrimaryKey.name, row[dataModelSync.syncOptions.serverPrimaryKey.name]];

            return dataModelSync.dataModel.select({
                where: where
            })
                .then((r): q.Promise<any[]> => {
                    return this
                        .executeTrigger(dataModelSync, "onSyncFromServerBeforeSave", row)
                        .then((): q.Promise<any[]> => {
                            return q.resolve(r);
                        });
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

    private postData(dataModelSync: IDataModelSync): q.Promise<any> {
        if (!dataModelSync.syncOptions.postUrl) {
            return q.resolve(null);
        }

        var selectOptions: dl.ISelectOptionsDataContext = {
            where: [ColDoSync, true]
        };

        return dataModelSync
            .dataModel
            .select(selectOptions)
            .then((r: any[]): q.Promise<any> => {
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

                if (isDeleted) {
                    def.resolve(true);
                    return;
                }

                r = JSON.parse(r);
                r[dataModelSync.dataModel.tableInfo.primaryKey.name] = data[dataModelSync.dataModel.tableInfo.primaryKey.name];
                r[ColDoSync] = false;

                r._isSyncActive = true;

                dataModelSync
                    .dataModel
                    .updateAndSelect(r)
                    .then((r) => {
                        return this.executeTrigger(dataModelSync, "onSyncToServerAfterSave", r);
                    })
                    .then((r) => {
                        def.resolve(true);
                    })
                    .catch((r): void => {
                        def.reject(r);
                    });
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

    private getRequestOptions(url: string, method?: string, body?: string): request.Options {
        return {
            method: method || "GET",
            url: url,
            body: body,
            headers: this._header,
            jar: this._cookies
        }
    }
}