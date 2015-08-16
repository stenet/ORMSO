import q = require("q");
import sqlite3 = require("sqlite3");
import moment = require("moment");
import h = require("./Helpers");

export enum DataTypes {
    text,
    int,
    float,
    date,
    bool,
    blob
}
export interface ITable {
    /** Name of the table */
    name: string,
    /** List of column inside this table */
    columns: IColumn[],
    /** is abstract table */
    isAbstract?: boolean
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
    name: string,
    /** Datatype of the column */
    dataType: DataTypes,
    /** Has to create index for this column */
    isIndexed?: boolean,
    /** Defines the primary key */
    isPrimaryKey?: boolean,
    /** Defines if column has AutoIncrement */
    isAutoIncrement?: boolean,
    /** Defines the default value if column is not set explicitly */
    defaultValue?: any,
    /** Defines a Relation to a parent table */
    relation?: IRelation
}
export interface IRelation {
    parentTable: ITable,
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

export enum OrderBySort {
    asc,
    desc
}
export interface IOrderBy {
    column: IColumn;
    sort: OrderBySort;
}
export interface ISelectOptions {
    columns?: IColumn[],
    where?: any,
    orderBy?: IOrderBy[],
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
export class Sqlite3DataLayer implements IDataLayer {
    private _database: sqlite3.Database;

    constructor(fileName: string) {
        this._database = new sqlite3.Database(fileName, (err): void => {
            if (err) {
                throw err;
            }
        });
    }

    updateSchema(table: ITable): q.Promise<any> {
        return this.updateTable(table)
            .then((): q.Promise<any> => {
                return this.updateIndexes(table);
            });
    }

    executeQuery(query: string, parameters?: any | any[]): q.Promise<any[]> {
        return this.prepareStatement(query)
            .then((preparedStatement): q.Promise<any[]> => {
                return this.executeAll(preparedStatement, parameters);
            });
    }
    executeNonQuery(nonQuery: string, parameters?: any | any[]): q.Promise<IExecuteNonQueryResult> {
        return this.prepareStatement(nonQuery)
            .then((preparedStatement): q.Promise<IExecuteNonQueryResult> => {
                return this.executeRun(preparedStatement, parameters);
            });
    }

    insert(tableInfo: ITableInfo, item: any): q.Promise<IExecuteNonQueryResult> {
        var table = tableInfo.table;

        this.validateBeforeUpdateToStore(table, item);

        var statement = "insert into " + table.name + " ("
            + this.getColumns(table, true, false).map((column): string => column.name).join(", ") + ")"
            + " values ("
            + this.getColumns(table, true, false).map((column): string => "?").join(", ") + ")";

        var parameters = this.getColumns(table, true, false).map((column): any => item[column.name]);

        return this.executeNonQuery(statement, parameters)
            .then((r): q.Promise<IExecuteNonQueryResult> => {
                item[tableInfo.primaryKey.name] = r.lastId;
                return q.resolve(r);
            });
    }
    update(tableInfo: ITableInfo, item: any): q.Promise<IExecuteNonQueryResult> {
        var table = tableInfo.table;

        if (!item[tableInfo.primaryKey.name]) {
            throw Error("Trying to update item in " + table.name + ", but item has no primary key");
        }

        this.validateBeforeUpdateToStore(table, item);

        var statement = "update " + table.name + " set "
            + this.getColumns(table, false, false).map((column): string => column.name + " = ?").join(", ")
            + " where " + tableInfo.primaryKey.name + " = ?";

        var parameters = this.getColumns(table, false, false).map((column): any => item[column.name]);
        parameters.push(item[tableInfo.primaryKey.name]);

        return this.executeNonQuery(statement, parameters)
            .then((r): q.Promise<IExecuteNonQueryResult> => {
                return q.resolve(r);
            });
    }
    delete(tableInfo: ITableInfo, item: any): q.Promise<IExecuteNonQueryResult> {
        var table = tableInfo.table;

        if (!item[tableInfo.primaryKey.name]) {
            throw Error("Trying to delete item in " + table.name + ", but item has no primary key");
        }

        this.validateBeforeUpdateToStore(table, item);

        var statement = "delete from " + table.name
            + " where " + tableInfo.primaryKey.name + " = ?";

        var parameters: any[] = [];
        parameters.push(item[tableInfo.primaryKey.name]);

        return this.executeNonQuery(statement, parameters)
            .then((r): q.Promise<IExecuteNonQueryResult> => {
                return q.resolve(r);
            });
    }
    select(tableInfo: ITableInfo, selectOptions?: ISelectOptions): q.Promise<any[]> {
        var parameters = {};

        var statement = this.getSelectColumns(selectOptions)
            + " "
            + this.getSelectFrom(tableInfo.table)
            + " "
            + this.getSelectWhere(tableInfo.table, parameters, selectOptions)
            + " "
            + this.getSelectOrderBy(selectOptions)
            + " "
            + this.getSelectTake(selectOptions)
            + " "
            + this.getSelectSkip(selectOptions);

        return this.executeQuery(statement, parameters)
            .then((r): q.Promise<any> => {
                r.forEach((row): void => {
                    this.validateAfterReadFromStore(tableInfo.table, row);
                });

                return q.resolve(r);
            });
    }
    selectById(tableInfo: ITableInfo, id: any): q.Promise<any> {
        return this.select(tableInfo, {
            where: [tableInfo.primaryKey.name, id]
        });
    }

