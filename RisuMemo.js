//@name Notepad
//@display-name 📝 RisuMemo v4.0.2
//@api 3.0
//@version 4.0.2
//@update-url https://raw.githubusercontent.com/EXena1722/RisuMemo/main/RisuMemo.js
//@link https://github.com/EXena1722/RisuMemo GitHub
//@arg risumemo_ui_reset string 창·버튼 위치가 꼬였을 때 reset 입력 후 새로고침

(async () => {
try {

const PLUGIN_NAME = "[RisuMemo v4.0.2]";
const NOTEPAD_UI_ID = "risu-notepad-container";
const NOTEPAD_STYLE_ID = "risu-notepad-style";
const FLOAT_ATTR = "x-risumemo-float";

// --- 메모 데이터: pluginStorage ---
// 세이브 파일에 저장되고 기기 간 동기화되며, 플러그인을 업데이트해도 유지된다.
// ※ pluginStorage는 모든 플러그인이 같은 공간을 쓴다. 고유 접두사를 붙이고 clear()는 절대 쓰지 않는다.
const DATA_KEY = "risumemo::folders";
// v3.x는 메모를 플러그인 인수에 저장했다 (플러그인 업데이트 시 초기화됨). 마이그레이션용.
const LEGACY_ARG_KEYS = ["risumemo_data", "Notepad::risumemo_data"];
const UI_RESET_ARG = "risumemo_ui_reset";
// MemoPlus(다른 제작자의 파생 플러그인) 데이터 가져오기용
const MEMOPLUS_DATA_KEY = "memoplus_data";

// --- UI 상태: safeLocalStorage (기기 전용, v3.3 이하의 localStorage와 같은 저장소) ---
const BUTTON_VISIBLE_KEY = "risu_notepad_button_visible";
const POSITION_KEY = "risu_notepad_position";
const SIZE_KEY = "risu_notepad_size";
const BTN_POSITION_KEY = "risu_notepad_btn_position";
const ACTIVE_NOTE_INDEX_KEY = "risu_notepad_active_index";
const ACTIVE_FOLDER_INDEX_KEY = "risu_notepad_active_folder_index";
const THEME_KEY = "risumemo_theme";
const BROWSER_BACKUP_KEY = "risumemo_manual_backup";
const LEGACY_WINDOW_VISIBLE_KEY = "risu_notepad_window_visible";
const SHORTCUT_ENABLED_KEY = "risumemo_shortcut_enabled";

const DEFAULT_FOLDER_TITLE = "기본 폴더";
const MIN_WIDTH = 400, MIN_HEIGHT = 300, HEADER_GRAB = 40;
// 전체화면 iframe의 z-index는 1000. 버튼을 그보다 아래에 두어 메모장이 열리면 가려지게 한다 (모바일에서 화면을 가리지 않도록).
const FLOAT_Z_INDEX = 999;
const FLOAT_DEFAULT = { right: 20, bottom: 100 };
const HANDLE_COLOR = "rgba(150,150,150,0.45)", HANDLE_ACTIVE_COLOR = "rgba(150,150,150,0.85)";

const ls = risuai.safeLocalStorage;
const ps = risuai.pluginStorage;

// --- 스토리지 헬퍼 ---
async function lsGet(key) {
    try { return await ls.getItem(key); } catch (e) { return null; }
}
async function lsSet(key, value) {
    try { await ls.setItem(key, String(value)); } catch (e) {}
}
async function lsRemove(key) {
    try { await ls.removeItem(key); } catch (e) {}
}
async function lsGetJSON(key, defaultValue) {
    const raw = await lsGet(key);
    if (!raw) return defaultValue;
    try { return JSON.parse(raw); } catch (e) { return defaultValue; }
}

// --- 공용 유틸 ---
function escapeHtml(str) {
    return String(str ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function clamp(value, min, max) {
    return Math.min(Math.max(value, min), Math.max(min, max));
}
function toIndex(value) {
    const n = Number(value);
    return Number.isInteger(n) && n >= 0 ? n : 0;
}
function pointOf(e) {
    const src = e.touches ? e.touches[0] : e;
    return { x: src.clientX, y: src.clientY };
}
// CSS의 @media (max-width: 768px)와 같은 기준. matchMedia는 iframe이 막 표시된 직후 이전(너비 0) 상태를
// 돌려줄 수 있어서, 레이아웃을 강제로 갱신하는 innerWidth로 판단한다.
function isMobileLayout() {
    return window.innerWidth <= 768;
}
function defaultFolders() {
    return [{ title: DEFAULT_FOLDER_TITLE, notes: [] }];
}
function countNotes(list) {
    return list.reduce((sum, f) => sum + f.notes.length, 0);
}

// 저장 데이터 검증/정규화. 잘못된 형식이면 null.
function normalizeFolders(parsed) {
    if (!Array.isArray(parsed)) return null;
    // v3.3 이전: 폴더 없이 메모 배열만 저장하던 형식
    if (parsed.length > 0 && !Array.isArray(parsed[0]?.notes)) {
        parsed = [{ title: DEFAULT_FOLDER_TITLE, notes: parsed }];
    }
    return parsed.filter(f => f && typeof f === "object").map(f => ({
        title: typeof f.title === "string" && f.title.trim() ? f.title : "새 폴더",
        notes: (Array.isArray(f.notes) ? f.notes : []).filter(n => n && typeof n === "object").map(n => ({
            title: typeof n.title === "string" ? n.title : "",
            content: typeof n.content === "string" ? n.content : ""
        }))
    }));
}
function parseFolders(raw) {
    if (!raw) return null;
    try { return normalizeFolders(typeof raw === "string" ? JSON.parse(raw) : raw); } catch (e) { return null; }
}

async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch (e) {
        // iframe 샌드박스에서는 Clipboard API가 막히는 경우가 많다 → execCommand 폴백
        try {
            const ta = document.createElement("textarea");
            ta.value = text;
            ta.style.position = "fixed";
            ta.style.opacity = "0";
            document.body.appendChild(ta);
            ta.select();
            const ok = document.execCommand("copy");
            ta.remove();
            return ok;
        } catch (e2) {
            return false;
        }
    }
}

// --- 상태 변수 ---
let isWindowVisible = false;
let isButtonVisible = true;
let isShortcutEnabled = false;      // Ctrl+Shift+Z+X로 메모장 열기/닫기 (기본 꺼짐, 켤 때 메인 화면 권한 요청)
let folders = [];
let activeFolderIndex = 0;
let activeTabIndex = 0;
let currentTheme = "NAVY";
let hasUnsavedChanges = false;
let pendingToasts = [];           // 창이 닫혀 있을 때 띄우려던 토스트 (열 때 한꺼번에 표시)
let pendingLegacyRestore = false;   // 저장소가 비어 있고 구버전 브라우저 백업이 있을 때

// --- 테마 정의 ---
const THEMES = {
    NAVY: {
        name: "Navy",
        buttonBackground: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
        vars: {
            "--rm-bg-main": "rgba(20, 20, 30, 0.95)",
            "--rm-bg-header": "rgba(102, 126, 234, 0.3)",
            "--rm-text-main": "#ffffff",
            "--rm-text-sub": "rgba(255,255,255,0.6)",
            "--rm-accent": "#667eea",
            "--rm-accent-text": "#a3bffa",
            "--rm-border": "rgba(255,255,255,0.1)",
            "--rm-btn-bg": "rgba(255,255,255,0.1)",
            "--rm-btn-hover": "rgba(255,255,255,0.2)",
            "--rm-folder-bg": "rgba(255,255,255,0.03)",
            "--rm-folder-active-bg": "rgba(102, 126, 234, 0.2)",
            "--rm-tab-bg": "rgba(255,255,255,0.05)",
            "--rm-tab-active-bg": "rgba(20, 20, 30, 0.95)",
            "--rm-scrollbar-thumb": "rgba(255,255,255,0.4)",
            "--rm-input-border": "rgba(255,255,255,0.1)",
            "--rm-menu-bg": "rgba(40, 40, 50, 0.98)",
            "--rm-menu-hover": "rgba(255,255,255,0.1)",
            "--rm-menu-highlight": "rgba(102, 126, 234, 0.4)",
            "--rm-btn-save-bg": "rgba(34, 197, 94, 0.3)",
            "--rm-btn-delete-bg": "rgba(239, 68, 68, 0.3)",
            "--rm-btn-copy-bg": "rgba(59, 130, 246, 0.3)",
            "--rm-btn-text": "white"
        }
    },
    IVORY: {
        name: "Ivory",
        buttonBackground: "linear-gradient(135deg, #d4a373 0%, #8b4513 100%)",
        vars: {
            "--rm-bg-main": "rgba(248, 246, 235, 0.98)",
            "--rm-bg-header": "rgba(210, 180, 140, 0.4)",
            "--rm-text-main": "#4a4a4a",
            "--rm-text-sub": "#4a4a4a",
            "--rm-accent": "#8b4513",
            "--rm-accent-text": "#8b4513",
            "--rm-border": "rgba(139, 69, 19, 0.15)",
            "--rm-btn-bg": "rgba(139, 69, 19, 0.1)",
            "--rm-btn-hover": "rgba(139, 69, 19, 0.2)",
            "--rm-folder-bg": "rgba(139, 69, 19, 0.05)",
            "--rm-folder-active-bg": "rgba(139, 69, 19, 0.15)",
            "--rm-tab-bg": "rgba(139, 69, 19, 0.05)",
            "--rm-tab-active-bg": "rgba(248, 246, 235, 0.98)",
            "--rm-scrollbar-thumb": "rgba(139, 69, 19, 0.4)",
            "--rm-input-border": "rgba(139, 69, 19, 0.2)",
            "--rm-menu-bg": "rgba(255, 253, 245, 0.98)",
            "--rm-menu-hover": "rgba(139, 69, 19, 0.1)",
            "--rm-menu-highlight": "rgba(139, 69, 19, 0.2)",
            "--rm-btn-save-bg": "rgba(34, 197, 94, 0.8)",
            "--rm-btn-delete-bg": "rgba(239, 68, 68, 0.8)",
            "--rm-btn-copy-bg": "rgba(59, 130, 246, 0.8)",
            "--rm-btn-text": "white"
        }
    }
};

// --- 드래그 상태 ---
let isWindowDragging = false;
let isResizing = false;
let isTabDragging = false;
let draggedTabInfo = {};
let isFolderDragging = false;
let draggedFolderInfo = {};
let dragStartX, dragStartY, dragStartTop, dragStartRight, resizeStartWidth, resizeStartHeight, resizeStartRight;
let lastDragPoint = null;
let savedLayout = { pos: null, size: null }; // 사용자가 정한 창 위치 {top, right} / 크기 {width, height}
let dragAnimationFrame = null;
let longPressTimer = null;
let hoveredFolderIndex = -1;

// --- 자동 스크롤 상태 ---
let autoScrollFrame = null;
let autoScrollSpeed = 0;
let autoScrollTarget = null;
const SCROLL_ZONE_SIZE = 60;
const MAX_SCROLL_SPEED = 12;

let saveDebounceTimer = null;
let stateDebounceTimer = null;

// ---------------------------------------------------------------
// 테마 & 스타일 (메모장 UI는 플러그인 iframe 내부 document에 만든다)
// ---------------------------------------------------------------
function applyThemeVars(themeName) {
    const theme = THEMES[themeName] || THEMES.NAVY;
    Object.entries(theme.vars).forEach(([key, value]) => document.documentElement.style.setProperty(key, value));
    if (floatEls) floatEls.btn.setStyle("background", theme.buttonBackground).catch(() => {});
}

function injectStyles() {
    if (document.getElementById(NOTEPAD_STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = NOTEPAD_STYLE_ID;
    style.textContent = `
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        /* 전체화면 iframe이 열려 있는 동안 뒤쪽 RisuAI는 조작할 수 없으므로 살짝 어둡게 표시한다. 바깥 클릭 시 닫힘. */
        html, body { background: rgba(0, 0, 0, 0.2); overflow: hidden; width: 100%; height: 100%; }
        body.tab-dragging-active, body.notepad-resizing { user-select: none; }
        body.notepad-resizing #${NOTEPAD_UI_ID} { box-shadow: none !important; transition: none !important; }
        #${NOTEPAD_UI_ID} {
            position: fixed;
            top: var(--rm-top, 120px); right: var(--rm-right, 20px);
            width: var(--rm-width, 450px); height: var(--rm-height, 600px);
            background: var(--rm-bg-main); border-radius: 12px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.5); z-index: 99999; display: flex; flex-direction: column;
            overflow: hidden; border: 1px solid var(--rm-border);
            font-family: 'Noto Sans KR', sans-serif; min-width: ${MIN_WIDTH}px; min-height: ${MIN_HEIGHT}px;
            color: var(--rm-text-main); transition: background 0.3s;
        }
        @media (max-width: 768px) {
            #${NOTEPAD_UI_ID} {
                top: 10px; right: 10px; left: 10px; bottom: 10px;
                width: auto; height: auto; min-width: unset; min-height: unset;
            }
            .notepad-resize-handle { display: none; }
            .notepad-header { cursor: default; }
        }
        #${NOTEPAD_UI_ID}.hidden { display: none !important; }
        .notepad-header {
            background: var(--rm-bg-header); padding: 10px 16px; display: flex;
            align-items: center; justify-content: space-between; cursor: move; user-select: none;
            position: relative; flex-shrink: 0; transition: background 0.3s;
        }
        .notepad-header-title { color: var(--rm-text-main); font-weight: bold; flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .notepad-header-buttons { display: flex; gap: 8px; }
        .notepad-header-btn {
            width: 28px; height: 28px; border: none; border-radius: 6px; background: var(--rm-btn-bg);
            color: var(--rm-text-main); cursor: pointer; display: flex; align-items: center; justify-content: center; flex-shrink: 0; transition: background 0.2s;
        }
        .notepad-header-btn:hover { background: var(--rm-btn-hover); }
        #notepad-folder-settings-btn { width: auto !important; padding: 0 8px !important; font-size: 13px !important; gap: 4px; }
        .notepad-folders-container {
            display: flex; align-items: center; background: rgba(0,0,0,0.4);
            padding: 4px 4px 0 4px; border-bottom: 1px solid var(--rm-border);
            overflow-x: auto; scrollbar-width: none; flex-shrink: 0;
        }
        .notepad-folders-container::-webkit-scrollbar { display: none; }
        .notepad-folder-item {
            background: var(--rm-folder-bg); color: var(--rm-text-sub); padding: 6px 12px;
            border-radius: 6px 6px 0 0; cursor: pointer; font-size: 13px; white-space: nowrap;
            margin-right: 2px; transition: all 0.2s; border: 1px solid transparent; border-bottom: none;
            display: flex; align-items: center; gap: 6px; user-select: none; font-weight: bold;
        }
        .notepad-folder-item:hover { background: var(--rm-btn-hover); }
        .notepad-folder-item.active { background: var(--rm-folder-active-bg); color: var(--rm-accent-text); font-weight: bold; border-color: var(--rm-border); }
        .notepad-folder-item.drag-hover { background: rgba(34, 197, 94, 0.4) !important; color: white !important; border-color: #22c55e !important; transform: scale(1.05); z-index: 10; }
        .notepad-folder-item.dragging { opacity: 0.5; background: var(--rm-bg-header); }
        .notepad-new-folder-btn {
            width: 24px; height: 24px; border: none; background: transparent; color: var(--rm-text-sub);
            cursor: pointer; font-size: 16px; display: flex; align-items: center; justify-content: center;
            border-radius: 4px; margin-left: 4px; flex-shrink: 0;
        }
        .notepad-new-folder-btn:hover { background: var(--rm-btn-hover); color: var(--rm-text-main); }
        .notepad-tabs-container {
            display: flex; align-items: center; background: rgba(0,0,0,0.2);
            padding: 6px 0 0 0; border-bottom: 1px solid var(--rm-border); position: relative; flex-shrink: 0;
        }
        .notepad-tabs-list { flex: 1; display: flex; overflow-x: auto; scrollbar-width: none; cursor: grab; padding: 0 6px; }
        .notepad-tabs-list::-webkit-scrollbar { display: none; }
        .notepad-tab-item {
            background: var(--rm-tab-bg); color: var(--rm-text-sub); padding: 8px 14px;
            border-radius: 6px 6px 0 0; cursor: pointer; font-size: 14px; white-space: nowrap; max-width: 150px;
            overflow: hidden; text-overflow: ellipsis; margin-right: 2px; flex-shrink: 0;
            transition: all 0.2s; border-bottom: 2px solid transparent; user-select: none; font-weight: bold;
        }
        .notepad-tab-item.dragging { opacity: 0.5; background: var(--rm-bg-header); }
        .notepad-tab-item.active { background: var(--rm-tab-active-bg); color: var(--rm-text-main); font-weight: 500; border-bottom: 2px solid var(--rm-accent); margin-bottom: -1px; z-index: 1; }
        .notepad-new-tab-btn {
            width: 28px; height: 28px; border: none; border-radius: 6px; background: var(--rm-btn-bg);
            color: var(--rm-text-main); cursor: pointer; font-size: 20px; margin: 0 6px 4px 6px; flex-shrink: 0;
            display: flex; align-items: center; justify-content: center;
        }
        .notepad-tab-dropdown-menu, .notepad-context-menu, .notepad-folder-settings-menu, .notepad-backup-menu, .notepad-theme-menu {
            position: absolute; z-index: 100002;
            background: var(--rm-menu-bg);
            border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.4);
            border: 1px solid var(--rm-border); padding: 4px; min-width: 120px;
        }
        .notepad-tab-dropdown-menu { max-height: 300px; overflow-y: auto; scrollbar-width: thin; scrollbar-color: var(--rm-scrollbar-thumb) transparent; }
        .notepad-tab-dropdown-menu::-webkit-scrollbar { width: 4px; }
        .notepad-tab-dropdown-menu::-webkit-scrollbar-track { background: transparent; }
        .notepad-tab-dropdown-menu::-webkit-scrollbar-thumb { background: var(--rm-scrollbar-thumb); border-radius: 4px; }
        .notepad-folder-settings-menu { top: 45px; right: 45px; }
        .notepad-backup-menu { top: 45px; right: 75px; }
        .notepad-theme-menu { top: 45px; right: 105px; }
        .notepad-tab-dropdown-menu ul, .notepad-context-menu ul, .notepad-folder-settings-menu ul, .notepad-backup-menu ul, .notepad-theme-menu ul { list-style: none; padding: 0; margin: 0; }
        .notepad-tab-dropdown-item, .notepad-context-menu-item, .notepad-folder-settings-item, .notepad-backup-item, .notepad-theme-item {
            padding: 8px 12px; border-radius: 4px; color: var(--rm-text-sub);
            cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: block;
        }
        .notepad-tab-dropdown-item:hover, .notepad-context-menu-item:hover, .notepad-folder-settings-item:hover, .notepad-backup-item:hover, .notepad-theme-item:hover { background: var(--rm-menu-hover); }
        .notepad-tab-dropdown-item.active, .notepad-theme-item.active { background: var(--rm-menu-highlight); font-weight: bold; color: var(--rm-text-main); }
        .notepad-menu-divider { border-top: 1px solid var(--rm-border); margin-top: 4px; padding-top: 8px; }
        .notepad-editor-area { flex: 1; display: flex; flex-direction: column; padding: 16px; gap: 12px; min-height: 0; }
        .notepad-title-input { background: transparent; border: none; border-bottom: 1px solid var(--rm-input-border); padding: 10px 4px; color: var(--rm-text-main); font-size: 20px; font-weight: bold; outline: none; flex-shrink: 0; width: 100%; font-family: inherit; }
        .notepad-content-textarea { flex: 1; background: transparent; border: none; padding: 4px; padding-right: 8px; color: var(--rm-text-main); font-size: 15px; font-family: inherit; resize: none; outline: none; line-height: 1.7; scrollbar-width: thin; scrollbar-color: var(--rm-scrollbar-thumb) transparent; }
        .notepad-content-textarea::-webkit-scrollbar { width: 4px; }
        .notepad-content-textarea::-webkit-scrollbar-track { background: transparent; }
        .notepad-content-textarea::-webkit-scrollbar-thumb { background: var(--rm-scrollbar-thumb); border-radius: 4px; }
        .notepad-search-bar { display: none; flex-direction: column; gap: 8px; padding: 8px 16px; background: var(--rm-bg-header); border-top: 1px solid var(--rm-border); flex-shrink: 0; }
        .notepad-search-bar.visible { display: flex; }
        .notepad-search-row { display: flex; gap: 8px; align-items: center; }
        .notepad-search-input { flex: 1; background: rgba(0,0,0,0.2); border: 1px solid var(--rm-border); color: var(--rm-text-main); padding: 4px 8px; border-radius: 4px; outline: none; font-size: 13px; }
        .notepad-search-input:focus { border-color: var(--rm-accent); }
        .notepad-search-btn { background: var(--rm-btn-bg); border: 1px solid var(--rm-border); color: var(--rm-text-main); padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 12px; white-space: nowrap; }
        .notepad-search-btn:hover { background: var(--rm-btn-hover); }
        .notepad-footer { padding: 10px 16px; border-top: 1px solid var(--rm-border); display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 8px; flex-shrink: 0; }
        .notepad-footer-left, .notepad-footer-right { display: flex; gap: 8px; }
        .notepad-footer button { border: none; border-radius: 6px; color: var(--rm-btn-text); padding: 8px 12px; cursor: pointer; white-space: nowrap; font-weight: 500; }
        .notepad-footer .notepad-header-btn { color: var(--rm-text-main); padding: 0; }
        .notepad-save-btn { background: var(--rm-btn-save-bg); padding: 8px 16px !important; }
        .notepad-save-btn.saved { background: rgba(100, 100, 100, 0.3); color: rgba(255,255,255,0.5); cursor: default; }
        .notepad-delete-btn { background: var(--rm-btn-delete-bg); }
        .notepad-copy-btn { background: var(--rm-btn-copy-bg); }
        .notepad-copy-btn:hover { filter: brightness(1.1); }
        .notepad-resize-handle { position: absolute; bottom: 0; right: 0; width: 20px; height: 20px; cursor: nwse-resize; z-index: 1; }
        .notepad-resize-handle::after {
            content: ''; position: absolute; right: 4px; bottom: 4px; width: 10px; height: 10px;
            background-image: url("data:image/svg+xml,%3Csvg width='10' height='10' viewBox='0 0 10 10' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='8.5' cy='1.5' r='1.5' fill='rgba(255,255,255,0.4)'/%3E%3Ccircle cx='5' cy='5' r='1.5' fill='rgba(255,255,255,0.4)'/%3E%3Ccircle cx='1.5' cy='8.5' r='1.5' fill='rgba(255,255,255,0.4)'/%3E%3Ccircle cx='8.5' cy='5' r='1.5' fill='rgba(255,255,255,0.4)'/%3E%3Ccircle cx='5' cy='8.5' r='1.5' fill='rgba(255,255,255,0.4)'/%3E%3C/svg%3E%0A");
        }
        .notepad-editor-area.empty { justify-content: center; align-items: center; color: var(--rm-text-sub); text-align: center; }
        .notepad-toast { position: fixed; top: 20px; left: 50%; transform: translateX(-50%); background: var(--rm-accent); color: white; padding: 12px 24px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.3); z-index: 100010; animation: slideDown 0.3s ease; max-width: calc(100vw - 32px); text-align: center; white-space: pre-line; }
        @keyframes slideDown { from { opacity: 0; transform: translateX(-50%) translateY(-20px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }
        .notepad-modal-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: transparent; z-index: 100005; display: flex; align-items: center; justify-content: center; }
        .notepad-modal-content { background: var(--rm-bg-main); padding: 24px; border-radius: 12px; text-align: center; box-shadow: 0 10px 40px rgba(0,0,0,0.6); max-width: 350px; width: 90%; border: 1px solid var(--rm-border); color: var(--rm-text-main); }
        .notepad-modal-message { color: var(--rm-text-main); margin-bottom: 20px; line-height: 1.6; white-space: pre-wrap; font-weight: 500; }
        .notepad-modal-input { width: 100%; padding: 8px 12px; border-radius: 6px; border: 1px solid var(--rm-border); background: var(--rm-btn-bg); color: var(--rm-text-main); font-size: 14px; outline: none; margin-bottom: 16px; }
        .notepad-modal-buttons { display: flex; justify-content: center; gap: 12px; }
        .notepad-modal-button { padding: 10px 20px; border-radius: 6px; border: none; cursor: pointer; font-weight: bold; transition: opacity 0.2s; }
        .notepad-modal-button:hover { opacity: 0.8; }
        .notepad-modal-confirm-btn { background: #d9534f; color: white; }
        .notepad-modal-cancel-btn { background: var(--rm-btn-bg); color: var(--rm-text-main); }
    `;
    document.head.appendChild(style);
}

// ---------------------------------------------------------------
// 데이터 저장/불러오기
// ---------------------------------------------------------------
async function loadNotes() {
    let loaded = null;
    let migratedFromArg = null;
    try {
        loaded = parseFolders(await ps.getItem(DATA_KEY));
    } catch (e) {
        console.error(`${PLUGIN_NAME} 데이터 로드 실패:`, e);
    }

    // 새 저장소가 비어 있으면 v3.x가 플러그인 인수에 남긴 데이터를 옮겨 온다
    if (!loaded) {
        for (const key of LEGACY_ARG_KEYS) {
            let raw = null;
            try { raw = await risuai.getArgument(key); } catch (e) {}
            const parsed = parseFolders(raw);
            if (parsed && parsed.length) { loaded = parsed; migratedFromArg = key; break; }
        }
    }

    folders = loaded && loaded.length ? loaded : defaultFolders();

    if (migratedFromArg) {
        await saveNotes();
        // 설정 화면에 긴 JSON이 남지 않도록 옮긴 인수는 비운다
        try { await risuai.setArgument(migratedFromArg, ""); } catch (e) {}
        queueToast("📦 이전 버전 메모를 새 저장소로 옮겼습니다.");
    } else if (!loaded) {
        // 저장된 데이터가 전혀 없으면 구버전 '브라우저 백업'이 있는지 확인 → 창을 열 때 복원 제안
        const backup = parseFolders(await lsGet(BROWSER_BACKUP_KEY));
        if (backup && countNotes(backup) > 0) pendingLegacyRestore = true;
    }
}

async function saveNotes(showToastMsg = false) {
    try {
        await ps.setItem(DATA_KEY, JSON.stringify(folders));
        if (showToastMsg) showToast("✓ 저장되었습니다.");
    } catch (e) {
        console.error(`${PLUGIN_NAME} 저장 실패:`, e);
        showToast("⚠️ 저장에 실패했습니다.");
    }
}

function debouncedSave() {
    if (saveDebounceTimer) clearTimeout(saveDebounceTimer);
    saveDebounceTimer = setTimeout(async () => { saveDebounceTimer = null; await saveNotes(false); }, 300);
}

function saveActiveState() {
    if (stateDebounceTimer) clearTimeout(stateDebounceTimer);
    stateDebounceTimer = setTimeout(async () => {
        stateDebounceTimer = null;
        await lsSet(ACTIVE_FOLDER_INDEX_KEY, activeFolderIndex);
        await lsSet(ACTIVE_NOTE_INDEX_KEY, activeTabIndex);
    }, 100);
}

// 편집기의 미저장 내용을 현재 메모 객체에 반영한다 (저장은 호출한 쪽에서).
// 탭 이동·삭제·폴더 이동처럼 화면을 다시 그리는 작업 전에 불러서 편집 내용을 잃지 않게 한다.
function commitEditorToNote() {
    if (!hasUnsavedChanges) return false;
    const note = folders[activeFolderIndex]?.notes[activeTabIndex];
    if (!note) return false;
    const titleInput = document.getElementById("notepad-title-input");
    const contentTextarea = document.getElementById("notepad-content-textarea");
    if (titleInput) note.title = titleInput.value;
    if (contentTextarea) note.content = contentTextarea.value;
    hasUnsavedChanges = false;
    return true;
}

// ---------------------------------------------------------------
// 토스트 & 모달
// ---------------------------------------------------------------
function showToast(message) {
    // 창이 닫혀 있으면 iframe이 숨겨져 보이지 않으므로 다음에 열 때 표시한다
    if (!isWindowVisible) { queueToast(message); return; }
    document.querySelector(".notepad-toast")?.remove();
    const toast = document.createElement("div");
    toast.className = "notepad-toast";
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2000);
}
function queueToast(message) {
    if (!pendingToasts.includes(message)) pendingToasts.push(message);
}

function showConfirmationModal(message) {
    return new Promise((resolve) => {
        const overlay = document.createElement("div");
        overlay.className = "notepad-modal-overlay";
        overlay.innerHTML = `<div class="notepad-modal-content"><p class="notepad-modal-message">${escapeHtml(message)}</p><div class="notepad-modal-buttons"><button class="notepad-modal-button notepad-modal-cancel-btn">취소</button><button class="notepad-modal-button notepad-modal-confirm-btn">확인</button></div></div>`;
        const close = (result) => { overlay.remove(); resolve(result); };
        overlay.querySelector(".notepad-modal-confirm-btn").onclick = () => close(true);
        overlay.querySelector(".notepad-modal-cancel-btn").onclick = () => close(false);
        document.body.appendChild(overlay);
    });
}

function showInputModal(message, defaultValue) {
    return new Promise((resolve) => {
        const overlay = document.createElement("div");
        overlay.className = "notepad-modal-overlay";
        overlay.innerHTML = `<div class="notepad-modal-content">
            <p class="notepad-modal-message">${escapeHtml(message)}</p>
            <input class="notepad-modal-input" type="text" />
            <div class="notepad-modal-buttons">
                <button class="notepad-modal-button notepad-modal-cancel-btn">취소</button>
                <button class="notepad-modal-button notepad-modal-confirm-btn">확인</button>
            </div>
        </div>`;
        const input = overlay.querySelector(".notepad-modal-input");
        input.value = defaultValue || "";
        const close = (result) => { overlay.remove(); resolve(result); };
        const confirm = () => close(input.value.trim() || null);
        overlay.querySelector(".notepad-modal-confirm-btn").onclick = confirm;
        overlay.querySelector(".notepad-modal-cancel-btn").onclick = () => close(null);
        input.addEventListener("keydown", (e) => { if (e.key === "Enter") confirm(); });
        document.body.appendChild(overlay);
        setTimeout(() => { input.focus(); input.select(); }, 50);
    });
}

// ---------------------------------------------------------------
// 메모장 창
// ---------------------------------------------------------------
function setWindowVars(el, { top, right, width, height }) {
    if (top !== undefined) el.style.setProperty("--rm-top", `${top}px`);
    if (right !== undefined) el.style.setProperty("--rm-right", `${right}px`);
    if (width !== undefined) el.style.setProperty("--rm-width", `${width}px`);
    if (height !== undefined) el.style.setProperty("--rm-height", `${height}px`);
}

// 헤더가 화면 안에 최소 HEADER_GRAB만큼 남도록 위치를 제한한다
function clampedWindowPosition(rect) {
    return {
        top: clamp(rect.top, 0, window.innerHeight - HEADER_GRAB),
        right: clamp(window.innerWidth - rect.right, -(rect.width - HEADER_GRAB), window.innerWidth - HEADER_GRAB)
    };
}

async function createNotepadUI() {
    if (document.getElementById(NOTEPAD_UI_ID)) return;
    const container = document.createElement("div");
    container.id = NOTEPAD_UI_ID;
    container.classList.add("hidden");

    // 위치/크기는 CSS 변수로 적용한다. 모바일에서는 미디어 쿼리가 무시하게 해서 저장값과 충돌하지 않는다.
    const pos = await lsGetJSON(POSITION_KEY, null);
    if (pos && Number.isFinite(pos.top) && Number.isFinite(pos.right)) savedLayout.pos = { top: pos.top, right: pos.right };
    const size = await lsGetJSON(SIZE_KEY, null);
    if (size && Number.isFinite(size.width) && Number.isFinite(size.height)) {
        savedLayout.size = { width: Math.max(MIN_WIDTH, size.width), height: Math.max(MIN_HEIGHT, size.height) };
    }

    container.innerHTML = `
        <div class="notepad-header">
            <span class="notepad-header-title">📝 메모장</span>
            <div class="notepad-header-buttons">
                <button class="notepad-header-btn" id="notepad-header-dropdown-btn" title="전체 메모 목록">▾</button>
                <button class="notepad-header-btn" id="notepad-theme-btn" title="테마 및 화면 설정">🎨</button>
                <button class="notepad-header-btn" id="notepad-backup-btn" title="백업 및 복원">💾</button>
                <button class="notepad-header-btn" id="notepad-folder-settings-btn" title="현재 폴더 설정">⚙️ 폴더 관리</button>
                <button class="notepad-header-btn" id="notepad-close-btn" title="닫기 (Esc)">✕</button>
            </div>
        </div>
        <div class="notepad-folders-container" id="notepad-folders-container"></div>
        <div class="notepad-tabs-container">
            <div class="notepad-tabs-list" id="notepad-tabs-list"></div>
            <button class="notepad-new-tab-btn" id="notepad-new-tab-btn" title="새 메모">+</button>
        </div>
        <div class="notepad-editor-area" id="notepad-editor-area"></div>
        <div class="notepad-search-bar" id="notepad-search-bar">
            <div class="notepad-search-row">
                <input type="text" class="notepad-search-input" id="notepad-find-input" placeholder="찾을 내용 (Enter: 다음 찾기)">
                <button class="notepad-search-btn" id="notepad-find-next-btn">▼ 다음 찾기</button>
            </div>
            <div class="notepad-search-row">
                <input type="text" class="notepad-search-input" id="notepad-replace-input" placeholder="바꿀 내용">
                <button class="notepad-search-btn" id="notepad-replace-btn">바꾸기</button>
                <button class="notepad-search-btn" id="notepad-replace-all-btn">모두 바꾸기</button>
            </div>
        </div>
        <div class="notepad-footer" id="notepad-footer"></div>
        <div class="notepad-resize-handle"></div>`;
    document.body.appendChild(container);
    applyWindowLayout();

    setupEventListeners();
    renderTabsAndContent(true);
}

// 창의 위치/크기 = 사용자가 정한 값(savedLayout)을 현재 화면에 맞춘 결과.
// ※ 보정 결과를 savedLayout에 덮어쓰지 않는다. 샌드박스 iframe은 별도 프로세스에서 돌 수 있어서
//   표시 직후에는 화면 크기가 이전 값/기본값으로 잘못 읽힐 수 있다. 그 값으로 보정한 위치가 굳지 않도록
//   화면 크기가 바뀔 때마다(resize) 원래 값에서 다시 계산한다.
function applyWindowLayout() {
    const el = document.getElementById(NOTEPAD_UI_ID);
    if (!el || isWindowDragging || isResizing) return;
    ["--rm-top", "--rm-right", "--rm-width", "--rm-height"].forEach(v => el.style.removeProperty(v));
    if (savedLayout.pos) setWindowVars(el, savedLayout.pos);
    if (savedLayout.size) setWindowVars(el, savedLayout.size);
    if (!isWindowVisible || window.innerWidth === 0 || window.innerHeight === 0 || isMobileLayout()) return;

    // 창 전체가 화면 안에 들어오게 맞춘다 (다른 크기의 화면에서 저장된 위치/크기일 수 있음)
    let rect = el.getBoundingClientRect();
    const maxWidth = Math.max(MIN_WIDTH, window.innerWidth - 20), maxHeight = Math.max(MIN_HEIGHT, window.innerHeight - 20);
    if (rect.width > maxWidth || rect.height > maxHeight) {
        setWindowVars(el, { width: Math.min(rect.width, maxWidth), height: Math.min(rect.height, maxHeight) });
        rect = el.getBoundingClientRect();
    }
    setWindowVars(el, {
        top: clamp(rect.top, 0, window.innerHeight - rect.height),
        right: clamp(window.innerWidth - rect.right, 0, window.innerWidth - rect.width)
    });
}

// Chrome 계열에서 한 번 숨겼다(display:none) 다시 표시한 플러그인 iframe은 렌더링이 멈춘 채로 남아
// 창이 안 보이고 배경만 어두운 경우가 있다. iframe 안에서 무엇을 바꿔도 다시 그려지지 않고,
// iframe 크기가 실제로 바뀌어야 렌더링이 재개된다.
// 그래서 메인 화면에서 이 플러그인의 iframe을 찾아 높이를 1px 줄였다 되돌린다 (메인 화면 권한 필요).
let ownIframe = null;
async function findOwnIframe() {
    // 전체화면으로 표시 중인 플러그인 iframe: showContainer('fullscreen')이 인라인으로 지정하는 스타일로 찾는다
    const frames = await risuai.unwarpSafeArray(await rootDoc.querySelectorAll("iframe"));
    for (const f of frames) {
        if (await f.getStyle("display") === "block" && await f.getStyle("position") === "fixed" && await f.getStyle("zIndex") === "1000") return f;
    }
    return null;
}

async function wakeOwnIframe() {
    if (!rootDoc) return;
    try {
        if (!ownIframe || await ownIframe.getStyle("display") !== "block") ownIframe = await findOwnIframe();
        if (!ownIframe) return;
        await ownIframe.setStyle("height", "calc(100% - 1px)");
        await new Promise(r => setTimeout(r, 100));
        await ownIframe.setStyle("height", "100%");
    } catch (e) {
        ownIframe = null;
        console.error(`${PLUGIN_NAME} iframe 다시 그리기 실패:`, e);
    }
}

// resize 이벤트가 늦거나 오지 않는 환경 대비: 연 직후 2초 동안 화면 크기가 바뀌는지 확인해 다시 계산한다
function watchViewportAfterOpen() {
    let last = `${window.innerWidth}x${window.innerHeight}`, ticks = 0;
    const timer = setInterval(() => {
        const now = `${window.innerWidth}x${window.innerHeight}`;
        if (now !== last) { last = now; applyWindowLayout(); }
        if (++ticks >= 20 || !isWindowVisible) clearInterval(timer);
    }, 100);
}

async function openNotepadWindow() {
    if (isWindowVisible) return;
    // 메인 화면 권한은 iframe을 띄우기 전에 요청한다. 띄운 뒤에 요청하면 RisuAI의 확인 창이 iframe에 가려질 수 있다.
    // (거부하면 같은 세션에서는 다시 묻지 않고 바로 null이 돌아온다)
    await ensureRootDocument();
    isWindowVisible = true;
    document.getElementById(NOTEPAD_UI_ID)?.classList.remove("hidden");
    await risuai.showContainer("fullscreen");
    wakeOwnIframe();
    // 이후 화면 크기가 실제 값으로 바뀌면 resize 이벤트에서 다시 계산된다
    applyWindowLayout();
    watchViewportAfterOpen();
    setTimeout(focusActiveTab, 50);
    if (pendingToasts.length) showToast(pendingToasts.splice(0).join("\n"));
    if (pendingLegacyRestore) { pendingLegacyRestore = false; await offerLegacyBackupRestore(); }
}

async function closeNotepadWindow() {
    if (!isWindowVisible) return;
    if (hasUnsavedChanges) {
        const confirmed = await showConfirmationModal("저장하지 않은 변경사항이 있습니다.\n그래도 닫으시겠습니까?");
        if (!confirmed) return;
        hasUnsavedChanges = false;
        loadNoteContent(activeTabIndex); // 편집기를 저장된 내용으로 되돌린다
    }
    closeAllMenus();
    isWindowVisible = false;
    document.getElementById(NOTEPAD_UI_ID)?.classList.add("hidden");
    await risuai.hideContainer();
}

function toggleNotepadWindow() {
    return isWindowVisible ? closeNotepadWindow() : openNotepadWindow();
}

function isBackdropTarget(target) {
    return target === document.body || target === document.documentElement;
}

function setupEventListeners() {
    window.addEventListener("mouseup", globalMouseUp);
    window.addEventListener("touchend", globalMouseUp);
    window.addEventListener("mousemove", globalMouseMove);
    window.addEventListener("touchmove", globalMouseMove, { passive: false });
    window.addEventListener("resize", () => { if (isWindowVisible) applyWindowLayout(); });
    window.addEventListener("blur", () => {
        if (isTabDragging) stopTabDrag();
        if (isFolderDragging) stopFolderDrag();
        if (isWindowDragging || isResizing) stopDrag();
        keysPressed.clear();
    });

    const container = document.getElementById(NOTEPAD_UI_ID);
    const header = container.querySelector(".notepad-header");
    header.addEventListener("mousedown", startWindowDrag);
    header.addEventListener("touchstart", startWindowDrag, { passive: true });
    container.querySelector(".notepad-resize-handle").addEventListener("mousedown", startResize);
    document.getElementById("notepad-close-btn").addEventListener("click", closeNotepadWindow);
    document.getElementById("notepad-new-tab-btn").addEventListener("click", createNewNote);
    document.getElementById("notepad-header-dropdown-btn").addEventListener("click", toggleTabDropdown);
    document.getElementById("notepad-folder-settings-btn").addEventListener("click", toggleFolderSettings);
    document.getElementById("notepad-backup-btn").addEventListener("click", toggleBackupMenu);
    document.getElementById("notepad-theme-btn").addEventListener("click", toggleThemeMenu);
    document.getElementById("notepad-find-next-btn").addEventListener("click", findNextText);
    document.getElementById("notepad-replace-btn").addEventListener("click", replaceCurrentText);
    document.getElementById("notepad-replace-all-btn").addEventListener("click", replaceAllText);
    document.getElementById("notepad-find-input").addEventListener("keydown", (e) => { if (e.key === "Enter") findNextText(); });
    // 휠 → 가로 스크롤 (요소가 다시 만들어지지 않으므로 한 번만 등록)
    setupHorizontalWheel(document.getElementById("notepad-folders-container"));
    setupHorizontalWheel(document.getElementById("notepad-tabs-list"));

    // 바깥(어두운 배경) 클릭 시 닫기. 헤더를 끌다가 배경에서 놓은 경우는 제외한다.
    let backdropPressed = false;
    document.addEventListener("mousedown", (e) => { backdropPressed = isBackdropTarget(e.target); });
    document.addEventListener("click", (e) => {
        const onMenu = e.target.closest(".notepad-context-menu, .notepad-folder-settings-menu, #notepad-folder-settings-btn, .notepad-backup-menu, #notepad-backup-btn, .notepad-theme-menu, #notepad-theme-btn, #notepad-tab-dropdown-menu, #notepad-header-dropdown-btn");
        const hadMenu = !onMenu && closeAllMenus();
        if (backdropPressed && isBackdropTarget(e.target) && !hadMenu && !document.querySelector(".notepad-modal-overlay")) {
            closeNotepadWindow();
        }
        backdropPressed = false;
    });
}

function setupHorizontalWheel(el) {
    el.addEventListener("wheel", (e) => {
        if (e.deltaX === 0 && e.deltaY !== 0) { e.preventDefault(); el.scrollLeft += e.deltaY; }
    }, { passive: false });
}

// 열린 메뉴를 모두 닫고, 닫은 것이 있었는지 반환
function closeAllMenus() {
    const menus = document.querySelectorAll(".notepad-context-menu, .notepad-folder-settings-menu, .notepad-backup-menu, .notepad-theme-menu, #notepad-tab-dropdown-menu");
    menus.forEach(m => m.remove());
    return menus.length > 0;
}

// --- 글로벌 이벤트 핸들러 ---
function globalMouseMove(e) {
    if (draggedTabInfo.element && !isTabDragging) {
        const p = pointOf(e);
        if (Math.abs(p.x - draggedTabInfo.startX) > 5 || Math.abs(p.y - draggedTabInfo.startY) > 5) {
            draggedTabInfo.isClick = false; clearTimeout(longPressTimer);
            if (!e.touches) { isTabDragging = true; draggedTabInfo.element.classList.add("dragging"); document.body.classList.add("tab-dragging-active"); }
        }
    }
    if (draggedFolderInfo.element && !isFolderDragging) {
        const p = pointOf(e);
        if (Math.abs(p.x - draggedFolderInfo.startX) > 5 || Math.abs(p.y - draggedFolderInfo.startY) > 5) {
            draggedFolderInfo.isClick = false; clearTimeout(longPressTimer);
            if (!e.touches) { isFolderDragging = true; draggedFolderInfo.element.classList.add("dragging"); document.body.classList.add("tab-dragging-active"); }
        }
    }
    if (isWindowDragging || isResizing) drag(e);
    else if (isTabDragging) dragTab(e);
    else if (isFolderDragging) dragFolder(e);
}

function globalMouseUp() {
    if (isWindowDragging || isResizing) stopDrag();
    clearTimeout(longPressTimer);
    if (isTabDragging) { stopTabDrag(); }
    else if (draggedTabInfo.element && draggedTabInfo.isClick) { switchTab(draggedTabInfo.startIndex); draggedTabInfo = {}; }
    else if (isFolderDragging) { stopFolderDrag(); }
    else { draggedTabInfo = {}; draggedFolderInfo = {}; }
    if (!isTabDragging && hoveredFolderIndex !== -1) {
        document.querySelectorAll(".notepad-folder-item").forEach(el => el.classList.remove("drag-hover"));
        hoveredFolderIndex = -1;
    }
}

// --- 창 이동 & 크기 조절 ---
function startWindowDrag(e) {
    if (e.target.closest(".notepad-header-btn") || isMobileLayout()) return;
    const rect = document.getElementById(NOTEPAD_UI_ID).getBoundingClientRect();
    const p = pointOf(e);
    isWindowDragging = true;
    dragStartX = p.x; dragStartY = p.y;
    dragStartTop = rect.top; dragStartRight = window.innerWidth - rect.right;
    lastDragPoint = p;
}

function startResize(e) {
    e.stopPropagation();
    const rect = document.getElementById(NOTEPAD_UI_ID).getBoundingClientRect();
    isResizing = true;
    document.body.classList.add("notepad-resizing");
    dragStartX = e.clientX; dragStartY = e.clientY;
    resizeStartWidth = rect.width; resizeStartHeight = rect.height; resizeStartRight = window.innerWidth - rect.right;
    lastDragPoint = { x: e.clientX, y: e.clientY };
}

function applyDragFrame() {
    dragAnimationFrame = null;
    if (!lastDragPoint) return;
    const el = document.getElementById(NOTEPAD_UI_ID);
    const deltaX = lastDragPoint.x - dragStartX, deltaY = lastDragPoint.y - dragStartY;
    if (isWindowDragging) {
        setWindowVars(el, {
            top: clamp(dragStartTop + deltaY, 0, window.innerHeight - HEADER_GRAB),
            right: clamp(dragStartRight - deltaX, -(el.offsetWidth - HEADER_GRAB), window.innerWidth - HEADER_GRAB)
        });
    } else if (isResizing) {
        const width = Math.max(MIN_WIDTH, resizeStartWidth + deltaX);
        const height = Math.max(MIN_HEIGHT, resizeStartHeight + deltaY);
        setWindowVars(el, { width, height, right: resizeStartRight - (width - resizeStartWidth) });
    }
}

function drag(e) {
    if (isWindowDragging && e.cancelable) e.preventDefault();
    lastDragPoint = pointOf(e); // 프레임마다 가장 최근 위치를 반영
    if (!dragAnimationFrame) dragAnimationFrame = requestAnimationFrame(applyDragFrame);
}

async function stopDrag() {
    if (dragAnimationFrame) { cancelAnimationFrame(dragAnimationFrame); applyDragFrame(); }
    const wasActive = isWindowDragging || isResizing;
    isWindowDragging = false; isResizing = false; lastDragPoint = null;
    document.body.classList.remove("notepad-resizing");
    if (!wasActive) return;
    const el = document.getElementById(NOTEPAD_UI_ID);
    const rect = el.getBoundingClientRect();
    savedLayout.pos = clampedWindowPosition(rect);
    savedLayout.size = { width: rect.width, height: rect.height };
    setWindowVars(el, savedLayout.pos);
    await lsSet(POSITION_KEY, JSON.stringify(savedLayout.pos));
    await lsSet(SIZE_KEY, JSON.stringify(savedLayout.size));
}

// --- 자동 스크롤 ---
function handleAutoScroll() {
    if (autoScrollSpeed !== 0 && autoScrollTarget) {
        autoScrollTarget.scrollLeft += autoScrollSpeed;
        autoScrollFrame = requestAnimationFrame(handleAutoScroll);
    } else if (autoScrollFrame) {
        cancelAnimationFrame(autoScrollFrame); autoScrollFrame = null;
    }
}
function updateAutoScroll(target, clientX) {
    const rect = target.getBoundingClientRect(), relativeX = clientX - rect.left;
    autoScrollTarget = target;
    if (relativeX < SCROLL_ZONE_SIZE) autoScrollSpeed = -MAX_SCROLL_SPEED * Math.pow(1 - Math.max(0, relativeX) / SCROLL_ZONE_SIZE, 2);
    else if (relativeX > rect.width - SCROLL_ZONE_SIZE) autoScrollSpeed = MAX_SCROLL_SPEED * Math.pow(1 - Math.max(0, rect.width - relativeX) / SCROLL_ZONE_SIZE, 2);
    else autoScrollSpeed = 0;
    if (autoScrollSpeed !== 0 && !autoScrollFrame) handleAutoScroll();
}
function stopAutoScroll() {
    autoScrollSpeed = 0;
    if (autoScrollFrame) { cancelAnimationFrame(autoScrollFrame); autoScrollFrame = null; }
}

// --- 탭 드래그 ---
function handleTabPressStart(e) {
    const tabEl = e.currentTarget;
    if ((e.type === "mousedown" && e.button !== 0) || isTabDragging || isFolderDragging) return;
    const p = pointOf(e);
    draggedTabInfo = { element: tabEl, startIndex: parseInt(tabEl.dataset.index), isClick: true, startX: p.x, startY: p.y };
    if (e.type === "touchstart") {
        longPressTimer = setTimeout(() => {
            if (draggedTabInfo.element) {
                draggedTabInfo.isClick = false; isTabDragging = true;
                draggedTabInfo.element.classList.add("dragging"); document.body.classList.add("tab-dragging-active");
                if (navigator.vibrate) navigator.vibrate(50);
            }
        }, 500);
    }
}

function dragTab(e) {
    if (!isTabDragging) return;
    e.preventDefault();
    const p = pointOf(e);
    const tabsList = document.getElementById("notepad-tabs-list");

    let targetFolderIndex = -1;
    document.querySelectorAll(".notepad-folder-item").forEach(item => {
        const rect = item.getBoundingClientRect();
        if (p.x >= rect.left && p.x <= rect.right && p.y >= rect.top && p.y <= rect.bottom) targetFolderIndex = parseInt(item.dataset.index);
        item.classList.remove("drag-hover");
    });
    if (targetFolderIndex !== -1 && targetFolderIndex !== activeFolderIndex) {
        document.querySelector(`.notepad-folder-item[data-index="${targetFolderIndex}"]`)?.classList.add("drag-hover");
        hoveredFolderIndex = targetFolderIndex;
    } else {
        hoveredFolderIndex = -1;
    }

    updateAutoScroll(tabsList, p.x);

    if (hoveredFolderIndex === -1) {
        const otherTabs = [...tabsList.children].filter(c => c !== draggedTabInfo.element);
        const nextSibling = otherTabs.find(t => { const r = t.getBoundingClientRect(); return p.x < r.left + r.width / 2; });
        if (nextSibling) tabsList.insertBefore(draggedTabInfo.element, nextSibling);
        else tabsList.appendChild(draggedTabInfo.element);
    }
}

async function stopTabDrag() {
    stopAutoScroll();
    if (!isTabDragging) return;
    document.querySelectorAll(".notepad-folder-item").forEach(el => el.classList.remove("drag-hover"));
    const info = draggedTabInfo;
    const targetFolderIndex = hoveredFolderIndex;
    isTabDragging = false; draggedTabInfo = {}; hoveredFolderIndex = -1;
    info.element.classList.remove("dragging");
    document.body.classList.remove("tab-dragging-active");

    // --- 다른 폴더로 이동 ---
    if (targetFolderIndex !== -1 && targetFolderIndex !== activeFolderIndex) {
        commitEditorToNote(); // 편집 중인 내용이 사라지거나 다른 메모에 덮어써지지 않게 먼저 반영
        const notes = folders[activeFolderIndex].notes;
        const [movedNote] = notes.splice(info.startIndex, 1);
        folders[targetFolderIndex].notes.push(movedNote);
        if (info.startIndex < activeTabIndex) activeTabIndex--;
        activeTabIndex = clamp(activeTabIndex, 0, notes.length - 1);
        saveActiveState();
        await saveNotes(false);
        renderTabsAndContent(true); // 편집기를 새 활성 메모로 다시 불러온다
        showToast(`'${folders[targetFolderIndex].title}' 폴더로 이동되었습니다.`);
        return;
    }

    // --- 같은 폴더 안에서 순서 변경 (편집기는 같은 메모를 계속 보여주므로 다시 그리지 않는다) ---
    const newIndex = [...document.getElementById("notepad-tabs-list").children].indexOf(info.element);
    if (newIndex === -1 || newIndex === info.startIndex) return;
    const notes = folders[activeFolderIndex].notes;
    const [movedNote] = notes.splice(info.startIndex, 1);
    notes.splice(newIndex, 0, movedNote);
    if (activeTabIndex === info.startIndex) activeTabIndex = newIndex;
    else if (info.startIndex < activeTabIndex && newIndex >= activeTabIndex) activeTabIndex--;
    else if (info.startIndex > activeTabIndex && newIndex <= activeTabIndex) activeTabIndex++;
    saveActiveState();
    updateTabIndices();
    debouncedSave();
}

// --- 폴더 드래그 ---
function handleFolderPressStart(e) {
    const folderEl = e.currentTarget;
    if ((e.type === "mousedown" && e.button !== 0) || isFolderDragging || isTabDragging) return;
    const p = pointOf(e);
    draggedFolderInfo = { element: folderEl, startIndex: parseInt(folderEl.dataset.index), isClick: true, startX: p.x, startY: p.y };
    if (e.type === "touchstart") {
        longPressTimer = setTimeout(() => {
            if (draggedFolderInfo.element) {
                draggedFolderInfo.isClick = false; isFolderDragging = true;
                draggedFolderInfo.element.classList.add("dragging"); document.body.classList.add("tab-dragging-active");
                if (navigator.vibrate) navigator.vibrate(50);
            }
        }, 500);
    }
}

function dragFolder(e) {
    if (!isFolderDragging) return;
    e.preventDefault();
    const p = pointOf(e);
    const container = document.getElementById("notepad-folders-container");
    updateAutoScroll(container, p.x);
    const otherFolders = [...container.children].filter(c => c !== draggedFolderInfo.element && c.classList.contains("notepad-folder-item"));
    const nextSibling = otherFolders.find(f => { const r = f.getBoundingClientRect(); return p.x < r.left + r.width / 2; });
    container.insertBefore(draggedFolderInfo.element, nextSibling || document.getElementById("notepad-new-folder-btn"));
}

function stopFolderDrag() {
    stopAutoScroll();
    if (!isFolderDragging) return;
    const container = document.getElementById("notepad-folders-container");
    const currentActiveFolder = folders[activeFolderIndex];
    const originalFolders = [...folders];
    folders = [...container.querySelectorAll(".notepad-folder-item")].map(item => originalFolders[parseInt(item.dataset.index)]);
    activeFolderIndex = Math.max(0, folders.indexOf(currentActiveFolder));
    draggedFolderInfo.element.classList.remove("dragging");
    document.body.classList.remove("tab-dragging-active");
    isFolderDragging = false; draggedFolderInfo = {};
    saveActiveState();
    debouncedSave();
    updateFolderIndices();
}

// ---------------------------------------------------------------
// 폴더 관리
// ---------------------------------------------------------------
function renderFolders() {
    const folderContainer = document.getElementById("notepad-folders-container");
    if (!folderContainer) return;
    if (activeFolderIndex >= folders.length) activeFolderIndex = 0;
    folderContainer.innerHTML = folders.map((folder, index) =>
        `<div class="notepad-folder-item ${index === activeFolderIndex ? "active" : ""}" data-index="${index}"><span class="folder-name">📁 ${escapeHtml(folder.title)}</span></div>`
    ).join("") + `<button class="notepad-new-folder-btn" id="notepad-new-folder-btn" title="새 폴더">+</button>`;
    folderContainer.querySelectorAll(".notepad-folder-item").forEach(item => {
        item.addEventListener("click", (e) => { if (!isFolderDragging) switchFolder(parseInt(e.currentTarget.dataset.index)); });
        item.addEventListener("contextmenu", (e) => { e.preventDefault(); showFolderContextMenu(e, parseInt(e.currentTarget.dataset.index)); });
        item.addEventListener("mousedown", handleFolderPressStart);
        item.addEventListener("touchstart", handleFolderPressStart, { passive: true });
    });
    document.getElementById("notepad-new-folder-btn").addEventListener("click", createNewFolder);
}

async function createNewFolder() {
    commitEditorToNote();
    folders.push({ title: "새 폴더", notes: [] });
    activeFolderIndex = folders.length - 1; activeTabIndex = 0;
    await saveNotes(false);
    saveActiveState(); renderTabsAndContent();
}

async function switchFolder(index) {
    if (activeFolderIndex === index) return;
    if (hasUnsavedChanges) {
        const confirmed = await showConfirmationModal("저장하지 않은 변경사항이 있습니다.\n저장하고 폴더를 이동할까요?");
        if (!confirmed) return;
        await saveCurrentNote(false);
    }
    activeFolderIndex = index; activeTabIndex = 0;
    saveActiveState(); renderTabsAndContent();
}

function showFolderContextMenu(e, index) {
    closeAllMenus();
    const menu = document.createElement("div");
    menu.className = "notepad-context-menu";
    menu.style.cssText = `left:${e.clientX}px;top:${e.clientY}px;position:fixed;`;
    menu.innerHTML = `<ul><li class="notepad-context-menu-item" data-action="rename">✏️ 이름 변경</li><li class="notepad-context-menu-item" data-action="delete" style="color:#ff6b6b;">🗑️ 폴더 삭제</li></ul>`;
    document.body.appendChild(menu);
    menu.querySelector('[data-action="rename"]').addEventListener("click", () => { menu.remove(); renameFolder(index); });
    menu.querySelector('[data-action="delete"]').addEventListener("click", () => { menu.remove(); deleteFolder(index); });
}

function toggleFolderSettings(e) {
    e.stopPropagation();
    if (document.querySelector(".notepad-folder-settings-menu")) { closeAllMenus(); return; }
    closeAllMenus();
    const menu = document.createElement("div");
    menu.className = "notepad-folder-settings-menu";
    menu.innerHTML = `<ul>
        <li class="notepad-folder-settings-item" data-action="rename">✏️ 현재 폴더 이름 바꾸기</li>
        <li class="notepad-folder-settings-item" data-action="empty" style="color:#ffae42;">🗑️ 현재 폴더 비우기</li>
        <li class="notepad-folder-settings-item" data-action="delete" style="color:#ff6b6b;">⛔ 현재 폴더 삭제</li>
    </ul>`;
    document.getElementById(NOTEPAD_UI_ID).appendChild(menu);
    menu.querySelector('[data-action="rename"]').addEventListener("click", () => { menu.remove(); renameFolder(activeFolderIndex); });
    menu.querySelector('[data-action="empty"]').addEventListener("click", () => { menu.remove(); deleteAllNotes(); });
    menu.querySelector('[data-action="delete"]').addEventListener("click", () => { menu.remove(); deleteFolder(activeFolderIndex); });
}

async function renameFolder(index) {
    const newName = await showInputModal("새 폴더 이름을 입력하세요:", folders[index].title);
    if (!newName) return;
    folders[index].title = newName;
    await saveNotes(false);
    renderFolders();
}

async function deleteFolder(index) {
    if (folders.length <= 1) { showToast("최소 하나의 폴더는 있어야 합니다."); return; }
    const confirmed = await showConfirmationModal(`'${folders[index].title}' 폴더와\n내부 메모 ${folders[index].notes.length}개를 모두 삭제하시겠습니까?`);
    if (!confirmed) return;
    if (index === activeFolderIndex) {
        // 지우는 폴더의 편집 내용은 버리고 앞 폴더로 이동
        hasUnsavedChanges = false;
        folders.splice(index, 1);
        activeFolderIndex = Math.max(0, index - 1);
        activeTabIndex = 0;
    } else {
        // 다른 폴더를 지울 때는 편집 중인 내용과 현재 탭을 유지
        commitEditorToNote();
        folders.splice(index, 1);
        if (index < activeFolderIndex) activeFolderIndex--;
    }
    await saveNotes(false);
    saveActiveState(); renderTabsAndContent();
}

async function deleteAllNotes() {
    const currentNotes = folders[activeFolderIndex].notes;
    if (!currentNotes.length) { showToast("삭제할 메모가 없습니다."); return; }
    const confirmed = await showConfirmationModal(`⚠️ 현재 폴더의 모든 메모 (${currentNotes.length}개)를 삭제하시겠습니까?`);
    if (!confirmed) return;
    const finalConfirmation = await showConfirmationModal("⚠️ 최종 확인: 삭제된 메모는 복구할 수 없습니다. 계속하시겠습니까?");
    if (!finalConfirmation) return;
    folders[activeFolderIndex].notes = [];
    activeTabIndex = 0; hasUnsavedChanges = false;
    await saveNotes(false);
    saveActiveState(); renderTabsAndContent();
    showToast("✓ 폴더를 비웠습니다.");
}

// ---------------------------------------------------------------
// 테마 & 화면 설정 메뉴
// ---------------------------------------------------------------
function toggleThemeMenu(e) {
    e.stopPropagation();
    if (document.querySelector(".notepad-theme-menu")) { closeAllMenus(); return; }
    closeAllMenus();
    const menu = document.createElement("div");
    menu.className = "notepad-theme-menu";
    menu.innerHTML = `<ul>
        <li class="notepad-theme-item ${currentTheme === "NAVY" ? "active" : ""}" data-theme="NAVY">🌑 Navy (기본)</li>
        <li class="notepad-theme-item ${currentTheme === "IVORY" ? "active" : ""}" data-theme="IVORY">🌕 Ivory (라이트)</li>
        <li class="notepad-theme-item notepad-menu-divider" data-action="float">📌 떠 있는 버튼: ${isButtonVisible ? "켜짐" : "꺼짐"}</li>
        <li class="notepad-theme-item" data-action="shortcut" title="Ctrl+Shift+Z+X로 메모장 열기/닫기">⌨️ 단축키: ${isShortcutEnabled ? "켜짐" : "꺼짐"}</li>
        <li class="notepad-theme-item" data-action="layout-reset">↺ 창·버튼 위치 초기화</li>
    </ul>`;
    document.getElementById(NOTEPAD_UI_ID).appendChild(menu);
    menu.querySelectorAll("[data-theme]").forEach(item => {
        item.addEventListener("click", async () => {
            menu.remove();
            currentTheme = item.dataset.theme;
            applyThemeVars(currentTheme);
            await lsSet(THEME_KEY, currentTheme);
            showToast(`🎨 테마가 '${THEMES[currentTheme].name}'(으)로 변경되었습니다.`);
        });
    });
    menu.querySelector('[data-action="float"]').addEventListener("click", () => { menu.remove(); setFloatingButtonVisible(!isButtonVisible); });
    menu.querySelector('[data-action="shortcut"]').addEventListener("click", () => { menu.remove(); setShortcutEnabled(!isShortcutEnabled); });
    menu.querySelector('[data-action="layout-reset"]').addEventListener("click", async () => {
        menu.remove();
        await resetLayout();
        showToast("↺ 창과 버튼 위치를 초기화했습니다.");
    });
}

async function clearLayoutStorage() {
    for (const key of [POSITION_KEY, SIZE_KEY, BTN_POSITION_KEY]) await lsRemove(key);
}

async function resetLayout() {
    await clearLayoutStorage();
    savedLayout = { pos: null, size: null };
    applyWindowLayout();
    if (floatEls) await setFloatAnchor(FLOAT_DEFAULT.right, FLOAT_DEFAULT.bottom);
}

// 떠 있는 버튼 표시/숨김. 성공하면 true. notify=false면 토스트를 띄우지 않는다 (창이 닫힌 상태에서 호출될 때).
async function setFloatingButtonVisible(visible, notify = true) {
    if (visible) {
        const ok = await createFloatingButton();
        if (!ok) {
            if (notify) showToast("⚠️ 메인 화면 접근 권한이 없어 버튼을 만들 수 없습니다.");
            return false;
        }
        isButtonVisible = true;
        if (notify) showToast("📌 떠 있는 버튼을 표시합니다.");
    } else {
        await removeFloatingButton();
        isButtonVisible = false;
        if (notify) showToast("버튼을 숨겼습니다. 채팅 메뉴의 📝 RisuMemo로 다시 표시할 수 있습니다.");
    }
    await lsSet(BUTTON_VISIBLE_KEY, isButtonVisible);
    return true;
}

// 단축키 옵션. 켤 때 메인 화면 권한을 요청한다 (메모장이 닫혀 있을 때 메인 화면의 키 입력을 받아야 하므로).
async function setShortcutEnabled(enabled) {
    if (enabled) {
        if (!(await ensureRootDocument())) { showToast("⚠️ 메인 화면 접근 권한이 없어 단축키를 켤 수 없습니다."); return; }
        await setupRootShortcut();
        showToast("⌨️ 단축키를 켰습니다.\nCtrl+Shift+Z+X로 메모장을 열고 닫을 수 있습니다.");
    } else {
        await removeRootShortcut();
        showToast("⌨️ 단축키를 껐습니다.");
    }
    isShortcutEnabled = enabled;
    await lsSet(SHORTCUT_ENABLED_KEY, enabled);
}

// 채팅 메뉴 버튼: 떠 있는 버튼을 켜고 끈다. 권한이 없어 버튼을 만들 수 없으면 메모장을 바로 연다.
async function onMenuButton() {
    if (isWindowVisible) return;
    if (!(await setFloatingButtonVisible(!isButtonVisible, false))) await openNotepadWindow();
}

// ---------------------------------------------------------------
// 백업 & 복원
// ---------------------------------------------------------------
function toggleBackupMenu(e) {
    e.stopPropagation();
    if (document.querySelector(".notepad-backup-menu")) { closeAllMenus(); return; }
    closeAllMenus();
    const menu = document.createElement("div");
    menu.className = "notepad-backup-menu";
    menu.innerHTML = `<ul>
        <li class="notepad-backup-item" data-action="clipboard">📋 클립보드로 백업</li>
        <li class="notepad-backup-item" data-action="browser">🌐 브라우저에 백업 (이 기기)</li>
        <li class="notepad-backup-item" data-action="restore-browser">🌐 브라우저에서 불러오기</li>
        <li class="notepad-backup-item" data-action="export">📥 파일로 내보내기 (.json)</li>
        <li class="notepad-backup-item" data-action="import">📤 파일로 불러오기</li>
        <li class="notepad-backup-item" data-action="memoplus">📝 MemoPlus 메모 가져오기</li>
        <li class="notepad-backup-item notepad-menu-divider" data-action="clear-browser" style="color:#ffae42;">🗑️ 브라우저 백업 삭제</li>
        <li class="notepad-backup-item" data-action="reset" style="color:#ff6b6b;">🔥 메모장 완전 초기화</li>
    </ul>
    <input type="file" id="backup-file-input" accept=".json" style="display:none;" />`;
    document.getElementById(NOTEPAD_UI_ID).appendChild(menu);
    const actions = {
        "clipboard": backupToClipboard,
        "browser": backupToBrowser,
        "restore-browser": restoreFromBrowser,
        "export": exportToFile,
        "memoplus": importFromMemoPlus,
        "clear-browser": clearBrowserBackup,
        "reset": factoryReset
    };
    menu.querySelectorAll("[data-action]").forEach(item => {
        const action = item.dataset.action;
        item.addEventListener("click", (evt) => {
            if (action === "import") { evt.stopPropagation(); menu.querySelector("#backup-file-input").click(); return; }
            menu.remove();
            actions[action]();
        });
    });
    menu.querySelector("#backup-file-input").addEventListener("change", (evt) => { importFromFile(evt); menu.remove(); });
}

async function replaceAllFolders(newFolders, toastMessage) {
    folders = newFolders.length ? newFolders : defaultFolders();
    activeFolderIndex = 0; activeTabIndex = 0; hasUnsavedChanges = false;
    await saveNotes(false);
    saveActiveState(); renderTabsAndContent();
    showToast(toastMessage);
}

async function backupToClipboard() {
    commitEditorToNote();
    const ok = await copyToClipboard(JSON.stringify(folders));
    showToast(ok ? "📋 데이터가 클립보드에 복사되었습니다." : "⚠️ 클립보드 복사에 실패했습니다.");
}

async function backupToBrowser() {
    try {
        await ls.setItem(BROWSER_BACKUP_KEY, JSON.stringify(folders));
        showToast("🌐 브라우저에 백업되었습니다.");
    } catch (e) {
        showToast("⚠️ 브라우저 백업에 실패했습니다.");
    }
}

async function restoreFromBrowser() {
    const parsed = parseFolders(await lsGet(BROWSER_BACKUP_KEY));
    if (!parsed) { showToast("⚠️ 브라우저에 저장된 백업이 없습니다."); return; }
    const confirmed = await showConfirmationModal(`⚠️ 현재 메모를 덮어쓰고\n브라우저 백업을 불러오시겠습니까?\n(폴더 ${parsed.length}개, 메모 ${countNotes(parsed)}개)`);
    if (confirmed) await replaceAllFolders(parsed, "🌐 브라우저 백업을 복원했습니다.");
}

// 새 저장소가 비어 있을 때 구버전 브라우저 백업 복원을 한 번 제안한다
async function offerLegacyBackupRestore() {
    const parsed = parseFolders(await lsGet(BROWSER_BACKUP_KEY));
    if (!parsed || !countNotes(parsed)) return;
    const confirmed = await showConfirmationModal(`이전 버전에서 만든 브라우저 백업이 있습니다.\n(폴더 ${parsed.length}개, 메모 ${countNotes(parsed)}개)\n\n불러오시겠습니까?`);
    if (confirmed) await replaceAllFolders(parsed, "🌐 브라우저 백업을 복원했습니다.");
    else await saveNotes(false); // 빈 데이터라도 저장해서 다시 묻지 않게 한다
}

async function clearBrowserBackup() {
    if (!(await lsGet(BROWSER_BACKUP_KEY))) { showToast("⚠️ 삭제할 브라우저 백업이 없습니다."); return; }
    const confirmed = await showConfirmationModal("🗑️ 브라우저에 저장된 백업을\n정말 삭제하시겠습니까?");
    if (!confirmed) return;
    await lsRemove(BROWSER_BACKUP_KEY);
    showToast("🗑️ 브라우저 백업이 삭제되었습니다.");
}

function exportToFile() {
    try {
        commitEditorToNote();
        const blob = new Blob([JSON.stringify(folders, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `risumemo_backup_${new Date().toISOString().slice(0, 10).replace(/-/g, "")}.json`;
        document.body.appendChild(a); a.click(); a.remove();
        URL.revokeObjectURL(url);
        showToast("📥 파일이 다운로드되었습니다.");
    } catch (e) {
        showToast("⚠️ 파일 내보내기에 실패했습니다.");
    }
}

async function importFromFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    try {
        const parsed = parseFolders(await file.text());
        if (!parsed) throw new Error("Invalid format");
        const confirmed = await showConfirmationModal(`⚠️ 현재 메모를 모두 덮어쓰고\n파일에서 불러오시겠습니까?\n(폴더 ${parsed.length}개, 메모 ${countNotes(parsed)}개)`);
        if (confirmed) await replaceAllFolders(parsed, "📤 데이터가 성공적으로 복원되었습니다.");
    } catch (err) {
        showToast("⚠️ 유효하지 않은 백업 파일입니다.");
    }
    e.target.value = "";
}

// MemoPlus도 같은 데이터 구조를 pluginStorage에 저장하므로 바로 읽을 수 있다. 기존 메모는 유지하고 폴더로 추가한다.
async function importFromMemoPlus() {
    let parsed = null;
    try { parsed = parseFolders(await ps.getItem(MEMOPLUS_DATA_KEY)); } catch (e) {}
    if (!parsed || !countNotes(parsed)) { showToast("⚠️ MemoPlus 메모를 찾을 수 없습니다."); return; }
    const confirmed = await showConfirmationModal(`MemoPlus의 폴더 ${parsed.length}개(메모 ${countNotes(parsed)}개)를\n현재 메모장에 새 폴더로 추가할까요?\n(기존 메모는 그대로 유지됩니다)`);
    if (!confirmed) return;
    commitEditorToNote();
    const firstNew = folders.length;
    folders.push(...parsed.map(f => ({ ...f, title: `${f.title} (MemoPlus)` })));
    activeFolderIndex = firstNew; activeTabIndex = 0;
    await saveNotes(false);
    saveActiveState(); renderTabsAndContent();
    showToast("📝 MemoPlus 메모를 가져왔습니다.");
}

async function factoryReset() {
    const confirmed = await showConfirmationModal("🔥 모든 폴더와 메모를 삭제하고 설정을 초기화합니다.\n(브라우저 백업은 남겨 둡니다)\n\n정말 삭제하시겠습니까?");
    if (!confirmed) return;
    try {
        for (const key of [ACTIVE_NOTE_INDEX_KEY, ACTIVE_FOLDER_INDEX_KEY, THEME_KEY, BUTTON_VISIBLE_KEY, LEGACY_WINDOW_VISIBLE_KEY, SHORTCUT_ENABLED_KEY]) await lsRemove(key);
        await removeRootShortcut();
        isShortcutEnabled = false;
        await resetLayout();
        folders = defaultFolders();
        activeFolderIndex = 0; activeTabIndex = 0; hasUnsavedChanges = false;
        await saveNotes(false); // 빈 데이터를 저장해 두어야 다음 실행 때 구버전 백업 복원을 묻지 않는다
        currentTheme = "NAVY";
        applyThemeVars(currentTheme);
        if (!isButtonVisible) await setFloatingButtonVisible(true);
        renderTabsAndContent();
        showToast("🔥 메모장이 완전히 초기화되었습니다.");
    } catch (e) {
        console.error(`${PLUGIN_NAME} 초기화 실패:`, e);
        showToast("⚠️ 초기화 중 오류가 발생했습니다.");
    }
}

// ---------------------------------------------------------------
// 탭 & 편집기
// ---------------------------------------------------------------
function renderTabsAndContent(skipFocus = false) {
    renderFolders();
    const tabsListEl = document.getElementById("notepad-tabs-list");
    const editorAreaEl = document.getElementById("notepad-editor-area");
    const footerEl = document.getElementById("notepad-footer");
    const searchBarEl = document.getElementById("notepad-search-bar");
    if (!tabsListEl || !editorAreaEl || !footerEl) return;

    if (!folders[activeFolderIndex]) { activeFolderIndex = 0; if (!folders[0]) folders = defaultFolders(); }
    const currentNotes = folders[activeFolderIndex].notes;

    if (currentNotes.length > 0) {
        activeTabIndex = clamp(activeTabIndex, 0, currentNotes.length - 1);
        tabsListEl.innerHTML = currentNotes.map((note, i) =>
            `<div class="notepad-tab-item ${i === activeTabIndex ? "active" : ""}" data-index="${i}">${escapeHtml(note.title || `메모 ${i + 1}`)}</div>`
        ).join("");
        editorAreaEl.innerHTML = `<input type="text" class="notepad-title-input" id="notepad-title-input" placeholder="제목"><textarea class="notepad-content-textarea" id="notepad-content-textarea" placeholder="내용"></textarea>`;
        footerEl.innerHTML = `
            <div class="notepad-footer-left"><button class="notepad-header-btn" id="notepad-toggle-search-btn" title="찾기/바꾸기">🔍</button></div>
            <div class="notepad-footer-right">
                <button class="notepad-copy-btn" id="notepad-copy-btn">📋 메모 복사</button>
                <button class="notepad-save-btn" id="notepad-save-btn" title="저장 (Ctrl+S)">💾 메모 저장</button>
                <button class="notepad-delete-btn" id="notepad-delete-btn">🗑️ 메모 삭제</button>
            </div>`;
        document.getElementById("notepad-save-btn").addEventListener("click", () => saveCurrentNote(true));
        document.getElementById("notepad-delete-btn").addEventListener("click", deleteCurrentNote);
        document.getElementById("notepad-copy-btn").addEventListener("click", copyCurrentNoteContent);
        document.getElementById("notepad-title-input").addEventListener("input", markAsUnsaved);
        document.getElementById("notepad-content-textarea").addEventListener("input", markAsUnsaved);
        document.getElementById("notepad-toggle-search-btn").addEventListener("click", toggleSearchBar);
        tabsListEl.querySelectorAll(".notepad-tab-item").forEach(tab => {
            tab.addEventListener("mousedown", handleTabPressStart);
            tab.addEventListener("touchstart", handleTabPressStart, { passive: true });
            // 가운데 클릭으로 메모 삭제 (PC)
            tab.addEventListener("mousedown", e => { if (e.button === 1) { e.preventDefault(); deleteNoteByIndex(parseInt(e.currentTarget.dataset.index)); } });
        });
        loadNoteContent(activeTabIndex);
    } else {
        editorAreaEl.innerHTML = '<div class="notepad-editor-area empty">메모가 없습니다.<br>+ 버튼을 눌러 추가하세요.</div>';
        footerEl.innerHTML = ""; tabsListEl.innerHTML = "";
        searchBarEl?.classList.remove("visible");
    }
    if (!skipFocus) setTimeout(focusActiveTab, 100);
}

function updateTabIndices() {
    const tabsList = document.getElementById("notepad-tabs-list");
    if (!tabsList) return;
    const tabs = tabsList.querySelectorAll(".notepad-tab-item");
    tabs.forEach((tab, i) => { if (parseInt(tab.dataset.index || "-1") !== i) tab.dataset.index = i; });
    const oldActive = tabsList.querySelector(".notepad-tab-item.active");
    const newActive = tabs[activeTabIndex];
    if (oldActive !== newActive) { oldActive?.classList.remove("active"); newActive?.classList.add("active"); }
}

function updateFolderIndices() {
    const fc = document.getElementById("notepad-folders-container");
    if (!fc) return;
    const items = fc.querySelectorAll(".notepad-folder-item");
    items.forEach((item, i) => { if (parseInt(item.dataset.index || "-1") !== i) item.dataset.index = i; });
    const oldActive = fc.querySelector(".notepad-folder-item.active");
    const newActive = items[activeFolderIndex];
    if (oldActive !== newActive) { oldActive?.classList.remove("active"); newActive?.classList.add("active"); }
}

function toggleTabDropdown(e) {
    e.stopPropagation();
    if (document.getElementById("notepad-tab-dropdown-menu")) { closeAllMenus(); return; }
    closeAllMenus();
    const btnRect = e.currentTarget.getBoundingClientRect();
    const menu = document.createElement("div");
    menu.id = "notepad-tab-dropdown-menu"; menu.className = "notepad-tab-dropdown-menu";
    // body에 fixed로 붙여서 창의 overflow:hidden에 잘리지 않게 한다
    menu.style.position = "fixed";
    menu.style.top = `${btnRect.bottom + 5}px`;
    menu.style.right = `${window.innerWidth - btnRect.right}px`;
    menu.style.zIndex = "100003";
    const list = document.createElement("ul");
    folders[activeFolderIndex].notes.forEach((note, i) => {
        const item = document.createElement("li");
        item.className = "notepad-tab-dropdown-item";
        if (i === activeTabIndex) item.classList.add("active");
        item.dataset.index = i;
        item.textContent = `${i + 1}. ${note.title || `메모 ${i + 1}`}`;
        list.appendChild(item);
    });
    menu.appendChild(list);
    document.body.appendChild(menu);
    list.addEventListener("click", (evt) => {
        const target = evt.target.closest(".notepad-tab-dropdown-item");
        if (target) { menu.remove(); switchTab(parseInt(target.dataset.index)); }
    });
}

function focusActiveTab() {
    document.querySelector(".notepad-tab-item.active")?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
}

async function copyCurrentNoteContent() {
    const ta = document.getElementById("notepad-content-textarea");
    if (!ta || !ta.value) { showToast("복사할 내용이 없습니다."); return; }
    const ok = await copyToClipboard(ta.value);
    showToast(ok ? "✓ 메모 내용이 복사되었습니다." : "⚠️ 복사에 실패했습니다.");
}

async function switchTab(index) {
    if (index === activeTabIndex || isTabDragging) return;
    if (hasUnsavedChanges) {
        const confirmed = await showConfirmationModal("저장하지 않은 변경사항이 있습니다.\n저장하고 이동할까요?");
        if (!confirmed) return;
        await saveCurrentNote(false);
    }
    activeTabIndex = index;
    saveActiveState();
    renderTabsAndContent();
}

function loadNoteContent(index) {
    const note = folders[activeFolderIndex].notes[index];
    if (!note) return;
    const titleInput = document.getElementById("notepad-title-input");
    const contentTextarea = document.getElementById("notepad-content-textarea");
    if (titleInput) titleInput.value = note.title;
    if (contentTextarea) contentTextarea.value = note.content;
    updateSaveButton();
}

async function createNewNote() {
    if (hasUnsavedChanges) {
        const confirmed = await showConfirmationModal("저장하지 않은 변경사항이 있습니다.\n저장하고 새 메모를 만들까요?");
        if (!confirmed) return;
        await saveCurrentNote(false);
    }
    folders[activeFolderIndex].notes.push({ title: "새 메모", content: "" });
    activeTabIndex = folders[activeFolderIndex].notes.length - 1;
    await saveNotes(false);
    saveActiveState(); renderTabsAndContent();
}

async function saveCurrentNote(showToastMsg = false) {
    const currentNotes = folders[activeFolderIndex].notes;
    if (!currentNotes.length || activeTabIndex >= currentNotes.length) return;
    const titleInput = document.getElementById("notepad-title-input");
    const contentTextarea = document.getElementById("notepad-content-textarea");
    if (!titleInput || !contentTextarea) return;
    currentNotes[activeTabIndex].title = titleInput.value;
    currentNotes[activeTabIndex].content = contentTextarea.value;
    hasUnsavedChanges = false;
    await saveNotes(showToastMsg);
    const tabEl = document.querySelector(`.notepad-tab-item[data-index="${activeTabIndex}"]`);
    if (tabEl) tabEl.textContent = currentNotes[activeTabIndex].title || `메모 ${activeTabIndex + 1}`;
    updateSaveButton();
}

async function deleteCurrentNote() {
    const currentNotes = folders[activeFolderIndex].notes;
    if (!currentNotes.length) return;
    const confirmed = await showConfirmationModal(`'${currentNotes[activeTabIndex].title || "이 메모"}'를 정말 삭제하시겠습니까?`);
    if (confirmed) await deleteNoteByIndex(activeTabIndex);
}

async function deleteNoteByIndex(index) {
    const currentNotes = folders[activeFolderIndex].notes;
    if (index < 0 || index >= currentNotes.length) return;
    if (index === activeTabIndex) hasUnsavedChanges = false; // 지우는 메모의 편집 내용은 버린다
    else commitEditorToNote();                               // 다른 메모를 지울 때는 편집 중인 내용을 지킨다
    currentNotes.splice(index, 1);
    if (index < activeTabIndex || (index === activeTabIndex && index > 0)) activeTabIndex--;
    await saveNotes(false);
    saveActiveState(); renderTabsAndContent();
}

function markAsUnsaved() {
    hasUnsavedChanges = true;
    updateSaveButton();
}

function updateSaveButton() {
    const saveBtn = document.getElementById("notepad-save-btn");
    if (!saveBtn) return;
    saveBtn.classList.toggle("saved", !hasUnsavedChanges);
    saveBtn.textContent = hasUnsavedChanges ? "💾 메모 저장" : "✓ 메모 저장됨";
    saveBtn.disabled = !hasUnsavedChanges;
}

// --- 찾기/바꾸기 ---
function toggleSearchBar() {
    const bar = document.getElementById("notepad-search-bar");
    if (!bar) return;
    if (bar.classList.toggle("visible")) setTimeout(() => document.getElementById("notepad-find-input")?.focus(), 100);
}

function findNextText() {
    const ta = document.getElementById("notepad-content-textarea"), findInput = document.getElementById("notepad-find-input");
    if (!ta || !findInput || !findInput.value) return;
    const term = findInput.value.toLowerCase(), text = ta.value.toLowerCase();
    let index = text.indexOf(term, ta.selectionEnd);
    if (index === -1) {
        index = text.indexOf(term, 0);
        if (index !== -1) showToast("🔄 문서 처음부터 다시 검색합니다.");
    }
    if (index === -1) { showToast("⚠️ 검색 결과를 찾을 수 없습니다."); return; }
    ta.focus();
    ta.setSelectionRange(index, index + term.length);
    ta.blur(); ta.focus(); // 선택 영역으로 스크롤
}

function replaceCurrentText() {
    const ta = document.getElementById("notepad-content-textarea"), findInput = document.getElementById("notepad-find-input"), replaceInput = document.getElementById("notepad-replace-input");
    if (!ta || !findInput || !replaceInput || !findInput.value) return;
    const start = ta.selectionStart, end = ta.selectionEnd;
    if (ta.value.substring(start, end).toLowerCase() === findInput.value.toLowerCase()) {
        ta.value = ta.value.substring(0, start) + replaceInput.value + ta.value.substring(end);
        ta.setSelectionRange(start, start + replaceInput.value.length);
        markAsUnsaved();
    }
    findNextText();
}

async function replaceAllText() {
    const ta = document.getElementById("notepad-content-textarea"), findInput = document.getElementById("notepad-find-input"), replaceInput = document.getElementById("notepad-replace-input");
    if (!ta || !findInput || !replaceInput || !findInput.value) return;
    const regex = new RegExp(findInput.value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    const matchCount = (ta.value.match(regex) || []).length;
    if (!matchCount) { showToast("⚠️ 바꿀 내용을 찾을 수 없습니다."); return; }
    const confirmed = await showConfirmationModal(`총 ${matchCount}개를 모두 바꾸시겠습니까?`);
    if (!confirmed) return;
    const replacement = replaceInput.value;
    ta.value = ta.value.replace(regex, () => replacement); // 함수로 넘겨서 $& 같은 특수 패턴이 해석되지 않게 한다
    markAsUnsaved();
    showToast(`✓ ${matchCount}개가 변경되었습니다.`);
}

// --- 키보드 (iframe 내부: 메모장이 열려 있을 때) ---
const keysPressed = new Set();
function isToggleShortcut(keys, e) {
    return e.ctrlKey && e.shiftKey && keys.has("z") && keys.has("x");
}

function setupKeyboardShortcut() {
    window.addEventListener("keydown", (e) => {
        keysPressed.add(e.key.toLowerCase());
        if (isShortcutEnabled && isToggleShortcut(keysPressed, e)) { e.preventDefault(); keysPressed.clear(); toggleNotepadWindow(); return; }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
            e.preventDefault();
            if (hasUnsavedChanges) saveCurrentNote(true);
            return;
        }
        if (e.key === "Escape" && isWindowVisible) {
            const modal = document.querySelector(".notepad-modal-overlay");
            if (modal) { modal.querySelector(".notepad-modal-cancel-btn")?.click(); return; }
            if (closeAllMenus()) return;
            closeNotepadWindow();
        }
    });
    window.addEventListener("keyup", (e) => { keysPressed.delete(e.key.toLowerCase()); });
}

// ---------------------------------------------------------------
// 메인 화면(RisuAI) 쪽: 떠 있는 버튼 & 단축키
// ※ SafeElement.addEventListener는 요소가 아니라 메인 document 전체에 등록된다.
//   그래서 좌표로 버튼 위인지 직접 판별하고, 등록한 리스너 ID를 모두 기록해 두었다가 제거한다.
// ※ getRootDocument()는 사용자가 'mainDom' 권한을 거부하면 null을 반환한다.
//   이 경우에도 채팅 메뉴 버튼/설정 메뉴로 메모장을 열 수 있다.
// ---------------------------------------------------------------
let rootDoc = null;
let floatEls = null;          // { container, handle, btn }
let floatListeners = [];      // [{ type, id }]
let shortcutListeners = [];   // [{ type, id }]
let floatHandleBottom = 14;   // 컨테이너 위쪽 기준, 드래그 손잡이 영역의 아래 경계(px)
let floatDrag = null;
let floatPressed = false;
const rootKeysPressed = new Set();

async function ensureRootDocument() {
    if (rootDoc) return rootDoc;
    try { rootDoc = await risuai.getRootDocument(); } catch (e) { rootDoc = null; }
    return rootDoc;
}

// SafeDocument는 document가 아니라 <html> 요소를 감싼 것이다. (querySelector('html')은 자손만 찾으므로 null)
// <html>의 clientWidth/clientHeight = 스크롤바를 뺀 화면 크기.
async function getViewportSize() {
    return { w: await rootDoc.clientWidth(), h: await rootDoc.clientHeight() };
}

function plainRect(r) {
    return { left: r.left, top: r.top, width: r.width, height: r.height };
}
function isInside(e, r) {
    return e.clientX >= r.left && e.clientX <= r.left + r.width && e.clientY >= r.top && e.clientY <= r.top + r.height;
}

// 버튼 위치는 오른쪽/아래 거리로 저장한다. 화면 크기가 바뀌어도(모바일 회전 등) 오른쪽 아래 기준으로 남는다.
async function setFloatAnchor(right, bottom) {
    const c = floatEls.container;
    await c.setStyle("right", `${right}px`);
    await c.setStyle("bottom", `${bottom}px`);
}

async function createFloatingButton() {
    if (floatEls) return true;
    const doc = await ensureRootDocument();
    if (!doc) return false;
    try {
        const body = await doc.querySelector("body");
        if (!body) return false;
        // 이전 실행(다시 불러오기 등)에서 남은 버튼 제거
        const leftover = await doc.querySelector(`[${FLOAT_ATTR}]`);
        if (leftover) await leftover.remove();

        const container = await doc.createElement("div");
        await container.setAttribute(FLOAT_ATTR, "true");
        await container.setStyleAttribute(`
            position: fixed; right: ${FLOAT_DEFAULT.right}px; bottom: ${FLOAT_DEFAULT.bottom}px;
            width: 52px; height: auto; display: flex; flex-direction: column; align-items: center; gap: 4px;
            z-index: ${FLOAT_Z_INDEX}; padding: 4px; border-radius: 26px; background: transparent;
            user-select: none; -webkit-user-select: none; cursor: default; touch-action: none;
        `);
        const handle = await doc.createElement("div");
        await handle.setStyleAttribute(`
            width: 24px; height: 6px; background: ${HANDLE_COLOR}; border-radius: 3px;
            pointer-events: none; transition: background 0.2s;
        `);
        const btn = await doc.createElement("div");
        await btn.setStyleAttribute(`
            width: 48px; height: 48px; border-radius: 50%; background: ${(THEMES[currentTheme] || THEMES.NAVY).buttonBackground};
            color: white; font-size: 22px; display: flex; align-items: center; justify-content: center;
            box-shadow: 0 4px 14px rgba(0,0,0,0.35); pointer-events: none; transition: background 0.2s; flex-shrink: 0;
        `);
        await btn.setTextContent("📝");
        await container.appendChild(handle);
        await container.appendChild(btn);
        await body.appendChild(container);
        floatEls = { container, handle, btn };

        const rect = plainRect(await container.getBoundingClientRect());
        const handleRect = await handle.getBoundingClientRect();
        floatHandleBottom = handleRect.top + handleRect.height - rect.top + 2;
        await restoreFloatPosition(rect);

        floatListeners.push({ type: "pointerdown", id: await doc.addEventListener("pointerdown", onRootPointerDown) });
        floatListeners.push({ type: "pointerup", id: await doc.addEventListener("pointerup", onRootPointerUp) });
        return true;
    } catch (e) {
        console.error(`${PLUGIN_NAME} 떠 있는 버튼 생성 오류:`, e);
        await removeFloatingButton();
        return false;
    }
}

async function restoreFloatPosition(rect) {
    const saved = await lsGetJSON(BTN_POSITION_KEY, null);
    if (!saved || typeof saved !== "object") return;
    const vp = await getViewportSize();
    // v4.0: {right, bottom} / v3.4: {left, top} / v3.3: {top, right}
    const right = Number.isFinite(saved.right) ? saved.right : Number.isFinite(saved.left) ? vp.w - saved.left - rect.width : null;
    const bottom = Number.isFinite(saved.bottom) ? saved.bottom : Number.isFinite(saved.top) ? vp.h - saved.top - rect.height : null;
    if (right === null || bottom === null) { await lsRemove(BTN_POSITION_KEY); return; }
    await setFloatAnchor(clamp(right, 0, vp.w - rect.width), clamp(bottom, 0, vp.h - rect.height));
}

async function onRootPointerDown(e) {
    floatPressed = false;
    if (!floatEls || floatDrag || e.button > 0) return;
    const rect = plainRect(await floatEls.container.getBoundingClientRect());
    if (!isInside(e, rect)) return;

    // 메모장이 열려 있으면 드래그하지 않는다 (버튼은 iframe 아래에 가려지고, pointerup도 메인 document에 오지 않는다)
    if (e.clientY - rect.top > floatHandleBottom || isWindowVisible) { floatPressed = true; return; }

    const drag = { shiftX: e.clientX - rect.left, shiftY: e.clientY - rect.top, size: rect, vp: await getViewportSize(), last: null, busy: false, ended: false, moveId: null };
    floatDrag = drag;
    await floatEls.handle.setStyle("background", HANDLE_ACTIVE_COLOR);
    const moveId = await rootDoc.addEventListener("pointermove", onRootPointerMove);
    if (drag.ended) await rootDoc.removeEventListener("pointermove", moveId); // 등록 전에 이미 손을 뗀 경우
    else drag.moveId = moveId;
}

async function onRootPointerMove(e) {
    const drag = floatDrag;
    if (!drag || !floatEls) return;
    const { vp, size } = drag;
    const left = clamp(e.clientX - drag.shiftX, 0, vp.w - size.width);
    const top = clamp(e.clientY - drag.shiftY, 0, vp.h - size.height);
    drag.last = { right: Math.round(vp.w - left - size.width), bottom: Math.round(vp.h - top - size.height) };
    // 스타일 변경 RPC가 끝나기 전에 들어온 이동은 합쳐서 최신 위치만 반영한다
    if (drag.busy) return;
    drag.busy = true;
    try {
        let applied = null;
        while (!drag.ended && drag.last !== applied) {
            applied = drag.last;
            await setFloatAnchor(applied.right, applied.bottom);
        }
    } finally {
        drag.busy = false;
    }
}

async function endFloatDrag() {
    const drag = floatDrag;
    floatDrag = null;
    drag.ended = true;
    if (drag.moveId) await rootDoc.removeEventListener("pointermove", drag.moveId);
    if (!floatEls) return;
    await floatEls.handle.setStyle("background", HANDLE_COLOR);
    if (drag.last) {
        await setFloatAnchor(drag.last.right, drag.last.bottom);
        await lsSet(BTN_POSITION_KEY, JSON.stringify(drag.last));
    }
}

async function onRootPointerUp(e) {
    if (floatDrag) { await endFloatDrag(); return; }
    if (!floatPressed || !floatEls) return;
    floatPressed = false;
    const rect = await floatEls.container.getBoundingClientRect();
    if (isInside(e, rect)) toggleNotepadWindow();
}

async function removeFloatingButton() {
    if (floatDrag) {
        floatDrag.ended = true;
        if (floatDrag.moveId) floatListeners.push({ type: "pointermove", id: floatDrag.moveId });
        floatDrag = null;
    }
    for (const { type, id } of floatListeners.splice(0)) {
        try { await rootDoc.removeEventListener(type, id); } catch (e) {}
    }
    if (floatEls) {
        try { await floatEls.container.remove(); } catch (e) {}
        floatEls = null;
    }
}

// 메모장이 닫혀 있을 때는 포커스가 메인 화면에 있으므로 단축키를 메인 document에서 받는다
// (키보드 이벤트는 보안상 0~99ms 무작위 지연되어 전달된다)
async function setupRootShortcut() {
    if (!rootDoc || shortcutListeners.length) return;
    shortcutListeners.push({ type: "keydown", id: await rootDoc.addEventListener("keydown", (e) => {
        rootKeysPressed.add(String(e.key).toLowerCase());
        if (isToggleShortcut(rootKeysPressed, e)) { rootKeysPressed.clear(); toggleNotepadWindow(); }
    }) });
    shortcutListeners.push({ type: "keyup", id: await rootDoc.addEventListener("keyup", (e) => {
        rootKeysPressed.delete(String(e.key).toLowerCase());
    }) });
}

async function removeRootShortcut() {
    for (const { type, id } of shortcutListeners.splice(0)) {
        try { await rootDoc.removeEventListener(type, id); } catch (e) {}
    }
    rootKeysPressed.clear();
}

async function cleanupRoot() {
    await removeFloatingButton();
    await removeRootShortcut();
}

// ---------------------------------------------------------------
// 초기화
// ---------------------------------------------------------------
async function initNotepad() {
    if (document.getElementById(NOTEPAD_UI_ID)) return;

    activeFolderIndex = toIndex(await lsGetJSON(ACTIVE_FOLDER_INDEX_KEY, 0));
    activeTabIndex = toIndex(await lsGetJSON(ACTIVE_NOTE_INDEX_KEY, 0));
    const savedTheme = await lsGet(THEME_KEY);
    currentTheme = THEMES[savedTheme] ? savedTheme : "NAVY";
    isButtonVisible = (await lsGet(BUTTON_VISIBLE_KEY)) !== "false";
    isShortcutEnabled = (await lsGet(SHORTCUT_ENABLED_KEY)) === "true";

    // 설정 화면의 ui_reset 칸에 reset이 입력되어 있으면 창·버튼 위치를 초기화
    let resetRequested = false;
    try { resetRequested = String((await risuai.getArgument(UI_RESET_ARG)) ?? "").trim().toLowerCase() === "reset"; } catch (e) {}
    if (resetRequested) {
        await clearLayoutStorage();
        await lsRemove(BUTTON_VISIBLE_KEY);
        isButtonVisible = true;
        try { await risuai.setArgument(UI_RESET_ARG, ""); } catch (e) {}
        queueToast("↺ 창과 버튼 위치를 초기화했습니다.");
    }

    injectStyles();
    applyThemeVars(currentTheme);
    await loadNotes();
    await createNotepadUI();
    setupKeyboardShortcut();

    // 공식 진입점 (플러그인 종료 시 자동 제거됨)
    // - 채팅 메뉴: 떠 있는 버튼 표시/숨김. 메인 화면 권한이 없으면 메모장을 바로 연다.
    // - 설정 메뉴: 메모장 열기
    await risuai.registerButton({ name: "RisuMemo", icon: "📝", iconType: "html", location: "chat" }, () => onMenuButton());
    await risuai.registerSetting("RisuMemo", () => openNotepadWindow(), "📝", "html");
    await risuai.onUnload(cleanupRoot);

    // 떠 있는 버튼과 단축키는 메인 화면 권한이 필요하다. 둘 다 꺼 두었으면 권한을 요청하지 않는다.
    // 권한이 없으면 설정값은 그대로 두고(다음 실행 때 다시 시도) 메뉴에는 실제 상태를 표시한다.
    if (isButtonVisible && !(await createFloatingButton())) {
        isButtonVisible = false;
        console.log(`${PLUGIN_NAME} 메인 화면 권한이 없어 떠 있는 버튼 없이 실행합니다.`);
    }
    if (isShortcutEnabled) {
        if (await ensureRootDocument()) await setupRootShortcut();
        else isShortcutEnabled = false;
    }

    console.log(`${PLUGIN_NAME} 로드 완료.`);
}

await initNotepad();

} catch (error) {
    console.error(`[RisuMemo v4.0.2] 플러그인 초기화 오류:`, error);
}
})();
