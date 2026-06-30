"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.GameSession = exports.GamePod = exports.CloudSave = exports.wtfReplaceRoleStrings = exports.wtfModifyProfileKeys = exports.WtfMigrationService = exports.WtfShareService = exports.WtfSyncService = exports.BattleNetAccount = exports.Wa = exports.Lua = exports.OssUploader = exports.OssDownloader = exports.DownloadTask = exports.UploadTask = exports.GameModUnInstallMulti = exports.GameModInstallMulti = exports.ModUnInstallTask = exports.ModInstallTask = exports.Archives = exports.Zip = exports.GameScanner = exports.AppScan = exports.Task = exports.Launcher = exports.getDisks = exports.FileSystem = exports.Device = exports.setLogCallback = exports.initLoggerWithConfig = exports.initLogger = void 0;
exports.requireNative = requireNative;
const node_module_1 = require("node:module");
const node_process_1 = require("node:process");
const CloudSaveModule = __importStar(require("./cloudsave"));
const path = __importStar(require("node:path"));
require = (0, node_module_1.createRequire)(__filename);
// 加载napi模块
function requireNative() {
    try {
        let filename;
        if (node_process_1.platform === "win32") {
            filename = "nbb-core.win32-x64-msvc.node";
        }
        else if (node_process_1.platform === "darwin") {
            filename = "nbb-core.darwin-universal.node";
        }
        else {
            throw new Error(`Unsupported OS: ${node_process_1.platform}, architecture: ${node_process_1.arch}`);
        }
        // 转绝对路径
        const fullPath = path.resolve(__dirname, filename);
        return require(fullPath);
    }
    catch (e) {
        throw new Error(`Failed to load native module for ${node_process_1.platform} ${node_process_1.arch}: ${e}`);
    }
}
const nativeBinding = requireNative();
// 日志
exports.initLogger = nativeBinding.initLogger;
exports.initLoggerWithConfig = nativeBinding.initLoggerWithConfig;
exports.setLogCallback = nativeBinding.setLogCallback;
// 设备信息
exports.Device = nativeBinding.Device;
// 文件操作
exports.FileSystem = nativeBinding.FileSystem;
// 获取磁盘信息
exports.getDisks = nativeBinding.getDisks;
// 启动游戏
exports.Launcher = nativeBinding.Launcher;
// 异步任务
exports.Task = nativeBinding.Task;
// 游戏扫描
// v1：磁盘扫描
exports.AppScan = nativeBinding.AppScan;
// v2：多平台扫描
exports.GameScanner = nativeBinding.GameScanner;
// 解压缩
// v1:作废
exports.Zip = nativeBinding.Zip;
// v2
exports.Archives = nativeBinding.Archives;
// 模组安装卸载v1：作废
exports.ModInstallTask = nativeBinding.ModInstallTask;
exports.ModUnInstallTask = nativeBinding.ModUnInstallTask;
// 模组安装卸载v2
exports.GameModInstallMulti = nativeBinding.GameModInstallMulti;
exports.GameModUnInstallMulti = nativeBinding.GameModUnInstallMulti;
// oss文件上传下载
// v1：大文件分割【抛弃】
exports.UploadTask = nativeBinding.UploadTask;
exports.DownloadTask = nativeBinding.DownloadTask;
// v2：文件夹上传
exports.OssDownloader = nativeBinding.OssDownloader;
exports.OssUploader = nativeBinding.OssUploader;
// lua2json
exports.Lua = nativeBinding.Lua;
// wa解析成json
exports.Wa = nativeBinding.Wa;
// 战网账号管理
exports.BattleNetAccount = nativeBinding.BattleNetAccount;
// wtf目录操作
exports.WtfSyncService = nativeBinding.WtfSyncService;
exports.WtfShareService = nativeBinding.WtfShareService;
exports.WtfMigrationService = nativeBinding.WtfMigrationService;
exports.wtfModifyProfileKeys = nativeBinding.wtfModifyProfileKeys;
exports.wtfReplaceRoleStrings = nativeBinding.wtfReplaceRoleStrings;
// 游戏存档
exports.CloudSave = {
    ...CloudSaveModule,
};
// 游戏实例隔离
exports.GamePod = nativeBinding.GamePod;
// export const GamePod = nativeBinding.GamePodV2;
// 游戏进程监听器
exports.GameSession = nativeBinding.GameSession;
