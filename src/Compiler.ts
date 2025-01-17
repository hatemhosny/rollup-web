import type { RollupOptions, OutputChunk } from "rollup";
import { web_module, ModuleConfig } from "./adapter/web_module";
import { useRollup } from "./Compiler/rollup";
import { useGlobal } from "./utils/useGlobal";
import { createModuleCache } from "./Cache";
import type { Plugin, RollupCache } from "rollup";
import { bareURL, URLResolve } from "./utils/isURLString";
import { isInWorker } from "./utils/createWorker";
import { expose, proxy } from "comlink";
import { LocalCache } from "./Cache/LocalCache";
import { log } from "./utils/ColorConsole";
import { WebFetcher } from "./adapter/Fetcher/WebFetcher";
/**
 * 缓存配置项
 */
export type CacheConfig = {
    /*  设置忽略缓存的域 */
    ignore?: string[];
    root?: string;
    /* 以秒计算的缓存生命时间 */
    maxAge?: number;
};

/* 
    备忘录：
    1. 模块 id 系统： 
        1. id 为 URL 形式，
        2. 但是不能够填入 hash 值，
        3. queryParams 可以作为参数传递信息，传递信息会算作 id 的一部分进行缓存
*/
export type CompilerModuleConfig = ModuleConfig & {
    /* 匹配到的区域都将使用 rollup 打包 */
    cache?: false | CacheConfig;
};

/* Compiler 是一个打包器 Server ，执行环境请查看 Evaluator*/
export class Compiler {
    inWorker = isInWorker();
    destroyed = false;
    destroy() {
        if (this.inWorker) {
            // 在线程中直接关闭线程
            return self.close();
        } else {
            const names = [
                "options",
                "plugins",
                "moduleCache",
                "moduleConfig",
                "RollupCache",
            ] as const;
            names.map((i) => {
                /* @ts-ignore */
                this[i] = null;
            });
        }
        this.destroyed = true;
    }
    constructor(
        /* input 和 output 将会被覆盖 */
        public options: RollupOptions,

        /**
         *  需要打包模块的解析配置
         *  @property extraBundle 若为 true，将会把 远程代码下载并经过 rollup 打包;若为 Array，将会打包区域内的代码; root 下的代码是必定被打包的，所以不用填;
         *  @property useDataCache 使用 indexDB 进行打包代码缓存以提高速度
         */
        public moduleConfig: CompilerModuleConfig
    ) {
        if (!this.moduleConfig.root) {
            this.moduleConfig.root = bareURL(globalThis.location.href);
        }
        const getCacheConfig = (tag: "cache") => {
            return moduleConfig[tag] === undefined ||
                moduleConfig[tag] === false
                ? (new Map() as any as LocalCache)
                : createModuleCache(moduleConfig[tag]);
        };
        this.moduleCache = getCacheConfig("cache");

        this.refreshPlugin();
    }
    plugins: Plugin[] = [];
    /* 更新插件配置 */
    refreshPlugin() {
        this.plugins = this.options.plugins as Plugin[];
        this.plugins.forEach((i) => {
            // 自定义预先配置修改
            /* @ts-ignore */
            i.ChangeConfig && i.ChangeConfig(this.moduleConfig);
        });
        this.plugins.push(
            web_module({
                ...this.moduleConfig,
            })
        );
    }
    /* 打包缓存，code import 被替换为指定的 url 标记 */
    moduleCache!: LocalCache;

    getModuleConfig() {
        return JSON.stringify(this.moduleConfig);
    }

    reporter = {
        lastEvaluate: {
            time: 0,
        },
    };

    RollupCache: RollupCache = {
        modules: [],
        plugins: {},
    };

    /* 编译之前的检查缓存环节 */
    async checkCache(url: string) {
        const isCached = await this.moduleCache.has(url);

        if (isCached) {
            const hasNewer = await (
                this.moduleConfig.adapter || WebFetcher()
            ).isNew(url, this.reporter.lastEvaluate.time);
            if (hasNewer) return false;
            log.green(` System fetch | cache ` + url);
            return (await this.moduleCache.get(url)) || "";
        }
        return false;
    }
    /* dev */
    async CompileMultiFile(paths: string[]) {
        const codes = await Promise.all(
            paths.map((path) => this.CompileSingleFile(path))
        );
        return codes;
    }
    /* 编译单个代码，不宜单独使用 */
    async CompileSingleFile(url: string): Promise<string> {
        const bundled = await this.checkCache(url);
        if (bundled) return bundled;
        return useRollup({
            ...this.options,
            input: url,
            plugins: this.plugins,
            output: {
                format: "system",
            },
            cache: this.RollupCache,
        }).then((res) => {
            let code: string = "";
            res.output.forEach((i) => {
                const info = i as OutputChunk;
                if (info.isEntry) {
                    code = info.code;
                    this.moduleCache.set(url, info.code);
                } else {
                    this.moduleCache.set(info.facadeModuleId!, info.code);
                }
            });
            log.pink(` System fetch | bundle ` + url);
            return code;
        });
    }
    /**
     * 在 worker 线程中启动，将自身导出为 comlink 接口
     * @params force 强制使用 force 模式
     */
    useWorker(
        /* 强制开启 comlink worker 端口 */
        force = false
    ) {
        if (force || this.inWorker) {
            expose(proxy(this));
            globalThis.postMessage("__rollup_web_ready__");
            return true;
        } else {
            return false;
        }
    }
}
