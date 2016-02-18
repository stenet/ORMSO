import dl = require("./DataLayer");
import dc = require("./DataContext");
import q = require("q");
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
export declare class SyncContext {
    private _dataModelSyncs;
    private _isSyncActiveAll;
    private _isSyncActive;
    private _currentSelectOptions;
    private _header;
    private _cookies;
    private _syncStatus;
    constructor();
    blockSyncUntil: Date;
    syncLogUrl: string;
    maxLogIdUrl: string;
    addDataModel(dataModel: dc.DataModel, syncOptions: ISyncOptions): void;
    addRequestHeader(header: any): void;
    resetDataModelSyncState(dataModel: dc.DataModel): q.Promise<any>;
    getCurrentServerDate: () => q.Promise<Date>;
    isSyncActive(): boolean;
    getSyncStatus(): string;
    sync(dataModel: dc.DataModel, getOptions?: string): q.Promise<any>;
    syncLogModel(): q.Promise<any>;
    syncAll(checkSyncBlock?: boolean): q.Promise<any>;
    private alterTable(dataModelSync);
    private getDataModel(tableName);
    private getDataModelSync(dataModel);
    private getLoadUrl(dataModelSync, getOptions);
    private getLastSync(dataModelSync);
    private canGetSync(dataModelSync);
    private doSyncLog(item);
    private loadData(url, selectOptions);
    private saveData(dataModelSync, rows);
    private getExistingIds(dataModelSync, rows);
    private updateClientIds(dataModelSync);
    private onSyncFromServerBeforeSave(dataModelSync, row);
    private onSyncFromServerAfterSave(dataModelSync, row);
    private onSyncToServerAfterSave(dataModelSync, row);
    private onSaving(dataModelSync, row);
    private postData(dataModelSync);
    private postDataToServer(dataModelSync, data);
    private executeTrigger(dataModelSync, triggerName, row);
    private saveSyncState(dataModelSync, date);
    private checkSyncState(dataModelSync, args);
    private getRequestOptions(url, method?, body?, selectOptions?);
}
