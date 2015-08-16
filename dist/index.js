/// <reference path="lib/DataContext.ts" />
/// <reference path="lib/DataLayer.ts" />
/// <reference path="lib/Helpers.ts" />
/// <reference path="lib/PublishContext.ts" />
/// <reference path="lib/SyncContext.ts" />
var dl = require("lib/DataLayer");
var dc = require("lib/DataContext");
var sc = require("lib/SyncContext");
var pc = require("lib/PublishContext");
var ormso;
(function (ormso) {
    dl: dl;
    dc: dc;
    sc: sc;
    pc: pc;
})(ormso = exports.ormso || (exports.ormso = {}));
//# sourceMappingURL=index.js.map