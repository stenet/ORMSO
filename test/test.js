var chai = require("chai");
var tc = require("./models");
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
                expand: ["Profiles"]
            });
        })
            .then(function (r) {
            var i = r[0];
            chai.assert.property(i, "Profiles");
            chai.assert.equal(i.Profiles.length, 1);
            chai.assert.equal(i.Profiles[0].IdUser, i.Id);
        });
    });
});
//# sourceMappingURL=test.js.map