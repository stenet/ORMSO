var chai = require("chai");
var tc = require("./models");
var dl = require("../lib/DataLayer");
describe("Data Context (Structure)", function () {
    it("Should has DataContext", function () {
        chai.assert(tc.dataCtx != null);
    });
    it("Should has DataModel users", function () {
        chai.assert(tc.dataCtx.getDataModel(tc.users.tableInfo.table) != null);
    });
    it("Should finalize without errors", function () {
        return tc.finalized;
    });
    it("DataModel base should have one column", function () {
        chai.assert(tc.base.tableInfo.table.columns.length === 1);
    });
    it("DataModel users have 5 columns (incl base)", function () {
        chai.assert(tc.users.tableInfo.table.columns.length === 5);
    });
    it("DataModel users should have one child relation", function () {
        chai.assert(tc.users.tableInfo.relationsToChild.length === 1);
    });
    it("DataModel users should have child relation with name 'Profiles'", function () {
        chai.assert(tc.users.tableInfo.relationsToChild[0].parentAssociationName === "Profiles");
    });
});
describe("Data Model (Functions)", function () {
    it("Should create user", function () {
        return tc.finalized
            .then(function () {
            return tc.users.insertAndSelect({
                UserName: "stefan",
                FirstName: "Stefan",
                LastName: "Heim"
            });
        })
            .then(function (r) {
            chai.assert.isNumber(r.Id);
        });
    });
    it("Should create user with Profiles", function () {
        return tc.finalized
            .then(function () {
            return tc.users.insertAndSelect({
                UserName: "stefan",
                FirstName: "Stefan",
                LastName: "Heim",
                Profiles: [
                    { IdProfile: null }
                ]
            });
        })
            .then(function (r) {
            return tc.users.select({
                where: ["Id", r.Id],
                expand: {
                    Profiles: null
                }
            });
        })
            .then(function (r) {
            var i = r[0];
            chai.assert.property(i, "Profiles");
            chai.assert.equal(i.Profiles.length, 1);
            chai.assert.equal(i.Profiles[0].IdUser, i.Id);
        });
    });
    it("Should delete Profile inside User", function () {
        return tc.finalized
            .then(function () {
            return tc.users.insertAndSelect({
                UserName: "stefan",
                FirstName: "Stefan",
                LastName: "Heim",
                Profiles: [
                    { IdProfile: null },
                    { IdProfile: null }
                ]
            });
        })
            .then(function (r) {
            return tc.users.select({
                where: ["Id", r.Id],
                expand: {
                    Profiles: null
                }
            });
        })
            .then(function (r) {
            var i = r[0];
            chai.assert.property(i, "Profiles");
            chai.assert.equal(i.Profiles.length, 2);
            var profiles = i.Profiles;
            profiles.splice(0, 1);
            return tc.users.updateAndSelect(i);
        })
            .then(function (r) {
            return tc.users.select({
                where: ["Id", r.Id],
                expand: {
                    Profiles: null
                }
            });
        })
            .then(function (r) {
            var i = r[0];
            chai.assert.property(i, "Profiles");
            chai.assert.equal(i.Profiles.length, 1);
        });
    });
    it("Testing selectCount", function () {
        return tc.finalized
            .then(function () {
            return tc.users.insertAndSelect({
                UserName: "stefan",
                FirstName: "Stefan",
                LastName: "Heim"
            });
        })
            .then(function (r) {
            return tc.users.selectCount(["Id", r.Id]);
        })
            .then(function (r) {
            chai.assert.equal(r, 1);
        });
    });
    it("Testing where with group or", function () {
        return tc.finalized
            .then(function () {
            return tc.users.insertAndSelect({
                UserName: "Test GroupOr",
                FirstName: "Stefan",
                LastName: "Heim"
            });
        })
            .then(function (r) {
            return tc.users.selectCount([["UserName", "contains", "Test GroupOr"], "or", ["UserName", "contains", "Test GroupOr"], "or", ["UserName", "contains", "Test GroupOr"], "or", ["UserName", "contains", "Test GroupOr"]]);
        })
            .then(function (r) {
            chai.assert.equal(r, 1);
        });
    });
    it("Testing search of expanded value", function () {
        return tc.finalized
            .then(function () {
            return tc.users.insertAndSelect({
                UserName: "stefan",
                FirstName: "Stefan",
                LastName: "Heim",
                Profiles: [
                    { IdProfile: null }
                ]
            });
        })
            .then(function (r) {
            return tc.users.select({
                where: ["Id", r.Id]
            });
        })
            .then(function (r) {
            return tc.usersToProfile.select({
                where: ["User.Id", r[0].Id]
            });
        })
            .then(function (r) {
            var i = r;
            chai.assert.equal(i.length, 1);
        });
    });
    it("Testing search with orderby of expanded value", function () {
        return tc.finalized
            .then(function () {
            return tc.users.insertAndSelect({
                UserName: "TestExpandedOrderBy",
                FirstName: "Stefan",
                LastName: "Heim",
                Profiles: [
                    { IdProfile: null }
                ]
            });
        })
            .then(function (r) {
            return tc.usersToProfile.select({
                where: ["User.Id", r.Id],
                orderBy: [{
                        columnName: "User.UserName",
                        sort: dl.OrderBySort.asc
                    }]
            });
        })
            .then(function (r) {
            var i = r;
            chai.assert.equal(i.length, 1);
        });
    });
    it("Testing child where without parameter", function () {
        return tc.finalized
            .then(function () {
            return tc.users.insertAndSelect({
                UserName: "TestChildWhereWithoutParameter",
                FirstName: "Stefan",
                LastName: "Heim",
                Profiles: [
                    { IdProfile: null, Comment: "TestChildWhereWithoutParameter" }
                ]
            });
        })
            .then(function (r) {
            return tc.users.select({
                where: [["UserName", "TestChildWhereWithoutParameter"], ["Profiles", []]]
            });
        })
            .then(function (r) {
            var i = r;
            chai.assert.equal(i.length, 1);
        });
    });
    it("Testing child where with parameter 1", function () {
        return tc.finalized
            .then(function () {
            return tc.users.insertAndSelect({
                UserName: "TestChildWhereWithParameter1",
                FirstName: "Stefan",
                LastName: "Heim",
                Profiles: [
                    { IdProfile: null, Comment: "TestChildWhereWithParameter1" }
                ]
            });
        })
            .then(function (r) {
            return tc.users.select({
                where: [["Profiles", ["Comment", "TestChildWhereWithParameter1"]]]
            });
        })
            .then(function (r) {
            var i = r;
            chai.assert.equal(i.length, 1);
        });
    });
    it("Testing child where with parameter 2", function () {
        return tc.finalized
            .then(function () {
            return tc.profiles.insert({
                Name: "TestChildWhereWithParameter2"
            });
        })
            .then(function (r) {
            return tc.users.insertAndSelect({
                UserName: "TestChildWhereWithParameter2",
                FirstName: "Stefan",
                LastName: "Heim",
                Profiles: [
                    { IdProfile: r.Id, Comment: "TestChildWhereWithParameter2" }
                ]
            });
        })
            .then(function (r) {
            return tc.users.select({
                where: [["Profiles", ["Profile.Name", "TestChildWhereWithParameter2"]]]
            });
        })
            .then(function (r) {
            var i = r;
            chai.assert.equal(i.length, 1);
        });
    });
    it("Testing child where with parameter 3", function () {
        return tc.finalized
            .then(function (r) {
            return tc.usersToProfile.select({
                where: [["Profile.Users", []]]
            });
        })
            .then(function (r) {
            var i = r;
            chai.assert.notEqual(i.length, 0);
        });
    });
});
//# sourceMappingURL=test.js.map