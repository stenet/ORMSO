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
    /** Name of the table */
    name: string;
    /** List of column inside this table */
    columns: IColumn[];
    /** is abstract table */
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
    /** Name of the column */
    name: string;
    /** Datatype of the column */
    dataType: DataTypes;
    /** Has to create index for this column */
    isIndexed?: boolean;
    /** Defines the primary key */
    isPrimaryKey?: boolean;
    /** Defines if column has AutoIncrement */
    isAutoIncrement?: boolean;
    /** Defines the default value if column is not set explicitly */
    defaultValue?: any;
    /** Defines a Relation to a parent table */
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
export declare enum OrderBySort {
    asc = 0,
    desc = 1,
}
export interface IOrderBy {
    column: IColumn;
    sort: OrderBySort;
}
export interface ISelectOptions {
    columns?: IColumn[];
    where?: any;
    orderBy?: IOrderBy[];
    skip?: number;
    take?: number;
    expand?: string[];
}
export interface IExecuteNonQueryResult {
    changedRows: number;
    lastId: number;
}
export interface IDataLayer {
    /** Validates the database schema and creates indexes and tables/column; does not remove columns (at least now) */
    updateSchema(table: ITable): q.Promise<any>;
    /** Executes a query and returns a promise with the result rows */
    executeQuery(query: string): q.Promise<any[]>;
    /** Executes a non-query (insert, update, delete, ...) and returns a promise with some informations */
    executeNonQuery(nonQuery: string): q.Promise<IExecuteNonQueryResult>;
    /** inserts the item into the database */
    insert(tableInfo: ITableInfo, item: any): q.Promise<IExecuteNonQueryResult>;
    /** Updates the item in the database */
    update(tableInfo: ITableInfo, item: any): q.Promise<IExecuteNonQueryResult>;
    /** Deletes the item in the database */
    delete(tableInfo: ITableInfo, item: any): q.Promise<IExecuteNonQueryResult>;
    /** Selects items from the database by using the selectOptions */
    select(tableInfo: ITableInfo, selectOptions?: ISelectOptions): q.Promise<any[]>;
    /** Selects an item from the database by its id */
    selectById(tableInfo: ITableInfo, id: any): q.Promise<any>;
}
export declare class Sqlite3DataLayer implements IDataLayer {
    private _database;
    constructor(fileName: string);
    updateSchema(table: ITable): q.Promise<any>;
    executeQuery(query: string, parameters?: any | any[]): q.Promise<any[]>;
    executeNonQuery(nonQuery: string, parameters?: any | any[]): q.Promise<IExecuteNonQueryResult>;
    insert(tableInfo: ITableInfo, item: any): q.Promise<IExecuteNonQueryResult>;
    update(tableInfo: ITableInfo, item: any): q.Promise<IExecuteNonQueryResult>;
    delete(tableInfo: ITableInfo, item: any): q.Promise<IExecuteNonQueryResult>;
    select(tableInfo: ITableInfo, selectOptions?: ISelectOptions): q.Promise<any[]>;
    selectById(tableInfo: ITableInfo, id: any): q.Promise<any>;
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
    private getColumns(table, withPrimaryKey, withAutoIncrement);
    private getSelectColumns(selectOptions?);
    private getSelectFrom(table);
    private getSelectWhere(table, parameters, selectOptions?);
    private getSelectOrderBy(selectOptions?);
    private getSelectOrderBySort(sort);
    private getSelectTake(selectOptions?);
    private getSelectSkip(selectOptions?);
    private getSelectWhereComponent(table, parameters, where);
    private getSelectWhereParameter(table, columnName, parameters, val);
    private validateBeforeUpdateToStore(table, item);
    private validateAfterReadFromStore(table, item);
    private convertToStorage(table, column, val);
    private convertFromStorage(table, column, val);
    private getColumn(table, columnName);
}
