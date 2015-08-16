import express = require("express");
import dc = require("./DataContext");
import sc = require("./SyncContext");
export declare class PublishContext {
    private _router;
    constructor();
    addDataModel(name: string, dataModel: dc.DataModel): void;
    addSyncContext(name: string, syncContext: sc.SyncContext): void;
    getRouter(): express.Router;
    private addDataModelGet(name, dataModel);
    private addDataModelPost(name, dataModel);
    private addDataModelPatch(name, dataModel);
    private addDataModelPut(name, dataModel);
    private addSyncContextGet(name, syncContext);
}
