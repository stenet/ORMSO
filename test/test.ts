import q = require("q");
import chai = require("chai");
import tc = require("./models");
import dl = require("../lib/DataLayer");

describe("Data Context (Structure)", () => {
    it("Should has DataContext", () => {
        chai.assert(tc.dataCtx != null);
    });
    it("Should has DataModel users", () => {
        chai.assert(tc.dataCtx.getDataModel(tc.users.tableInfo.table) != null);
    });

    it("Should finalize without errors", () => {
        return tc.finalized;
    })

    it("DataModel base should have one column", () => {
        chai.assert(tc.base.tableInfo.table.columns.length === 1);
    });
    it("DataModel users have 5 columns (incl base)", () => {
        chai.assert(tc.users.tableInfo.table.columns.length === 5);
    });

    it("DataModel users should have one child relation", () => {
        chai.assert(tc.users.tableInfo.relationsToChild.length === 1);
    });
    it("DataModel users should have child relation with name 'Profiles'", () => {
        chai.assert(tc.users.tableInfo.relationsToChild[0].parentAssociationName === "Profiles");
    });
});

describe("Data Model (Functions)", () => {
    it("Should create user", () => {
        return tc.finalized
            .then((): q.Promise<any> => {
                return tc.users.insertAndSelect({
                    UserName: "stefan",
                    FirstName: "Stefan",
                    LastName: "Heim"
                });
            })
            .then((r): void => {
                chai.assert.isNumber(r.Id);
            });
    });

    it("Should create user with Profiles", () => {
        return tc.finalized
            .then((): q.Promise<any> => {
                return tc.users.insertAndSelect({
                    UserName: "stefan",
                    FirstName: "Stefan",
                    LastName: "Heim",
                    Profiles: [
                        { IdProfile: null }
                    ]
                });
            })
            .then((r): q.Promise<any> => {
                return tc.users.select({
                    where: ["Id", r.Id],
                    expand: {
                        Profiles: null
                    }
                });
            })
            .then((r): void => {
                var i = r[0];

                chai.assert.property(i, "Profiles");
                chai.assert.equal(i.Profiles.length, 1);
                chai.assert.equal(i.Profiles[0].IdUser, i.Id);
            });
    });
    it("Should delete Profile inside User", () => {
        return tc.finalized
            .then((): q.Promise<any> => {
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
            .then((r): q.Promise<any> => {
                return tc.users.select({
                    where: ["Id", r.Id],
                    expand: {
                        Profiles: null
                    }
                });
            })
            .then((r): q.Promise<any> => {
                var i = r[0];

                chai.assert.property(i, "Profiles");
                chai.assert.equal(i.Profiles.length, 2);

                var profiles: any[] = i.Profiles;
                profiles.splice(0, 1);

                return tc.users.updateAndSelect(i);
            })
            .then((r): q.Promise<any> => {
                return tc.users.select({
                    where: ["Id", r.Id],
                    expand: {
                        Profiles: null
                    }
                });
            })
            .then((r): void => {
                var i = r[0];

                chai.assert.property(i, "Profiles");
                chai.assert.equal(i.Profiles.length, 1);
            });
    });
    it("Testing selectCount", () => {
        return tc.finalized
            .then((): q.Promise<any> => {
                return tc.users.insertAndSelect({
                    UserName: "stefan",
                    FirstName: "Stefan",
                    LastName: "Heim"
                });
            })
            .then((r): q.Promise<any> => {
                return tc.users.selectCount(["Id", r.Id]);
            })
            .then((r): void => {
                chai.assert.equal(r, 1);
            });
    });
    it("Testing where with group or", () => {
        return tc.finalized
            .then((): q.Promise<any> => {
                return tc.users.insertAndSelect({
                    UserName: "Test GroupOr",
                    FirstName: "Stefan",
                    LastName: "Heim"
                });
            })
            .then((r): q.Promise<any> => {
                return tc.users.selectCount([["UserName", "contains", "Test GroupOr"], "or", ["UserName", "contains", "Test GroupOr"], "or", ["UserName", "contains", "Test GroupOr"], "or", ["UserName", "contains", "Test GroupOr"]]);
            })
            .then((r): void => {
                chai.assert.equal(r, 1);
            });
    });
    it("Testing search of expanded value", () => {
        return tc.finalized
            .then((): q.Promise<any> => {
                return tc.users.insertAndSelect({
                    UserName: "stefan",
                    FirstName: "Stefan",
                    LastName: "Heim",
                    Profiles: [
                        { IdProfile: null }
                    ]
                });
            })
            .then((r): q.Promise<any> => {
                return tc.users.select({
                    where: ["Id", r.Id]
                });
            })
            .then((r): q.Promise<any> => {
                return tc.usersToProfile.select({
                    where: ["User.Id", r[0].Id]
                });
            })
            .then((r): void => {
                var i: any[] = r;

                chai.assert.equal(i.length, 1);
            });
    });
    it("Testing search with orderby of expanded value", () => {
        return tc.finalized
            .then((): q.Promise<any> => {
                return tc.users.insertAndSelect({
                    UserName: "TestExpandedOrderBy",
                    FirstName: "Stefan",
                    LastName: "Heim",
                    Profiles: [
                        { IdProfile: null }
                    ]
                });
            })
            .then((r): q.Promise<any> => {
                return tc.usersToProfile.select({
                    where: ["User.Id", r.Id],
                    orderBy: [{
                        columnName: "User.UserName",
                        sort: dl.OrderBySort.asc
                    }]
                });
            })
            .then((r): void => {
                var i: any[] = r;

                chai.assert.equal(i.length, 1);
            });
    });
    it("Testing child where without parameter", () => {
        return tc.finalized
            .then((): q.Promise<any> => {
                return tc.users.insertAndSelect({
                    UserName: "TestChildWhereWithoutParameter",
                    FirstName: "Stefan",
                    LastName: "Heim",
                    Profiles: [
                        { IdProfile: null, Comment: "TestChildWhereWithoutParameter" }
                    ]
                });
            })
            .then((r): q.Promise<any> => {
                return tc.users.select({
                    where: [["UserName", "TestChildWhereWithoutParameter"], ["Profiles", []]]
                });
            })
            .then((r): void => {
                var i: any[] = r;

                chai.assert.equal(i.length, 1);
            });
    })

    it("Testing child where with parameter 1", () => {
        return tc.finalized
            .then((): q.Promise<any> => {
                return tc.users.insertAndSelect({
                    UserName: "TestChildWhereWithParameter1",
                    FirstName: "Stefan",
                    LastName: "Heim",
                    Profiles: [
                        { IdProfile: null, Comment: "TestChildWhereWithParameter1" }
                    ]
                });
            })
            .then((r): q.Promise<any> => {
                return tc.users.select({
                    where: [["Profiles", ["Comment", "TestChildWhereWithParameter1"]]]
                });
            })
            .then((r): void => {
                var i: any[] = r;

                chai.assert.equal(i.length, 1);
            });
    })
    it("Testing child where with parameter 2", () => {
        return tc.finalized
            .then((): q.Promise<any> => {
                return tc.profiles.insert({
                    Name: "TestChildWhereWithParameter2"
                });
            })
            .then((r): q.Promise<any> => {
                return tc.users.insertAndSelect({
                    UserName: "TestChildWhereWithParameter2",
                    FirstName: "Stefan",
                    LastName: "Heim",
                    Profiles: [
                        { IdProfile: r.Id, Comment: "TestChildWhereWithParameter2" }
                    ]
                });
            })
            .then((r): q.Promise<any> => {
                return tc.users.select({
                    where: [["Profiles", ["Profile.Name", "TestChildWhereWithParameter2"]]]
                });
            })
            .then((r): void => {
                var i: any[] = r;

                chai.assert.equal(i.length, 1);
            });
    })
    it("Testing child where with parameter 3", () => {
        return tc.finalized
            .then((r): q.Promise<any> => {
                return tc.usersToProfile.select({
                    where: [["Profile.Users", []]]
                });
            })
            .then((r): void => {
                var i: any[] = r;

                chai.assert.notEqual(i.length, 0);
            });
    })
});