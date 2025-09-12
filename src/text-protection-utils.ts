// ==================== Text Protection Utilities ====================
/**
 * テキスト翻訳時に技術的な内容やテーブル形式データを保護するユーティリティ
 * 翻訳前にこれらのパターンをプレースホルダーで置換し、翻訳後に復元する
 */

export interface ProtectedPattern {
    type: string;
    originalText: string;
    placeholder: string;
    metadata?: Record<string, any>;
}

export interface ProtectionResult {
    protectedText: string;
    patterns: ProtectedPattern[];
    hasProtectedContent: boolean;
}

export interface RestoreResult {
    restoredText: string;
    restoredCount: number;
}

export class TextProtectionUtils {
    private static placeholderCounter = 0;
    
    /**
     * プレースホルダーIDを生成
     */
    private static generatePlaceholderId(): string {
        return `__PROTECTED_${Date.now()}_${++this.placeholderCounter}__`;
    }

    /**
     * SQLクエリ結果のテーブル形式データのパターンを検出
     */
    private static detectTablePatterns(): RegExp[] {
        return [
            // PostgreSQL形式のシンプルなテーブル（例：  Count\n-------\n     0）
            // インデントを含む場合も考慮
            /^([ \t]*\w+(?:[ \t]+\w+)*)\s*\n([ \t]*-{3,})\s*\n([ \t]*(?:\d+|[\w\s]+))$/gm,
            
            // より一般的なテーブル形式（複数行のデータを含む）
            /^([ \t]*\w+(?:[ \t]+\w+)*)\s*\n([ \t]*-{3,})\s*\n((?:[ \t]*.*\n?)+?)(?=\n\n|\n*$)/gm,
            
            // MySQL形式のテーブル
            /^\+[-+]+\+\s*\n\|[^|]*\|\s*\n\+[-+]+\+\s*\n(?:\|[^|]*\|\s*\n)*\+[-+]+\+$/gm,
            
            // 一般的なテーブル形式（ヘッダー、区切り線、データ行）
            /^(.+)\n(\s*[=\-_]{3,}\s*)\n((?:.+\n?)+?)(?=\n\n|\n*$)/gm,
            
            // 縦棒区切りのテーブル
            /^(\s*\|[^|\n]*\|\s*\n)(\s*\|[\s\-=:]*\|\s*\n)((?:\s*\|[^|\n]*\|\s*\n?)+)$/gm,
            
            // 複数カラムのテーブル（スペース区切り）
            /^([ \t]*\w+(?:[ \t]+\w+)+)\s*\n([ \t]*-{3,}(?:[ \t]+-{3,})*)\s*\n((?:[ \t]*[\w\d]+(?:[ \t]+[\w\d]+)*\s*\n?)+)$/gm
        ];
    }

    /**
     * 技術文書のパターンを検出
     */
    private static detectTechnicalPatterns(): RegExp[] {
        return [
            // 関数シグネチャ（例：generate_series (start integer, stop integer [, step integer])）
            /\b\w+\s*\([^)]*\)\s*(?:→\s*[\w\s<>[\],]+)?/g,
            
            // SQL関数定義
            /\b\w+\s*\([^)]*\)(?:\s*RETURNS?\s+[\w\s<>[\],]+)?/gi,
            
            // 戻り値表記（例：→ setof integer）
            /→\s*[\w\s<>[\],]+/g,
            
            // コマンドライン出力（$ や # で始まる行）
            /^[\s]*[$#]\s+.+$/gm,
            
            // ファイルパス
            /(?:[a-zA-Z]:)?(?:\/[\w\-.\s]+)+(?:\.[\w]+)?/g,
            
            // プログラミング言語のキーワードを含む短い行
            /^\s*(?:public|private|protected|static|const|let|var|function|def|class|import|export|from|return|if|else|for|while|try|catch)\s+\w+.*$/gm,
            
            // バージョン番号
            /v?\d+\.\d+(?:\.\d+)?(?:-\w+)?/g,
            
            // URL/URI
            /https?:\/\/[^\s]+/g,
            
            // 設定ファイル形式（key=value）
            /^\s*[\w.]+\s*[=:]\s*.+$/gm,
            
            // ログ出力形式
            /^\[\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2}\].*$/gm,
            
