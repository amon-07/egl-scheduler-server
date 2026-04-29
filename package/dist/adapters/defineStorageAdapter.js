"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.defineStorageAdapter = defineStorageAdapter;
const validateStorageAdapter_1 = require("./validateStorageAdapter");
function defineStorageAdapter(adapter) {
    (0, validateStorageAdapter_1.assertStorageAdapter)(adapter);
    return adapter;
}
//# sourceMappingURL=defineStorageAdapter.js.map