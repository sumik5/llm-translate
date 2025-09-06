// ==================== PDF Parser Factory ====================
// PDFパーサーインスタンスを作成するファクトリークラス

import type { 
    IPDFParser, 
    IPDFParserFactory,
    PDFParserType, 
    PDFParserInfo 
} from '../types/pdf-parsers.js';
import BuiltInParser from './builtin-parser.js';
import PDFJSParser from './pdfjs-parser.js';
import PDFJSAdvancedParser from './pdfjs-advanced-parser.js';
import UnPDFParser from './unpdf-parser.js';
import { PDFParserUnavailableError } from './base-pdf-parser.js';

/**
 * PDFパーサーファクトリークラス
 * 各種PDFパーサーのインスタンス生成とライフサイクル管理を行う
 */
export class PDFParserFactory implements IPDFParserFactory {
    private static instance: PDFParserFactory | null = null;
    private parserInstances: Map<PDFParserType, IPDFParser> = new Map();
    private availableParsers: PDFParserInfo[] | null = null;

    private constructor() {
        // シングルトンパターン
    }

    /**
     * ファクトリーのシングルトンインスタンスを取得
     */
    static getInstance(): PDFParserFactory {
        if (!PDFParserFactory.instance) {
            PDFParserFactory.instance = new PDFParserFactory();
        }
        return PDFParserFactory.instance;
    }

    /**
     * 利用可能なパーサー一覧を取得
     */
    async getAvailableParsers(): Promise<readonly PDFParserInfo[]> {
        if (this.availableParsers) {
            return this.availableParsers;
        }

        const allParsers = await this.getAllParserDefinitions();
        this.availableParsers = [];

        // 各パーサーの利用可能性を確認
        for (const parserDef of allParsers) {
            try {
                const parser = await this.createParserInstance(parserDef.type);
                const isAvailable = await parser.isAvailable();
                
                this.availableParsers.push({
                    ...parserDef,
                    isAvailable
                });
                
            } catch (error) {
                // 利用不可のパーサーも情報として含める
                this.availableParsers.push({
                    ...parserDef,
                    isAvailable: false
                });
                console.warn(`Parser ${parserDef.type} is not available:`, error);
            }
        }

        return this.availableParsers;
    }

    /**
     * 指定されたタイプのパーサーインスタンスを作成
     */
    async createParser(type: PDFParserType): Promise<IPDFParser> {
        // 既存のインスタンスがあればそれを返す（キャッシュ）
        if (this.parserInstances.has(type)) {
            const cachedParser = this.parserInstances.get(type)!;
            const isAvailable = await cachedParser.isAvailable();
            if (isAvailable) {
                return cachedParser;
            } else {
                // 利用不可になったインスタンスはキャッシュから削除
                this.parserInstances.delete(type);
            }
        }

        // 新しいインスタンスを作成
        const parser = await this.createParserInstance(type);
        
        // 利用可能性を確認
        const isAvailable = await parser.isAvailable();
        if (!isAvailable) {
            throw new PDFParserUnavailableError(type, 'Parser is not currently available');
        }

        // キャッシュに保存
        this.parserInstances.set(type, parser);
        return parser;
    }

    /**
     * デフォルトパーサーを取得
     */
    async getDefaultParser(): Promise<IPDFParser> {
        // Built-inを優先的に使用
        try {
            return await this.createParser('builtin');
        } catch (error) {
            console.warn('Built-in parser not available, trying alternatives:', error);
        }
        
        // Built-inが使えない場合はPDF.jsを試す
        try {
            return await this.createParser('pdfjs-dist');
        } catch (error) {
            console.warn('PDF.js parser not available, trying alternatives:', error);
        }

        // 利用可能なパーサーの中から最初のものを使用
        const availableParsers = await this.getAvailableParsers();
        const firstAvailable = availableParsers.find(p => p.isAvailable);
        
        if (!firstAvailable) {
            throw new PDFParserUnavailableError(
                'pdfjs-dist',
                'No PDF parsers are available'
            );
        }

        return await this.createParser(firstAvailable.type);
    }

    /**
     * 指定されたパーサーが利用可能かチェック
     */
    async isParserAvailable(type: PDFParserType): Promise<boolean> {
        try {
            const parser = await this.createParserInstance(type);
            return await parser.isAvailable();
        } catch (error) {
            return false;
        }
    }

