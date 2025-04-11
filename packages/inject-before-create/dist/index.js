"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = injectBeforeCreate;
var compiler_sfc_1 = require("vue/compiler-sfc");
var pluginutils_1 = require("@rollup/pluginutils");
var magic_string_1 = __importDefault(require("magic-string"));
var defaultOptions = {
    args: '',
    modulePath: '',
    importName: '',
    importType: 'default',
};
function injectBeforeCreate(options) {
    var mergedOpts = __assign(__assign({}, defaultOptions), options);
    // 检查必填项
    if (!mergedOpts.modulePath || !mergedOpts.importName) {
        throw new Error('modulePath and importName are required');
    }
    return {
        name: 'vite-plugin-injectBeforeCreate',
        enforce: 'pre',
        transform: function (code, id) {
            // 只处理 .vue 文件
            var filter = (0, pluginutils_1.createFilter)(/\.vue$/);
            if (!filter(id))
                return null;
            try {
                var s = new magic_string_1.default(code);
                var descriptor = (0, compiler_sfc_1.parse)(code).descriptor;
                // 不仅检查 scriptSetup 是否存在，还检查源代码中是否包含 <script setup> 标签
                var isVue3 = !!descriptor.scriptSetup || code.includes('<script setup>');
                var hookName = isVue3 ? 'onBeforeMount' : 'beforeCreate';
                var functionCall = typeof mergedOpts.call === 'function'
                    ? "(".concat(mergedOpts.call.toString(), ")(").concat(mergedOpts.args, ")")
                    : "".concat(mergedOpts.importName, "(").concat(mergedOpts.args || '', ")");
                var importStatement = getImportStatement(mergedOpts);
                // 处理没有脚本标签的情况
                if (!descriptor.script && !descriptor.scriptSetup) {
                    return handleNoScript(code, s, id, hookName, importStatement, functionCall);
                }
                var script = descriptor.script || descriptor.scriptSetup;
                var scriptStart = script === null || script === void 0 ? void 0 : script.loc.start.offset;
                var scriptContent = (script === null || script === void 0 ? void 0 : script.content) || '';
                if (!hasExistingImport(scriptContent, mergedOpts)) {
                    s.appendRight(scriptStart, "\n".concat(importStatement));
                }
                injectLifecycle(s, scriptContent, scriptStart, isVue3, hookName, functionCall);
                var result = {
                    code: s.toString(),
                    map: s.generateMap({ hires: true })
                };
                return result;
            }
            catch (error) {
                return null;
            }
        }
    };
}
// 处理没有脚本标签的情况
function handleNoScript(code, s, id, hookName, importStatement, functionCall) {
    // 如果没有找到脚本标签，但文件中确实包含 script setup
    if (code.includes('<script setup>')) {
        var scriptMatch = /<script setup>([\s\S]*?)<\/script>/g.exec(code);
        if (scriptMatch) {
            var scriptStart = scriptMatch.index + '<script setup>'.length;
            // 构建注入内容
            var injection = "\nimport { ".concat(hookName, " } from 'vue';\n").concat(importStatement, "\n\n").concat(hookName, "(() => {\n  ").concat(functionCall, ";\n});\n");
            // 注入到 script 标签内
            s.appendLeft(scriptStart, injection);
            return {
                code: s.toString(),
                map: s.generateMap({ hires: true })
            };
        }
    }
    return null;
}
// 生成导入语句
function getImportStatement(options) {
    var importName = options.importName, modulePath = options.modulePath, importType = options.importType;
    // 直接使用用户传入的路径，不做转换
    var finalPath = modulePath;
    // 只移除 .ts 扩展名
    if (finalPath.endsWith('.ts')) {
        finalPath = finalPath.replace(/\.ts$/, '');
    }
    if (importType === 'named') {
        return "import { ".concat(importName, " } from '").concat(finalPath, "';");
    }
    else if (importType === 'namespace') {
        return "import * as ".concat(importName, " from '").concat(finalPath, "';");
    }
    else {
        return "import ".concat(importName, " from '").concat(finalPath, "';");
    }
}
// 检查是否已存在导入语句
function hasExistingImport(script, options) {
    var importName = options.importName, modulePath = options.modulePath, importType = options.importType;
    var importPattern;
    if (importType === 'named') {
        // 更灵活地处理空格，允许任意数量的空格或没有空格
        importPattern = "import\\s*{\\s*".concat(importName, "\\s*}\\s*from\\s*['\"]").concat(modulePath, "['\"]");
    }
    else if (importType === 'namespace') {
        // 修复命名空间导入的正则表达式
        importPattern = "import\\s*{\\s*as\\s*".concat(importName, "\\s*from\\s*['\"]").concat(modulePath, "['\"]");
    }
    else {
        importPattern = "import\\s*".concat(importName, "\\s*from\\s*['\"]").concat(modulePath, "['\"]");
    }
    // 使用更灵活的正则表达式匹配
    var regex = new RegExp(importPattern.replace(/\\s\*/g, '\\s*'), 'i');
    return regex.test(script);
}
// 注入生命周期钩子
function injectLifecycle(s, scriptContent, scriptStart, isVue3, hookName, functionCall) {
    // 处理Vue3的空script setup内容
    // 这种情况是脚本标签存在，但内容为空
    if (isVue3 && scriptContent.trim() === '') {
        var setupInsert = "\nimport { ".concat(hookName, " } from 'vue';\n\n").concat(hookName, "(() => {\n  ").concat(functionCall, ";\n});\n");
        s.appendLeft(scriptStart, setupInsert);
        return;
    }
    // 检查是否已存在生命周期钩子
    var hookRegex = isVue3
        ? new RegExp("".concat(hookName, "\\s*\\(\\s*(?:async\\s*)?(?:\\([^)]*\\)|[^,)]+)\\s*=>\\s*{"))
        : new RegExp("".concat(hookName, "\\s*\\(\\s*\\)\\s*{"));
    var hookMatch = hookRegex.exec(scriptContent);
    if (hookMatch) {
        // 已存在钩子，在其中插入函数调用
        var hookContentStart = scriptStart + hookMatch.index + hookMatch[0].length;
        s.appendLeft(hookContentStart, "\n    ".concat(functionCall, ";"));
        return;
    }
    // 处理Vue3情况
    if (isVue3) {
        // 检查是否需要导入钩子
        if (!scriptContent.includes("import") || !new RegExp("\\b".concat(hookName, "\\b")).test(scriptContent)) {
            s.appendLeft(scriptStart + 1, "\nimport { ".concat(hookName, " } from 'vue';\n"));
        }
        // 在setup中添加钩子或直接在script内容中添加
        if (scriptContent.includes('setup')) {
            var setupMatch = /setup\s*\([^)]*\)\s*{/.exec(scriptContent);
            if (setupMatch) {
                var setupBodyStart = scriptStart + setupMatch.index + setupMatch[0].length;
                s.appendLeft(setupBodyStart, "\n  ".concat(hookName, "(() => {\n    ").concat(functionCall, ";\n  });"));
            }
        }
        else {
            s.appendLeft(scriptStart + 1, "\n\n".concat(hookName, "(() => {\n  ").concat(functionCall, ";\n});\n"));
        }
        return;
    }
    // 处理Vue2情况
    var exportMatch = /export\s+default\s+{/.exec(scriptContent);
    if (exportMatch) {
        var exportObjStart = scriptStart + exportMatch.index + exportMatch[0].length;
        s.appendLeft(exportObjStart, "\n  ".concat(hookName, "() {\n    ").concat(functionCall, ";\n  },"));
    }
    else {
        s.appendLeft(scriptStart + scriptContent.length, "\n\nexport default {\n  ".concat(hookName, "() {\n    ").concat(functionCall, ";\n  }\n}"));
    }
}
