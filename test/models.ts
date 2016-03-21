import dc = require("../lib/DataContext");
import fs = require("fs");
import o = require("../index");

if (fs.existsSync("test.db")) {
    fs.unlinkSync("test.db");
}

var sqlite3 = new o.DataLayers.Sqlite3DataLayer("test.db");
var dataCtx = new o.DataContexts.DataContext(sqlite3);

var base = dataCtx.createDataModel({
    name: "base",
    isAbstract: true,
    columns: [
        { name: "Id", dataType: o.DataLayers.DataTypes.int, isPrimaryKey: true, isAutoIncrement: true }
    ]
});
var users = dataCtx.createDataModel({
    name: "users",
    columns: [
        { name: "UserName", dataType: o.DataLayers.DataTypes.text },
        { name: "FirstName", dataType: o.DataLayers.DataTypes.text },
        { name: "LastName", dataType: o.DataLayers.DataTypes.text },
        { name: "Email", dataType: o.DataLayers.DataTypes.text }
    ]
}, base);
var profiles = dataCtx.createDataModel({
    name: "profiles",
    columns: [
        { name: "Name", dataType: o.DataLayers.DataTypes.text }
    ]
}, base);
var usersToProfile = dataCtx.createDataModel({
    name: "users_to_profile",
    columns: [
        { name: "IdUser", dataType: o.DataLayers.DataTypes.text, relation: { parentTable: users.tableInfo.table, parentAssociationName: "Profiles", childAssociationName: "User" } },
        { name: "IdProfile", dataType: o.DataLayers.DataTypes.text, relation: { parentTable: profiles.tableInfo.table, parentAssociationName: "Users", childAssociationName: "Profile" } },
        { name: "Comment", dataType: o.DataLayers.DataTypes.text }
    ]
}, base);

var finalized = dataCtx.finalizeInitialize();

export = {
    base: base,
    users: users,
    profiles: profiles,
    usersToProfile: usersToProfile,
    dataCtx: dataCtx,
    finalized: finalized
}