var h = require("./helpers");
var q = require("q");
var DataContext = (function () {
    function DataContext(dataLayer) {
        this.dataLayer = dataLayer;
        this._dataModels = [];
        this._hasFinalizeDone = false;
    }
    DataContext.prototype.createDataModel = function (table, baseModel) {
        if (baseModel) {
            this.inheritTableFromBaseModel(table, baseModel);
        }
        this.validateTable(table);
        var dataModel = new DataModel(this, this.createTableInfo(table, baseModel));
        this._dataModels.push(dataModel);
        return dataModel;
    };
    DataContext.prototype.getDataModel = function (table) {
        var dataModels = this._dataModels.filter(function (dataModel) {
            return dataModel.tableInfo.table.name == table.name;
        });
        if (dataModels.length !== 1) {
            throw Error("Table " + table.name + " does not exist in current DataContext");
        }
        return dataModels[0];
    };
    DataContext.prototype.finalizeInitialize = function () {
        var _this = this;
        if (this._hasFinalizeDone) {
            throw Error("Finalize should be executed only once");
        }
        this._hasFinalizeDone = true;
        return this.updateSchema()
            .then(function () {
            return _this.addRelationInfoToTableInfo();
        });
    };
    DataContext.prototype.hasFinalizeDone = function () {
        return this._hasFinalizeDone;
    };
    DataContext.prototype.addRelationInfoToTableInfo = function () {
        var _this = this;
        this.getNonAbstractDataModels().forEach(function (dataModel) {
            var table = dataModel.tableInfo.table;
            table.columns.forEach(function (column) {
                if (!column.relation) {
                    return;
                }
                var parentDataModel = _this.getDataModel(column.relation.parentTable);
                var relationInfo = {
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
    };
    DataContext.prototype.createTableInfo = function (table, baseModel) {
        var primaryKey = table.columns.filter(function (column) {
            return column.isPrimaryKey === true;
        });
        var tableInfo = {
            table: table,
            primaryKey: primaryKey[0],
            baseTableInfo: (baseModel ? baseModel.tableInfo : null),
            relationsToChild: [],
            relationsToParent: []
        };
        return tableInfo;
    };
    DataContext.prototype.getNonAbstractDataModels = function () {
        return this._dataModels.filter(function (dataModel) {
            return dataModel.tableInfo.table.isAbstract !== true;
        });
    };
    DataContext.prototype.inheritTableFromBaseModel = function (table, baseModel) {
        (baseModel).tableInfo.table.columns
            .forEach(function (column) {
            table.columns.push(column);
        });
    };
    DataContext.prototype.updateSchema = function () {
        var _this = this;
        return h.Helpers
            .qSequential(this.getNonAbstractDataModels(), function (dataModel) {
            return _this.dataLayer.updateSchema(dataModel.tableInfo.table);
        });
    };
    DataContext.prototype.validateTable = function (table) {
        if (!table.isAbstract) {
            var primaryKeys = table.columns.filter(function (column) {
                return column.isPrimaryKey === true;
            });
            if (primaryKeys.length != 1) {
                throw Error("Table " + table.name + " has no PrimaryKey");
            }
        }
    };
    return DataContext;
})();
exports.DataContext = DataContext;
var DataModel = (function () {
    function DataModel(dataContext, tableInfo) {
        this.dataContext = dataContext;
        this.tableInfo = tableInfo;
        this._fixedWhere = [];
        this._beforeInsertCallbacks = [];
        this._afterInsertCallbacks = [];
        this._beforeUpdateCallbacks = [];
        this._afterUpdateCallbacks = [];
        this._beforeDeleteCallbacks = [];
        this._afterDeleteCallbacks = [];
        this._dataLayer = dataContext.dataLayer;
    }
    DataModel.prototype.onBeforeInsert = function (callback) {
        this._beforeInsertCallbacks.push(callback);
    };
    DataModel.prototype.onAfterInsert = function (callback) {
        this._afterInsertCallbacks.push(callback);
    };
    DataModel.prototype.onBeforeUpdate = function (callback) {
        this._beforeUpdateCallbacks.push(callback);
    };
    DataModel.prototype.onAfterUpdate = function (callback) {
        this._afterUpdateCallbacks.push(callback);
    };
    DataModel.prototype.onBeforeDelete = function (callback) {
        this._beforeDeleteCallbacks.push(callback);
    };
    DataModel.prototype.onAfterDelete = function (callback) {
        this._afterDeleteCallbacks.push(callback);
    };
    DataModel.prototype.insert = function (itemToCreate) {
        var _this = this;
        if (!itemToCreate) {
            return q.reject("No item to insert specified");
        }
        return this.executeTrigger(itemToCreate, "_beforeInsertCallbacks")
            .then(function () {
            return _this._dataLayer.insert(_this.tableInfo, itemToCreate);
        })
            .then(function () {
            return _this.saveChildRelations(itemToCreate);
        })
            .then(function () {
            return _this.executeTrigger(itemToCreate, "_afterInsertCallbacks");
        })
            .then(function () {
            return q.resolve(itemToCreate);
        });
    };
    DataModel.prototype.insertAndSelect = function (itemToCreate) {
        var _this = this;
        if (!itemToCreate) {
            return q.reject("No item to insert specified");
        }
        return this.insert(itemToCreate)
            .then(function () {
            return _this.selectById(itemToCreate[_this.tableInfo.primaryKey.name]);
        })
            .then(function (rows) {
            if (rows.length === 1) {
                return q.resolve(rows[0]);
            }
            else {
                return q.resolve(null);
            }
        });
    };
    DataModel.prototype.update = function (itemToUpdate) {
        var _this = this;
        if (!itemToUpdate) {
            return q.reject("No item to update specified");
        }
        return this.executeTrigger(itemToUpdate, "_beforeUpdateCallbacks")
            .then(function () {
            return _this._dataLayer.update(_this.tableInfo, itemToUpdate);
        })
            .then(function () {
            return _this.saveChildRelations(itemToUpdate);
        })
            .then(function () {
            return _this.executeTrigger(itemToUpdate, "_afterUpdateCallbacks");
        })
            .then(function () {
            return q.resolve(itemToUpdate);
        });
    };
    DataModel.prototype.updateAndSelect = function (itemToUpdate) {
        var _this = this;
        if (!itemToUpdate) {
            return q.reject("No item to update specified");
        }
        return this.update(itemToUpdate)
            .then(function () {
            return _this.selectById(itemToUpdate[_this.tableInfo.primaryKey.name]);
        })
            .then(function (rows) {
            if (rows.length === 1) {
                return q.resolve(rows[0]);
            }
            else {
                return q.resolve(null);
            }
        });
    };
    DataModel.prototype.updateItems = function (valuesToUpdate, where) {
        var _this = this;
        return this.select(this.createCustomSelectOptions({
            where: where
        }))
            .then(function (rows) {
            return h.Helpers.qSequential(rows, function (row) {
                for (var element in valuesToUpdate) {
                    row[element] = valuesToUpdate[element];
                }
                return _this.update(row);
            });
        });
    };
    DataModel.prototype.updateOrInsert = function (item) {
        var _this = this;
        return q.fcall(function () {
            var id = item[_this.tableInfo.primaryKey.name];
            if (id) {
                return _this.selectById(id);
            }
            else {
                return q.resolve(null);
            }
        })
            .then(function (r) {
            var arr = r;
            if (arr && arr.length > 0) {
                return _this.update(item);
            }
            else {
                return _this.insert(item);
            }
        })
            .then(function () {
            return q.resolve(item);
        });
    };
    DataModel.prototype.updateOrInsertAndSelect = function (item) {
        var _this = this;
        return this.updateOrInsert(item)
            .then(function (r) {
            return _this.selectById(item[_this.tableInfo.primaryKey.name]);
        });
    };
    DataModel.prototype.delete = function (itemToDelete) {
        var _this = this;
        if (!itemToDelete) {
            return q.reject("No item to delete specified");
        }
        return this.executeTrigger(itemToDelete, "_beforeDeleteCallbacks")
            .then(function () {
            return _this._dataLayer.delete(_this.tableInfo, itemToDelete);
        })
            .then(function () {
            return _this.executeTrigger(itemToDelete, "_afterDeleteCallbacks");
        });
    };
    DataModel.prototype.selectById = function (id) {
        return this._dataLayer.selectById(this.tableInfo, id);
    };
    DataModel.prototype.select = function (selectOptions) {
        var _this = this;
        return this._dataLayer.select(this.tableInfo, this.createCustomSelectOptions(selectOptions))
            .then(function (r) {
            if (!selectOptions.expand) {
                return q.resolve(r);
            }
            return h.Helpers.qSequential(selectOptions.expand, function (item) {
                return _this.expand(item, r);
            })
                .then(function () {
                return q.resolve(r);
            });
        });
    };
    DataModel.prototype.appendFixedWhere = function (where) {
        this._fixedWhere.push(where);
    };
    DataModel.prototype.getColumn = function (columnName) {
        var columns = this.tableInfo.table.columns.filter(function (column) {
            return column.name === columnName;
        });
        if (columns.length === 1) {
            return columns[0];
        }
        return null;
    };
    DataModel.prototype.createCustomSelectOptions = function (selectOptions) {
        selectOptions = selectOptions || {};
        selectOptions = h.Helpers.extend({}, selectOptions);
        selectOptions.where = this.getCombinedWhere(selectOptions.where);
        return selectOptions;
    };
    DataModel.prototype.getBaseTables = function () {
        var baseTables = [];
        var baseTableInfo = this.tableInfo.baseTableInfo;
        while (baseTableInfo) {
            baseTables.push(baseTableInfo.table);
            baseTableInfo = baseTableInfo.baseTableInfo;
        }
        return baseTables;
    };
    DataModel.prototype.getCombinedWhere = function (customWhere) {
        var newWhere = [];
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
    };
    DataModel.prototype.expand = function (expand, rows) {
        var _this = this;
        var expandKeys = expand.split('/');
        var parentRelations = this.tableInfo.relationsToParent.filter(function (relation) {
            return relation.childAssociationName === expandKeys[0];
        });
        if (parentRelations.length === 1) {
            var parentRelation = parentRelations[0];
            return h.Helpers.qSequential(rows, function (row) {
                var dataModel = _this.dataContext.getDataModel(parentRelation.parentTableInfo.table);
                return dataModel.select({
                    where: [parentRelation.parentPrimaryKey.name, row[parentRelation.childColumn.name]]
                })
                    .then(function (r) {
                    if (r.length === 1) {
                        row[parentRelation.childAssociationName] = r[0];
                        expandKeys.shift();
                        return _this.expand(expandKeys.join("/"), [r[0]]);
                    }
                    return q.resolve(null);
                });
            });
        }
        var childRelations = this.tableInfo.relationsToChild.filter(function (relation) {
            return relation.parentAssociationName === expandKeys[0];
        });
        if (childRelations.length === 1) {
            var childRelation = childRelations[0];
            return h.Helpers.qSequential(rows, function (row) {
                var dataModel = _this.dataContext.getDataModel(childRelation.childTableInfo.table);
                return dataModel.select({
                    where: [childRelation.childColumn.name, row[childRelation.parentPrimaryKey.name]]
                })
                    .then(function (r) {
                    row[childRelation.parentAssociationName] = r;
                    expandKeys.shift();
                    return _this.expand(expandKeys.join("/"), r);
                });
            });
        }
        return q.resolve(null);
    };
    DataModel.prototype.saveChildRelations = function (row) {
        var _this = this;
        return h.Helpers.qSequential(this.tableInfo.relationsToChild, function (relation) {
            if (!row[relation.childAssociationName]) {
                return q.resolve(null);
            }
            var children = row[relation.childAssociationName];
            if (!Array.isArray(children)) {
                return q.resolve(null);
            }
            var dataModel = _this.dataContext.getDataModel(relation.childTableInfo.table);
            return h.Helpers.qSequential(children, function (child) {
                child[relation.childColumn.name] = row[relation.parentPrimaryKey.name];
                return dataModel.updateOrInsert(child);
            });
        });
    };
    DataModel.prototype.executeTrigger = function (itemToChange, eventVariable) {
        var _this = this;
        if (!this[eventVariable]) {
            throw Error("EventVariable " + eventVariable + " does not exist");
        }
        var callbacks = [];
        callbacks = [].concat(this[eventVariable]);
        this.getBaseTables().forEach(function (baseTable) {
            var baseModel = _this.dataContext.getDataModel(baseTable);
            callbacks = [].concat(callbacks).concat(baseModel[eventVariable]);
        });
        return h.Helpers.qSequential(callbacks, function (item) {
            return item(itemToChange);
        });
    };
    return DataModel;
})();
exports.DataModel = DataModel;
//# sourceMappingURL=DataContext.js.map