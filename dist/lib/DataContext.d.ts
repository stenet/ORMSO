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
    private _updateSchemaCallbacks;
    constructor(dataContext: DataContext, tableInfo: dl.ITableInfo);
    registerAdditionalWhere(where: (selectOptions: dl.ISelectOptionsDataContext) => any[]): void;
    onBeforeInsert(callback: (args: ITriggerArgs) => q.Promise<any>): void;
    onAfterInsert(callback: (args: ITriggerArgs) => q.Promise<any>): void;
    onBeforeUpdate(callback: (args: ITriggerArgs) => q.Promise<any>): void;
    onAfterUpdate(callback: (args: ITriggerArgs) => q.Promise<any>): void;
    onBeforeDelete(callback: (args: ITriggerArgs) => q.Promise<any>): void;
    onAfterDelete(callback: (args: ITriggerArgs) => q.Promise<any>): void;
    onUpdateSchema(callback: (args: ITriggerArgs) => q.Promise<any>): void;
    insert(itemToCreate: any): q.Promise<any>;
    insertAndSelect(itemToCreate: any): q.Promise<any>;
    update(itemToUpdate: any): q.Promise<any>;
    updateAndSelect(itemToUpdate: any): q.Promise<any>;
    updateItems(valuesToUpdate: any, where: any): q.Promise<any>;
    updateOrInsert(item: any): q.Promise<any>;
    updateOrInsertAndSelect(item: any): q.Promise<any>;
    delete(itemToDelete: any): q.Promise<any>;
    selectById(id: any): q.Promise<any>;
    select(selectOptions: dl.ISelectOptionsDataContext): q.Promise<any[]>;
    selectCount(where: any): q.Promise<any>;
    getColumn(columnName: string): dl.IColumn;
    getDataLayer(): dl.IDataLayer;
    updateSchema(): q.Promise<any>;
    private createCustomSelectOptions(selectOptions);
    private getBaseTables();
    private getCombinedWhere(selectOptions, customWhere);
    private expand(selectOptions, rows);
    private expandRelation(relationName, selectOptions, rows);
    private saveChildRelations(row);
    private getSelectOptionsWithAdditionalWhere(selectOptions, where);
    private executeTrigger(args, eventVariable);
}
