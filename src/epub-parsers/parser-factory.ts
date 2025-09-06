// ==================== EPUB Parser Factory ====================
// EPUBパーサーインスタンスを作成するファクトリークラス

import type { 
    IEPUBParser, 
    IEPUBParserFactory,
    EPUBParserType, 
    EPUBParserInfo 
} from '../types/epub-parsers.js';
import BuiltInEPUBParser from './builtin-parser.js';
import LingoTurndownParser from './lingo-turndown-parser.js';
import EPUBJSParser from './epubjs-parser.js';
import { EPUBParserUnavailableError } from './base-epub-parser.js';

/**
 * EPUBパーサーファクトリークラス
 * 各種EPUBパーサーのインスタンス生成とライフサイクル管理を行う
 */
export class EPUBParserFactory implements IEPUBParserFactory {
    private static instance: EPUBParserFactory | null = null;
    private parserInstances: Map<EPUBParserType, IEPUBParser> = new Map();
    private availableParsers: EPUBParserInfo[] | null = null;

    private constructor() {
        // シングルトンパターン
    }

    /**
     * ファクトリーのシングルトンインスタンスを取得
     */
    static getInstance(): EPUBParserFactory {
        if (!EPUBParserFactory.instance) {
            EPUBParserFactory.instance = new EPUBParserFactory();
        }
        return EPUBParserFactory.instance;
    }

    /**
     * 利用可能なパーサー一覧を取得
     */
    async getAvailableParsers(): Promise<readonly EPUBParserInfo[]> {
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
    async createParser(type: EPUBParserType): Promise<IEPUBParser> {
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
            throw new EPUBParserUnavailableError(type, 'Parser is not currently available');
        }

        // キャッシュに保存
        this.parserInstances.set(type, parser);
        return parser;
    }

    /**
     * デフォルトパーサーを取得
     */
    async getDefaultParser(): Promise<IEPUBParser> {
        // Built-inを優先的に使用
        try {
            return await this.createParser('builtin');
        } catch (error) {
            console.warn('Built-in EPUB parser not available, trying alternatives:', error);
        }
        
        // Built-inが使えない場合はLingoを試す
        try {
            return await this.createParser('lingo-turndown');
        } catch (error) {
            console.warn('Lingo + Turndown parser not available, trying alternatives:', error);
        }
        
        // 最後にepub.jsを試す
        try {
            return await this.createParser('epubjs');
        } catch (error) {
            console.warn('epub.js parser not available:', error);
        }

        // 利用可能なパーサーの中から最初のものを使用
        const availableParsers = await this.getAvailableParsers();
        const firstAvailable = availableParsers.find(p => p.isAvailable);
        
        if (!firstAvailable) {
            throw new EPUBParserUnavailableError(
                'builtin',
                'No EPUB parsers are available'
            );
        }

        return await this.createParser(firstAvailable.type);
    }

    /**
     * 指定されたパーサーが利用可能かチェック
     */
    async isParserAvailable(type: EPUBParserType): Promise<boolean> {
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
    async getRecommendedParser(purpose: 'general' | 'speed' | 'quality' | 'compatibility'): Promise<IEPUBParser> {
        const availableParsers = await this.getAvailableParsers();
        const availableTypes = availableParsers
            .filter(p => p.isAvailable)
            .map(p => p.type);

        let recommendedType: EPUBParserType;

        switch (purpose) {
            case 'speed':
                // 高速処理重視
                recommendedType = availableTypes.includes('builtin') ? 'builtin' :
                                 availableTypes.includes('epubjs') ? 'epubjs' :
                                 'lingo-turndown';
                break;
            case 'quality':
                // 高品質変換重視
                recommendedType = availableTypes.includes('lingo-turndown') ? 'lingo-turndown' :
                                 availableTypes.includes('builtin') ? 'builtin' :
                                 'epubjs';
                break;
            case 'compatibility':
                // 互換性重視
                recommendedType = availableTypes.includes('builtin') ? 'builtin' :
                                 availableTypes.includes('lingo-turndown') ? 'lingo-turndown' :
                                 'epubjs';
                break;
            case 'general':
            default:
                // 一般的な用途にはLingoを優先（最も推奨）
                recommendedType = availableTypes.includes('lingo-turndown') ? 'lingo-turndown' :
                                 availableTypes.includes('builtin') ? 'builtin' :
                                 'epubjs';
                break;
        }

        if (!availableTypes.includes(recommendedType)) {
            throw new EPUBParserUnavailableError(
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
    private async createParserInstance(type: EPUBParserType): Promise<IEPUBParser> {
        switch (type) {
            case 'builtin':
                return new BuiltInEPUBParser();
            
            case 'lingo-turndown':
                return new LingoTurndownParser();
            
            case 'epubjs':
                return new EPUBJSParser();
            
            default:
                throw new EPUBParserUnavailableError(type, `Unknown parser type: ${type}`);
        }
    }

    /**
     * 全パーサーの定義情報を取得
     */
    private async getAllParserDefinitions(): Promise<EPUBParserInfo[]> {
        return [
            {
                type: 'builtin',
                name: 'Built-in Parser',
                description: '標準内蔵EPUBパーサー（安定版）',
                features: ['テキスト抽出', '画像抽出', 'レイアウト保持', '見出し検出', 'リスト検出', 'テーブル処理'],
                strengths: ['安定した動作', '画像処理対応', 'バランスの取れた処理', '実績のある実装'],
                limitations: ['処理速度は標準的', '高度なレイアウト解析は限定的'],
                isAvailable: false, // 後で実際にチェック
                requiresInternet: false
            },
            {
                type: 'lingo-turndown',
                name: 'Lingo + Turndown',
                description: '最新EPUB仕様対応の高度なパーサー（最も推奨）',
                features: ['最新EPUB仕様対応', '高品質HTML→Markdown変換', 'TypeScript型安全性', '詳細なメタデータ', '画像抽出対応'],
                strengths: ['最新EPUB仕様フル対応', '高品質な変換結果', 'ブラウザ完全対応', '詳細なメタデータ抽出', '高度な画像処理'],
                limitations: ['処理時間がやや長い', 'メモリ使用量が多い'],
                isAvailable: false, // 後で実際にチェック
                requiresInternet: false
            },
            {
                type: 'epubjs',
                name: 'epub.js + Turndown',
                description: 'EPUB表示特化ライブラリ（軽量・高速）',
                features: ['軽量・高速処理', 'ブラウザ完全対応', '基本的なHTML→Markdown変換', 'メタデータ取得'],
                strengths: ['軽量で高速', 'ブラウザ完全対応', 'EPUB表示に特化', '安定した動作'],
                limitations: ['画像抽出に制限', '高度なレイアウト解析は限定的'],
                isAvailable: false, // 後で実際にチェック
                requiresInternet: false
            }
        ];
    }
}

export default EPUBParserFactory;