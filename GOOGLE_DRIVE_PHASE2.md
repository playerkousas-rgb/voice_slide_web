# Phase 2：Google Drive Friendly 方案

目標：不用 Supabase / 複雜 database，讓一般用戶只需要懂 Google Drive 都可以重用工具。

---

## 核心原則

用戶不需要理解 database、storage、backend。

他們只需要知道：

```txt
每個活動 = 一個 Google Drive 資料夾
```

例如：

```txt
Google Drive/
  Voice Cue Slide Projects/
    2026 周年大會/
      slides/
        Slide1.png
        Slide2.png
        Slide3.png
      script.docx
      cues.csv
      project.vcue.json
```

網站部署在 Vercel，只負責提供工具介面。

活動檔案由用戶自己的 Google Drive 管理。

---

## 最簡單版本：不用 Google API

這是 Phase 1.5，最容易上線，也最少風險。

### 用戶流程

1. 用戶在 Google Drive 建立活動資料夾
2. 將投影片匯出成 PNG/JPG，放入 `slides` 資料夾
3. 將 cue CSV / project JSON 放在同一個活動資料夾
4. 開 Vercel 網站
5. 從電腦選擇 `slides` 資料夾
6. 載入 `project.vcue.json` 或 `cues.csv`
7. 按開始聆聽

### 優點

- 不用 Google OAuth
- 不用 Google API
- 不需要 app verification
- 不會有私隱/權限疑慮
- 技術最簡單

### 缺點

- 每次仍要手動選一次投影片圖片資料夾
- Project JSON 不會自動把圖片一併帶入，因為瀏覽器安全限制不允許網站自動讀取本機檔案路徑

### 已加入的功能

目前 `index.html` 已支援：

- 下載 `Project JSON`
- 載入 `Project JSON`
- 保存 cue、語言、模式、門檻、冷卻等設定

所以用戶下次不用重寫 cue，只要載入 project JSON，再選一次 slides 資料夾即可。

---

## 進階版本：Google Drive 直接整合

這是 Phase 2。

### 用戶流程

1. 用戶登入 Google
2. 按「從 Google Drive 開啟 Project」
3. Google Picker 讓用戶選擇一個活動資料夾或 `project.vcue.json`
4. 網站讀取：
   - project JSON
   - slides 圖片
   - cues
   - script
5. 用戶修改 cue 後，按「儲存到 Google Drive」
6. 要分享給其他人，只要分享 Drive 資料夾

---

## 技術架構

```txt
Vercel Static / Next.js App
  ↓
Google Identity Services：登入 / OAuth
  ↓
Google Picker：選擇 project folder / files
  ↓
Google Drive API：讀寫 project JSON、cue、slide images
```

不需要 Supabase。

---

## Google Drive 權限建議

建議先用較保守的 scope：

```txt
https://www.googleapis.com/auth/drive.file
```

意思是：

- app 只可以讀寫用戶透過此 app 建立或選擇的檔案
- 不會掃描整個 Drive

如果要讀整個指定資料夾內所有檔案，可能需要配合 Google Picker 或額外 scope。

避免一開始用過大的權限：

```txt
https://www.googleapis.com/auth/drive
```

因為用戶會覺得不安全，Google app verification 也較麻煩。

---

## Project 檔案格式

建議用：

```txt
project.vcue.json
```

內容例子：

```json
{
  "schema": "voice-cue-slide-project",
  "version": 1,
  "title": "2026 周年大會",
  "settings": {
    "language": "zh-HK",
    "mode": "sequential",
    "threshold": 84,
    "cooldownSeconds": 3
  },
  "slides": [
    { "slideNo": 1, "name": "Slide1.png", "driveFileId": "...", "title": "封面" },
    { "slideNo": 2, "name": "Slide2.png", "driveFileId": "...", "title": "簽到表格" }
  ],
  "cues": [
    { "order": 1, "trigger": "周年大會現在正式開始", "action": "goto_slide", "targetSlideNo": 3 },
    { "order": 2, "trigger": "無未了事項進入議程三", "action": "goto_slide", "targetSlideNo": 5 }
  ]
}
```

---

## Google Drive 整合要注意的地方

### 1. 圖片載入

Drive 圖片不能只用普通 share link 當 `<img>`，因為權限和 CORS 可能出問題。

較穩定做法：

- 用 Drive API 取得 file blob
- 在 browser 建立 `URL.createObjectURL(blob)`
- 然後顯示圖片

### 2. 大量圖片效能

如果投影片有很多頁，不應一次全部讀入。

建議：

- 先讀前後幾頁
- 當前頁前後 preload
- 其餘頁 lazy load

### 3. OAuth Verification

如果網站公開給很多 Google 用戶使用，Google 可能要求 app verification。

為降低風險：

- 只用 `drive.file`
- 清楚寫 Privacy Policy
- 不要求 full drive access
- 初期可用 test users / 同一組織內使用

---

## 對一般用戶最友善的介面

### Dashboard 不一定叫 Dashboard

可以叫：

```txt
我的活動資料夾
```

### 建立活動

按鈕：

```txt
建立新活動到 Google Drive
```

系統自動建立：

```txt
Voice Cue Slide Projects / 活動名稱 /
```

### 分享活動

按鈕：

```txt
在 Google Drive 分享此活動資料夾
```

實際上就是打開 Drive share dialog / 提示用戶分享 folder。

---

## 建議開發順序

### Step 1：完成 Vercel 靜態版

功能：

- 上傳本機 slides 圖片
- cue editor
- project JSON import/export
- present mode

### Step 2：Google Drive 手動工作流

文件教學：

- 如何建立 Drive folder
- 如何放 slides / project JSON
- 如何下載/載入

### Step 3：Google Login + Picker

加入：

- Sign in with Google
- Open project JSON from Drive
- Save project JSON to Drive

### Step 4：Drive Folder Project

加入：

- 選 project folder
- 自動讀 slides folder
- 自動讀/write project JSON

### Step 5：Google Slides / Docs 輔助

較後才做：

- 選 Google Slides 檔案
- 匯出 PDF / image
- 選 Google Docs 司儀稿
- 抽文字建議 cue

---

## 最推薦策略

短期：

```txt
Vercel 靜態網站 + Google Drive 手動管理檔案 + Project JSON
```

中期：

```txt
Google Login + Picker + Drive API 儲存 Project JSON
```

長期：

```txt
Google Drive folder 成為 project database
```

這樣對非技術用戶最友善，也避免 Supabase / database 帳戶管理的心理負擔。
