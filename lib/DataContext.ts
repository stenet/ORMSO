import h = require("./helpers");
import dl = require("./DataLayer");

import q = require("q");
import extend = require("extend");

export interface ITriggerArgs {
    item: any;
    cancel: boolean;
}
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
    private getNonAbstractDataModels(): DataModel[] {
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
    }
}
export class DataModel {
    private _dataLayer: dl.IDataLayer;

    private _additionalWhereCallbacks: ((selectOptions: dl.ISelectOptionsDataContext) => any[])[] = [];

    private _beforeInsertCallbacks: ((args: ITriggerArgs) => q.Promise<any>)[] = [];
    private _afterInsertCallbacks: ((args: ITriggerArgs) => q.Promise<any>)[] = [];
    private _beforeUpdateCallbacks: ((args: ITriggerArgs) => q.Promise<any>)[] = [];
    private _afterUpdateCallbacks: ((args: ITriggerArgs) => q.Promise<any>)[] = [];
    private _beforeDeleteCallbacks: ((args: ITriggerArgs) => q.Promise<any>)[] = [];
    private _afterDeleteCallbacks: ((args: ITriggerArgs) => q.Promise<any>)[] = [];

    constructor(public dataContext: DataContext, public tableInfo: dl.ITableInfo) {
        this._dataLayer = dataContext.dataLayer;
    }

    /** appends a where which will be executed always when reading data by operators */
    registerAdditionalWhere(where: (selectOptions: dl.ISelectOptionsDataContext) => any[]): void {
        this._additionalWhereCallbacks.push(where);
    }

    /** Add before insert callback */
    onBeforeInsert(callback: (args: ITriggerArgs) => q.Promise<any>) {
        this._beforeInsertCallbacks.push(callback);
    }
    /** Add after insert callback */
    onAfterInsert(callback: (args: ITriggerArgs) => q.Promise<any>) {
        this._afterInsertCallbacks.push(callback);
    }
    /** Add before update callback */
    onBeforeUpdate(callback: (args: ITriggerArgs) => q.Promise<any>) {
        this._beforeUpdateCallbacks.push(callback);
    }
    /** Add after update callback */
    onAfterUpdate(callback: (args: ITriggerArgs) => q.Promise<any>) {
        this._afterUpdateCallbacks.push(callback);
    }
    /** Add before delete callback */
    onBeforeDelete(callback: (args: ITriggerArgs) => q.Promise<any>) {
        this._beforeDeleteCallbacks.push(callback);
    }
    /** Add after delete callback */
    onAfterDelete(callback: (args: ITriggerArgs) => q.Promise<any>) {
        this._afterDeleteCallbacks.push(callback);
    }

