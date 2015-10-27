import dl = require("./DataLayer");
import q = require("q");
export interface ITriggerArgs {
    item: any;
    cancel: boolean;
}
export declare class DataContext {
    dataLayer: dl.IDataLayer;
    private _dataModels;
    private _hasFinalizeDone;
    constructor(dataLayer: dl.IDataLayer);
    createDataModel(table: dl.ITable, baseModel?: DataModel): DataModel;
    getDataModel(table: dl.ITable): DataModel;
    finalizeInitialize(): q.Promise<any>;
    hasFinalizeDone(): boolean;
    private addRelationInfoToTableInfo();
    private createTableInfo(table, baseModel?);
    private getNonAbstractDataModels();
    private inheritTableFromBaseModel(table, baseModel);
    private updateSchema();
    private validateTable(table);
}
export declare class DataModel {
    dataContext: DataContext;
    tableInfo: dl.ITableInfo;
    private _dataLayer;
    private _additionalWhereCallbacks;
    private _beforeInsertCallbacks;
    private _afterInsertCallbacks;
    private _beforeUpdateCallbacks;
    private _afterUpdateCallbacks;
    private _beforeDeleteCallbacks;
    private _afterDeleteCallbacks;
    constructor(dataContext: DataContext, tableInfo: dl.ITableInfo);
    /** appends a where which will be executed always when reading data by operators */
    registerAdditionalWhere(where: (selectOptions: dl.ISelectOptionsDataContext) => any[]): void;
    /** Add before insert callback */
    onBeforeInsert(callback: (args: ITriggerArgs) => q.Promise<any>): void;
    /** Add after insert callback */
    onAfterInsert(callback: (args: ITriggerArgs) => q.Promise<any>): void;
    /** Add before update callback */
    onBeforeUpdate(callback: (args: ITriggerArgs) => q.Promise<any>): void;
    /** Add after update callback */
    onAfterUpdate(callback: (args: ITriggerArgs) => q.Promise<any>): void;
    /** Add before delete callback */
    onBeforeDelete(callback: (args: ITriggerArgs) => q.Promise<any>): void;
    /** Add after delete callback */
    onAfterDelete(callback: (args: ITriggerArgs) => q.Promise<any>): void;
    /** Insert the new item into the database */
    insert(itemToCreate: any): q.Promise<any>;
    /** Insert the new item into the database and returns the inserted item */
    insertAndSelect(itemToCreate: any): q.Promise<any>;
    /** Updates the item in the database */
    update(itemToUpdate: any): q.Promise<any>;
    /** Updates the item in the database and returns the updated item */
    updateAndSelect(itemToUpdate: any): q.Promise<any>;
    /** Updates the item in the database */
    updateItems(valuesToUpdate: any, where: any): q.Promise<any>;
    /** Updates the item in the database, if it exists, otherwise creates the item */
    updateOrInsert(item: any): q.Promise<any>;
    /** Updates the item in the database, if it exists, otherwise creates the item and returns the newly read item */
    updateOrInsertAndSelect(item: any): q.Promise<any>;
    /** Deletes the item in the database */
    delete(itemToDelete: any): q.Promise<any>;
    /** Selects the item by its id */
    selectById(id: any): q.Promise<any>;
    /** Selects items from the database by using the selectOptions */
    select(selectOptions: dl.ISelectOptionsDataContext): q.Promise<any[]>;
    selectCount(where: any): q.Promise<any>;
    /** returns the column by its name */
    getColumn(columnName: string): dl.IColumn;
    /** returns the current used DataLayer */
    getDataLayer(): dl.IDataLayer;
    private createCustomSelectOptions(selectOptions);
    private getBaseTables();
    private getCombinedWhere(selectOptions, customWhere);
    private expand(selectOptions, rows);
    private expandRelation(relationName, selectOptions, rows);
    private saveChildRelations(row);
    private getSelectOptionsWithAdditionalWhere(selectOptions, where);
    private executeTrigger(args, eventVariable);
}
