import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import babel from "@rollup/plugin-babel";
import alias from "@rollup/plugin-alias";
import replace from "@rollup/plugin-replace";
import p from "../package.json";
/*
    统一的插件配置
 */
console.log(p.version);
export const plugins = [
    {
        resolveId(thisFile) {
            // * 自动忽略 CDN
            if (thisFile.startsWith("https://")) {
                return { external: true, id: thisFile };
            }
        },
    },
    replace({
        preventAssignment: false,
        values: {
            __dirname: JSON.stringify(""),
            __Version: JSON.stringify(p.version),
        },
    }),
    alias({
        entries: {
            path: "src/shim/path.ts",
            fs: "src/shim/fs.cjs",
            glob: "src/shim/glob/glob.js",
            process: "src/shim/process.ts",
            module: "src/shim/module.ts",
            url: "src/shim/url.ts",
            child_process: "src/shim/child_process.ts",
            zlib: "src/shim/zlib.ts",
            brotli: "src/shim/brotli.js",
            buffer: "src/shim/buffer.ts",
            os: "src/shim/os.ts",
            "generic-names": "src/shim/generic-names.ts",
            cssnano: "src/shim/cssnano.ts",
            "@rollup/pluginutils-bundle":
                "node_modules/@rollup/pluginutils/dist/es/index.js",
            "@rollup/pluginutils": "src/plugins/plugin-utils.ts",
            "rollup-pluginutils": "@rollup/pluginutils",
            "safe-identifier": "src/shim/safe-identifier.ts",
        },
    }),
    commonjs({
        // ! 不要使用这个，这个会错误转义 lodash
        // transformMixedEsModules: true,
        ignoreDynamicRequires: true,
    }),
    resolve({
        browser: true,
        extensions: [".ts", ".js"],
        preferBuiltins: true,
    }),
    babel({
        extensions: [".ts"],
        babelHelpers: "bundled",
    }),
];
