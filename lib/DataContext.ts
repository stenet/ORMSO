import dl = require("./DataLayer");
import h = require("./helpers");
import q = require("q");

export class DataContext {
    private _dataModels: DataModel[] = [];
    private _hasFinalizeDone: boolean = false;

    constructor(public dataLayer: dl.IDataLayer) {

    }

    createDataModel(table: dl.ITable, baseModel?: DataModel): DataModel {
        if (baseModel) {
            this.inheritTableFromBaseModel(table, baseModel);
        }

        this.validateTable(table);

        var dataModel = new DataModel(this, this.createTableInfo(table, baseModel));
        this._dataModels.push(dataModel);

        return dataModel;
    }
    getDataModel(table: dl.ITable): DataModel {
        var dataModels = this._dataModels.filter((dataModel): boolean => {
            return dataModel.tableInfo.table.name == table.name;
        });

        if (dataModels.length !== 1) {
            throw Error("Table " + table.name + " does not exist in current DataContext");
        }

        return dataModels[0];
    }

    finalizeInitialize(): q.Promise<any> {
        if (this._hasFinalizeDone) {
            throw Error("Finalize should be executed only once");
        }

        this._hasFinalizeDone = true;

        return this.updateSchema()
            .then((): q.Promise<any> => {
                return this.addRelationInfoToTableInfo();
            });
    }
    hasFinalizeDone(): boolean {
        return this._hasFinalizeDone;
    }

    private addRelationInfoToTableInfo(): q.Promise<any> {
        this.getNonAbstractDataModels().forEach((dataModel): void => {
            var table = dataModel.tableInfo.table;

            table.columns.forEach((column): void => {
                if (!column.relation) {
                    return;
                }

                var parentDataModel = this.getDataModel(column.relation.parentTable);

                var relationInfo: dl.IRelationInfo = {
                    parentTableInfo: parentDataModel.tableInfo,
                    parentPrimaryKey: parentDataModel.tableInfo.primaryKey,
                    parentAssociationName: column.relation.parentAssociationName,
                    childTableInfo: dataModel.tableInfo,
                    childColumn: column,
                    childAssociationName: column.relation.childAssociationName
                };

                dataModel.tableInfo.relationsToParent.push(relationInfo);
                parentDataModel.tableInfo.relationsToChild.push(relationInfo);
            });
        });

        return q.resolve(null);
    }
    private createTableInfo(table: dl.ITable, baseModel?: DataModel): dl.ITableInfo {
        var primaryKey = table.columns.filter((column): boolean => {
            return column.isPrimaryKey === true;
        });

        var tableInfo: dl.ITableInfo = {
            table: table,
            primaryKey: primaryKey[0],
            baseTableInfo: (baseModel ? baseModel.tableInfo : null),
            relationsToChild: [],
            relationsToParent: []
        };

        return tableInfo;
    }
    private getNonAbstractDataModels(): DataModel[]{
        return this._dataModels.filter((dataModel): boolean => {
            return dataModel.tableInfo.table.isAbstract !== true;
        });
    }
    private inheritTableFromBaseModel(table: dl.ITable, baseModel: DataModel): void {
        (baseModel).tableInfo.table.columns
            .forEach((column): void => {
                table.columns.push(column);
            });
    }
    private updateSchema(): q.Promise<any> {
        return h.Helpers
            .qSequential(this.getNonAbstractDataModels(), (dataModel: DataModel) => {
                return this.dataLayer.updateSchema(dataModel.tableInfo.table);
            });
    }
    private validateTable(table: dl.ITable): void {
        if (!table.isAbstract) {
            var primaryKeys = table.columns.filter((column): boolean => {
                return column.isPrimaryKey === true;
            });

            if (primaryKeys.length != 1) {
                throw Error("Table " + table.name + " has no PrimaryKey");
            }
        }

        var dummyCallback = (i): q.Promise<any> => {
            return q.resolve(null);
        };

        if (!table.beforeInsertCallback) {
            table.beforeInsertCallback = dummyCallback;
        }
        if (!table.afterInsertCallback) {
            table.afterInsertCallback = dummyCallback;
        }
        if (!table.beforeUpdateCallback) {
            table.beforeUpdateCallback = dummyCallback;
        }
        if (!table.afterUpdateCallback) {
            table.afterUpdateCallback = dummyCallback;
        }
        if (!table.beforeDeleteCallback) {
            table.beforeDeleteCallback = dummyCallback;
        }
        if (!table.afterDeleteCallback) {
            table.afterDeleteCallback = dummyCallback;
        }
    }
}

