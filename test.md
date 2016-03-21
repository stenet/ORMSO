# TOC
   - [Data Context (Structure)](#data-context-structure)
   - [Data Model (Functions)](#data-model-functions)
<a name=""></a>
 
<a name="data-context-structure"></a>
# Data Context (Structure)
Should has DataContext.

```js
chai.assert(tc.dataCtx != null);
```

Should has DataModel users.

```js
chai.assert(tc.dataCtx.getDataModel(tc.users.tableInfo.table) != null);
```

Should finalize without errors.

```js
return tc.finalized;
```

DataModel base should have one column.

```js
chai.assert(tc.base.tableInfo.table.columns.length === 1);
```

DataModel users have 5 columns (incl base).

```js
chai.assert(tc.users.tableInfo.table.columns.length === 5);
```

DataModel users should have one child relation.

```js
chai.assert(tc.users.tableInfo.relationsToChild.length === 1);
```

DataModel users should have child relation with name 'Profiles'.

```js
chai.assert(tc.users.tableInfo.relationsToChild[0].parentAssociationName === "Profiles");
```

<a name="data-model-functions"></a>
# Data Model (Functions)
Should create user.

```js
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
```

Should create user with Profiles.

```js
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
```

Should delete Profile inside User.

```js
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
```

Testing selectCount.

```js
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
```

Testing where with group or.

```js
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
```

Testing search of expanded value.

```js
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
```

Testing search with orderby of expanded value.

```js
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
```

Testing child where without parameter.

```js
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
```

Testing child where with parameter.

```js
return tc.finalized
    .then(function () {
    return tc.users.insertAndSelect({
        UserName: "TestChildWhereWithParameter",
        FirstName: "Stefan",
        LastName: "Heim",
        Profiles: [
            { IdProfile: null, Comment: "TestChildWhereWithParameter" }
        ]
    });
})
    .then(function (r) {
    return tc.users.select({
        where: [["Profiles", ["Comment", "TestChildWhereWithParameter"]]]
    });
})
    .then(function (r) {
    var i = r;
    chai.assert.equal(i.length, 1);
});
```

