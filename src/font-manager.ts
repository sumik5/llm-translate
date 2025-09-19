// ==================== Font Manager ====================
import { JAPANESE_FONTS, GOOGLE_FONTS_URLS } from './constants.js';

/**
 * フォント管理クラス
 * Google Fontsの日本語フォントの読み込みと適用を管理
 */
export class FontManager {
    private currentFont: string = 'default';
    private loadedFonts: Set<string> = new Set();
    private outputElement: HTMLElement | null = null;
    private htmlOutputElement: HTMLElement | null = null;

    constructor() {
        this.loadedFonts.add('default');
    }

    /**
     * 出力要素を設定
     */
    setOutputElements(markdownOutput: HTMLElement | null, htmlOutput: HTMLElement | null): void {
        this.outputElement = markdownOutput;
        this.htmlOutputElement = htmlOutput;
    }

    /**
     * フォントを設定
     */
    async setFont(fontId: string): Promise<void> {
        // フォントが存在するか確認
        const fontInfo = JAPANESE_FONTS.find(f => f.value === fontId);
        if (!fontInfo) {
            console.warn(`Font ${fontId} not found, using default`);
            fontId = 'default';
        }

        // Google Fontsを読み込み（まだ読み込まれていない場合）
        if (fontId !== 'default' && !this.loadedFonts.has(fontId)) {
            await this.loadGoogleFont(fontId);
        }

        this.currentFont = fontId;
        this.applyFont();
    }

    /**
     * Google Fontを読み込む
     */
    private async loadGoogleFont(fontId: string): Promise<void> {
        const url = GOOGLE_FONTS_URLS[fontId];
        if (!url) {
            console.warn(`No URL found for font ${fontId}`);
            return;
        }

        // すでにlink要素が存在するか確認
        const existingLink = document.querySelector(`link[data-font="${fontId}"]`);
        if (existingLink) {
            this.loadedFonts.add(fontId);
            return;
        }

        return new Promise((resolve, reject) => {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = url;
            link.setAttribute('data-font', fontId);

            link.onload = () => {
                this.loadedFonts.add(fontId);
                console.log(`Font ${fontId} loaded successfully`);
                resolve();
            };

            link.onerror = () => {
                console.error(`Failed to load font ${fontId}`);
                reject(new Error(`Failed to load font ${fontId}`));
            };

            document.head.appendChild(link);
        });
    }

    /**
     * フォントを適用
     */
    private applyFont(): void {
        const fontInfo = JAPANESE_FONTS.find(f => f.value === this.currentFont);
        if (!fontInfo) return;

        const fontFamily = fontInfo.fontFamily;

        // Markdown出力テキストエリアに適用
        if (this.outputElement) {
            this.outputElement.style.fontFamily = fontFamily;
        }

        // HTMLプレビューエリアに適用
        if (this.htmlOutputElement) {
            this.htmlOutputElement.style.fontFamily = fontFamily;
        }

        // 入力エリアにも適用（オプション）
        const inputTextarea = document.getElementById('input') as HTMLTextAreaElement;
        if (inputTextarea) {
            inputTextarea.style.fontFamily = fontFamily;
        }

        console.log(`Font applied: ${this.currentFont} (${fontFamily})`);
    }

    /**
     * 現在のフォントIDを取得
     */
    getCurrentFont(): string {
        return this.currentFont;
    }

    /**
     * フォントをローカルストレージに保存
     */
    saveToStorage(): void {
        try {
            localStorage.setItem('llm-translate-font', this.currentFont);
        } catch (error) {
            console.error('Failed to save font preference:', error);
        }
    }

    /**
     * フォントをローカルストレージから復元
     */
    async loadFromStorage(): Promise<void> {
        try {
            const savedFont = localStorage.getItem('llm-translate-font');
            if (savedFont && JAPANESE_FONTS.some(f => f.value === savedFont)) {
                await this.setFont(savedFont);
            }
        } catch (error) {
            console.error('Failed to load font preference:', error);
        }
    }

    /**
     * すべての読み込み済みフォントをクリア（メモリ節約用）
     */
    clearLoadedFonts(): void {
        // Google Fontsのlink要素を削除
        document.querySelectorAll('link[data-font]').forEach(link => {
            link.remove();
        });

        this.loadedFonts.clear();
        this.loadedFonts.add('default');
        this.currentFont = 'default';
        this.applyFont();
    }
}

export default FontManager;