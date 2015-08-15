﻿import q = require("q");
import chai = require("chai");
import tc = require("./models");

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
});