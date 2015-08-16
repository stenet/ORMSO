/// <reference path="Helpers.d.ts" />
/// <reference path="DataLayer.d.ts" />
/// <reference path="DataContext.d.ts" />
import express = require("express");
import dc = require("./DataContext");
import sc = require("./SyncContext");
export declare class PublishContext {
    private _router;
    constructor();
    addDataModel(name: string, dataModel: dc.ormso.DataModel): void;
    addSyncContext(name: string, syncContext: sc.SyncContext): void;
    getRouter(): express.Router;
    private addDataModelGet(name, dataModel);
    private addDataModelPost(name, dataModel);
    private addDataModelPatch(name, dataModel);
    private addDataModelPut(name, dataModel);
    private addSyncContextGet(name, syncContext);
}