    private prepareStatement(statement: string): q.Promise<sqlite3.Statement> {
        return q.Promise<sqlite3.Statement>((res, rej): void => {
            var preparedStatement = this._database
                .prepare(statement, (err): void => {
                    if (err) {
                        rej(err);
                    } else {
                        res(preparedStatement);
                    }
                });
        });
    }

    private executeAll(preparedStatement: sqlite3.Statement, parameters?: any | any[]): q.Promise<any[]> {
        return q.Promise<any[]>((res, rej): void => {
            preparedStatement.all(parameters || {}, (err, rows): void => {
                if (err) {
                    rej(err);
                } else {
                    res(rows);
                }
            });
        });
    }
    private executeRun(preparedStatement: sqlite3.Statement, parameters?: any | any[]): q.Promise<IExecuteNonQueryResult> {
        return q.Promise<IExecuteNonQueryResult>((res, rej): void => {
            preparedStatement.run(parameters || {}, (err): void => {
                if (err) {
                    rej(err);
                } else {
                    res({
                        changedRows: (<any>preparedStatement).changes,
                        lastId: (<any>preparedStatement).lastID
                    });
                }
            });
        });
    }

    private updateTable(table: ITable): q.Promise<any> {
        return this.executeQuery("PRAGMA table_info(" + table.name + ")")
            .then((rows): q.Promise<any> => {
                if (rows.length === 0) {
                    return this.createTable(table);
                } else {
                    return this.createColumns(table, rows.map((item): string => item.name));
                }
            });
    }
    private createTable(table: ITable): q.Promise<any> {
        var statement =
            "create table " + table.name + "("
            + table.columns.map((column): string => {
                return this.getColumnCreateStatement(column);
            }).join(", ")
            + ")";

        return this.executeNonQuery(statement);
    }
    private createColumns(table: ITable, existingColumns: string[]): q.Promise<any> {
        var createColumns: IColumn[] = [];

        table.columns.forEach((column): void => {
            if (existingColumns.indexOf(column.name) >= 0) {
                return;
            }

            createColumns.push(column);
        });

        return h.Helpers
            .qSequential(createColumns, (column) => {
                return this.createColumn(table, column);
            });
    }
    private createColumn(table: ITable, column: IColumn): q.Promise<any> {
        var statement =
            "alter table " + table.name + " add "
            + this.getColumnCreateStatement(column);

        return this.executeNonQuery(statement);
    }
    private updateIndexes(table: ITable): q.Promise<any> {
        var createColumns = table.columns
            .filter((column): boolean => {
                return column.isIndexed === true;
            });

        return h.Helpers
            .qSequential(createColumns, (column) => {
                return this.updateIndex(table, column);
            });
    }
    private updateIndex(table: ITable, column: IColumn): q.Promise<any> {
        return this.executeQuery("PRAGMA index_info(" + this.getIndexName(table, column) + ")")
            .then((rows): q.Promise<any> => {
                if (rows.length > 0) {
                    return q.resolve(null);
                } else {

                }
            });
    }
    private createIndex(table: ITable, column: IColumn): q.Promise<any> {
        var statement = "create index " + this.getIndexName(table, column)
            + " on " + table.name + " ("
            + column.name + ")";

        return this.executeNonQuery(statement);
    }

