/**
 * コードブロック検出のためのユーティリティ関数群
 * プログラミング言語の特徴と通常の文章を区別して、
 * より正確にコードブロックを判定する
 */

/**
 * プログラミング言語のキーワード（主要言語の代表的なキーワード）
 */
const PROGRAMMING_KEYWORDS = new Set([
    // JavaScript/TypeScript
    'function', 'const', 'let', 'var', 'class', 'extends', 'import', 'export', 'async', 'await',
    'return', 'if', 'else', 'for', 'while', 'switch', 'case', 'break', 'continue', 'try', 'catch',
    
    // Python
    'def', 'class', 'import', 'from', 'if', 'elif', 'else', 'for', 'while', 'return', 'yield',
    'lambda', 'with', 'as', 'try', 'except', 'finally', 'raise', 'assert', 'global', 'nonlocal',
    
    // Java
    'public', 'private', 'protected', 'static', 'final', 'abstract', 'interface', 'implements',
    'extends', 'package', 'import', 'class', 'void', 'int', 'boolean', 'String', 'ArrayList',
    
    // C/C++
    'int', 'char', 'float', 'double', 'void', 'struct', 'union', 'enum', 'typedef', 'sizeof',
    'malloc', 'free', 'printf', 'scanf', 'include', 'define', 'ifdef', 'ifndef', 'endif',
    
    // C#
    'namespace', 'using', 'public', 'private', 'protected', 'internal', 'static', 'readonly',
    'override', 'virtual', 'abstract', 'sealed', 'partial', 'string', 'int', 'bool', 'var',
    
    // Ruby
    'def', 'class', 'module', 'require', 'include', 'extend', 'attr_accessor', 'attr_reader',
    'attr_writer', 'initialize', 'super', 'self', 'nil', 'true', 'false', 'unless', 'until',
    
    // Go
    'package', 'import', 'func', 'var', 'const', 'type', 'struct', 'interface', 'map', 'chan',
    'go', 'defer', 'select', 'range', 'make', 'new', 'nil', 'true', 'false',
    
    // Rust
    'fn', 'let', 'mut', 'const', 'static', 'struct', 'enum', 'impl', 'trait', 'use', 'mod',
    'pub', 'crate', 'super', 'self', 'Self', 'match', 'if', 'else', 'loop', 'while', 'for',
    
    // PHP
    'function', 'class', 'interface', 'trait', 'namespace', 'use', 'extends', 'implements',
    'public', 'private', 'protected', 'static', 'final', 'abstract', 'const', 'var', 'array',
    
    // SQL
    'SELECT', 'FROM', 'WHERE', 'JOIN', 'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'ALTER', 'DROP',
    'TABLE', 'INDEX', 'VIEW', 'PROCEDURE', 'FUNCTION', 'TRIGGER', 'DATABASE', 'SCHEMA',
    
    // HTML/XML タグ（角括弧なし）
    'html', 'head', 'body', 'div', 'span', 'p', 'h1', 'h2', 'h3', 'img', 'a', 'ul', 'li',
    
    // CSS
    'display', 'position', 'width', 'height', 'margin', 'padding', 'border', 'color', 'background',
    'font-size', 'font-weight', 'text-align', 'flex', 'grid',
]);

/**
 * コード特有の記号とパターン
 */
