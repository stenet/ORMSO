var express = require("express");
var PublishContext = (function () {
    function PublishContext() {
        this._router = express.Router();
    }
    PublishContext.prototype.addDataModel = function (name, dataModel) {
        this.addGet(name, dataModel);
        this.addPost(name, dataModel);
        this.addPatch(name, dataModel);
        this.addPut(name, dataModel);
    };
    PublishContext.prototype.getRouter = function () {
        return this._router;
    };
    PublishContext.prototype.addGet = function (name, dataModel) {
        this._router.get("/" + name, function (req, res) {
            var selectOptions = req.body;
            if (req.query.options) {
                selectOptions = JSON.parse(req.query.options);
            }
            dataModel.select(selectOptions)
                .then(function (r) {
                res.json(r);
            })
                .done();
        });
        this._router.get("/" + name + "/:id", function (req, res) {
            dataModel.selectById(req.params.id)
                .then(function (r) {
                res.json(r);
            })
                .done();
        });
    };
    PublishContext.prototype.addPost = function (name, dataModel) {
        this._router.post("/" + name, function (req, res) {
            dataModel.updateOrInsertAndSelect(req.body)
                .then(function (r) {
                res.json(r);
            })
                .done();
        });
    };
    PublishContext.prototype.addPatch = function (name, dataModel) {
        this._router.patch("/" + name, function (req, res) {
            dataModel.updateAndSelect(req.body)
                .then(function (r) {
                res.json(r);
            })
                .done();
        });
    };
    PublishContext.prototype.addPut = function (name, dataModel) {
        this._router.put("/" + name, function (req, res) {
            dataModel.insertAndSelect(req.body)
                .then(function (r) {
                res.json(r);
            })
                .done();
        });
    };
    return PublishContext;
})();
exports.PublishContext = PublishContext;
//# sourceMappingURL=PublishContext.js.map