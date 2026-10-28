/*
 * 修仙小游戏 (tg.zifumh.cn) — 定时任务脚本（多模式）
 * 类型: cron（定时脚本）
 * 依赖: 先运行 zifumh_capture.js 抓取 CK
 *
 * 通过 cron 规则里 script("zifumh_task.js", "模式") 的第二个参数传入模式（即 $argument），
 * 不同模式执行不同动作：
 *   sign     签到
 *   salary   领取俸禄
 *   mine     雇人挖矿（派矿）
 *   collect  领取挖矿收成（op 已确认 mine_collect）
 *   meditate 闭关（正在闭关则先出关收收益，再重新闭关）
 *   dual     双修（向固定道友发邀请，op 待补）
 *   all      手动测试用：一次性跑 sign/salary/mine/meditate
 *
 * 推荐时刻表（与 loon-config.txt 保持一致）：
 *   每天 00:00  雇人挖矿
 *   每天 00:01  双修
 *   每周一 00:01 领取俸禄
 *   每天 00:02  签到
 *   每天 08:00  闭关
 *   每天 08:01  领取挖矿收成
 *   每天 08:03  雇人挖矿
 *   每天 16:00  闭关
 *   每天 16:04  领取挖矿收成
 */

var MODE = (typeof $argument === "string" && $argument) ? String($argument) : "all";

// ==================== 配置区（开关） ====================
var CONFIG = {
    sign: true,           // 签到
    salary: true,         // 领取俸禄
    mine: true,           // 雇人挖矿
    mine_hours: "8",      // 挖矿时长，可选 "2" / "4" / "8"
    mine_collect: true,   // 领取挖矿收成
    meditate: true,       // 闭关
    exit: true,           // 闭关前先出关收收益
    meditate_delay: 3000, // 出关后等待多少毫秒再闭关（防止服务端状态没刷新导致再进失败）
    dual: true,           // 双修
    dual_targets: [],     // 三个固定道友的标识：抓到双修请求后确认邀请用的是道友 id 还是名字，再按对应格式填。例(数字id): [218, 144, 134]；若是名字则填 ["道友A", "道友B", "道友C"]
};

// ==================== 操作码 ====================
var OP = {
    mine_collect: "mine_collect",  // 领取挖矿收成 op（已抓包确认：{"action":"run","op":"mine_collect","args":[]}）
    dual: "",          // TODO 双修 op，抓到双修请求后填入
};

var API = "https://tg.zifumh.cn/api/xiuxian-app.php";
var UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148";

// ==================== 主体 ====================
var COOKIE = $persistentStore.read("zifumh_cookie") || "";
var INITDATA = $persistentStore.read("zifumh_initdata") || "";
console.log("[修仙] MODE=" + MODE + " 读取CK: cookie=" + COOKIE.length + ", initData=" + INITDATA.length);

if (!COOKIE || !INITDATA) {
    $notification.post("修仙脚本", "缺少 CK", "读取到 cookie=" + (COOKIE || "").length + "、initData=" + (INITDATA || "").length + "，请先打开小程序抓取后重试");
    $done();
}

function post(payload, cb) {
    $httpClient.post({
        url: API,
        timeout: 15000,
        "auto-cookie": false,
        headers: {
            "Content-Type": "application/json",
            "Accept": "*/*",
            "Origin": "https://tg.zifumh.cn",
            "Referer": "https://tg.zifumh.cn/xiuxian/index.html",
            "User-Agent": UA,
            "Cookie": COOKIE
        },
        body: JSON.stringify(payload)
    }, function (err, resp, data) {
        if (err) {
            cb({ __err: "网络错误: " + err });
            return;
        }
        var o = {};
        try { o = JSON.parse(data || "{}"); } catch (e) { o = { __raw: data }; }
        cb(o);
    });
}

function shortMsg(o) {
    if (o.__err) return o.__err;
    if (o.view && o.view.alert) return o.view.alert;
    if (o.view && o.view.html) return String(o.view.html).replace(/<[^>]+>/g, "").slice(0, 50);
    if (o.data && o.data.status_label) return o.data.status_label;
    if (typeof o.ok !== "undefined") {
        if (o.ok) return "完成";
        // 失败时把服务端返回的错误文字带出来，便于判断原因
        var detail = o.error || o.message || (o.view && (o.view.error || o.view.alert)) || "";
        return "失败：" + (detail ? String(detail).slice(0, 60) : JSON.stringify(o).slice(0, 60));
    }
    return JSON.stringify(o).slice(0, 50);
}

function run(op, args) {
    return { initData: INITDATA, action: "run", op: op, args: args || [] };
}

var logs = [];
var steps = []; // { name, payload }
var hasFail = false;

console.log("[修仙] ===== 开始运行 MODE=" + MODE + " =====");

function finish() {
    var numbered = logs.length
        ? logs.map(function (l, i) { return (i + 1) + ". " + l; }).join("\n")
        : "（本次无需执行）";
    console.log("[修仙] 共 " + logs.length + " 步，结束:\n" + numbered);
    $notification.post("修仙·" + MODE, hasFail ? "有失败项" : "执行完成（" + logs.length + " 步）", numbered);
    $done();
}

function runSteps() {
    var i = 0;
    function next() {
        if (i >= steps.length) { finish(); return; }
        var s = steps[i++];
        post(s.payload, function (o) {
            var msg = shortMsg(o);
            if (/失败|错误|异常/.test(msg)) hasFail = true;
            var line = s.name + " → " + msg;
            logs.push(line);
            console.log("[修仙] 步骤: " + line);
            var wait = s.delayAfter || 0;
            if (wait > 0) {
                console.log("[修仙] 等待 " + wait + "ms 后继续...");
                setTimeout(next, wait);
            } else {
                next();
            }
        });
    }
    next();
}

