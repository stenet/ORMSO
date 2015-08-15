var Event = (function () {
    function Event() {
        this._handlers = [];
    }
    Event.prototype.on = function (handler) {
        this._handlers.push(handler);
    };
    Event.prototype.off = function (handler) {
        this._handlers = this._handlers.filter(function (h) { return h !== handler; });
    };
    Event.prototype.trigger = function (data) {
        if (this._handlers) {
            this._handlers.slice(0).forEach(function (h) { return h(data); });
        }
    };
    return Event;
})();
exports.Event = Event;
//# sourceMappingURL=Events.js.map