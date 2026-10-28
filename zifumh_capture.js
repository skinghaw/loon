/*
 * 修仙小游戏 (tg.zifumh.cn) — CK 抓取脚本
 * 类型: http-request（requires_body=true）
 * 作用: 每次打开小程序时自动抓取 Cookie 与 initData 并保存到本地
 *
 * 输出策略（v2.3）:
 *   - 抓取成功（cookie + initData 都拿到）: 静默，不通知、不打 log
 *   - 抓取失败（cookie 或 initData 缺失）: 弹通知 + 打 log（带详细信息，便于排查）
 */

function getHeader(name) {
    var h = ($request && $request.headers) || {};
    var lower = String(name).toLowerCase();
    for (var k in h) {
        if (String(k).toLowerCase() === lower) return h[k];
    }
    return "";
}

// 把 Loon 传来的 body 统一转成字符串（string / Uint8Array / 空）
function bodyToStr(b) {
    if (!b) return "";
    if (typeof b === "string") return b;
    try {
        var s = "";
        for (var i = 0; i < b.length; i++) s += String.fromCharCode(b[i] & 0xff);
        return s;
    } catch (e) {
        return String(b);
    }
}

var cookie = getHeader("Cookie");
var rawBody = ($request && $request.body);
var bodyStr = bodyToStr(rawBody);
var bodyType = (!rawBody) ? "empty" : (typeof rawBody === "string" ? "string" : "bytes(" + rawBody.length + ")");

var initData = "";

// 1) body 是 JSON：initData 在顶层，或嵌套在某个子对象里
try {
    var parsed = JSON.parse(bodyStr);
    if (parsed && typeof parsed === "object") {
        if (parsed.initData) {
            initData = String(parsed.initData);
        } else {
            for (var k in parsed) {
                if (parsed[k] && typeof parsed[k] === "object" && parsed[k].initData) {
                    initData = String(parsed[k].initData);
                    break;
                }
            }
        }
    }
} catch (e) { /* body 不是 JSON，走下面 */ }

// 2) 非 JSON（form/urlencoded）：从 body 里抠 initData=xxx
if (!initData && bodyStr.indexOf("initData=") !== -1) {
    var m = bodyStr.match(/[?&]?initData=([^&]+)/);
    if (m && m[1]) {
        try { initData = decodeURIComponent(m[1]); } catch (e) { initData = m[1]; }
    }
}

// 3) 兜底：URL 查询串里带 initData
if (!initData) {
    var q = String($request.url || "").split("?")[1] || "";
    var m2 = q.match(/[?&]?initData=([^&]+)/);
    if (m2 && m2[1]) {
        try { initData = decodeURIComponent(m2[1]); } catch (e) { initData = m2[1]; }
    }
}

// 写入（只写非空值，不会用空值覆盖已抓到的）
if (cookie) $persistentStore.write(cookie, "zifumh_cookie");
if (initData) $persistentStore.write(initData, "zifumh_initdata");

if (cookie && initData) {
    // 成功：静默，不通知不打 log
    $done({});
} else {
    // 失败：通知 + log，带详细信息
    var reason = (!cookie && !initData) ? "cookie 和 initData 都没抓到"
               : (!cookie ? "cookie 没抓到（请求头里没有）"
                          : "initData 没抓到（检查 requires_body 是否开启 / body 内容）");
    var detail = "原因: " + reason +
        "\nurl: " + ($request && $request.url) +
        "\nbodyType: " + bodyType + "，body_len: " + bodyStr.length +
        "\nbody_head: " + bodyStr.slice(0, 90);
    console.log("[修仙] 抓取失败: " + reason + " | " + detail);
    $notification.post("修仙抓包失败", "cookie=" + cookie.length + "，initData=" + initData.length, detail);
    $done({});
}
