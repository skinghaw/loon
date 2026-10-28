# 修仙小游戏 (tg.zifumh.cn) Loon 自动脚本

## 一、抓包解析结果（已全部确认）

| 项目 | 值 |
| --- | --- |
| 接口 | `POST https://tg.zifumh.cn/api/xiuxian-app.php` |
| 认证方式 | ① 请求头 `Cookie: server_name_session=3b0fb7110d78792c46800d1025c36124`；② 请求体里的 `initData`（Telegram MiniApp 登录态，含 signature/hash） |

`initData`（URL 编码的 Telegram 登录数据，解码后）：

```
query_id=AAH888VMAgAAAPzzxUzKQcC8
user={"id":5583008764,"first_name":"Cat","username":"carplay_cat","language_code":"zh-hans",...}
auth_date=1793161962          (≈ 2026-10-28 12:32 北京时间，会过期)
signature=3wC-FGJhO_7e...
hash=1b47597f...               (校验 hash，服务端凭它验证登录态)
```

### 核心操作（请求体全部确认）

```json
{"initData":"...","action":"run","op":"sign","args":[]}                  // 签到（每天一次）
{"initData":"...","action":"run","op":"salary","args":[]}                // 领取俸禄（每周一次）
{"initData":"...","action":"run","op":"mine_start","args":["8","hire"]}  // 雇人挖矿（8=8小时, 可选 2/4/8; hire=雇人）
{"initData":"...","action":"run","op":"mine_collect","args":[]}          // 领取挖矿收成
{"initData":"...","action":"run","op":"meditate","args":[]}              // 闭关（上限 8 小时）
{"initData":"...","action":"run","op":"exit","args":[]}                  // 出关
```

### 关键状态字段（来自 `action:"home"` 和 `action:"mine"`）

- `home.data.signed` / `sign_streak` → 今日是否已签到、连签天数
- `home.data.salary_done` → 本周俸禄是否已领
- `home.data.status` → `"meditate"` 表示正在闭关
- `mine.data.used` / `daily` → 今日已派矿趟数 / 每日上限（2 趟）
- `mine.data.options` → 时长选项 `[{2小时,36灵石},{4小时,72},{8小时,144}]`

## 二、文件说明

| 文件 | 用途 | 类型 |
| --- | --- | --- |
| `zifumh_capture.js` | 打开小程序时自动抓取 Cookie + initData 存到本地（成功静默，失败才通知） | http-request |
| `zifumh_task.js` | 定时执行签到/俸禄/挖矿/收成/闭关/出关 | cron |
| `zifumh.plugin` | Loon 插件文件：在 App 里渲染出开关+定时设置页，引用上面两个远程脚本 | 插件 |
| `loon-config.txt` | 手动版配置片段（不用插件时用） | 配置 |

## 三、安装步骤（推荐：插件方式）

1. **建 GitHub 仓库**：把本目录 4 个文件（`zifumh_capture.js`、`zifumh_task.js`、`zifumh.plugin`、`README.md`）
   上传到你自己的 GitHub 仓库（比如仓库名 `zifumh-loon`，分支 `main`）。
2. **替换插件里的地址**：把 `zifumh.plugin` 里所有
   `https://raw.githubusercontent.com/你的GitHub用户名/zifumh-loon/main/`
   批量替换成你自己仓库的 raw 地址（注意 `#!homepage` 那行也一起改）。
3. **安装插件**：Loon → 插件 → 安装插件，粘贴
   `https://raw.githubusercontent.com/你的GitHub用户名/zifumh-loon/main/zifumh.plugin`
   这个订阅地址。安装后打开插件开关，就能看到和截图一样的"详细 + 设置"页面：
   每个任务一个开关、每条定时一个输入框，直接在 App 里改，不用动代码。
4. **抓一次登录态**：打开游戏小程序随便点一下（插件已自动配置 MitM 域名和 requires_body）。
   抓包成功是静默的；只有失败才会弹"修仙抓包失败"通知。
