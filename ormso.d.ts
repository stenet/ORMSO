/// <reference path="lib/DataContext.ts" />
/// <reference path="lib/DataLayer.ts" />
/// <reference path="lib/Helpers.ts" />
/// <reference path="lib/PublishContext.ts" />
/// <reference path="lib/SyncContext.ts" />

declare module "ormso" {
    import dl = require('lib/DataLayer');
    import dc = require('lib/DataLayer');
    import sc = require('lib/DataLayer');
    import pc = require('lib/DataLayer');
    export = {
        dl: dl,
        dc: dc,
        sc: sc,
        pc: pc
    };
}