export class DataModel {
    private _dataLayer: dl.IDataLayer;
    private _fixedWhere: any[] = [];

    constructor(public dataContext: DataContext, public tableInfo: dl.ITableInfo) {
        this._dataLayer = dataContext.dataLayer;
    }

    /** Insert the new item into the database */
    insert(itemToCreate: any): q.Promise<any> {
        if (!itemToCreate) {
            return q.reject("No item to insert specified");
        }

        return this.tableInfo.table.beforeInsertCallback(itemToCreate)
            .then((): q.Promise<any> => {
                var baseTables = this.getBaseTables();
                if (baseTables.length == 0) {
                    return q.resolve(null);
                }

                return h.Helpers.qSequential(baseTables, (x: dl.ITable) => {
                    return x.beforeInsertCallback(itemToCreate);
                });
            })
            .then((): q.Promise<any> => {
                return this._dataLayer.insert(this.tableInfo, itemToCreate);
            })
            .then((): q.Promise<any> => {
                return this.saveChildRelations(itemToCreate);
            })
            .then((): q.Promise<any> => {
                return this.tableInfo.table.afterInsertCallback(itemToCreate);
            })
            .then((): q.Promise<any> => {
                var baseTables = this.getBaseTables();
                if (baseTables.length == 0) {
                    return q.resolve(null);
                }

                return h.Helpers.qSequential(baseTables, (x: dl.ITable) => {
                    return x.afterInsertCallback(itemToCreate);
                });
            })
            .then((): q.Promise<any> => {
                return q.resolve(itemToCreate);
            });
    }
    /** Insert the new item into the database and returns the inserted item */
    insertAndSelect(itemToCreate: any): q.Promise<any> {
        if (!itemToCreate) {
            return q.reject("No item to insert specified");
        }

        return this.insert(itemToCreate)
            .then((): q.Promise<any[]> => {
                return this.selectById(itemToCreate[this.tableInfo.primaryKey.name]);
            })
            .then((rows): q.Promise<any> => {
                if (rows.length === 1) {
                    return q.resolve(rows[0]);
                } else {
                    return q.resolve(null);
                }
            });
    }
    /** Updates the item in the database */
    update(itemToUpdate: any): q.Promise<any> {
        if (!itemToUpdate) {
            return q.reject("No item to update specified");
        }

        return this.tableInfo.table.beforeUpdateCallback(itemToUpdate)
            .then((): q.Promise<any> => {
                var baseTables = this.getBaseTables();
                if (baseTables.length == 0) {
                    return q.resolve(null);
                }

                return h.Helpers.qSequential(baseTables, (x: dl.ITable) => {
                    return x.beforeUpdateCallback(itemToUpdate);
                });
            })
            .then((): q.Promise<any> => {
                return this._dataLayer.update(this.tableInfo, itemToUpdate);
            })
            .then((): q.Promise<any> => {
                return this.saveChildRelations(itemToUpdate);
            })
            .then((): q.Promise<any> => {
                return this.tableInfo.table.afterUpdateCallback(itemToUpdate);
            })
            .then((): q.Promise<any> => {
                var baseTables = this.getBaseTables();
                if (baseTables.length == 0) {
                    return q.resolve(null);
                }

                return h.Helpers.qSequential(baseTables, (x: dl.ITable) => {
                    return x.afterUpdateCallback(itemToUpdate);
                });
            })
            .then((): q.Promise<any> => {
                return q.resolve(itemToUpdate);
            });
    }
    /** Updates the item in the database and returns the updated item */
    updateAndSelect(itemToUpdate: any): q.Promise<any> {
        if (!itemToUpdate) {
            return q.reject("No item to update specified");
        }

        return this.update(itemToUpdate)
            .then((): q.Promise<any[]> => {
                return this.selectById(itemToUpdate[this.tableInfo.primaryKey.name]);
            })
            .then((rows): q.Promise<any> => {
                if (rows.length === 1) {
                    return q.resolve(rows[0]);
                } else {
                    return q.resolve(null);
                }
            });
    }
    /** Updates the item in the database */
    updateItems(valuesToUpdate: any, where: any): q.Promise<any> {
        return this.select(this.createCustomSelectOptions({
            where: where
        }))
            .then((rows): q.Promise<any> => {
                return h.Helpers.qSequential(rows, (row) => {
                    for (var element in valuesToUpdate) {
                        row[element] = valuesToUpdate[element];
                    }

                    return this.update(row);
                });
            });
    }
    /** Updates the item in the database, if it exists, otherwise creates the item */
    updateOrInsert(item: any): q.Promise<any> {
        return q.fcall((): any => {
            var id = item[this.tableInfo.primaryKey.name];

            if (id) {
                return this.selectById(id);
            } else {
                return q.resolve(null);
            }
        })
            .then((r): q.Promise<any> => {
                var arr: any[] = r;

                if (arr && arr.length > 0) {
                    return this.update(item);
                } else {
                    return this.insert(item);
                }
            })
            .then((): q.Promise<any> => {
                return q.resolve(item);
            });
    }
    /** Updates the item in the database, if it exists, otherwise creates the item and returns the newly read item */
    updateOrInsertAndSelect(item: any): q.Promise<any> {
        return this.updateOrInsert(item)
            .then((r): q.Promise<any> => {
                return this.selectById(item[this.tableInfo.primaryKey.name]);
            });
    }
    /** Deletes the item in the database */
    delete(itemToDelete: any): q.Promise<any> {
        if (!itemToDelete) {
            return q.reject("No item to delete specified");
        }

        return this.tableInfo.table.beforeDeleteCallback(itemToDelete)
            .then((): q.Promise<any> => {
                var baseTables = this.getBaseTables();
                if (baseTables.length == 0) {
                    return q.resolve(null);
                }

                return h.Helpers.qSequential(baseTables, (x: dl.ITable) => {
                    return x.beforeDeleteCallback(itemToDelete);
                });
            })
            .then((): q.Promise<any> => {
                return this._dataLayer.delete(this.tableInfo, itemToDelete);
            })
            .then((): q.Promise<any> => {
                return this.tableInfo.table.afterDeleteCallback(itemToDelete);
            })
            .then((): q.Promise<any> => {
                var baseTables = this.getBaseTables();
                if (baseTables.length == 0) {
                    return q.resolve(null);
                }

                return h.Helpers.qSequential(baseTables, (x: dl.ITable) => {
                    return x.afterDeleteCallback(itemToDelete);
                });
            });
    }
    /** Selects the item by its id */
    selectById(id: any): q.Promise<any> {
        return this._dataLayer.selectById(this.tableInfo, id);
    }
    /** Selects items from the database by using the selectOptions */
    select(selectOptions: dl.ISelectOptions): q.Promise<any[]> {
        return this._dataLayer.select(this.tableInfo, this.createCustomSelectOptions(selectOptions))
            .then((r): q.Promise<any> => {
                if (!selectOptions.expand) {
                    return q.resolve(r);
                }

                return h.Helpers.qSequential(selectOptions.expand, (item) => {
                    return this.expand(item, r);
                })
                    .then((): q.Promise<any> => {
                        return q.resolve(r);
                    });
            });
    }

