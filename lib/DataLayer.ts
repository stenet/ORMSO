"use strict";

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
export interface IPreparedStatements {
    insert: any;
    update: any;
    delete: any;
}

export enum OrderBySort {
    asc,
    desc
}
export interface IOrderBy {
    columnName: string;
    sort: OrderBySort;
}
export interface ISelectOptionsDataLayer {
    columns?: string[],
    where?: any,
    orderBy?: IOrderBy[],
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
    /** Validates the database schema and creates indexes and tables/column; does not remove columns (at least now) */
    updateSchema(table: ITable): q.Promise<boolean>;

    /** Starts a transaction */
    beginTransaction(): q.Promise<any>;
    /** Commits a transaction */
    commitTransaction(): q.Promise<any>;

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
    select(tableInfo: ITableInfo, selectOptions?: ISelectOptionsDataLayer): q.Promise<any[]>;
    /** Selects an item from the database by its id */
    selectById(tableInfo: ITableInfo, id: any): q.Promise<any>;
    /** Selects the count */
    selectCount(tableInfo: ITableInfo, where?: any): q.Promise<number>;
}
export class Sqlite3DataLayer implements IDataLayer {
    private _database: sqlite3.Database;
    private _inTransaction: number = 0;
    private _preparedStatements: IPreparedStatements;

    constructor(fileName: string) {
        this._database = new sqlite3.Database(fileName, (err): void => {
            if (err) {
                throw err;
            }
        });
    }

    updateSchema(table: ITable): q.Promise<boolean> {
        return this.updateTable(table)
            .then((hasChanged: boolean): q.Promise<boolean> => {
                return this
                    .updateIndexes(table)
                    .then((): q.Promise<boolean> => {
                        return q.resolve(hasChanged);
                    });
            });
    }

    beginTransaction(): q.Promise<any> {
        this.executeNonQuery("BEGIN");

        if (this._inTransaction == 0) {
            this._preparedStatements = {
                insert: {},
                update: {},
                delete: {}
            };
        }

        this._inTransaction++;

        return q.resolve(true);
    }
    commitTransaction(): q.Promise<any> {
        this.executeNonQuery("COMMIT");
        this._inTransaction--;

        if (this._inTransaction == 0) {
            this._preparedStatements = null;
        }

        return q.resolve(true);
    }

    executeQuery(query: string, parameters?: any | any[]): q.Promise<any[]> {
        return this.prepareStatement(query)
            .then((preparedStatement): q.Promise<any[]> => {
                return this.executeAll(preparedStatement, parameters);
            })
            .catch((r): q.Promise<any[]> => {
                console.log(r);
                console.log(query);
                return q.reject<any[]>(r);
            });
    }
    executeNonQuery(nonQuery: string, parameters?: any | any[]): q.Promise<IExecuteNonQueryResult> {
        return this.prepareStatement(nonQuery)
            .then((preparedStatement): q.Promise<IExecuteNonQueryResult> => {
                return this.executeRun(preparedStatement, parameters);
            })
            .catch((r): q.Promise<IExecuteNonQueryResult> => {
                console.log(r);
                console.log(nonQuery);
                return q.reject<IExecuteNonQueryResult>(r);
            });
    }