    /** Insert the new item into the database */
    insert(itemToCreate: any): q.Promise<any> {
        if (!itemToCreate) {
            return q.reject("No item to insert specified");
        }

        var args: ITriggerArgs = {
            item: itemToCreate,
            cancel: false
        }

        return this.executeTrigger(args, "_beforeInsertCallbacks")
            .then((): q.Promise<any> => {
                if (args.cancel) {
                    return q.resolve(null);
                }

                return this._dataLayer.insert(this.tableInfo, itemToCreate);
            })
            .then((): q.Promise<any> => {
                if (args.cancel) {
                    return q.resolve(null);
                }

                return this.saveChildRelations(itemToCreate);
            })
            .then((): q.Promise<any> => {
                if (args.cancel) {
                    return q.resolve(null);
                }

                return this.executeTrigger(args, "_afterInsertCallbacks");
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
            });
    }
    /** Updates the item in the database */
    update(itemToUpdate: any): q.Promise<any> {
        if (!itemToUpdate) {
            return q.reject("No item to update specified");
        }

        var args: ITriggerArgs = {
            item: itemToUpdate,
            cancel: false
        }

        return this.executeTrigger(args, "_beforeUpdateCallbacks")
            .then((): q.Promise<any> => {
                if (args.cancel) {
                    return q.resolve(null);
                }

                return this._dataLayer.update(this.tableInfo, itemToUpdate);
            })
            .then((): q.Promise<any> => {
                if (args.cancel) {
                    return q.resolve(null);
                }

                return this.saveChildRelations(itemToUpdate);
            })
            .then((): q.Promise<any> => {
                if (args.cancel) {
                    return q.resolve(null);
                }

                return this.executeTrigger(args, "_afterUpdateCallbacks");
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
                if (r) {
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

        var args: ITriggerArgs = {
            item: itemToDelete,
            cancel: false
        }

        return this.executeTrigger(args, "_beforeDeleteCallbacks")
            .then((): q.Promise<any> => {
                if (args.cancel) {
                    return q.resolve(null);
                }

                return this._dataLayer.delete(this.tableInfo, itemToDelete);
            })
            .then((): q.Promise<any> => {
                if (args.cancel) {
                    return q.resolve(null);
                }

                return this.executeTrigger(args, "_afterDeleteCallbacks");
            });
    }
    /** Selects the item by its id */
    selectById(id: any): q.Promise<any> {
        return this._dataLayer.selectById(this.tableInfo, id);
    }
    /** Selects items from the database by using the selectOptions */
    select(selectOptions: dl.ISelectOptionsDataContext): q.Promise<any[]> {
        var customSelectOptions = this.createCustomSelectOptions(selectOptions);

        return this._dataLayer.select(this.tableInfo, customSelectOptions)
            .then((r): q.Promise<any> => {
                if (!selectOptions.expand) {
                    return q.resolve(r);
                }

                return this.expand(selectOptions, r);
            })
            .then((r): q.Promise<any> => {
                if (selectOptions.requireTotalCount) {
                    return this.selectCount(customSelectOptions.where)
                        .then((c): q.Promise<any> => {
                            return q.resolve({
                                rows: r,
                                count: c
                            });
                        });
                } else {
                    return q.resolve(r);
                }
            });
    }
    selectCount(where: any): q.Promise<any> {
        return this._dataLayer.selectCount(this.tableInfo, where);
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

    /** returns the current used DataLayer */
    getDataLayer(): dl.IDataLayer {
        return this._dataLayer;
    }

    private createCustomSelectOptions(selectOptions: dl.ISelectOptionsDataContext): dl.ISelectOptionsDataLayer {
        var result = h.Helpers.extend({}, selectOptions);
        result.where = this.getCombinedWhere(selectOptions, result.where);

        return result;
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
    private getCombinedWhere(selectOptions: dl.ISelectOptionsDataContext, customWhere: any) {
        var newWhere: any[] = [];

        var additionalWhere = this._additionalWhereCallbacks
            .map((item) => { return item(selectOptions); })
            .filter((item) => { return item != null; });

        if (additionalWhere && additionalWhere.length > 0) {
            newWhere = newWhere.concat(additionalWhere);
        }

        if (customWhere) {
            newWhere = [customWhere].concat(newWhere);
        }

        if (this.tableInfo.baseTableInfo) {
            var baseModel = this.dataContext.getDataModel(this.tableInfo.baseTableInfo.table);
            newWhere = baseModel.getCombinedWhere(selectOptions, newWhere);
        }

        if (newWhere.length === 0) {
            return null;
        }

        return newWhere;
    }
    private expand(selectOptions: dl.ISelectOptionsDataContext, rows: any[]): q.Promise<any> {
        var relations: string[] = [];

        for (var relationName in selectOptions.expand) {
            relations.push(relationName);
        }

        return h.Helpers.qSequential(relations, (relationName: string) => {
            var relationSelectOptions = selectOptions.expand[relationName];

            return this.expandRelation(relationName, relationSelectOptions, rows);
        })
            .then((): q.Promise<any[]> => {
                return q.resolve(rows);
            });
    }
    private expandRelation(relationName: string, selectOptions: dl.ISelectOptionsDataContext, rows: any[]): q.Promise<any> {
        var parentRelations = this.tableInfo.relationsToParent.filter((relation): boolean => {
            return relation.childAssociationName === relationName;
        });

        if (parentRelations.length === 1) {
            var parentRelation = parentRelations[0];

            return h.Helpers.qSequential(rows, (row) => {
                var dataModel = this.dataContext.getDataModel(parentRelation.parentTableInfo.table);

                let newSelectOptions = this.getSelectOptionsWithAdditionalWhere(
                    selectOptions,
                    [parentRelation.parentPrimaryKey.name, row[parentRelation.childColumn.name]]);

                return dataModel.select(newSelectOptions)
                    .then((r): q.Promise<any> => {
                        if (r.length === 1) {
                            row[parentRelation.childAssociationName] = r[0];

                            if (newSelectOptions.expand) {
                                return this.expand(newSelectOptions, r);
                            } else {
                                return q.resolve(null);
                            }
                        }

                        return q.resolve(null);
                    });
            });
        }

        var childRelations = this.tableInfo.relationsToChild.filter((relation): boolean => {
            return relation.parentAssociationName === relationName;
        });

        if (childRelations.length === 1) {
            var childRelation = childRelations[0];

            return h.Helpers.qSequential(rows, (row) => {
                var dataModel = this.dataContext.getDataModel(childRelation.childTableInfo.table);

                let newSelectOptions = this.getSelectOptionsWithAdditionalWhere(
                    selectOptions,
                    [childRelation.childColumn.name, row[childRelation.parentPrimaryKey.name]]);

                return dataModel.select(newSelectOptions)
                    .then((r): q.Promise<any> => {
                        row[childRelation.parentAssociationName] = r;
                        row["__" + childRelation.parentAssociationName] = r.map((item): any => {
                            return item[childRelation.childTableInfo.primaryKey.name];
                        });

                        if (newSelectOptions.expand) {
                            return this.expand(newSelectOptions, r);
                        } else {
                            return q.resolve(null);
                        }
                    });
            });
        }

        return q.resolve(null);
    }
    private saveChildRelations(row: any): q.Promise<any> {
        return h.Helpers.qSequential(this.tableInfo.relationsToChild, (relation: dl.IRelationInfo) => {
            if (!row[relation.parentAssociationName]) {
                return q.resolve(null);
            }

            var dataModel = this.dataContext.getDataModel(relation.childTableInfo.table);
            var children: any[] = row[relation.parentAssociationName];

            return q.fcall((): q.Promise<any> => {
                if (!Array.isArray(children)) {
                    return q.resolve(null);
                }

                return h.Helpers.qSequential(children, (child) => {
                    child[relation.childColumn.name] = row[relation.parentPrimaryKey.name];
                    return dataModel.updateOrInsert(child);
                });
            })
                .then((): q.Promise<any> => {
                    var childrenPrevious: any[] = row["__" + relation.parentAssociationName];

                    if (!Array.isArray(childrenPrevious)) {
                        return q.resolve(null);
                    }

                    var toDelete: any[] = [];
                    childrenPrevious.forEach((item): void => {
                        if (Array.isArray(children)) {
                            var exists = children.some((child): boolean => {
                                return child[relation.childTableInfo.primaryKey.name] == item;
                            });

                            if (!exists) {
                                toDelete.push(item);
                            }
                        } else {
                            toDelete.push(item);
                        }
                    });

                    return h.Helpers.qSequential(toDelete, (child) => {
                        return dataModel
                            .selectById(child)
                            .then((r): q.Promise<any> => {
                                return dataModel.delete(r);
                            });
                    });
                });
        });
    }
    private getSelectOptionsWithAdditionalWhere(selectOptions: dl.ISelectOptionsDataContext, where: any): dl.ISelectOptionsDataContext {
        var newSelectOptions: dl.ISelectOptionsDataContext = {};

        if (selectOptions) {
            extend(true, newSelectOptions, selectOptions);
        }

        if (newSelectOptions.where) {
            newSelectOptions.where = [newSelectOptions.where, where];
        } else {
            newSelectOptions.where = where;
        }

        return newSelectOptions;
    }

    private executeTrigger(args: ITriggerArgs, eventVariable: string): q.Promise<any> {
        if (!this[eventVariable]) {
            throw Error("EventVariable " + eventVariable + " does not exist");
        }

        var callbacks: ((item: any) => q.Promise<any>)[] = [];

        callbacks = [].concat(this[eventVariable]);

        this.getBaseTables().forEach((baseTable): void => {
            var baseModel = this.dataContext.getDataModel(baseTable);
            callbacks = [].concat(callbacks).concat(baseModel[eventVariable]);
        });

        return h.Helpers.qSequential(callbacks, (item: ((args: ITriggerArgs) => q.Promise<any>)) => {
            return item(args);
        });
    }
}