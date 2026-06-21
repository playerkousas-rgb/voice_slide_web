# UI Mockup 說明

檔案：`ui_mockup.html`

這是一個純前端互動 prototype，用來模擬 Voice Cue Slide Tool 的產品流程。它不是正式功能版，Google Drive、上傳、AI 自動建議等功能目前只是 mock data。

---

## Mockup 流程

### Step 1：選擇使用方式

用戶先選：

1. 純瀏覽器即插即用
2. Google Drive 模式（連通多用）

### Step 2：提供 A / B 資料

A 檔：投影片

- PPT / Canva / Google Slides 匯出成圖片或 PDF

B 檔：司儀稿 / 逐字稿

- DOCX / TXT / PDF / 直接貼上

Browser 模式：本機選檔。

Google Drive 模式：模擬選擇活動資料夾。

### Step 3：選擇 Cue 模式

支援三種模式，可混合：

1. 指定句 / 關鍵字 Cue
2. 逐字稿配對
3. 「參閱 XXX」標題鎖定

另有安全設定：

- Sequential
- Any
- Confirm
- 門檻
- 冷卻時間

### Step 4：Cue Builder

用表格設定：

- 觸發字眼 / 句子
- 動作：跳到頁碼、下一頁、跳到標題、提示確認
- 目標頁 / 標題
- 門檻

旁邊可從司儀稿句子快速加入 cue。

### Step 5：彩排 / 放映預覽

模擬：

- 投影片預覽
- 輸入「聽到句子」測試命中
- log 記錄
- 人手上一頁 / 下一頁 / 全螢幕按鈕位置

### Project JSON 重用

Mockup 現已加入：

- 頂部「載入 Project」
- 首頁「載入 Project JSON」
- A/B 資料頁「載入 project.vcue.json」
- 最後摘要頁「下載 JSON / 複製 JSON」

重用流程：

1. 用戶完成 cue 設定後，在最後一步下載 `project.vcue.json`
2. 下次打開網站，按「載入 Project」
3. 系統還原 cue、模式、門檻、冷卻等設定
4. 如果是 Browser 模式，用戶再手動選一次投影片圖片資料夾

注意：基於瀏覽器安全限制，Project JSON 不會保存或自動讀取本機圖片檔案本身。

### Step 6：Project 摘要

顯示 project JSON 形態，可下載或複製成 `project.vcue.json`，方便下次重用。

---

## 建議下一步

1. 先確認 UI flow 是否合適
2. 將現有 `index.html` 播放器功能拆成正式 app screen
3. 加入 project JSON 儲存/載入到 mockup flow
4. 之後再做 Google Drive Picker / Drive API

---

## 非功能範圍

目前 mockup 未真正做到：

- Google 登入
- Google Drive API
- 真正上傳檔案
- PPT/PDF 轉圖
- Web Speech API 聆聽
- 逐字稿 alignment
- AI cue 建議

這些可在 UI 確認後逐步加上。
