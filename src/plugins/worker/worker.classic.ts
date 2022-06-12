import { expose, proxy } from "comlink";
import { createModule } from "../../utils/ModuleEval";
import type { Evaluator } from "../../Evaluator";
import { Setting } from "../../Setting";

// 这里引用了 CDN 进行加载
const ClassicInit = () => {
    const importScripts = (globalThis as any).importScripts;
    /* @ts-ignore */
    globalThis.module = {};
    importScripts("https://fastly.jsdelivr.net/npm/process/browser.js");
    importScripts("https://unpkg.com/comlink/dist/umd/comlink.js");
    // importScripts("http://localhost:8888/package/rollup-web/dist/Evaluator.umd.js");
    importScripts(
        "https://fastly.jsdelivr.net/npm/rollup-web@$version$/dist/Evaluator.umd.js"
    );
    /* @ts-ignore */
    const { Comlink, Evaluator: EvaluatorModule } = globalThis;
    const { wrap } = Comlink as typeof import("comlink");
    const { Evaluator } = EvaluatorModule as typeof import("../../Evaluator");
    // 删除全局变量以防止冲突
    /* @ts-ignore */
    delete globalThis.Comlink;
    /* @ts-ignore */
    delete globalThis.Evaluator;
    async function fakeImport(url: string) {
        const System = (globalThis as any).System;
        return System.fetch(url)
            .then((res: Response) => {
                return res.text();
            })
            .then((i: string) => {
                // ! 非常危险地将 system 模块转化为异步，并将 importScripts 转化为异步锁定
                const code = i
                    .replace("execute: (function", "execute: (async function")
                    .replace(/^\s*importScripts/gm, "await importScripts");

                const url = URL.createObjectURL(
                    new File([code], "index.js", { type: "text/javascript" })
                );
                (globalThis as any).__importScripts(url);
                URL.revokeObjectURL(url);
                return;
            });
    }
    function SystemInit(localURL: string) {
        const System = (globalThis as any).System;
        /* @ts-ignore */
        globalThis.__importScripts = globalThis.importScripts;
        /* @ts-ignore */
        globalThis.importScripts = (...urls: string[]) => {
            return urls.reduce((col, cur) => {
                return col.then(() => {
                    return System.import(new URL(cur, localURL).toString());
                });
            }, Promise.resolve());
        };
        System.instantiate = function (url: string) {
            var loader = this;
            return Promise.resolve().then(async function () {
                await fakeImport(url);
                return loader.getRegister(url);
            });
        };
    }

    addEventListener(
        "message",
        async (e) => {
            // ! 在内部进行了 import comlink 和 Evaluator
            const { port: CompilerPort, localURL } = e.data;
            let Eval: Evaluator;
            Eval = new Evaluator();
            await Eval.createEnv({
                Compiler: wrap(CompilerPort) as any,
                worker: "module",
                root: localURL,
                wrap: true,
            })
                .then(() => SystemInit(localURL))
                .then(async () => {
                    await Eval.evaluate(localURL);
                    console.log("worker 初始化完成");
                });
        },
        { once: true }
    );
};
// console.log(ClassicInit.toString().replace(/^\(\)\s=>\s{([\s\S]+)}/, "$1"));
export const classicWorkerURL = createModule(
    `
    
    (${ClassicInit.toString().replace("$version$", Setting.workerVersion)})()`,
    "worker.classic.js"
);