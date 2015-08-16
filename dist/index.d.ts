/// <reference path="lib/DataContext.d.ts" />
/// <reference path="lib/DataLayer.d.ts" />
/// <reference path="lib/Helpers.d.ts" />
/// <reference path="lib/PublishContext.d.ts" />
/// <reference path="lib/SyncContext.d.ts" />
import dl = require("./lib/DataLayer");
import dc = require("./lib/DataContext");
import sc = require("./lib/SyncContext");
import pc = require("./lib/PublishContext");
declare var _default: {
    DataLayers: typeof dl;
    DataContexts: typeof dc;
    SyncContexts: typeof sc;
    PublishContexts: typeof pc;
};
export = _default;
