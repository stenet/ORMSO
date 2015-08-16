/// <reference path="lib/DataContext.ts" />
/// <reference path="lib/DataLayer.ts" />
/// <reference path="lib/Helpers.ts" />
/// <reference path="lib/PublishContext.ts" />
/// <reference path="lib/SyncContext.ts" />

import dl = require("lib/DataLayer");
import dc = require("lib/DataContext");
import sc = require("lib/SyncContext");
import pc = require("lib/PublishContext");

export module ormso {
    dl: dl;
    dc: dc;
    sc: sc;
    pc: pc;
}