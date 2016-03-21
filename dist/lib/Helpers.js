"use strict";
var q = require("q");
var Helpers = (function () {
    function Helpers() {
    }
    Helpers.qSequential = function (items, callback) {
        if (!items || items.length === 0) {
            return q.resolve(null);
        }
        return items.reduce(function (prev, curr) {
            return prev
                .then(function () {
                return callback(curr);
            });
        }, q.resolve(null));
    };
    Helpers.extend = function (origin, add) {
        if (!add || typeof add !== "object") {
            return origin;
        }
        var keys = Object.keys(add);
        var i = keys.length;
        while (i--) {
            origin[keys[i]] = add[keys[i]];
        }
        return origin;
    };
    ;
    Helpers.wasRequestSuccessful = function (response) {
        if (!response || !response.statusCode) {
            return false;
        }
        if (response.statusCode < 200 || response.statusCode > 299) {
            return false;
        }
        return true;
    };
    Helpers.getRequestError = function (response) {
        if (!response || !response.statusCode || !response.statusMessage) {
            return {
                url: response.url,
                statusCode: 0,
                statusMessage: "Unknown Error occured (no response, statusCode or statusMessage)"
            };
        }
        var url = response.url;
        var req = response.req;
        if (req && req.path) {
            url = req.path;
        }
        return {
            url: url,
            statusCode: response.statusCode,
            statusMessage: response.statusMessage
        };
    };
    return Helpers;
}());
exports.Helpers = Helpers;
//# sourceMappingURL=Helpers.js.map