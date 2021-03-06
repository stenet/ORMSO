import q = require("q");
export declare enum DataTypes {
    text = 0,
    int = 1,
    float = 2,
    date = 3,
    bool = 4,
    blob = 5,
}
export interface ITable {
    name: string;
    columns: IColumn[];
    isAbstract?: boolean;
}
export interface ITableInfo {
    table: ITable;
    baseTableInfo: ITableInfo;
    primaryKey: IColumn;
    relationsToParent: IRelationInfo[];
    relationsToChild: IRelationInfo[];
}
export interface IColumn {
    name: string;
    dataType: DataTypes;
    isIndexed?: boolean;
    isPrimaryKey?: boolean;
    isAutoIncrement?: boolean;
    defaultValue?: any;
    relation?: IRelation;
}
export interface IRelation {
    parentTable: ITable;
    parentAssociationName: string;
    childAssociationName: string;
}
export interface IRelationInfo {
    parentTableInfo: ITableInfo;
    parentPrimaryKey: IColumn;
    parentAssociationName: string;
    childTableInfo: ITableInfo;
    childColumn: IColumn;
    childAssociationName: string;
}
export interface IPreparedStatements {
    insert: any;
    update: any;
    delete: any;
}
export declare enum OrderBySort {
    asc = 0,
    desc = 1,
}
export interface IOrderBy {
    columnName: string;
    sort: OrderBySort;
}
export interface ISelectOptionsDataLayer {
    columns?: string[];
    where?: any;
    orderBy?: IOrderBy[];
    skip?: number;
    take?: number;
    expand?: any;
}
export interface ISelectOptionsDataContext extends ISelectOptionsDataLayer {
    requireTotalCount?: boolean;
}
export interface IExecuteNonQueryResult {
    changedRows: number;
    lastId: number;
}
export interface IDataLayer {
    updateSchema(table: ITable): q.Promise<boolean>;
    beginTransaction(): q.Promise<any>;
    commitTransaction(): q.Promise<any>;
    executeQuery(query: string): q.Promise<any[]>;
    executeNonQuery(nonQuery: string): q.Promise<IExecuteNonQueryResult>;
    insert(tableInfo: ITableInfo, item: any): q.Promise<IExecuteNonQueryResult>;
    update(tableInfo: ITableInfo, item: any): q.Promise<IExecuteNonQueryResult>;
    delete(tableInfo: ITableInfo, item: any): q.Promise<IExecuteNonQueryResult>;
    select(tableInfo: ITableInfo, selectOptions?: ISelectOptionsDataLayer): q.Promise<any[]>;
    selectById(tableInfo: ITableInfo, id: any): q.Promise<any>;
    selectCount(tableInfo: ITableInfo, where?: any): q.Promise<number>;
}
export declare class Sqlite3DataLayer implements IDataLayer {
    private _database;
    private _inTransaction;
    private _preparedStatements;
    constructor(fileName: string);
    updateSchema(table: ITable): q.Promise<boolean>;
    beginTransaction(): q.Promise<any>;
    commitTransaction(): q.Promise<any>;
    executeQuery(query: string, parameters?: any | any[]): q.Promise<any[]>;
    executeNonQuery(nonQuery: string, parameters?: any | any[]): q.Promise<IExecuteNonQueryResult>;
    insert(tableInfo: ITableInfo, item: any): q.Promise<IExecuteNonQueryResult>;
    update(tableInfo: ITableInfo, item: any): q.Promise<IExecuteNonQueryResult>;
    delete(tableInfo: ITableInfo, item: any): q.Promise<IExecuteNonQueryResult>;
    select(tableInfo: ITableInfo, selectOptions?: ISelectOptionsDataLayer): q.Promise<any[]>;
    selectById(tableInfo: ITableInfo, id: any): q.Promise<any>;
    selectCount(tableInfo: ITableInfo, where?: any): q.Promise<number>;
    private prepareStatement(statement);
    private executeAll(preparedStatement, parameters?);
    private executeRun(preparedStatement, parameters?);
    private updateTable(table);
    private createTable(table);
    private createColumns(table, existingColumns);
    private createColumn(table, column);
    private updateIndexes(table);
    private updateIndex(table, column);
    private createIndex(table, column);
    private getColumnCreateStatement(column);
    private getDataType(dataType);
    private getIndexName(table, column);
    private getColumns(table, withPrimaryKey, withAutoIncrement, objectToCheck?);
    private getSelectColumns(selectOptions?);
    private getSelectFrom(table);
    private getSelectWhere(tableInfo, parameters, selectOptions?);
    private getSelectOrderBy(tableInfo, selectOptions?);
    private getSelectOrderBySort(sort);
    private getSelectTake(selectOptions?);
    private getSelectSkip(selectOptions?);
    private getSelectWhereComponent(tableInfo, parameters, where);
    private getSelectWhereParameter(tableInfo, columnName, parameters, val);
    private getSelectFieldName(tableInfo, columnName);
    private getWhereExists(tableInfo, columnName, parameters, where);
    private validateBeforeUpdateToStore(table, item);
    private validateAfterReadFromStore(table, item);
    private convertToStorage(table, column, val);
    private convertFromStorage(table, column, val);
    private getColumn(tableInfo, columnName);
}
