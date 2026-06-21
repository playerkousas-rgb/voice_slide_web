# Voice Cue Slide Tool｜產品設計草案

目標：做成一個可重用網站工具。用戶登入後，上傳 A 檔（投影片）和 B 檔（司儀稿/逐字稿），系統自動建立語音 cue，放映時聽到指定內容就跳到指定頁或下一頁。

---

## 核心概念

網站本身成為「投影片播放器」。PowerPoint / Canva / Google Slides 可先上傳或匯出，系統轉成圖片/PDF頁面後在瀏覽器播放。

放映電腦只需要：

- Chrome 或 Edge
- 網絡
- 可用咪高峰 / mixer input / USB audio interface

不需要安裝 Python。

---

## 用戶流程

1. 登入網站
2. 建立活動 / Project
3. 上傳 A 檔：PPTX / PDF / 圖片 / Canva 匯出檔
4. 上傳 B 檔：DOCX / PDF / TXT 司儀稿
5. 系統抽取：
   - 每頁 slide 圖片
   - 每頁標題 / 文字
   - 司儀稿可讀句子
   - 忽略不讀內容，例如括號、斜字、黃底、備註（DOCX 較可靠）
6. 選擇或混合三種模式：
   - 指定句 → 下一頁 / 指定頁
   - 逐字稿配對 → 到達 cue 位置自動跳頁
   - 聽到「參閱 XXX」→ 以 slide title / 附件名鎖定頁面
7. 系統產生 cue table，用戶確認/修改
8. 彩排模式：聽一次，記錄命中率和錯誤
9. 正式放映模式：全螢幕播放，自動跳頁，人手鍵盤後備

---

## 三種模式

### 1. 指定句觸發

用戶在司儀稿選一句，設定 action：

- 下一頁
- 跳到第 N 頁
- 跳到標題為 XXX 的頁

適合短流程、固定 cue。

安全設定：

- Sequential lock：只等下一個 cue
- Confidence threshold
- Cooldown
- 避免太短/重複句

---

### 2. 逐字稿配對

系統將司儀稿切成句子/段落，放映時將語音辨識結果和逐字稿做 sliding alignment。

當系統判斷已讀到某段 script position，就觸發該位置的 cue。

優點：

- 用戶不用逐句設定
- 可根據完整稿自動推進
- 可在彩排後自動修正 cue

風險：

- 如果講者大幅跳稿/即興，可能失準

安全設定：

- 只在下一個 5–10 行 script 範圍內搜尋
- 若偏離過大，只提示不自動跳
- 支援人手「跳到目前段落」校正

---

### 3. 「參閱 XXX」標題鎖定

系統偵測句式：

- 大家可以參閱 XXX
- 請參閱 XXX
- 請大家看 XXX
- 接下來進入 XXX
- 以下是 XXX

然後將 XXX 和 slide title / attachment title / agenda item 做 fuzzy match。

例子：

- 「大家可以參閱附件二」→ 找到附件二 / 財務報告頁
- 「接下來進入財務報告」→ 找到財務報告頁
- 「議程七提名及選出區執行委員會成員」→ 找到議程七頁

安全設定：

- 若多於一頁相似，要求人手確認或只在預期範圍內跳
- 可限制只跳到當前頁之後 N 頁
- 可配合 sequential lock，避免跳回前面

---

## 建議 MVP

### MVP 1：不用 backend 的靜態版

- 上傳圖片投影片
- 貼上 / 載入 cue CSV
- Chrome/Edge Web Speech API
- 全螢幕 player
- Sequential mode
- 匯出/匯入 project JSON

已可應付一次活動，但未有登入和自動 PPT 轉換。

### MVP 2：登入網站版

- User login
- Project storage
- 上傳 PPTX/PDF/DOCX
- Server convert slides to images
- Script parser
- Cue table editor
- Rehearsal / Present mode

### MVP 3：智能配對版

- 自動 slide title extraction
- 逐字稿 alignment
- 「參閱 XXX」標題鎖定
- 彩排後自動建議更好 cue
- 多用戶協作 / operator link

---

## 技術建議

### Frontend

- React / Vue / Next.js
- Fullscreen slide player
- Web Speech API 初版
- Device selector 選咪高峰 / mixer input
- Cue editor table

### Backend

- Docker server
- LibreOffice headless：PPTX → PDF/PNG
- PDF renderer：PDF → images
- DOCX parser：抽取文字、可選忽略斜字/黃底/括號
- Storage：S3 / Cloudflare R2 / local object storage
- DB：PostgreSQL

### Speech Recognition

方案 A：Chrome/Edge Web Speech API

- 最快、成本低
- 但控制較少，通常需要網絡

方案 B：Azure/Google/OpenAI Speech API

- 較穩、可控、支援更詳細 logs
- 有成本，需要 backend token / stream

正式產品建議：MVP 用 Web Speech API，之後可切換雲端 STT。

---

## 音訊輸入建議

如果現場咪高峰屬於音響系統，最佳做法是：

- Mixer AUX OUT / REC OUT / USB OUT → 活動電腦 USB audio interface
- 在網站選擇該 input device

不建議只靠 notebook 內置咪，因為現場回音和環境聲會影響辨識。

---

## 安全機制

正式活動必須具備：

- Sequential lock 預設開啟
- 人手上一頁/下一頁/跳頁
- Confidence threshold
- Cooldown
- Rehearsal mode
- 命中記錄 log
- 一鍵停止聆聽
- 當信心不足時「提示但不自動跳」

---

## 推薦實作策略

先做 MVP 2 的精簡版：

1. 登入可稍後加，先用 project JSON 儲存
2. 先支援圖片/PDF，PPTX 可由用戶先匯出
3. Cue editor 做好
4. Voice player 做好
5. 再加 PPTX/DOCX 自動解析

這樣最快可試用，又可以逐步變成完整網站工具。