    /** appends a fixed where which will be executed always when reading data by operators */
    appendFixedWhere(where: any): void {
        this._fixedWhere.push(where);
    }

    /** returns the column by its name */
    getColumn(columnName: string): dl.IColumn {
        var columns = this.tableInfo.table.columns.filter((column): boolean => {
            return column.name === columnName;
        });

        if (columns.length === 1) {
            return columns[0];
        }

        return null;
    }

    private createCustomSelectOptions(selectOptions: dl.ISelectOptions): dl.ISelectOptions {
        selectOptions = selectOptions || {};
        selectOptions = h.Helpers.extend({}, selectOptions);
        selectOptions.where = this.getCombinedWhere(selectOptions.where);

        return selectOptions;
    }

    private getBaseTables(): dl.ITable[] {
        var baseTables: dl.ITable[] = [];

        var baseTableInfo = this.tableInfo.baseTableInfo;

        while (baseTableInfo) {
            baseTables.push(baseTableInfo.table);
            baseTableInfo = baseTableInfo.baseTableInfo;
        }

        return baseTables;
    }
    private getCombinedWhere(customWhere: any) {
        var newWhere: any[] = [];

        if (this._fixedWhere) {
            newWhere = newWhere.concat(this._fixedWhere);
        }
        if (customWhere) {
            newWhere = [customWhere].concat(newWhere);
        }

        if (this.tableInfo.baseTableInfo) {
            var baseModel = this.dataContext.getDataModel(this.tableInfo.baseTableInfo.table);
            newWhere = baseModel.getCombinedWhere(newWhere);
        }
        
        if (newWhere.length === 0) {
            return null;
        }

        return newWhere;
    }
    private expand(expand: string, rows: any[]): q.Promise<any> {
        var expandKeys = expand.split('/');

        var parentRelations = this.tableInfo.relationsToParent.filter((relation): boolean => {
            return relation.parentAssociationName === expandKeys[0];
        });

        if (parentRelations.length === 1) {
            var parentRelation = parentRelations[0];

            return h.Helpers.qSequential(rows, (row) => {
                var dataModel = this.dataContext.getDataModel(parentRelation.parentTableInfo.table);

                return dataModel.select({
                    where: [parentRelation.parentPrimaryKey.name, row[parentRelation.childColumn.name]]
                })
                    .then((r): q.Promise<any> => {
                        if (r.length === 1) {
                            row[parentRelation.parentAssociationName] = r[0];
                            expandKeys.shift();
                            return this.expand(expandKeys.join("/"), [r[0]]);
                        }

                        return q.resolve(null);
                    });
            });
        }

        var childRelations = this.tableInfo.relationsToChild.filter((relation): boolean => {
            return relation.childAssociationName === expandKeys[0];
        });

        if (childRelations.length === 1) {
            var childRelation = childRelations[0];

            return h.Helpers.qSequential(rows, (row) => {
                var dataModel = this.dataContext.getDataModel(childRelation.childTableInfo.table);

                return dataModel.select({
                    where: [childRelation.childColumn.name, row[childRelation.parentPrimaryKey.name]]
                })
                    .then((r): q.Promise<any> => {
                        row[childRelation.childAssociationName] = r;
                        expandKeys.shift();
                        return this.expand(expandKeys.join("/"), r);
                    });
            });
        }

        return q.resolve(null);
    }
    private saveChildRelations(row: any): q.Promise<any> {
        return h.Helpers.qSequential(this.tableInfo.relationsToChild, (relation: dl.IRelationInfo) => {
            if (!row[relation.childAssociationName]) {
                return q.resolve(null);
            }

            var children = row[relation.childAssociationName];
            if (!Array.isArray(children)) {
                return q.resolve(null);
            }

            var dataModel = this.dataContext.getDataModel(relation.childTableInfo.table);
            return h.Helpers.qSequential(children, (child) => {
                child[relation.childColumn.name] = row[relation.parentPrimaryKey.name];
                return dataModel.updateOrInsert(child);
            });
        });
    }
}