    /**
     * 推奨パーサーを取得（用途別）
     */
    async getRecommendedParser(purpose: 'general' | 'ocr' | 'tables' | 'images'): Promise<IPDFParser> {
        const availableParsers = await this.getAvailableParsers();
        const availableTypes = availableParsers
            .filter(p => p.isAvailable)
            .map(p => p.type);

        let recommendedType: PDFParserType;

        switch (purpose) {
            case 'ocr':
                // OCRが必要な場合はpdfjs-advancedを優先
                recommendedType = availableTypes.includes('pdfjs-advanced') ? 'pdfjs-advanced' : 
                                 availableTypes.includes('unpdf') ? 'unpdf' :
                                 'pdfjs-dist';
                break;
            case 'tables':
                // テーブル処理にはpdfjs-advancedを優先
                recommendedType = availableTypes.includes('pdfjs-advanced') ? 'pdfjs-advanced' :
                                 availableTypes.includes('unpdf') ? 'unpdf' :
                                 'pdfjs-dist';
                break;
            case 'images':
                // 画像処理にはPDF.jsを優先
                recommendedType = availableTypes.includes('pdfjs-dist') ? 'pdfjs-dist' :
                                 availableTypes.includes('unpdf') ? 'unpdf' :
                                 'pdfjs-advanced';
                break;
            case 'general':
            default:
                // 一般的な用途にはPDF.jsを優先
                recommendedType = availableTypes.includes('pdfjs-dist') ? 'pdfjs-dist' :
                                 availableTypes.includes('unpdf') ? 'unpdf' :
                                 'pdfjs-advanced';
                break;
        }

        if (!availableTypes.includes(recommendedType)) {
            throw new PDFParserUnavailableError(
                recommendedType,
                `No suitable parser available for ${purpose} purpose`
            );
        }

        return await this.createParser(recommendedType);
    }

    /**
     * 全てのパーサーインスタンスを破棄
     */
    dispose(): void {
        for (const [, parser] of this.parserInstances) {
            if ('dispose' in parser && typeof parser.dispose === 'function') {
                parser.dispose();
            }
        }
        this.parserInstances.clear();
        this.availableParsers = null;
    }

    /**
     * キャッシュされたパーサー情報をリフレッシュ
     */
    async refresh(): Promise<void> {
        this.availableParsers = null;
        this.dispose();
        await this.getAvailableParsers();
    }

    /**
     * パーサーインスタンスを実際に作成
     */
    private async createParserInstance(type: PDFParserType): Promise<IPDFParser> {
        switch (type) {
            case 'builtin':
                return new BuiltInParser();
            
            case 'pdfjs-dist':
                return new PDFJSParser();
            
            case 'pdfjs-advanced':
                return new PDFJSAdvancedParser();
            
            case 'unpdf':
                return new UnPDFParser();
            
            default:
                throw new PDFParserUnavailableError(type, `Unknown parser type: ${type}`);
        }
    }

    /**
     * 全パーサーの定義情報を取得
     */
    private async getAllParserDefinitions(): Promise<PDFParserInfo[]> {
        return [
            {
                type: 'builtin',
                name: 'Built-in Parser',
                description: '標準内蔵PDFパーサー（安定版）',
                features: ['テキスト抽出', '画像抽出', 'レイアウト保持', '見出し検出', 'リスト検出'],
                strengths: ['安定した動作', '画像処理対応', 'バランスの取れた処理', '実績のある実装'],
                limitations: ['OCR未対応', 'テーブル検出は基本的'],
                isAvailable: false, // 後で実際にチェック
                requiresInternet: false
            },
            {
                type: 'pdfjs-dist',
                name: 'PDF.js',
                description: 'Mozilla PDF.jsライブラリを使用した標準パーサー',
                features: ['テキスト抽出', '画像抽出', 'レイアウト保持', 'フォント情報取得', '高速処理'],
                strengths: ['安定した動作', '幅広いPDF対応', 'ブラウザ標準', '軽量'],
                limitations: ['OCR未対応', 'テーブル認識が基本的', '複雑なレイアウトで制限'],
                isAvailable: false, // 後で実際にチェック
                requiresInternet: false
            },
            {
                type: 'pdfjs-advanced',
                name: 'PDF.js Advanced',
                description: 'PDF.jsの高度な機能を使用した拡張パーサー',
                features: ['テキスト抽出', '画像抽出', 'テーブル検出', 'レイアウト解析', 'メタデータ抽出', '注釈処理'],
                strengths: ['高度なレイアウト解析', 'テーブル自動検出', '注釈対応', 'メタデータ完全抽出'],
                limitations: ['処理時間が長い', 'テーブル検出は実験的', 'メモリ使用量が多い'],
                isAvailable: false, // 後で実際にチェック
                requiresInternet: false
            },
            {
                type: 'unpdf',
                name: 'UnPDF',
                description: '軽量・高速なブラウザ対応PDFパーサー',
                features: ['テキスト抽出', 'メタデータ取得', 'ページ別処理', '高速処理', 'AI向け最適化'],
                strengths: ['軽量（ゼロ依存）', '高速処理', 'ブラウザ完全対応', 'シンプルなAPI', 'モダンなコード'],
                limitations: ['画像抽出未対応', 'テーブル検出は基本的', '複雑なレイアウトの制限', 'OCR未対応'],
                isAvailable: false, // 後で実際にチェック
                requiresInternet: false
            }
        ];
    }
}

export default PDFParserFactory;