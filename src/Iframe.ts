import { IframeBox } from "@konghayao/iframe-box";
import { Setting } from "./Setting";
import { URLResolve } from "./utils/isURLString";
const template = `<!DOCTYPE html>
<html lang="en">
    <head>
        <meta charset="UTF-8" />
    </head>
    <body>
    </body>
</html>`;
const threadInit = async () => {
    // import { Evaluator } from "http://localhost:8888/package/rollup-web/dist/index.js";
    /* @ts-ignore */
    const { Evaluator } = await import(
        "https://fastly.jsdelivr.net/npm/rollup-web@3.7.6/dist/index.js"
    );
    /* @ts-ignore */
    const { wrap } = await import(
        "https://fastly.jsdelivr.net/npm/comlink/dist/esm/comlink.mjs"
    );
    const Eval = new Evaluator();
    const EvalCode = (url: string) => Eval.evaluate(url);
    addEventListener("message", (e) => {
        if (e.data && e.data.password === "__rollup_evaluate__" && e.data.url) {
            EvalCode(e.data.url);
        }
    });
    // 初始化 Compiler 线程的端口
    const EvalInit = (e: MessageEvent) => {
        if (e.data && e.data.password === "__rollup_init__" && e.data.port) {
            Eval.createEnv({
                Compiler: wrap(e.data.port),
                worker: "module",
                root: e.data.localURL,
            }).then(() => {
                EvalCode(e.data.localURL);
            });
            removeEventListener("message", EvalInit);
        }
    };
    addEventListener("message", EvalInit);
};

export class IframeEnv {
    async mount({
        container = document.body,
        src,
        port,
    }: {
        container?: HTMLElement;
        src: string;
        port: MessagePort;
    }) {
        const frame = new IframeBox();
        frame.src = await this.createSrc(src);
        container.appendChild(frame);
        return frame.ready
            .then((api: any) => {
                return api.runCode(`(${threadInit.toString()})()`);
            })
            .then(() => {
                (
                    (frame as any).frame as HTMLIFrameElement
                ).contentWindow!.postMessage(
                    {
                        password: "__rollup_init__",
                        localURL: src,
                        port,
                    },
                    "*",
                    []
                );
            });
    }
    InitEnv() {}
    async createSrc(baseURL = location.href, remote = false) {
        const { rehype } = await import("rehype");
        const { visit } = await import("unist-util-visit");
        const html = remote
            ? await fetch(baseURL).then((res) => res.text())
            : template;
        const file = await rehype()
            .use(() => (tree) => {
                visit(tree, ["element"], (node: any) => {
                    const {
                        properties: { src, href },
                    } = node;

                    if (typeof src === "string")
                        node.properties.src = URLResolve(src, baseURL);
                    if (typeof href === "string")
                        node.properties.href = URLResolve(href, baseURL);
                });
            })
            .process(html);
        const InitScript = `<script src="${Setting.NPM(
            "@konghayao/iframe-box/dist/iframeCallback.umd.js"
        )}"></script>`;
        return URL.createObjectURL(
            new File([file.value, InitScript], "a.html", { type: "text/html" })
        );
    }
}
