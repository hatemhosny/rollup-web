// classic worker 测试 主线程
import ClassicWorker from "./worker.classic.js?worker";
const worker = new ClassicWorker({
    type: "classic",
});
worker.addEventListener("message", (e) => {
    console.warn(e.data);
});
