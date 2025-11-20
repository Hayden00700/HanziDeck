# 🀄 Hanzi Deck - 網頁版漢字記憶卡

這是一個基於 Web 的間隔重複系統 (SRS) 應用程式，專為學習漢字設計。它結合了 **Anki 風格的記憶演算法**、**筆順動畫/書寫練習**、**語音朗讀**以及 **萌典 (Moedict)** 的釋義功能。

此專案是純前端應用 (Serverless)，利用 **GitHub Gist** 作為雲端資料庫，實現跨裝置進度同步。

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Status](https://img.shields.io/badge/status-Active-green.svg)

## ✨ 主要功能

*   **🧠 間隔重複系統 (SRS)**：基於 SM-2 演算法變體（類似 Anki），根據你的熟練度（Again, Good, Easy）自動安排複習時間。
*   **✍️ 筆順動畫與練習**：
    *   整合 `HanziWriter`，顯示正確的筆順動畫。
    *   **手寫練習模式**：在畫布上描紅或自由書寫，支援自動評分與提示。
    *   **自由塗鴉板**：提供空白畫布進行自由書寫練習。
*   **🗣️ 語音朗讀 (TTS)**：使用瀏覽器的語音合成 API 朗讀單字（支援台灣國語/普通話發音）。
*   **📚 內建字典**：整合 [萌典 (Moedict)](https://www.moedict.tw/) API，自動載入注音、部首、釋義與例句。
*   **☁️ 雲端同步**：
    *   支援 **GitHub Gist Sync**。
    *   資料可跨裝置（電腦、平板、手機）同步。
    *   包含防衝突機制與 Debounce 存檔優化。
*   **👥 多設定檔 (Profiles)**：支援建立多個使用者或不同學習主題的設定檔。
*   **📊 統計圖表**：視覺化顯示學習熟練度分佈與未來 7 天的複習預測。

## 🚀 快速開始

### 1. 安裝與執行
由於這是純靜態網頁，你不需要安裝 Node.js 或 Python。

1.  Clone 此專案。
2.  直接用瀏覽器打開 `index.html` 即可使用。
3.  **推薦**：使用 GitHub Pages 託管，即可在任何地方透過網址存取。

### 2. 設定雲端同步 (GitHub Gist)
為了在不同裝置間同步進度，請依照以下步驟設定：

1.  登入你的 GitHub 帳號。
2.  前往 [GitHub Settings > Developer settings > Personal access tokens](https://github.com/settings/tokens)。
3.  建立一個新的 Token (Classic)，勾選 **`gist`** 權限，並複製產生的 Token。
4.  前往 [gist.github.com](https://gist.github.com/) 建立一個新的 Gist（內容可留空或是寫個 `{}`），並複製網址列末端的 **Gist ID**。
5.  打開本應用程式，點擊右上角的 **設定 (Settings)** 圖示。
6.  在 "GitHub Gist Sync" 區塊填入 **Token** 與 **Gist ID** 並儲存。

## 📖 操作說明

### 主畫面
*   **Search (🔍)**：搜尋特定漢字，若字卡不存在可直接新增。
*   **Practice (✏️)**：進入自由手寫板模式。
*   **Stats (📊)**：查看學習統計數據。
*   **Settings (⚙️)**：編輯牌組、設定雲端同步、管理設定檔。

### 學習模式
1.  畫面顯示漢字（或提示）。
2.  點擊 **筆順 (Writing)** 圖示可查看動畫或進行測驗。
3.  點擊 **發音 (Volume)** 圖示聽取讀音。
4.  根據記憶情況評分：
    *   **Again**：忘記了，稍後重來。
    *   **Good**：記得，間隔將稍微拉長。
    *   **Easy**：非常熟悉，間隔將大幅拉長。

### 編輯模式
*   **Bulk Add**：貼上一串漢字（例如：「天地玄黃」）即可批量新增卡片。
*   **Profile Management**：可在此切換、新增或刪除設定檔。

## 📄 授權

本專案採用 MIT License 開源授權。