    private getColumnCreateStatement(column: IColumn): string {
        var dataType: string;

        return column.name + " " + this.getDataType(column.dataType)
            + (column.isPrimaryKey === true ? " PRIMARY KEY" : "")
            + (column.isAutoIncrement === true ? " AUTOINCREMENT" : "");
    }
    private getDataType(dataType: DataTypes): string {
        switch (dataType) {
            case DataTypes.text:
                return "text";
            case DataTypes.int:
            case DataTypes.bool:
                return "integer";
            case DataTypes.float:
                return "real";
            case DataTypes.blob:
                return "blob";
            case DataTypes.date:
                return "date";
            default:
                throw Error(dataType + " not implemented");
        }
    }
    private getIndexName(table: ITable, column: IColumn): string {
        return "ix" + table.name + "_" + column.name;
    }
    private getColumns(table: ITable, withPrimaryKey: boolean, withAutoIncrement: boolean): IColumn[] {
        return table.columns.filter((column): boolean => {
            return (withPrimaryKey || column.isPrimaryKey !== true)
                && (withAutoIncrement || column.isAutoIncrement !== true);
        });
    }

    private getSelectColumns(selectOptions?: ISelectOptions): string {
        var token = "select ";

        if (!selectOptions || !selectOptions.columns || selectOptions.columns.length === 0) {
            return token + "*";
        }

        return token + selectOptions.columns.map((column): string => column.name)
            .join(", ");
    }
    private getSelectFrom(table: ITable): string {
        return "from " + table.name;
    }
    private getSelectWhere(table: ITable, parameters: any, selectOptions?: ISelectOptions): string {
        if (!selectOptions || !selectOptions.where) {
            return "";
        }

        var where = this.getSelectWhereComponent(table, parameters, selectOptions.where);
        if (!where) {
            return "";
        }

        return "where " + where;
    }
    private getSelectOrderBy(selectOptions?: ISelectOptions): string {
        if (!selectOptions || !selectOptions.orderBy || selectOptions.orderBy.length === 0) {
            return "";
        }

        return "order by " + selectOptions.orderBy.map((orderBy): string => orderBy.column.name + " " + this.getSelectOrderBySort(orderBy.sort))
            .join(", ");
    }
    private getSelectOrderBySort(sort: OrderBySort): string {
        switch (sort) {
            case OrderBySort.asc:
                return "asc";
            case OrderBySort.desc:
                return "desc";
            default:
                throw Error(sort + " not implemented");
        }
    }
    private getSelectTake(selectOptions?: ISelectOptions): string {
        if (!selectOptions || !selectOptions.take) {
            return "";
        }

        return "limit " + selectOptions.take;
    }
    private getSelectSkip(selectOptions?: ISelectOptions): string {
        if (!selectOptions || !selectOptions.skip) {
            return "";
        }

        return "offset " + selectOptions.skip;
    }
    private getSelectWhereComponent(table: ITable, parameters: any, where: any): string {
        var elements = [];

        for (var element in where) {
            elements.push(where[element]);
        }

        if (elements.length == 0) {
            return "";
        }

        if (Array.isArray(elements[0])) {
            if (elements.length == 1) {
                return this.getSelectWhereComponent(table, parameters, elements[0]);
            } else if (Array.isArray(elements[1])) {
                return elements.map((x): string => this.getSelectWhereComponent(table, parameters, x)).join(" and ");
            } else if (elements.length == 3) {
                return this.getSelectWhereComponent(table, parameters, elements[0])
                    + " " + elements[1]
                    + " " + this.getSelectWhereComponent(table, parameters, elements[2]);
            } else {
                throw Error("Invalid filter " + JSON.stringify(where));
            }
        } else {
            if (elements.length < 2 || elements.length > 3) {
                throw Error("Invalid Filter " + JSON.stringify(where));
            }

            if (elements.length == 2) {
                if (elements[1] === "null") {
                    return elements[0] + " is null";
                }

                return elements[0] + " = " + this.getSelectWhereParameter(table, elements[0], parameters, elements[1]);

            } else if (elements.length == 3) {
                if (elements[2] === "null" && elements[1] === "=") {
                    return elements[0] + " is null";
                } else if (elements[2] === "null" && elements[1] === "!=") {
                    return elements[0] + " is not null";
                }

                switch (elements[1]) {
                    case "=":
                    case "!=":
                    case ">":
                    case ">=":
                    case "<":
                    case "<=":
                        return elements[0] + " " + elements[1] + " " + this.getSelectWhereParameter(table, elements[0], parameters, elements[2]);
                    case "contains":
                        return elements[0] + " like '%' || " + this.getSelectWhereParameter(table, elements[0], parameters, elements[2]) + " || '%'";
                    case "notcontains":
                        return elements[0] + " not like '%' || " + this.getSelectWhereParameter(table, elements[0], parameters, elements[2]) + " || '%'";
                    case "startswith":
                        return elements[0] + " like " + this.getSelectWhereParameter(table, elements[0], parameters, elements[2]) + " || '%'";
                    case "endswith":
                        return elements[0] + " like '%' + " + this.getSelectWhereParameter(table, elements[0], parameters, elements[2]);
                    default:
                        throw Error("Operator " + elements[1] + " in filter " + JSON.stringify(where) + " not implemented");
                }
            }
        }
    }
    private getSelectWhereParameter(table: ITable, columnName: string, parameters: any, val: any): string {
        var count = Object.keys(parameters).length + 1;
        var parameterName = "$" + count;

        parameters[parameterName] = this.convertToStorage(table, this.getColumn(table, columnName), val);

        return parameterName;
    }

