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
    return Helpers;
})();
exports.Helpers = Helpers;
//# sourceMappingURL=helpers.js.map