    insert(tableInfo: ITableInfo, item: any): q.Promise<IExecuteNonQueryResult> {
        var table = tableInfo.table;

        this.validateBeforeUpdateToStore(table, item);

        var key = tableInfo.table.name;
        var parameters = this.getColumns(table, true, false).map((column): any => item[column.name]);
        
        if (!this._preparedStatements || !this._preparedStatements.insert[key]) {
            var statement = "insert into " + table.name + " ("
                + this.getColumns(table, true, false).map((column): string => column.name).join(", ") + ")"
                + " values ("
                + this.getColumns(table, true, false).map((column): string => "?").join(", ") + ")";

            return this.prepareStatement(statement)
                .then((preparedStatement): q.Promise<IExecuteNonQueryResult> => {
                    if (this._preparedStatements) {
                        this._preparedStatements.insert[key] = preparedStatement;
                    }

                    return this.executeRun(preparedStatement, parameters);
                })
                .then((r): q.Promise<IExecuteNonQueryResult> => {
                    item[tableInfo.primaryKey.name] = r.lastId;
                    return q.resolve(r);
                })
                .catch((r): q.Promise<any> => {
                    console.log(r);
                    console.log(statement);
                    return q.reject(r);
                });
        } else {
            return this.executeRun(this._preparedStatements.insert[key], parameters)
                .then((r): q.Promise<IExecuteNonQueryResult> => {
                    item[tableInfo.primaryKey.name] = r.lastId;
                    return q.resolve(r);
                });
        }
    }
    update(tableInfo: ITableInfo, item: any): q.Promise<IExecuteNonQueryResult> {
        var table = tableInfo.table;

        if (!item[tableInfo.primaryKey.name]) {
            throw Error("Trying to update item in " + table.name + ", but item has no primary key");
        }

        this.validateBeforeUpdateToStore(table, item);

        var key = tableInfo.table.name;
        var parameters = this.getColumns(table, false, false, item).map((column): any => item[column.name]);
        parameters.push(item[tableInfo.primaryKey.name]);

        if (!this._preparedStatements || !this._preparedStatements.update[key]) {
            var statement = "update " + table.name + " set "
                + this.getColumns(table, false, false, item).map((column): string => column.name + " = ?").join(", ")
                + " where " + tableInfo.primaryKey.name + " = ?";

            return this.prepareStatement(statement)
                .then((preparedStatement): q.Promise<IExecuteNonQueryResult> => {
                    if (this._preparedStatements) {
                        this._preparedStatements.update[key] = preparedStatement;
                    }

                    return this.executeRun(preparedStatement, parameters);
                })
                .then((r): q.Promise<IExecuteNonQueryResult> => {
                    return q.resolve(r);
                })
                .catch((r): q.Promise<any> => {
                    console.log(r);
                    console.log(statement);
                    return q.reject(r);
                });
        } else {
            return this.executeRun(this._preparedStatements.update[key], parameters)
                .then((r): q.Promise<IExecuteNonQueryResult> => {
                    return q.resolve(r);
                });
        }
    }
    delete(tableInfo: ITableInfo, item: any): q.Promise<IExecuteNonQueryResult> {
        var table = tableInfo.table;

        if (!item[tableInfo.primaryKey.name]) {
            throw Error("Trying to delete item in " + table.name + ", but item has no primary key");
        }

        this.validateBeforeUpdateToStore(table, item);

        var key = tableInfo.table.name;
        var parameters: any[] = [];
        parameters.push(item[tableInfo.primaryKey.name]);

        if (!this._preparedStatements || !this._preparedStatements.delete[key]) {
            var statement = "delete from " + table.name
                + " where " + tableInfo.primaryKey.name + " = ?";

            return this.prepareStatement(statement)
                .then((preparedStatement): q.Promise<IExecuteNonQueryResult> => {
                    if (this._preparedStatements) {
                        this._preparedStatements.delete[key] = preparedStatement;
                    }

                    return this.executeRun(preparedStatement, parameters);
                })
                .then((r): q.Promise<IExecuteNonQueryResult> => {
                    return q.resolve(r);
                })
                .catch((r): q.Promise<any> => {
                    console.log(r);
                    console.log(statement);
                    return q.reject(r);
                });
        } else {
            return this.executeRun(this._preparedStatements.delete[key], parameters)
                .then((r): q.Promise<IExecuteNonQueryResult> => {
                    return q.resolve(r);
                });
        }
    }
    select(tableInfo: ITableInfo, selectOptions?: ISelectOptionsDataLayer): q.Promise<any[]> {
        var parameters = {};

        var statement = this.getSelectColumns(selectOptions)
            + " "
            + this.getSelectFrom(tableInfo.table)
            + " "
            + this.getSelectWhere(tableInfo, parameters, selectOptions)
            + " "
            + this.getSelectOrderBy(tableInfo, selectOptions)
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
        })
            .then((r): q.Promise<any> => {
                if (r.length > 0) {
                    return q.resolve(r[0]);
                } else {
                    return q.resolve(null);
                }
            });
    }
    selectCount(tableInfo: ITableInfo, where?: any): q.Promise<number> {
        var parameters = {};

        var statement = "select count(*) as Count"
            + " "
            + this.getSelectFrom(tableInfo.table)
            + " "
            + this.getSelectWhere(tableInfo, parameters, { where: where });

        return this.executeQuery(statement, parameters)
            .then((r): q.Promise<number> => {
                return q.resolve(r[0].Count);
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

    private updateTable(table: ITable): q.Promise<boolean> {
        return this.executeQuery("PRAGMA table_info(" + table.name + ")")
            .then((rows): q.Promise<any> => {
                if (rows.length === 0) {
                    return this.createTable(table);
                } else {
                    return this.createColumns(table, rows.map((item): string => item.name));
                }
            });
    }
    private createTable(table: ITable): q.Promise<boolean> {
        var statement =
            "create table " + table.name + "("
            + table.columns.map((column): string => {
                return this.getColumnCreateStatement(column);
            }).join(", ")
            + ")";

        return this
            .executeNonQuery(statement)
            .then((): q.Promise<boolean> => {
                return q.resolve(false);
            });
    }
    private createColumns(table: ITable, existingColumns: string[]): q.Promise<boolean> {
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
            })
            .then((): q.Promise<boolean> => {
                return q.resolve(createColumns.length > 0);
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
                    return this.createIndex(table, column);
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
    private getColumns(table: ITable, withPrimaryKey: boolean, withAutoIncrement: boolean, objectToCheck?: any): IColumn[] {
        return table.columns.filter((column): boolean => {
            return (withPrimaryKey || column.isPrimaryKey !== true)
                && (withAutoIncrement || column.isAutoIncrement !== true)
                && (!objectToCheck || (objectToCheck[column.name] !== undefined));
        });
    }

    private getSelectColumns(selectOptions?: ISelectOptionsDataLayer): string {
        var token = "select ";

        if (!selectOptions || !selectOptions.columns || selectOptions.columns.length === 0) {
            return token + "*";
        }

        return token + selectOptions.columns.join(", ");
    }
    private getSelectFrom(table: ITable): string {
        return "from " + table.name;
    }
    private getSelectWhere(tableInfo: ITableInfo, parameters: any, selectOptions?: ISelectOptionsDataLayer): string {
        if (!selectOptions || !selectOptions.where) {
            return "";
        }

        var where = this.getSelectWhereComponent(tableInfo, parameters, selectOptions.where);
        if (!where) {
            return "";
        }

        return "where " + where;
    }
    private getSelectOrderBy(tableInfo: ITableInfo, selectOptions?: ISelectOptionsDataLayer): string {
        if (!selectOptions || !selectOptions.orderBy || selectOptions.orderBy.length === 0) {
            return "";
        }

        return "order by " + selectOptions.orderBy.map((orderBy): string => {
            return this.getSelectFieldName(tableInfo, orderBy.columnName) + " " + this.getSelectOrderBySort(orderBy.sort);
        })
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
    private getSelectTake(selectOptions?: ISelectOptionsDataLayer): string {
        if (!selectOptions || !selectOptions.take) {
            return "";
        }

        return "limit " + selectOptions.take;
    }
    private getSelectSkip(selectOptions?: ISelectOptionsDataLayer): string {
        if (!selectOptions || !selectOptions.skip) {
            return "";
        }

        return "offset " + selectOptions.skip;
    }
    private getSelectWhereComponent(tableInfo: ITableInfo, parameters: any, where: any): string {
        var elements: any[] = where;

        if (elements.length == 0) {
            return "";
        }

        if (Array.isArray(elements[0])) {
            if (elements.length == 1) {
                var result = this.getSelectWhereComponent(tableInfo, parameters, elements[0]);

                if (result) {
                    return "(" + result + ")";
                } else {
                    return ""; 
                }
            } else if (Array.isArray(elements[1])) {
                var result = elements.map((x): string => this.getSelectWhereComponent(tableInfo, parameters, x)).join(" and ");

                if (result) {
                    return "(" + result + ")";
                } else {
                    return "";
                }
            } else if (elements.length >= 3) {
                var result = this.getSelectWhereComponent(tableInfo, parameters, elements[0]);

                for (var index = 1; index < elements.length; index = index + 2) {
                    result += " " + elements[index]
                    + " " + this.getSelectWhereComponent(tableInfo, parameters, elements[index + 1])
                }

                if (result) {
                    return "(" + result + ")";
                } else {
                    return "";
                }
            } else {
                throw Error("Invalid filter " + JSON.stringify(where));
            }
        } else {
            if (elements.length < 2 || elements.length > 3) {
                throw Error("Invalid Filter " + JSON.stringify(where));
            }

            var fieldName = this.getSelectFieldName(tableInfo, elements[0]);

            if (elements.length == 2) {
                if (elements[1] === "null") {
                    return fieldName + " is null";
                }

                return fieldName + " = " + this.getSelectWhereParameter(tableInfo, elements[0], parameters, elements[1]);

            } else if (elements.length == 3) {
                if (elements[2] === "null" && elements[1] === "=") {
                    return fieldName + " is null";
                } else if (elements[2] === "null" && (elements[1] === "!=" || elements[1] === "<>")) {
                    return fieldName + " is not null";
                }

                switch (elements[1]) {
                    case "=":
                    case "!=":
                    case ">":
                    case ">=":
                    case "<":
                    case "<=":
                        return fieldName + " " + elements[1] + " " + this.getSelectWhereParameter(tableInfo, elements[0], parameters, elements[2]);
                    case "<>":
                        return fieldName + " != " + this.getSelectWhereParameter(tableInfo, elements[0], parameters, elements[2]);
                    case "contains":
                        return fieldName + " like '%' || " + this.getSelectWhereParameter(tableInfo, elements[0], parameters, elements[2]) + " || '%'";
                    case "notcontains":
                        return fieldName + " not like '%' || " + this.getSelectWhereParameter(tableInfo, elements[0], parameters, elements[2]) + " || '%'";
                    case "startswith":
                        return fieldName + " like " + this.getSelectWhereParameter(tableInfo, elements[0], parameters, elements[2]) + " || '%'";
                    case "endswith":
                        return fieldName + " like '%' + " + this.getSelectWhereParameter(tableInfo, elements[0], parameters, elements[2]);
                    default:
                        throw Error("Operator " + elements[1] + " in filter " + JSON.stringify(where) + " not implemented");
                }
            }
        }
    }
    private getSelectWhereParameter(tableInfo: ITableInfo, columnName: string, parameters: any, val: any): string {
        var count = Object.keys(parameters).length + 1;
        var parameterName = "$" + count;

        parameters[parameterName] = this.convertToStorage(tableInfo.table, this.getColumn(tableInfo, columnName), val);

        return parameterName;
    }
    private getSelectFieldName(tableInfo: ITableInfo, columnName: string): string {
        if (columnName.indexOf(".") < 0) {
            return columnName;
        } else {
            var columnNames = columnName.split(".");
            var relations: IRelationInfo[] = [];

            for (var i = 0; i < columnNames.length - 1; i++) {
                var info: ITableInfo;

                if (i == 0) {
                    info = tableInfo;
                } else {
                    info = relations[i - 1].parentTableInfo;
                }

                var relationInfos = info.relationsToParent.filter((relation): boolean => {
                    return relation.childAssociationName === columnNames[i];
                });

                if (relationInfos.length != 1) {
                    throw Error("Relation for fieldname " + columnName + " does not exists");
                }

                relations.push(relationInfos[0]);
            }

            var sql = "";
            sql += "(select n" + (relations.length - 1) + "." + columnNames[columnNames.length - 1];
            sql += " from ";

            for (var i = 0; i < relations.length; i++) {
                if (i > 0) {
                    sql += ", ";
                }

                sql += relations[i].parentTableInfo.table.name + " n" + i;
            }

            sql += " where ";

            for (var i = 0; i < relations.length; i++) {
                if (i > 0) {
                    sql += " and ";
                    sql += ("n" + i) + "." + relations[i].parentPrimaryKey.name + " = " + ("n" + (i - 1)) + "." + relations[i].childColumn.name;
                } else {
                    sql += ("n" + i) + "." + relations[i].parentPrimaryKey.name + " = " + tableInfo.table.name + "." + relations[i].childColumn.name;
                }
            }

            sql += ")";

            return sql;
        }
    }

    private validateBeforeUpdateToStore(table: ITable, item: any): void {
        table.columns.forEach((column): void => {
            var val = item[column.name];

            if (val == null && column.defaultValue != null) {
                val = column.defaultValue;
            }
            if (val == null && column.dataType == DataTypes.bool) {
                val = false;
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
    private getColumn(tableInfo: ITableInfo, columnName: string): IColumn {
        if (columnName.indexOf(".") < 0) {
            var columns = tableInfo.table.columns.filter((column): boolean => {
                return column.name === columnName;
            });

            if (columns.length !== 1) {
                throw Error("Column " + columnName + " does not exists");
            }

            return columns[0];
        } else {
            var columnNames = columnName.split(".");

            var relationInfos = tableInfo.relationsToParent.filter((relation): boolean => {
                return relation.childAssociationName === columnNames[0];
            });

            if (relationInfos.length != 1) {
                throw Error("Relation for fieldname " + columnName + " does not exists");
            }

            return this.getColumn(relationInfos[0].parentTableInfo, columnNames.splice(1).join("."));
        }
    }
}