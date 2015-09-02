import express = require("express");
import dl = require("./DataLayer");
import dc = require("./DataContext");
import sc = require("./SyncContext");
import h = require("./helpers");
import q = require("q");

export class PublishContext {
    private _router: express.Router;

    constructor() {
        this._router = express.Router();
    }

    addDataModel(name: string, dataModel: dc.DataModel): void {
        this.addDataModelGet(name, dataModel);
        this.addDataModelPost(name, dataModel);
        this.addDataModelPatch(name, dataModel);
        this.addDataModelPut(name, dataModel);
    }
    addSyncContext(name: string, syncContext: sc.SyncContext): void {
        this.addSyncContextGet(name, syncContext);
    }
    getRouter(): express.Router {
        return this._router;
    }

    private addDataModelGet(name: string, dataModel: dc.DataModel): void {
        this._router.get("/" + name, (req, res): void => {
            var selectOptions = req.body;

            if (req.query.options) {
                selectOptions = JSON.parse(req.query.options);
            }

            dataModel.select(selectOptions)
                .then((r): void => {
                    res.json(r);
                })
                .done();
        });
        this._router.get("/" + name + "/:id", (req, res): void => {
            dataModel.selectById(req.params.id)
                .then((r): void => {
                    res.json(r);
                })
                .done();
        });
    }
    private addDataModelPost(name: string, dataModel: dc.DataModel): void {
        this._router.post("/" + name, (req, res): void => {
            dataModel.updateOrInsertAndSelect(req.body)
                .then((r): q.Promise<any> => {
                    if (r && req.query.options && r[dataModel.tableInfo.primaryKey.name]) {
                        var selectOptions: dl.ISelectOptionsDataContext = JSON.parse(req.query.options);
                        selectOptions.where = [dataModel.tableInfo.primaryKey.name, r[dataModel.tableInfo.primaryKey.name]];

                        return dataModel.select(selectOptions);
                    } else {
                        return q.resolve(r);
                    }
                })
                .then((r): void => {
                    if (Array.isArray(r)) {
                        var arr: any[] = r;

                        if (arr.length > 0) {
                            res.json(arr[0]);
                        } else {
                            res.json(r);
                        }
                    } else {
                        res.json(r);
                    }
                })
                .done();
        });
    }
    private addDataModelPatch(name: string, dataModel: dc.DataModel): void {
        this._router.patch("/" + name, (req, res): void => {
            dataModel.updateAndSelect(req.body)
                .then((r): q.Promise<any> => {
                    if (r && req.query.options && r[dataModel.tableInfo.primaryKey.name]) {
                        var selectOptions: dl.ISelectOptionsDataContext = JSON.parse(req.query.options);
                        selectOptions.where = [dataModel.tableInfo.primaryKey.name, r[dataModel.tableInfo.primaryKey.name]];

                        return dataModel.select(selectOptions);
                    } else {
                        return q.resolve(r);
                    }
                })
                .then((r): void => {
                    if (Array.isArray(r)) {
                        var arr: any[] = r;

                        if (arr.length > 0) {
                            res.json(arr[0]);
                        } else {
                            res.json(r);
                        }
                    } else {
                        res.json(r);
                    }
                })
                .done();
        });
    }
    private addDataModelPut(name: string, dataModel: dc.DataModel): void {
        this._router.put("/" + name, (req, res): void => {
            dataModel.insertAndSelect(req.body)
                .then((r): q.Promise<any> => {
                    if (r && req.query.options && r[dataModel.tableInfo.primaryKey.name]) {
                        var selectOptions: dl.ISelectOptionsDataContext = JSON.parse(req.query.options);
                        selectOptions.where = [dataModel.tableInfo.primaryKey.name, r[dataModel.tableInfo.primaryKey.name]];

                        return dataModel.select(selectOptions);
                    } else {
                        return q.resolve(r);
                    }
                })
                .then((r): void => {
                    if (Array.isArray(r)) {
                        var arr: any[] = r;

                        if (arr.length > 0) {
                            res.json(arr[0]);
                        } else {
                            res.json(r);
                        }
                    } else {
                        res.json(r);
                    }
                })
                .done();
        });
    }

    private addSyncContextGet(name: string, syncContext: sc.SyncContext): void {
        this._router.get("/" + name + "/start", (req, res): void => {
            if (syncContext.isSyncActive()) {
                res.json("Sync already started");
            } else {
                syncContext.syncAll();
                res.json("Sync started");
            }
        });
        this._router.get("/" + name + "/status", (req, res): void => {
            if (syncContext.isSyncActive()) {
                res.json({
                    isActive: true
                });
            } else {
                res.json({
                    isActive: false
                });
            }
        });
    }
}