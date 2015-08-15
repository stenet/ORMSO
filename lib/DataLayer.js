var q = require("q");
var sqlite3 = require("sqlite3");
var moment = require("moment");
var h = require("./helpers");
(function (DataTypes) {
    DataTypes[DataTypes["text"] = 0] = "text";
    DataTypes[DataTypes["int"] = 1] = "int";
    DataTypes[DataTypes["float"] = 2] = "float";
    DataTypes[DataTypes["date"] = 3] = "date";
    DataTypes[DataTypes["bool"] = 4] = "bool";
    DataTypes[DataTypes["blob"] = 5] = "blob";
})(exports.DataTypes || (exports.DataTypes = {}));
var DataTypes = exports.DataTypes;
(function (OrderBySort) {
    OrderBySort[OrderBySort["asc"] = 0] = "asc";
    OrderBySort[OrderBySort["desc"] = 1] = "desc";
})(exports.OrderBySort || (exports.OrderBySort = {}));
var OrderBySort = exports.OrderBySort;
var Sqlite3DataLayer = (function () {
    function Sqlite3DataLayer(fileName) {
        this._database = new sqlite3.Database(fileName, function (err) {
            if (err) {
                throw err;
            }
        });
    }
    Sqlite3DataLayer.prototype.updateSchema = function (table) {
        var _this = this;
        return this.updateTable(table)
            .then(function () {
            return _this.updateIndexes(table);
        });
    };
    Sqlite3DataLayer.prototype.executeQuery = function (query, parameters) {
        var _this = this;
        return this.prepareStatement(query)
            .then(function (preparedStatement) {
            return _this.executeAll(preparedStatement, parameters);
        });
    };
    Sqlite3DataLayer.prototype.executeNonQuery = function (nonQuery, parameters) {
        var _this = this;
        return this.prepareStatement(nonQuery)
            .then(function (preparedStatement) {
            return _this.executeRun(preparedStatement, parameters);
        });
    };
    Sqlite3DataLayer.prototype.insert = function (tableInfo, item) {
        var table = tableInfo.table;
        this.validateBeforeUpdateToStore(table, item);
        var statement = "insert into " + table.name + " ("
            + this.getColumns(table, true, false).map(function (column) { return column.name; }).join(", ") + ")"
            + " values ("
            + this.getColumns(table, true, false).map(function (column) { return "?"; }).join(", ") + ")";
        var parameters = this.getColumns(table, true, false).map(function (column) { return item[column.name]; });
        return this.executeNonQuery(statement, parameters)
            .then(function (r) {
            item[tableInfo.primaryKey.name] = r.lastId;
            return q.resolve(r);
        });
    };
    Sqlite3DataLayer.prototype.update = function (tableInfo, item) {
        var table = tableInfo.table;
        if (!item[tableInfo.primaryKey.name]) {
            throw Error("Trying to update item in " + table.name + ", but item has no primary key");
        }
        this.validateBeforeUpdateToStore(table, item);
        var statement = "update " + table.name + " set "
            + this.getColumns(table, false, false).map(function (column) { return column.name + " = ?"; }).join(", ")
            + " where " + tableInfo.primaryKey.name + " = ?";
        var parameters = this.getColumns(table, false, false).map(function (column) { return item[column.name]; });
        parameters.push(item[tableInfo.primaryKey.name]);
        return this.executeNonQuery(statement, parameters)
            .then(function (r) {
            return q.resolve(r);
        });
    };
    Sqlite3DataLayer.prototype.delete = function (tableInfo, item) {
        var table = tableInfo.table;
        if (!item[tableInfo.primaryKey.name]) {
            throw Error("Trying to delete item in " + table.name + ", but item has no primary key");
        }
        this.validateBeforeUpdateToStore(table, item);
        var statement = "delete from " + table.name
            + " where " + tableInfo.primaryKey.name + " = ?";
        var parameters = [];
        parameters.push(item[tableInfo.primaryKey.name]);
        return this.executeNonQuery(statement, parameters)
            .then(function (r) {
            return q.resolve(r);
        });
    };
    Sqlite3DataLayer.prototype.select = function (tableInfo, selectOptions) {
        var _this = this;
        var parameters = {};
        var statement = this.getSelectColumns(selectOptions)
            + " "
            + this.getSelectFrom(tableInfo.table)
            + " "
            + this.getSelectWhere(tableInfo.table, parameters, selectOptions)
            + " "
            + this.getSelectOrderBy(selectOptions)
            + " "
            + this.getSelectSkip(selectOptions)
            + " "
            + this.getSelectTake(selectOptions);
        return this.executeQuery(statement, parameters)
            .then(function (r) {
            r.forEach(function (row) {
                _this.validateAfterReadFromStore(tableInfo.table, row);
            });
            return q.resolve(r);
        });
    };
    Sqlite3DataLayer.prototype.selectById = function (tableInfo, id) {
        return this.select(tableInfo, {
            where: [tableInfo.primaryKey.name, id]
        });
    };
    Sqlite3DataLayer.prototype.prepareStatement = function (statement) {
        var _this = this;
        return q.Promise(function (res, rej) {
            var preparedStatement = _this._database
                .prepare(statement, function (err) {
                if (err) {
                    rej(err);
                }
                else {
                    res(preparedStatement);
                }
            });
        });
    };
    Sqlite3DataLayer.prototype.executeAll = function (preparedStatement, parameters) {
        return q.Promise(function (res, rej) {
            preparedStatement.all(parameters || {}, function (err, rows) {
                if (err) {
                    rej(err);
                }
                else {
                    res(rows);
                }
            });
        });
    };
    Sqlite3DataLayer.prototype.executeRun = function (preparedStatement, parameters) {
        return q.Promise(function (res, rej) {
            preparedStatement.run(parameters || {}, function (err) {
                if (err) {
                    rej(err);
                }
                else {
                    res({
                        changedRows: preparedStatement.changes,
                        lastId: preparedStatement.lastID
                    });
                }
            });
        });
    };
    Sqlite3DataLayer.prototype.updateTable = function (table) {
        var _this = this;
        return this.executeQuery("PRAGMA table_info(" + table.name + ")")
            .then(function (rows) {
            if (rows.length === 0) {
                return _this.createTable(table);
            }
            else {
                return _this.createColumns(table, rows.map(function (item) { return item.name; }));
            }
        });
    };
    Sqlite3DataLayer.prototype.createTable = function (table) {
        var _this = this;
        var statement = "create table " + table.name + "("
            + table.columns.map(function (column) {
                return _this.getColumnCreateStatement(column);
            }).join(", ")
            + ")";
        return this.executeNonQuery(statement);
    };
    Sqlite3DataLayer.prototype.createColumns = function (table, existingColumns) {
        var _this = this;
        var createColumns = [];
        table.columns.forEach(function (column) {
            if (existingColumns.indexOf(column.name) >= 0) {
                return;
            }
            createColumns.push(column);
        });
        return h.Helpers
            .qSequential(createColumns, function (column) {
            return _this.createColumn(table, column);
        });
    };
    Sqlite3DataLayer.prototype.createColumn = function (table, column) {
        var statement = "alter table " + table.name + " add "
            + this.getColumnCreateStatement(column);
        return this.executeNonQuery(statement);
    };
    Sqlite3DataLayer.prototype.updateIndexes = function (table) {
        var _this = this;
        var createColumns = table.columns
            .filter(function (column) {
            return column.isIndexed === true;
        });
        return h.Helpers
            .qSequential(createColumns, function (column) {
            return _this.updateIndex(table, column);
        });
    };
    Sqlite3DataLayer.prototype.updateIndex = function (table, column) {
        return this.executeQuery("PRAGMA index_info(" + this.getIndexName(table, column) + ")")
            .then(function (rows) {
            if (rows.length > 0) {
                return q.resolve(null);
            }
            else {
            }
        });
    };
    Sqlite3DataLayer.prototype.createIndex = function (table, column) {
        var statement = "create index " + this.getIndexName(table, column)
            + " on " + table.name + " ("
            + column.name + ")";
        return this.executeNonQuery(statement);
    };
    Sqlite3DataLayer.prototype.getColumnCreateStatement = function (column) {
        var dataType;
        return column.name + " " + this.getDataType(column.dataType)
            + (column.isPrimaryKey === true ? " PRIMARY KEY" : "")
            + (column.isAutoIncrement === true ? " AUTOINCREMENT" : "");
    };
    Sqlite3DataLayer.prototype.getDataType = function (dataType) {
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
    };
    Sqlite3DataLayer.prototype.getIndexName = function (table, column) {
        return "ix" + table.name + "_" + column.name;
    };
    Sqlite3DataLayer.prototype.getColumns = function (table, withPrimaryKey, withAutoIncrement) {
        return table.columns.filter(function (column) {
            return (withPrimaryKey || column.isPrimaryKey !== true)
                && (withAutoIncrement || column.isAutoIncrement !== true);
        });
    };
    Sqlite3DataLayer.prototype.getSelectColumns = function (selectOptions) {
        var token = "select ";
        if (!selectOptions || !selectOptions.columns || selectOptions.columns.length === 0) {
            return token + "*";
        }
        return token + selectOptions.columns.map(function (column) { return column.name; })
            .join(", ");
    };
    Sqlite3DataLayer.prototype.getSelectFrom = function (table) {
        return "from " + table.name;
    };
    Sqlite3DataLayer.prototype.getSelectWhere = function (table, parameters, selectOptions) {
        if (!selectOptions || !selectOptions.where) {
            return "";
        }
        var where = this.getSelectWhereComponent(table, parameters, selectOptions.where);
        if (!where) {
            return "";
        }
        return "where " + where;
    };
    Sqlite3DataLayer.prototype.getSelectOrderBy = function (selectOptions) {
        var _this = this;
        if (!selectOptions || !selectOptions.orderBy || selectOptions.orderBy.length === 0) {
            return "";
        }
        return "order by " + selectOptions.orderBy.map(function (orderBy) { return orderBy.column.name + " " + _this.getSelectOrderBySort(orderBy.sort); })
            .join(", ");
    };
    Sqlite3DataLayer.prototype.getSelectOrderBySort = function (sort) {
        switch (sort) {
            case OrderBySort.asc:
                return "asc";
            case OrderBySort.desc:
                return "desc";
            default:
                throw Error(sort + " not implemented");
        }
    };
    Sqlite3DataLayer.prototype.getSelectSkip = function (selectOptions) {
        if (!selectOptions || !selectOptions.skip) {
            return "";
        }
        return "offset " + selectOptions.skip;
    };
    Sqlite3DataLayer.prototype.getSelectTake = function (selectOptions) {
        if (!selectOptions || !selectOptions.take) {
            return "";
        }
        return "limit " + selectOptions.take;
    };
    Sqlite3DataLayer.prototype.getSelectWhereComponent = function (table, parameters, where) {
        var _this = this;
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
            }
            else if (Array.isArray(elements[1])) {
                return elements.map(function (x) { return _this.getSelectWhereComponent(table, parameters, x); }).join(" and ");
            }
            else if (elements.length == 3) {
                return this.getSelectWhereComponent(table, parameters, elements[0])
                    + " " + elements[1]
                    + " " + this.getSelectWhereComponent(table, parameters, elements[2]);
            }
            else {
                throw Error("Invalid filter " + JSON.stringify(where));
            }
        }
        else {
            if (elements.length < 2 || elements.length > 3) {
                throw Error("Invalid Filter " + JSON.stringify(where));
            }
            if (elements.length == 2) {
                if (elements[1] === "null") {
                    return elements[0] + " is null";
                }
                return elements[0] + " = " + this.getSelectWhereParameter(table, elements[0], parameters, elements[1]);
            }
            else if (elements.length == 3) {
                if (elements[2] === "null" && elements[1] === "=") {
                    return elements[0] + " is null";
                }
                else if (elements[2] === "null" && elements[1] === "!=") {
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
    };
    Sqlite3DataLayer.prototype.getSelectWhereParameter = function (table, columnName, parameters, val) {
        var count = Object.keys(parameters).length + 1;
        var parameterName = "$" + count;
        parameters[parameterName] = this.convertToStorage(table, this.getColumn(table, columnName), val);
        return parameterName;
    };
    Sqlite3DataLayer.prototype.validateBeforeUpdateToStore = function (table, item) {
        var _this = this;
        table.columns.forEach(function (column) {
            var val = item[column.name];
            if (val == null && column.defaultValue != null) {
                val = column.defaultValue;
            }
            if (val == null) {
                return;
            }
            item[column.name] = _this.convertToStorage(table, column, val);
        });
    };
    Sqlite3DataLayer.prototype.validateAfterReadFromStore = function (table, item) {
        var _this = this;
        table.columns.forEach(function (column) {
            var val = item[column.name];
            if (val == null) {
                return;
            }
            item[column.name] = _this.convertFromStorage(table, column, val);
        });
    };
    Sqlite3DataLayer.prototype.convertToStorage = function (table, column, val) {
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
    };
    Sqlite3DataLayer.prototype.convertFromStorage = function (table, column, val) {
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
    };
    Sqlite3DataLayer.prototype.getColumn = function (table, columnName) {
        var columns = table.columns.filter(function (column) {
            return column.name === columnName;
        });
        if (columns.length !== 1) {
            throw Error("Column " + columnName + " does not exists");
        }
        return columns[0];
    };
    return Sqlite3DataLayer;
})();
exports.Sqlite3DataLayer = Sqlite3DataLayer;
//# sourceMappingURL=DataLayer.js.map