const CODE_SYMBOLS = [
    /[{}();,]/,                          // プログラミングでよく使われる記号
    /\w+\s*=\s*\w+/,                    // 代入文のパターン
    /\w+\s*\(\s*.*?\s*\)/,              // 関数呼び出しのパターン
    /^\s*\/\/.*$/,                      // コメント（//）
    /^\s*\/\*.*?\*\/$/,                 // コメント（/* */）
    /^\s*#.*$/,                         // コメント（#）
    /^\s*<!--.*?-->$/,                  // HTMLコメント
    /[<>]=?|[!=]==?|\|\||&&/,           // 比較・論理演算子
    /\+\+|--|\+=|-=|\*=|\/=/,           // インクリメント・代入演算子
    /\$\w+/,                            // PHPやShellの変数
    /\w+::\w+/,                         // 名前空間やスタティック呼び出し
    /\w+\.\w+/,                         // オブジェクトのプロパティアクセス
    /\[\s*\d+\s*\]/,                    // 配列インデックス
    /["`']\w*["`']/,                    // 文字列リテラル（単語のみ）
    /^\s*<\/?\w+[^>]*>/,                // HTMLタグ
    /^\s*\{[^}]*\}/,                    // JSONオブジェクト
    /^\s*\[[^\]]*\]/,                   // JSON配列
];

/**
 * 自然言語（日本語・英語）の特徴
 */
const NATURAL_LANGUAGE_PATTERNS = [
    /[。！？]/,                          // 日本語の句読点
    /[.!?]\s*$/,                        // 英語の句読点（行末）
    /、/,                               // 日本語の読点
    /,\s+[A-Z]/,                        // 英語のカンマ+大文字（文の区切り）
    /^\s*[A-Z][a-z]/,                   // 英語の文の開始
    /です$|である$|します$|ます$/,       // 日本語の丁寧語・敬語
    /という|について|において|に関して/,   // 日本語の助詞・接続詞
    /\b(the|a|an|and|or|but|in|on|at|to|for|of|with|by)\b/i, // 英語の基本単語
    /\b(this|that|these|those|such|which|what|where|when|why|how)\b/i, // 英語の指示語・疑問詞
];

/**
 * 文章がコードである可能性を0-1のスコアで判定
 */
export function calculateCodeScore(text: string): number {
    if (!text || text.trim().length === 0) {
        return 0;
    }

    const trimmedText = text.trim();
    let codeScore = 0;
    let naturalScore = 0;

    // プログラミングキーワードの存在をチェック
    const words = trimmedText.split(/\s+/);
    const keywordCount = words.filter(word => 
        PROGRAMMING_KEYWORDS.has(word.toLowerCase()) ||
        PROGRAMMING_KEYWORDS.has(word)
    ).length;
    
    if (keywordCount > 0) {
        codeScore += Math.min(keywordCount * 0.3, 0.6); // 最大0.6まで
    }

    // コード特有のパターンをチェック
    let symbolMatches = 0;
    for (const pattern of CODE_SYMBOLS) {
        if (pattern.test(trimmedText)) {
            symbolMatches++;
        }
    }
    if (symbolMatches > 0) {
        codeScore += Math.min(symbolMatches * 0.15, 0.4); // 最大0.4まで
    }

    // 自然言語パターンをチェック
    let naturalMatches = 0;
    for (const pattern of NATURAL_LANGUAGE_PATTERNS) {
        if (pattern.test(trimmedText)) {
            naturalMatches++;
        }
    }
    if (naturalMatches > 0) {
        naturalScore += Math.min(naturalMatches * 0.2, 0.6); // 最大0.6まで
    }

    // インデントがある場合のボーナススコア（ただし控えめに）
    if (trimmedText !== text) {
        codeScore += 0.1;
    }

    // 短いテキストの場合は自然言語の可能性が高い
    if (trimmedText.length < 10) {
        naturalScore += 0.2;
    }

    // 全て大文字または全て小文字の場合（設定値やコマンドの可能性）
    if (trimmedText === trimmedText.toUpperCase() || trimmedText === trimmedText.toLowerCase()) {
        if (trimmedText.length > 3 && !/\s/.test(trimmedText)) {
            codeScore += 0.15;
        }
    }

    // ファイル拡張子や設定値のパターン
    if (/\.\w{2,4}$/.test(trimmedText) || /^\w+[:=]\w+/.test(trimmedText)) {
        codeScore += 0.2;
    }

    // 最終スコアの計算：コードスコア - 自然言語スコア
    return Math.max(0, Math.min(1, codeScore - naturalScore));
}

/**
 * テキストがコードかどうかを判定（閾値ベース）
 */
export function isLikelyCode(text: string, threshold: number = 0.4): boolean {
    return calculateCodeScore(text) >= threshold;
}

/**
 * インデントがあるテキストに対してより厳格な判定を行う
 */
export function isIndentedCode(text: string): boolean {
    // インデントがない場合はfalse
    if (text.trim() === text) {
        return false;
    }

    // より高い閾値でコード判定
    const score = calculateCodeScore(text);
    
    // インデントがあってもスコアが低い場合は通常の文章と判定
    if (score < 0.3) {
        return false;
    }

    // 長い文章で句読点が多い場合は文章と判定
    const punctuationCount = (text.match(/[。！？.!?、,]/g) || []).length;
    const wordCount = text.trim().split(/\s+/).length;
    
    if (wordCount > 10 && punctuationCount >= wordCount * 0.15) {
        return false;
    }

    return score >= 0.4;
}

/**
 * HTML/XMLコンテンツがコードかどうかを判定
 */
export function isHtmlContentCode(content: string): boolean {
    const trimmedContent = content.trim();
    
    // 空の場合はコードではない
    if (!trimmedContent) {
        return false;
    }

    // HTMLタグそのものの場合は除外
    if (/^<[^>]+>$/.test(trimmedContent)) {
        return false;
    }

    // 短いテキストで自然言語パターンがある場合は文章
    if (trimmedContent.length < 50) {
        for (const pattern of NATURAL_LANGUAGE_PATTERNS) {
            if (pattern.test(trimmedContent)) {
                return false;
            }
        }
    }

    // コードスコアで判定
    return calculateCodeScore(trimmedContent) >= 0.5;
}

/**
 * デバッグ用：判定の詳細情報を取得
 */
export function getCodeDetectionDetails(text: string) {
    const score = calculateCodeScore(text);
    const words = text.trim().split(/\s+/);
    const keywords = words.filter(word => 
        PROGRAMMING_KEYWORDS.has(word.toLowerCase()) ||
        PROGRAMMING_KEYWORDS.has(word)
    );
    
    const symbolMatches = CODE_SYMBOLS.filter(pattern => pattern.test(text));
    const naturalMatches = NATURAL_LANGUAGE_PATTERNS.filter(pattern => pattern.test(text));

    return {
        score,
        isCode: score >= 0.4,
        keywords,
        symbolMatches: symbolMatches.length,
        naturalMatches: naturalMatches.length,
        hasIndent: text.trim() !== text,
        textLength: text.length,
        wordCount: words.length
    };
}