    private validateBeforeUpdateToStore(table: ITable, item: any): void {
        table.columns.forEach((column): void => {
            var val = item[column.name];

            if (val == null && column.defaultValue != null) {
                val = column.defaultValue;
            }

            if (val == null) {
                return;
            }

            item[column.name] = this.convertToStorage(table, column, val);
        });
    }
    private validateAfterReadFromStore(table: ITable, item: any): void {
        table.columns.forEach((column): void => {
            var val = item[column.name];

            if (val == null) {
                return;
            }

            item[column.name] = this.convertFromStorage(table, column, val);
        });
    }
    private convertToStorage(table: ITable, column: IColumn, val: any): any {
        if (val == null) {
            return;
        }

        switch (column.dataType) {
            case DataTypes.bool:
                return val ? 1 : 0;
            case DataTypes.date:
                return moment(val).format();
            case DataTypes.float:
                return parseFloat(val);
            case DataTypes.int:
                return parseInt(val);
            default:
                break;
        }

        return val;
    }
    private convertFromStorage(table: ITable, column: IColumn, val: any): any {
        if (val == null) {
            return;
        }

        switch (column.dataType) {
            case DataTypes.bool:
                return val ? true : false;
            case DataTypes.date:
                return moment(val).toDate();
            case DataTypes.float:
                return parseFloat(val);
            case DataTypes.int:
                return parseInt(val);
            default:
                break;
        }

        return val;
    }
    private getColumn(table: ITable, columnName: string): IColumn {
        var columns = table.columns.filter((column): boolean => {
            return column.name === columnName;
        });

        if (columns.length !== 1) {
            throw Error("Column " + columnName + " does not exists");
        }

        return columns[0];
    }
}