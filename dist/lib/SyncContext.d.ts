import dl = require("./DataLayer");
import dc = require("./DataContext");
import q = require("q");
export interface ISyncOptions {
    loadUrl: string;
    postUrl?: string;
    deleteUrl?: string;
    serverPrimaryKey: dl.IColumn;
    onSyncFromServerBeforeSave?: (row: any) => q.Promise<any>;
    onSyncFromServerAfterSave?: (row: any) => q.Promise<any>;
    onSyncToServerAfterSave?: (row: any) => q.Promise<any>;
}
export declare class SyncContext {
    private _dataModelSyncs;
    private _isSyncActiveAll;
    private _isSyncActive;
    constructor();
    addDataModel(dataModel: dc.DataModel, syncOptions: ISyncOptions): void;
    isSyncActive(): boolean;
    sync(dataModel: dc.DataModel): q.Promise<any>;
    syncAll(): q.Promise<any>;
    private alterTable(dataModel);
    private getDataModelSync(dataModel);
    private getLoadUrl(dataModelSync);
    private loadData(url);
    private saveData(dataModelSync, rows);
    private postData(dataModelSync);
    private postDataToServer(dataModelSync, data);
    private executeTrigger(dataModelSync, triggerName, row);
    private saveSyncState(dataModelSync, date);
    private checkSyncState(args);
}
