// ==================== EPUB Processor ====================
// @ts-expect-error - Import type may have compatibility issues
import { BaseFileProcessor } from './base-file-processor.js?v=20250126';
// @ts-expect-error - Import type may have compatibility issues
import { ERROR_MESSAGES } from './constants.js?v=20250126';
import { MarkdownFormatter } from './markdown-formatter.js';
import EPUBParserFactory from './epub-parsers/parser-factory.js';
import EPUBParserSelector from './epub-parser-selector.js';
import type { 
    ProcessingResult
} from './types/processors.js';
import type { SupportedFileType, FileInfo } from './types/core.js';
import type { 
    EPUBParserOptions,
    EPUBParserSelection
} from './types/epub-parsers.js';
import type { ImageManager } from './image-manager.js';

/**
 * EPUB形式のファイルを処理するプロセッサー
 * 複数のEPUBパーサーライブラリから選択して解析を行う
 */
class EPUBProcessor extends BaseFileProcessor {
    private imageManager: ImageManager | null;
    private parserFactory: EPUBParserFactory;
    private parserSelector: EPUBParserSelector;
    
    readonly supportedTypes: readonly SupportedFileType[] = ['epub'];

    constructor() {
        super();
        this.imageManager = null;
        this.parserFactory = EPUBParserFactory.getInstance();
        this.parserSelector = new EPUBParserSelector();
    }

    /**
     * マークダウンを正規化
     * @param content - 正規化対象のマークダウン
     */
    normalizeMarkdown(content: string): string {
        // Fix misplaced language identifiers after closing code blocks
        let normalized = this.fixMisplacedCodeBlockLanguages(content);
        return MarkdownFormatter.ensureProperSpacing(normalized);
    }

    /**
     * Fix language identifiers that appear after closing ``` tags
     * @param content - Markdown content with possible misplaced language identifiers
     * @returns Fixed markdown content
     */
    private fixMisplacedCodeBlockLanguages(content: string): string {
        // Pattern to match ``` followed by a language identifier on the same or next line
        // This happens when EPUB parsers incorrectly place language info
        const lines = content.split('\n');
        const fixed: string[] = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i] || '';
            const nextLine = lines[i + 1];