            // IPアドレス
            /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
            
            // ポート番号付きアドレス
            /\b(?:\d{1,3}\.){3}\d{1,3}:\d+\b/g
        ];
    }

    /**
     * コードブロック内の内容を検出して保護
     */
    private static detectCodeBlocks(): RegExp[] {
        return [
            // フェンスされたコードブロック
            /```[\w]*\n[\s\S]*?\n```/gm,
            
            // インラインコード
            /`[^`\n]+`/g,
            
            // インデントされたコードブロック（4スペース以上）
            /(?:^|\n)((?:    .+(?:\n|$))+)/gm
        ];
    }

    /**
     * 数値形式のデータを検出
     */
    private static detectNumericData(): RegExp[] {
        return [
            // 表形式の数値データ
            /^\s*(?:\d+\.?\d*\s*){2,}$/gm,
            
            // 統計データ（括弧付き）
            /\d+\s*\([^)]+\)/g,
            
            // パーセンテージ
            /\d+(?:\.\d+)?%/g,
            
            // 通貨
            /[$¥€£]\s*\d+(?:,\d{3})*(?:\.\d{2})?/g
        ];
    }

    /**
     * シンプルなSQLテーブル形式を検出して保護
     * Count\n-------\n     0 のような形式を確実に検出
     */
    private static protectSimpleTables(text: string, patterns: ProtectedPattern[]): string {
        let protectedText = text;
        
        // より緩いパターンでテーブルを検出
        // スペースやインデントを考慮し、様々な形式に対応
        const tablePatterns = [
            // パターン1: インデント付きのシンプルなテーブル（例：  Count\n-------\n     0）
            /(^|\n)([ \t]*)(\w+(?:[ \t]+\w+)*)\s*\n([ \t]*)-{3,}\s*\n([ \t]*[^\n]+(?:\n|$))/g,
            // パターン2: インデントなしのテーブル
            /(^|\n)(\w+(?:[ \t]+\w+)*)\s*\n-{3,}\s*\n([^\n]+(?:\n|$))/g,
            // パターン3: 複数行データのテーブル
            /(^|\n)([ \t]*)(\w+(?:[ \t]+\w+)*)\s*\n([ \t]*)-{3,}\s*\n((?:[ \t]*[^\n]+\n?)+)/g
        ];
        
        // 各パターンで検出を試みる
        for (const tableRegex of tablePatterns) {
            let match;
            while ((match = tableRegex.exec(text)) !== null) {
                const fullMatch = match[0];
                // 改行で始まる場合は除去してオリジナルテキストとする
                const originalText = fullMatch.startsWith('\n') ? fullMatch.substring(1) : fullMatch;
            
                // 既に保護されている場合はスキップ
                if (originalText.includes('__PROTECTED_')) {
                    continue;
                }
                
                // プレースホルダーで保護
                const placeholder = this.generatePlaceholderId();
                
                patterns.push({
                    type: 'simple_table',
                    originalText: originalText,
                    placeholder: placeholder,
                    metadata: {
                        matchIndex: match.index,
                        fullMatch: fullMatch
                    }
                });
                
                // 元のテキストをプレースホルダーで置換
                // fullMatchの位置で置換（改行を含む場合がある）
                const beforeText = protectedText.substring(0, match.index);
                const afterText = protectedText.substring(match.index + fullMatch.length);
                protectedText = beforeText + (fullMatch.startsWith('\n') ? '\n' : '') + placeholder + afterText;
                
                // regexの位置を調整
                tableRegex.lastIndex = match.index + placeholder.length;
            }
        }
        
        return protectedText;
    }

    /**
     * テキスト内の保護すべきパターンを検出してプレースホルダーで置換
     */
    static protectPatterns(text: string): ProtectionResult {
        const patterns: ProtectedPattern[] = [];
        let protectedText = text;
        let hasProtectedContent = false;

        // まずシンプルなテーブル形式を保護
        protectedText = this.protectSimpleTables(protectedText, patterns);
        if (patterns.length > 0) {
            hasProtectedContent = true;
        }

        // 各種パターンの検出と保護（優先順位順）
        // コードブロックを最初に保護（最も明確なパターン）
        // 次にテーブル形式、最後に技術パターンと数値
        const patternGroups = [
            { type: 'code', regexes: this.detectCodeBlocks() },
            { type: 'table', regexes: this.detectTablePatterns() },
            { type: 'technical', regexes: this.detectTechnicalPatterns() },
            { type: 'numeric', regexes: this.detectNumericData() }
        ];

        for (const group of patternGroups) {
            for (const regex of group.regexes) {
                let match;
                const globalRegex = new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : regex.flags + 'g');
                
                while ((match = globalRegex.exec(protectedText)) !== null) {
                    const originalText = match[0];
                    const placeholder = this.generatePlaceholderId();
                    
                    // 既に保護されているプレースホルダーは除外
                    if (originalText.includes('__PROTECTED_')) {
                        continue;
                    }

                    // 短すぎる一致は除外（誤検出を防ぐ）
                    if (originalText.trim().length < 3) {
                        continue;
                    }

                    patterns.push({
                        type: group.type,
                        originalText,
                        placeholder,
                        metadata: {
                            position: match.index,
                            length: originalText.length,
                            pattern: regex.source
                        }
                    });

                    // プレースホルダーで置換（位置を指定して確実に置換）
                    const beforeText = protectedText.substring(0, match.index);
                    const afterText = protectedText.substring(match.index + originalText.length);
                    protectedText = beforeText + placeholder + afterText;
                    hasProtectedContent = true;
                    
                    // 無限ループを防ぐため、regex実行位置を調整
                    globalRegex.lastIndex = match.index + placeholder.length;
                }
            }
        }

        return {
            protectedText,
            patterns,
            hasProtectedContent
        };
    }

    /**
     * 翻訳後のテキストでプレースホルダーを元の内容に復元
     */
    static restorePatterns(translatedText: string, patterns: ProtectedPattern[]): RestoreResult {
        let restoredText = translatedText;
        let restoredCount = 0;

        // 長いプレースホルダーから順に処理（部分的な置換を防ぐため）
        const sortedPatterns = patterns.sort((a, b) => b.placeholder.length - a.placeholder.length);

        for (const pattern of sortedPatterns) {
            if (restoredText.includes(pattern.placeholder)) {
                restoredText = restoredText.replace(
                    new RegExp(pattern.placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
                    pattern.originalText
                );
                restoredCount++;
            }
        }

        return {
            restoredText,
            restoredCount
        };
    }

    /**
     * 保護されたパターンの統計を取得
     */
    static getProtectionStats(patterns: ProtectedPattern[]): Record<string, number> {
        const stats: Record<string, number> = {};
        
        for (const pattern of patterns) {
            stats[pattern.type] = (stats[pattern.type] || 0) + 1;
        }
        
        return stats;
    }

    /**
     * デバッグ用：保護されたパターンの詳細を表示
     */
    static debugProtectedPatterns(patterns: ProtectedPattern[]): string {
        return patterns.map((pattern, index) => {
            const truncatedOriginal = pattern.originalText.length > 100 
                ? pattern.originalText.substring(0, 100) + '...' 
                : pattern.originalText;
                
            return `${index + 1}. Type: ${pattern.type}\n` +
                   `   Placeholder: ${pattern.placeholder}\n` +
                   `   Original: "${truncatedOriginal}"\n` +
                   `   Length: ${pattern.originalText.length}`;
        }).join('\n\n');
    }

    /**
     * 特定のタイプのパターンのみを保護
     */
    static protectSpecificTypes(text: string, types: string[]): ProtectionResult {
        const fullResult = this.protectPatterns(text);
        
        // 指定されたタイプのみをフィルタ
        const filteredPatterns = fullResult.patterns.filter(p => types.includes(p.type));
        
        // 他のパターンのプレースホルダーを元に戻す
        let filteredText = fullResult.protectedText;
        const excludedPatterns = fullResult.patterns.filter(p => !types.includes(p.type));
        
        for (const pattern of excludedPatterns) {
            filteredText = filteredText.replace(pattern.placeholder, pattern.originalText);
        }
        
        return {
            protectedText: filteredText,
            patterns: filteredPatterns,
            hasProtectedContent: filteredPatterns.length > 0
        };
    }

    /**
     * プレースホルダーカウンターをリセット（テスト用）
     */
    static resetCounter(): void {
        this.placeholderCounter = 0;
    }
}