5. **每天开一次游戏**：initData 会过期，每天打开一次小程序即自动刷新。

## 四、手动安装（不用插件时）

1. **导入脚本**：Loon → 配置 → 本地脚本（或“脚本”→ 新建本地脚本），
   分别新建两个脚本并粘贴对应 `.js` 内容，文件名分别命名为
   `zifumh_capture.js` 和 `zifumh_task.js`。

2. **开启 MitM**：Loon 里安装并信任证书，配置里加入：
   ```
   [MITM]
   hostname = tg.zifumh.cn
   ```

3. **添加脚本规则**：把 `loon-config.txt` 里的 `[MITM]` 和 `[Script]` 段整段粘贴进 Loon 配置文件
   （`[Script]` 段现在是 1 条抓包规则 + 9 条定时 cron 规则，用的是 Loon 3.5.1/Build 983 之后的新版语法；
   若你的 Loon 版本更旧，改用文件末尾注释掉的旧版语法块）。

4. **抓一次 CK**：打开小程序（游戏页面随便点一下），Loon 会弹通知
   “修仙CK已更新”，表示 cookie 和 initData 已抓到。

5. **设置开关和时间**：
   - 开关：编辑 `zifumh_task.js` 顶部的 `CONFIG`，把不需要的项目改成 `false`；
     挖矿时长 `mine_hours` 可选 `"2"` / `"4"` / `"8"`（当前按 8 小时一轮排布，建议保持 `"8"`）。
   - 时间：已在 `loon-config.txt` 的 `[Script]` 里按下方时刻表配好 9 条 cron；
     要改时间就改对应那行的 cron 表达式（旧版语法块也已同步更新）。

## 四、运行逻辑（脚本会自动判断，避免重复操作）

**定时时刻表（已在 loon-config.txt 配好，script() 第二个参数指定模式）**

| 时间 | 模式 | 动作 |
| --- | --- | --- |
| 每天 00:00 | mine | 雇人挖矿（先查 `mine.used < daily`，有配额才派） |
| 每天 00:01 | dual | 双修（op 抓到前自动跳过） |
| 每周一 00:01 | salary | 领取俸禄（本周已领则跳过） |
| 每天 00:02 | sign | 签到（今日已签则跳过） |
| 每天 08:00 | meditate | 闭关（闭关中先出关收收益，再自动续挂机） |
| 每天 08:01 | collect | 领取挖矿收成（op 抓到前自动跳过） |
| 每天 08:03 | mine | 雇人挖矿 |
| 每天 16:00 | meditate | 闭关 |
| 每天 16:04 | collect | 领取挖矿收成 |

- 签到：`signed=false` 才发
- 俸禄：`salary_done=false` 才发
- 挖矿：先查 `action:"mine"` 看 `used < daily` 才派矿，派满自动跳过
- 闭关/出关：正在闭关时先“出关”收收益，再自动“闭关”继续挂机；
  若只想出关不重新闭关，把 `meditate` 关掉、`exit` 打开即可

## 五、注意事项

- `initData` 和 `server_name_session` 都可能过期，所以脚本设计成
  “每天打开小程序时自动更新”，保持每天用 Loon 开着抓包点开一次游戏即可。
- 定时脚本的请求会走 Loon 当前的分流，确保 `tg.zifumh.cn` 能连通（国内 .cn 域名一般直连即可）。
- 闭关上限 8 小时、挖矿每天 2 趟且单次最长 8 小时，
  时刻表按 8 小时一轮排布：0/8/16 点闭关，00:00 和 08:03 派矿、08:01 和 16:04 收成。
- **还没抓到的操作码**（脚本会自动跳过并提示，不影响其他任务）：
  - 双修 → 抓到后填 `OP.dual`，并在 `CONFIG.dual_targets` 填三个固定道友的标识；
    填之前先确认双修邀请的请求体里用的是道友**数字 id** 还是**名字**，按对应格式填。
    （领取挖矿收成 `mine_collect` 已抓包确认并填入。）
