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
        this.addDataModelDelete(name, dataModel);
    }
    addSyncContext(name: string, syncContext: sc.SyncContext): void {
        this.addSyncContextGet(name, syncContext);
    }
    getRouter(): express.Router {
        return this._router;
    }

    private addDataModelGet(name: string, dataModel: dc.DataModel): void {
        this._router.get("/" + name, (req, res): void => {
            var selectOptions = this.getSelectOptions(req);

            dataModel.select(selectOptions || {})
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
                    var selectOptions = this.getSelectOptions(req);

                    if (r && selectOptions && r[dataModel.tableInfo.primaryKey.name]) {
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
                    var selectOptions = this.getSelectOptions(req);

                    if (r && selectOptions && r[dataModel.tableInfo.primaryKey.name]) {
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
                    var selectOptions = this.getSelectOptions(req);

                    if (r && selectOptions && r[dataModel.tableInfo.primaryKey.name]) {
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
    private addDataModelDelete(name: string, dataModel: dc.DataModel): void {
        this._router.delete("/" + name + "/:id", (req, res): void => {
            dataModel.selectById(req.params.id)
                .then((r) => {
                    if (r) {
                        dataModel.delete(req.body)
                            .then(() => {
                                res.status(200);
                            });
                    } else {
                        res.status(404);
                    }
                })
                .done();
        });
    }

    private getSelectOptions(req: express.Request): dl.ISelectOptionsDataContext {
        var selectOptions: dl.ISelectOptionsDataContext = null;

        if (req.header("X-Get-Options")) {
            selectOptions = JSON.parse(req.header("X-Get-Options"));
        }
        if (req.query.options) {
            selectOptions = JSON.parse(req.query.options);
        }

        return selectOptions;
    }

    private addSyncContextGet(name: string, syncContext: sc.SyncContext): void {
        this._router.get("/" + name + "/start", (req, res): void => {
            if (syncContext.isSyncActive()) {
                res.json({
                    status: "Sync has been started"
                });
            } else {
                syncContext.syncAll();
                res.json({
                    status: "Sync already has been started"
                });
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