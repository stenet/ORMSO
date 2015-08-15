var tc = require("./testclasses");
describe("Data Context", function () {
    tc.dataCtx.finalizeInitialize()
        .then(function () {
        it("users has 5 columns", function (done) {
            tc.users.tableInfo.table.columns.length.should.be.exactly(5);
            done();
        });
    });
});
//# sourceMappingURL=test.js.map