function fetchHome(cb) { post({ initData: INITDATA, action: "home" }, cb); }
function fetchMine(cb) { post({ initData: INITDATA, action: "mine" }, cb); }

// ---- 签到 ----
function doSign() {
    fetchHome(function (home) {
        if (home.__err || !home.data) { logs.push("状态获取失败: " + (home.__err || "CK失效")); finish(); return; }
        if (home.data.signed) { logs.push("签到: 今日已签（连签 " + (home.data.sign_streak || 0) + " 天）"); finish(); return; }
        steps.push({ name: "签到", payload: run("sign") });
        runSteps();
    });
}

// ---- 领取俸禄 ----
function doSalary() {
    fetchHome(function (home) {
        if (home.__err || !home.data) { logs.push("状态获取失败: " + (home.__err || "CK失效")); finish(); return; }
        if (home.data.salary_done) { logs.push("领取俸禄: 本周已领"); finish(); return; }
        steps.push({ name: "领取俸禄", payload: run("salary") });
        runSteps();
    });
}

// ---- 闭关（正在闭关则先出关，再重新闭关） ----
function doMeditate() {
    fetchHome(function (home) {
        if (home.__err || !home.data) { logs.push("状态获取失败: " + (home.__err || "CK失效")); finish(); return; }
        var meditating = (home.data.status === "meditate");
        logs.push("状态: " + (home.data.status_label || home.data.status || "未知"));
        if (meditating) {
            if (CONFIG.exit) {
                steps.push({ name: "出关", payload: run("exit"), delayAfter: CONFIG.meditate_delay });
                steps.push({ name: "闭关", payload: run("meditate") });
            } else {
                logs.push("闭关: 已在闭关中，跳过");
            }
        } else {
            steps.push({ name: "闭关", payload: run("meditate") });
        }
        runSteps();
    });
}

// ---- 雇人挖矿（先查今日派矿配额） ----
function doMine() {
    fetchMine(function (mine) {
        if (mine.__err || !mine.data) {
            steps.push({ name: "雇人挖矿", payload: run("mine_start", [CONFIG.mine_hours, "hire"]) });
            runSteps();
            return;
        }
        var used = parseInt(mine.data.used, 10) || 0;
        var daily = parseInt(mine.data.daily, 10) || 0;
        if (used < daily) {
            steps.push({ name: "雇人挖矿(" + CONFIG.mine_hours + "h)", payload: run("mine_start", [CONFIG.mine_hours, "hire"]) });
        } else {
            logs.push("雇人挖矿: 今日已派 " + used + "/" + daily + " 趟，跳过");
        }
        runSteps();
    });
}

// ---- 领取挖矿收成 ----
function doCollect() {
    if (!OP.mine_collect) {
        logs.push("领取挖矿收成: op 尚未抓到，跳过（抓到后填 OP.mine_collect）");
        finish();
        return;
    }
    steps.push({ name: "领取挖矿收成", payload: run(OP.mine_collect, []) });
    runSteps();
}

// ---- 双修（向固定道友发邀请） ----
function doDual() {
    if (!OP.dual) {
        logs.push("双修: 双修 op 尚未抓到，跳过（抓到后填 OP.dual）");
        finish();
        return;
    }
    if (!CONFIG.dual_targets.length) {
        logs.push("双修: 未配置道友（抓到双修请求后填 CONFIG.dual_targets）");
        finish();
        return;
    }
    for (var i = 0; i < CONFIG.dual_targets.length; i++) {
        steps.push({ name: "双修@" + CONFIG.dual_targets[i], payload: run(OP.dual, [String(CONFIG.dual_targets[i])]) });
    }
    runSteps();
}

// ---- 手动测试 all：签到+俸禄+闭关+挖矿 ----
function doAll() {
    fetchHome(function (home) {
        if (home.__err || !home.data) { logs.push("状态获取失败: " + (home.__err || "CK失效")); finish(); return; }
        var d = home.data;
        if (CONFIG.sign && !d.signed) steps.push({ name: "签到", payload: run("sign") });
        if (CONFIG.salary && !d.salary_done) steps.push({ name: "领取俸禄", payload: run("salary") });
        var meditating = (d.status === "meditate");
        if (CONFIG.meditate) {
            if (meditating && CONFIG.exit) steps.push({ name: "出关", payload: run("exit"), delayAfter: CONFIG.meditate_delay });
            if (!meditating || (meditating && CONFIG.exit)) steps.push({ name: "闭关", payload: run("meditate") });
        }
        if (CONFIG.mine) {
            fetchMine(function (mine) {
                var used = 0, daily = 0;
                if (mine.data) { used = parseInt(mine.data.used, 10) || 0; daily = parseInt(mine.data.daily, 10) || 0; }
                if (used < daily) steps.push({ name: "雇人挖矿(" + CONFIG.mine_hours + "h)", payload: run("mine_start", [CONFIG.mine_hours, "hire"]) });
                else logs.push("雇人挖矿: 今日已派 " + used + "/" + daily + " 趟，跳过");
                runSteps();
            });
            return;
        }
        runSteps();
    });
}

// ==================== 分发 ====================
switch (MODE) {
    case "sign":      if (CONFIG.sign) doSign(); else finish(); break;
    case "salary":    if (CONFIG.salary) doSalary(); else finish(); break;
    case "mine":      if (CONFIG.mine) doMine(); else finish(); break;
    case "collect":   if (CONFIG.mine_collect) doCollect(); else finish(); break;
    case "meditate":  if (CONFIG.meditate) doMeditate(); else finish(); break;
    case "dual":      if (CONFIG.dual) doDual(); else finish(); break;
    default:          doAll(); break;
}
