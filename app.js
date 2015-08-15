var dc = require("./lib/DataContext");
var dl = require("./lib/DataLayer");
var sc = require("./lib/SyncContext");
var serverUrl = "http://10.20.50.53/TIP/api/DM360/";
var ctx = new dc.DataContext(new dl.Sqlite3DataLayer("test.db"));
var baseModelId = ctx.createDataModel({
    name: "Master",
    isAbstract: true,
    columns: [
        { name: "IdClient", dataType: dl.DataTypes.int, isPrimaryKey: true, isAutoIncrement: true }
    ]
});
var gpKzModel = ctx.createDataModel({
    name: "GPKZ_ST",
    columns: [
        { name: "Code", dataType: dl.DataTypes.text, isPrimaryKey: true },
        { name: "Bezeichnung", dataType: dl.DataTypes.text }
    ]
});
var landModel = ctx.createDataModel({
    name: "LAENDER_ST",
    columns: [
        { name: "Code", dataType: dl.DataTypes.text, isPrimaryKey: true },
        { name: "Bezeichnung", dataType: dl.DataTypes.text },
        { name: "IsEU", dataType: dl.DataTypes.bool }
    ]
});
var anredeModel = ctx.createDataModel({
    name: "ANREDEN_ST",
    columns: [
        { name: "Code", dataType: dl.DataTypes.text, isPrimaryKey: true },
        { name: "Bezeichnung", dataType: dl.DataTypes.text }
    ]
});
var personengruppeModel = ctx.createDataModel({
    name: "PERSONENGRUPPEN_ST",
    columns: [
        { name: "Code", dataType: dl.DataTypes.text, isPrimaryKey: true },
        { name: "Bezeichnung", dataType: dl.DataTypes.text }
    ]
});
var geschaeftspartnerModel = ctx.createDataModel({
    name: "GESCHAEFTSPARTNER_ST",
    columns: [
        { name: "Id", dataType: dl.DataTypes.int },
        { name: "CodeGpKz", dataType: dl.DataTypes.text, relation: { parentTable: gpKzModel.tableInfo.table, parentAssociationName: "Geschaeftspartner", childAssociationName: "GpKz" } },
        { name: "Firmenbez1", dataType: dl.DataTypes.text },
        { name: "Firmenbez2", dataType: dl.DataTypes.text },
        { name: "Firmenbez3", dataType: dl.DataTypes.text },
        { name: "Strasse", dataType: dl.DataTypes.text },
        { name: "CodeLand", dataType: dl.DataTypes.text, relation: { parentTable: landModel.tableInfo.table, parentAssociationName: "Geschaeftspartner", childAssociationName: "Land" } },
        { name: "Plz", dataType: dl.DataTypes.text },
        { name: "Ort", dataType: dl.DataTypes.text },
        { name: "Telefon", dataType: dl.DataTypes.text },
        { name: "Fax", dataType: dl.DataTypes.text },
        { name: "Email", dataType: dl.DataTypes.text },
        { name: "Homepage", dataType: dl.DataTypes.text }
    ]
}, baseModelId);
var personModel = ctx.createDataModel({
    name: "PERSONEN_ST",
    columns: [
        { name: "Id", dataType: dl.DataTypes.int },
        { name: "IdGeschaeftspartner", dataType: dl.DataTypes.int, relation: { parentTable: geschaeftspartnerModel.tableInfo.table, parentAssociationName: "Personen", childAssociationName: "Geschaeftspartner" } },
        { name: "CodePersonengruppe", dataType: dl.DataTypes.text, relation: { parentTable: personengruppeModel.tableInfo.table, parentAssociationName: "Personen", childAssociationName: "Personengruppe" } },
        { name: "CodeAnrede", dataType: dl.DataTypes.text, relation: { parentTable: anredeModel.tableInfo.table, parentAssociationName: "Personen", childAssociationName: "Anrede" } },
        { name: "Titel", dataType: dl.DataTypes.text },
        { name: "Vorname", dataType: dl.DataTypes.text },
        { name: "Nachname", dataType: dl.DataTypes.text },
        { name: "Telefon", dataType: dl.DataTypes.text },
        { name: "Mobil", dataType: dl.DataTypes.text },
        { name: "Fax", dataType: dl.DataTypes.text },
        { name: "Email", dataType: dl.DataTypes.text },
        { name: "Geburtsdatum", dataType: dl.DataTypes.date }
    ]
}, baseModelId);
var besuchstypModel = ctx.createDataModel({
    name: "BESUCHSTYPEN_ST",
    columns: [
        { name: "Id", dataType: dl.DataTypes.int, isPrimaryKey: true },
        { name: "Bezeichnung", dataType: dl.DataTypes.text }
    ]
});
var tourPlanModel = ctx.createDataModel({
    name: "TOUREN_PLAN",
    columns: [
        { name: "Id", dataType: dl.DataTypes.int },
        { name: "Von", dataType: dl.DataTypes.date },
        { name: "Bis", dataType: dl.DataTypes.date },
        { name: "TourName", dataType: dl.DataTypes.text }
    ]
}, baseModelId);
var besuchPlanModel = ctx.createDataModel({
    name: "BESUCHE_PLAN",
    columns: [
        { name: "Id", dataType: dl.DataTypes.int },
        { name: "IdTourPlan", dataType: dl.DataTypes.int, relation: { parentTable: tourPlanModel.tableInfo.table, parentAssociationName: "BesuchePlan", childAssociationName: "TourPlan" } },
        { name: "IdGeschaeftspartner", dataType: dl.DataTypes.int, relation: { parentTable: geschaeftspartnerModel.tableInfo.table, parentAssociationName: "BesuchePlan", childAssociationName: "Geschaeftspartner" } },
        { name: "Status", dataType: dl.DataTypes.int }
    ]
}, baseModelId);
var besuchModel = ctx.createDataModel({
    name: "BESUCHE",
    columns: [
        { name: "Id", dataType: dl.DataTypes.int },
        { name: "IdBesuchstyp", dataType: dl.DataTypes.int, relation: { parentTable: besuchstypModel.tableInfo.table, parentAssociationName: "Besuche", childAssociationName: "Besuchstyp" } },
        { name: "IdGeschaeftspartner", dataType: dl.DataTypes.int, relation: { parentTable: geschaeftspartnerModel.tableInfo.table, parentAssociationName: "Besuche", childAssociationName: "Geschaeftspartner" } },
        { name: "IdBesuchPlan", dataType: dl.DataTypes.int, relation: { parentTable: besuchPlanModel.tableInfo.table, parentAssociationName: "Besuche", childAssociationName: "BesuchPlan" } },
        { name: "Von", dataType: dl.DataTypes.date },
        { name: "Bis", dataType: dl.DataTypes.date }
    ]
}, baseModelId);
var berichtModel = ctx.createDataModel({
    name: "BERICHTE",
    columns: [
        { name: "Id", dataType: dl.DataTypes.int },
        { name: "IdBesuch", dataType: dl.DataTypes.int, relation: { parentTable: besuchModel.tableInfo.table, parentAssociationName: "Berichte", childAssociationName: "Besuch" } },
        { name: "Titel", dataType: dl.DataTypes.text },
        { name: "Text", dataType: dl.DataTypes.text }
    ]
}, baseModelId);
var syncCtx = new sc.SyncContext();
syncCtx.addDataModel(gpKzModel, {
    loadUrl: serverUrl + "Stammdaten/GpKz",
    serverPrimaryKey: gpKzModel.getColumn("Code")
});
syncCtx.addDataModel(landModel, {
    loadUrl: serverUrl + "Stammdaten/Land",
    serverPrimaryKey: landModel.getColumn("Code")
});
syncCtx.addDataModel(anredeModel, {
    loadUrl: serverUrl + "Stammdaten/Anrede",
    serverPrimaryKey: anredeModel.getColumn("Code")
});
syncCtx.addDataModel(personengruppeModel, {
    loadUrl: serverUrl + "Stammdaten/Personengruppe",
    serverPrimaryKey: personengruppeModel.getColumn("Code")
});
syncCtx.addDataModel(geschaeftspartnerModel, {
    loadUrl: serverUrl + "Stammdaten/Geschaeftspartner",
    serverPrimaryKey: geschaeftspartnerModel.getColumn("Id")
});
syncCtx.addDataModel(personModel, {
    loadUrl: serverUrl + "Stammdaten/Person",
    serverPrimaryKey: personModel.getColumn("Id")
});
syncCtx.addDataModel(besuchstypModel, {
    loadUrl: serverUrl + "Vertreter/Besuchstyp",
    serverPrimaryKey: besuchstypModel.getColumn("Id")
});
syncCtx.addDataModel(tourPlanModel, {
    loadUrl: serverUrl + "Vertreter/TourPlan",
    serverPrimaryKey: tourPlanModel.getColumn("Id")
});
syncCtx.addDataModel(besuchPlanModel, {
    loadUrl: serverUrl + "Vertreter/BesuchPlan",
    serverPrimaryKey: besuchPlanModel.getColumn("Id")
});
syncCtx.addDataModel(besuchModel, {
    loadUrl: serverUrl + "Vertreter/Besuch",
    serverPrimaryKey: besuchModel.getColumn("Id")
});
syncCtx.addDataModel(berichtModel, {
    loadUrl: serverUrl + "Vertreter/Bericht",
    serverPrimaryKey: berichtModel.getColumn("Id")
});
ctx.finalizeInitialize()
    .then(function () {
    console.log("Finalize done");
    return syncCtx.syncAll();
})
    .then(function () {
    console.log("Sync done");
})
    .catch(function (r) {
    console.log(r);
})
    .done();
//# sourceMappingURL=app.js.map