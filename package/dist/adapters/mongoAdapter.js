"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createMongoAdapter = createMongoAdapter;
const mongoStore_1 = require("../store/mongoStore");
function createMongoAdapter(config) {
    return (0, mongoStore_1.createMongoStore)(config.mongoose);
}
//# sourceMappingURL=mongoAdapter.js.map