            // Check if current line ends with ``` followed by language
            const closingWithLang = line.match(/```(\w+)$/);
            if (closingWithLang) {
                // Remove the language identifier from closing tag
                fixed.push(line.replace(/```\w+$/, '```'));
                continue;
            }

            // Check if line is just ``` and next line is a single word (likely language)
            if (line.trim() === '```' && nextLine && /^[a-z]+$/i.test(nextLine.trim())) {
                // This might be a closing tag followed by misplaced language
                // Check if the line after is not code-like
                const lineAfterNext = lines[i + 2];
                if (!lineAfterNext || lineAfterNext.trim() === '' || /^[#*\-\s]/.test(lineAfterNext)) {
                    // Skip the language line
                    fixed.push(line);
                    i++; // Skip next line
                    continue;
                }
            }

            fixed.push(line);
        }

        return fixed.join('\n');
    }

    /**
     * EPUBファイルを解析してMarkdownテキストに変換
     * @param arrayBuffer - EPUBファイルのバイナリデータ
     * @param fileInfo - ファイル情報（オプション）
     * @param forceParserSelection - パーサー選択を強制するかどうか
     * @returns 処理結果
     */
    async parse(
        arrayBuffer: ArrayBuffer, 
        fileInfo?: FileInfo, 
        forceParserSelection: boolean = false
    ): Promise<ProcessingResult> {
        try {
            // パーサーの選択
            const parserSelection = await this.selectParser(forceParserSelection);
            
            if (!parserSelection) {
                throw new Error('EPUB parser selection was cancelled');
            }
            
            // 選択されたパーサーでEPUBを解析
            const parser = await this.parserFactory.createParser(parserSelection.parser);
            const result = await parser.parse(arrayBuffer, parserSelection.options);
            
            // ImageManagerを取得
            this.imageManager = parser.getImageManager();

            // Fix and normalize the content
            const normalizedContent = this.normalizeMarkdown(result.content);

            // ProcessingResult形式に変換
            return {
                content: normalizedContent,
                metadata: {
                    originalName: fileInfo?.name || 'unknown.epub',
                    fileType: 'epub',
                    size: fileInfo?.size || arrayBuffer.byteLength,
                    characterCount: result.content.length,
                    processingTime: result.processingTime || 0,
                    // EPUBメタデータも含める
                    ...result.metadata
                }
            };
            
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            throw new Error(`${ERROR_MESSAGES.EPUB_PARSE_ERROR}: ${errorMessage}`);
        }
    }

    /**
     * パーサーを選択する
     * @param _forceSelection - 選択を強制するかどうか（現在は常にポップアップを表示）
     */
    private async selectParser(_forceSelection: boolean = false): Promise<EPUBParserSelection | null> {
        // 常にユーザーに選択させる
        // 利用可能なパーサーを取得
        const availableParsers = [...await this.parserFactory.getAvailableParsers()];
        
        if (availableParsers.length === 0) {
            throw new Error('No EPUB parsers are available');
        }
        
        // パーサー選択ダイアログを常に表示（デフォルトは最も推奨のLingo）
        return await this.parserSelector.showSelector(availableParsers, 'lingo-turndown');
    }

    /**
     * ファイルタイプをサポートしているかチェック
     * @param fileType - チェック対象のファイルタイプ
     */
    supportsType(fileType: SupportedFileType): boolean {
        return this.supportedTypes.includes(fileType);
    }

    /**
     * 章を個別に抽出
     * @param arrayBuffer - EPUBファイル内容
     */
    async extractChapters(arrayBuffer: ArrayBuffer): Promise<any[]> {
        try {
            // デフォルトパーサーを使用してチャプター抽出
            const parser = await this.parserFactory.getDefaultParser();
            const result = await parser.parse(arrayBuffer, {
                includeChapterNumbers: true,
                sectionSeparator: 'heading'
            });
            
            // 簡易的にチャプターを分割（実際の実装では各パーサーがチャプター情報を提供）
            const chapters = result.content.split(/\n## /);
            return chapters.map((content, index) => ({
                id: `chapter-${index + 1}`,
                title: `Chapter ${index + 1}`,
                content: index === 0 ? content : `## ${content}`,
                order: index + 1
            }));
        } catch (error) {
            console.warn('Failed to extract chapters:', error);
            return [];
        }
    }

    /**
     * EPUBファイルのメタデータを抽出
     * @param arrayBuffer - EPUBファイル内容
     */
    async extractMetadata(arrayBuffer: ArrayBuffer): Promise<any> {
        try {
            // デフォルトパーサーを使用してメタデータ抽出
            const parser = await this.parserFactory.getDefaultParser();
            const result = await parser.parse(arrayBuffer, {
                includeMetadata: true,
                extractImages: false
            });
            
            return {
                originalName: 'unknown.epub',
                fileType: 'epub' as const,
                size: arrayBuffer.byteLength,
                characterCount: result.content.length,
                processingTime: result.processingTime || 0,
                ...result.metadata
            };
        } catch (error) {
            console.warn('Failed to extract metadata:', error);
            return {
                originalName: 'unknown.epub',
                fileType: 'epub' as const,
                size: arrayBuffer.byteLength,
                characterCount: 0,
                processingTime: 0
            };
        }
    }
    
    /**
     * プレーンテキストを抽出
     * @param arrayBuffer - EPUBファイル内容
     */
    async extractPlainText(arrayBuffer: ArrayBuffer): Promise<string> {
        try {
            // プレーンテキスト抽出用の設定でパーサーを実行
            const parser = await this.parserFactory.getDefaultParser();
            const options: EPUBParserOptions = {
                extractImages: false,
                includeMetadata: false,
                includeChapterNumbers: false,
                sectionSeparator: 'none',
                footnoteStyle: 'ignore',
                preserveStyles: false
            };
            
            const result = await parser.parse(arrayBuffer, options);
            
            // マークダウン記法を除去してプレーンテキストに変換
            return this.stripMarkdown(result.content);
        } catch (error) {
            console.warn('Failed to extract plain text:', error);
            return '';
        }
    }
    
    /**
     * マークダウン記法を除去してプレーンテキストに変換
     * @param markdown - マークダウンテキスト
     */
    private stripMarkdown(markdown: string): string {
        let text = markdown;
        
        // 見出しマーカーを除去
        text = text.replace(/^#{1,6}\s*/gm, '');
        
        // リストマーカーを除去
        text = text.replace(/^\s*[\*\-\+]\s+/gm, '');
        text = text.replace(/^\s*\d+\.\s+/gm, '');
        
        // リンクを除去
        text = text.replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1');
        
        // 画像を除去
        text = text.replace(/!\[([^\]]*)\]\([^\)]+\)/g, '$1');
        
        // 強調記法を除去
        text = text.replace(/\*\*([^\*]+)\*\*/g, '$1');
        text = text.replace(/\*([^\*]+)\*/g, '$1');
        text = text.replace(/__([^_]+)__/g, '$1');
        text = text.replace(/_([^_]+)_/g, '$1');
        
        // コードブロックを除去
        text = text.replace(/```[\s\S]*?```/g, '');
        text = text.replace(/`([^`]+)`/g, '$1');
        
        // 水平線を除去
        text = text.replace(/^\s*[-*_]{3,}\s*$/gm, '');
        
        // 過剰な空白を正規化
        text = text.replace(/\n{3,}/g, '\n\n');
        text = text.replace(/[ \t]+/g, ' ');
        
        return text.trim();
    }
    
    /**
     * 画像マネージャーを取得（翻訳後の画像復元用）
     */
    getImageManager(): ImageManager | null {
        return this.imageManager;
    }
}

export default EPUBProcessor;