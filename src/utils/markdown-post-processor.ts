/**
 * Markdown後処理ユーティリティ
 * 変換後のMarkdownを整形して、不適切なコードブロックを修正する
 */

import { calculateCodeScore } from './code-detection.js';

/**
 * Markdownコンテンツの後処理オプション
 */
export interface MarkdownPostProcessOptions {
    /** コードブロック検出の閾値（0-1、デフォルト: 0.4） */
    codeThreshold?: number;
    /** 言語の自動検出を行うか */
    autoDetectLanguage?: boolean;
    /** 空のコードブロックを削除するか（注意：正規表現の問題により現在無効） */
    removeEmptyCodeBlocks?: boolean;
    /** 連続するコードブロックを統合するか */
    mergeConsecutiveCodeBlocks?: boolean;
}

/**
 * プログラミング言語の検出パターン（優先順位順）
 */
const LANGUAGE_PATTERNS = [
    // Python - 最も特徴的なパターンから順に
    {
        patterns: [
            /^\s*from\s+[\w.]+\s+import\s+/m,  // from ... import文
            /^\s*@\w+(\([^)]*\))?$/m,           // デコレーター
            /^\s*def\s+\w+\s*\([^)]*\)\s*:/m,   // 関数定義
            /^\s*class\s+\w+(\([^)]*\))?\s*:/m, // クラス定義
            /^\s*if\s+__name__\s*==\s*['"]__main__['"]\s*:/m, // メインガード
            /^\s*(elif|except|finally|yield|lambda|with\s+.+\s+as)\s+/m, // Python固有キーワード
            /print\s*\([^)]*\)/m,               // print関数
            /^\s*"""[\s\S]*?"""/m,              // ドキュメント文字列
        ],
        lang: 'python',
        score: (content: string) => {
            let score = 0;
            if (/from\s+\w+\s+import/.test(content)) score += 3;
            if (/def\s+\w+\s*\([^)]*\)\s*:/.test(content)) score += 3;
            if (/^\s+/m.test(content) && !content.includes('{')) score += 1; // インデントベース
            if (content.includes('self')) score += 2;
            if (content.includes('__')) score += 1;
            return score;
        }
    },

    // JavaScript/TypeScript
    {
        patterns: [
            /^\s*(const|let|var)\s+\w+\s*=/m,   // 変数宣言
            /^\s*function\s+\w+\s*\([^)]*\)\s*\{/m, // 関数定義
            /^\s*async\s+(function|\w+)/m,      // async関数
            /=>\s*\{?/m,                        // アロー関数
            /^\s*class\s+\w+(\s+extends\s+\w+)?\s*\{/m, // クラス定義
            /^\s*(import|export)\s+(\{[^}]*\}|\*|default)/m, // ES6 import/export
            /console\.(log|error|warn)/m,       // console
            /\.(then|catch|finally)\s*\(/m,     // Promise
        ],
        lang: 'javascript',
        score: (content: string) => {
            let score = 0;
            if (/=>\s*\{?/.test(content)) score += 3;
            if (/(const|let|var)\s+\w+\s*=/.test(content)) score += 2;
            if (/function\s*\([^)]*\)\s*\{/.test(content)) score += 2;
            if (content.includes('console.')) score += 2;
            if (content.includes('async') || content.includes('await')) score += 2;
            return score;
        }
    },

    // TypeScript（JavaScriptの後にチェック）
    {
        patterns: [
            /^\s*interface\s+\w+\s*\{/m,        // インターフェース
            /^\s*type\s+\w+\s*=/m,              // 型エイリアス
            /:\s*(string|number|boolean|void|any|unknown|never)/m, // 型注釈
            /^\s*enum\s+\w+\s*\{/m,             // enum
            /<[A-Z]\w*>/,                       // ジェネリクス
        ],
        lang: 'typescript',
        score: (content: string) => {
            let score = 0;
            if (/interface\s+\w+/.test(content)) score += 3;
            if (/:\s*(string|number|boolean)/.test(content)) score += 3;
            if (/type\s+\w+\s*=/.test(content)) score += 2;
            return score;
        }
    },

    // Java
    {
        patterns: [
            /^\s*(public|private|protected)\s+(static\s+)?class\s+/m, // クラス定義
            /^\s*package\s+[\w.]+;/m,           // パッケージ宣言
            /^\s*import\s+[\w.]+;/m,            // import文（セミコロン付き）
            /^\s*(public|private|protected)\s+\w+\s+\w+\s*\([^)]*\)/m, // メソッド定義
            /System\.out\.print/m,              // 標準出力
            /^\s*@\w+(\([^)]*\))?$/m,           // アノテーション
            /\bnew\s+\w+\s*\([^)]*\)/m,         // インスタンス生成
        ],
        lang: 'java',
        score: (content: string) => {
            let score = 0;
            if (/public\s+class/.test(content)) score += 3;
            if (/System\.out/.test(content)) score += 3;
            if (/import\s+[\w.]+;/.test(content)) score += 2;
            if (content.includes(';') && content.includes('{')) score += 1;
            return score;
        }
    },

    // Go
    {
        patterns: [
            /^\s*package\s+\w+$/m,              // パッケージ宣言
            /^\s*import\s+\(/m,                 // 複数import
            /^\s*func\s+(\(\w+\s+\*?\w+\)\s+)?\w+\s*\([^)]*\)/m, // 関数定義
            /^\s*type\s+\w+\s+(struct|interface)\s*\{/m, // 型定義
            /fmt\.Print/m,                      // fmt パッケージ
            /:=\s*/m,                            // 短縮変数宣言
            /^\s*go\s+\w+/m,                    // goroutine
        ],
        lang: 'go',
        score: (content: string) => {
            let score = 0;
            if (/func\s+/.test(content)) score += 3;
            if (/:=/.test(content)) score += 3;
            if (/package\s+\w+$/.test(content)) score += 2;
            if (content.includes('fmt.')) score += 2;
            return score;
        }
    },

    // Ruby
    {
        patterns: [
            /^\s*def\s+\w+(\([^)]*\))?$/m,      // メソッド定義
            /^\s*class\s+\w+(\s*<\s*\w+)?$/m,   // クラス定義
            /^\s*require\s+['"][\w\/]+['"]/m,   // require
            /^\s*attr_(reader|writer|accessor)/m, // 属性
            /^\s*module\s+\w+/m,                // モジュール
            /puts\s+/m,                         // puts
            /^\s*end$/m,                        // end キーワード
        ],
        lang: 'ruby',
        score: (content: string) => {
            let score = 0;
            if (/def\s+\w+/.test(content) && /end$/.test(content)) score += 3;
            if (/require\s+['"]/.test(content)) score += 2;
            if (content.includes('puts')) score += 2;
            return score;
        }
    },

    // 他の言語（簡略化）
    { patterns: [/^\s*#include\s*<\w+>/m, /int\s+main\s*\(/m], lang: 'c' },
    { patterns: [/^\s*using\s+namespace/m, /std::/m, /cout\s*<</m], lang: 'cpp' },
    { patterns: [/^\s*namespace\s+\w+/m, /^\s*using\s+System/m], lang: 'csharp' },
    { patterns: [/^\s*fn\s+\w+/m, /let\s+mut\s+/m, /impl\s+\w+/m], lang: 'rust' },
    { patterns: [/^\s*<\?php/m, /\$\w+\s*=/m, /echo\s+/m], lang: 'php' },
    { patterns: [/^\s*(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\s+/im], lang: 'sql' },
    { patterns: [/^\s*<(!DOCTYPE|html|head|body)/im, /<\/\w+>/m], lang: 'html' },
    { patterns: [/^\s*\{[\s\S]*"[\w-]+"\s*:/m, /^\s*\[[\s\S]*\]$/m], lang: 'json' },
];

/**
 * テキストからプログラミング言語を推定（スコアリング方式）
 */
function detectLanguage(content: string): string {
    const scores: { [key: string]: number } = {};

    // 各言語のスコアを計算
    for (const langDef of LANGUAGE_PATTERNS) {
        let matched = false;

        // パターンマッチング
        if ('patterns' in langDef && Array.isArray(langDef.patterns)) {
            for (const pattern of langDef.patterns) {
                if (pattern.test(content)) {
                    matched = true;
                    scores[langDef.lang] = (scores[langDef.lang] || 0) + 1;
                }
            }
        }

        // スコア関数がある場合は追加スコアを計算
        if (matched && 'score' in langDef && typeof langDef.score === 'function') {
            scores[langDef.lang] = (scores[langDef.lang] || 0) + langDef.score(content);
        }
    }

    // 最高スコアの言語を返す
    let maxScore = 0;
    let detectedLang = '';

    for (const [lang, score] of Object.entries(scores)) {
        if (score > maxScore) {
            maxScore = score;
            detectedLang = lang;
        }
    }

    // Pythonの特別チェック（from ... import がある場合は確実にPython）
    if (/from\s+[\w.]+\s+import\s+/m.test(content)) {
        return 'python';
    }

    return detectedLang;
}

/**
 * インラインコード（段落内のコード）を検出して```で囲む
 */
function detectAndWrapInlineCode(markdown: string, threshold: number): string {
    const lines = markdown.split('\n');
    const result: string[] = [];
    let codeLines: string[] = [];
    let inCodeBlock = false;
    let inFencedBlock = false;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i] || '';
        const trimmedLine = line.trim();

        // 既存のコードブロックの開始/終了を追跡
        if (trimmedLine.startsWith('```')) {
            inFencedBlock = !inFencedBlock;
            result.push(line);
            continue;
        }

        // フェンス内はそのまま
        if (inFencedBlock) {
            result.push(line);
            continue;
        }

        // コード行の判定条件
        const isCodeStart = /^(from\s+[\w.]+\s+import|import\s+[\w.,\s]+|@\w+|def\s+|class\s+)/.test(trimmedLine);
        const isCodeLine = /^(from\s+|import\s+|def\s+|class\s+|@|#|\s+|\w+\s*=|\w+\(|if\s+|for\s+|while\s+|return\s+|print\(|\)\s*$)/.test(trimmedLine) ||
                          /^(graph|convo|result|example_order|AIMessage|HumanMessage|SystemMessage|ToolMessage|StateGraph|ChatOpenAI|tool|order|prompt|msgs|out|full|first|second|tc)/.test((trimmedLine.split(/[\s(=]/)[0] || ''));

        if (isCodeStart && !inCodeBlock) {
            // コードブロック開始
            inCodeBlock = true;
            codeLines = [line];
        } else if (inCodeBlock) {
            if (trimmedLine === '') {
                // 空行はコードブロックに含める
                codeLines.push(line);
            } else if (isCodeLine || (trimmedLine.includes('(') && trimmedLine.includes(')')) || trimmedLine.includes('=') || trimmedLine.includes('{') || trimmedLine.includes('}')) {
                // コード行
                codeLines.push(line);
            } else if (codeLines.length > 2) {
                // コードブロック終了（複数行のコード）
                const codeContent = codeLines.join('\n');
                const score = calculateCodeScore(codeContent);

                if (score >= threshold) {
                    // 言語を検出
                    const lang = detectLanguage(codeContent) || 'python';
                    result.push('```' + lang);
                    result.push(...codeLines);
                    result.push('```');
                } else {
                    // コードとしてのスコアが低い場合はそのまま
                    result.push(...codeLines);
                }

                inCodeBlock = false;
                codeLines = [];
                result.push(line);
            } else {
                // 短いコードブロックはそのまま
                result.push(...codeLines);
                inCodeBlock = false;
                codeLines = [];
                result.push(line);
            }
        } else {
            result.push(line);
        }
    }

    // 残りのコードブロックを処理
    if (inCodeBlock && codeLines.length > 2) {
        const codeContent = codeLines.join('\n');
        const score = calculateCodeScore(codeContent);

        if (score >= threshold) {
            const lang = detectLanguage(codeContent) || 'python';
            result.push('```' + lang);
            result.push(...codeLines);
            result.push('```');
        } else {
            result.push(...codeLines);
        }
    } else if (codeLines.length > 0) {
        result.push(...codeLines);
    }

    return result.join('\n');
}

/**
 * Markdownコンテンツを後処理して品質を向上させる
 */
export function postProcessMarkdown(
    markdown: string,
    options: MarkdownPostProcessOptions = {}
): string {
    const {
        codeThreshold = 0.4,
        autoDetectLanguage = true,
        removeEmptyCodeBlocks = true,
        mergeConsecutiveCodeBlocks = false
    } = options;

    let processed = markdown;

    // 0. インラインコード（from/importから始まる連続したコード）を検出して```で囲む
    processed = detectAndWrapInlineCode(processed, codeThreshold);

    // 1. 空のコードブロックを削除（より包括的に）
    if (removeEmptyCodeBlocks) {
        // 完全に空のコードブロック（言語指定なし）
        processed = processed.replace(/```\n\s*```/g, '');
        // 完全に空のコードブロック（言語指定あり）
        processed = processed.replace(/```[\w-]+\n\s*```/g, '');
        // 空白のみのコードブロック（言語指定なし）
        processed = processed.replace(/```\n[\s\t]*\n```/g, '');
        // 空白のみのコードブロック（言語指定あり）
        processed = processed.replace(/```[\w-]+\n[\s\t]*\n```/g, '');
        // より複雑なパターン（複数の空行を含む）
        processed = processed.replace(/```[\w-]*\n[\s\n]*```/g, (match) => {
            // コードブロック内の内容を確認
            const content = match.replace(/```[\w-]*\n/, '').replace(/\n```$/, '');
            // 空白文字のみかチェック
            if (!content.trim()) {
                return '';
            }
            return match;
        });
    }

    // 2. 不適切なコードブロックを修正
    processed = processed.replace(/```([\w]*)\n([\s\S]*?)\n```/g, (_match, lang, content) => {
        // コードブロック内の末尾の空行を除去（内容の前後のみ）
        const lines = content.split('\n');
        // 先頭の空行を除去
        while (lines.length > 0 && lines[0].trim() === '') {
            lines.shift();
        }
        // 末尾の空行を除去
        while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
            lines.pop();
        }
        
        const cleanedContent = lines.join('\n');
        const trimmedContent = cleanedContent.trim();
        
        // 空の場合はそのまま削除（上のパターンでキャッチしきれない場合）
        if (!trimmedContent) {
            return '';
        }

        // コードスコアを計算
        const score = calculateCodeScore(trimmedContent);
        
        // スコアが閾値を下回る場合は通常のテキストに変換
        if (score < codeThreshold) {
            return '\n\n' + trimmedContent + '\n\n';
        }

        // 言語の自動検出
        if (autoDetectLanguage && !lang) {
            const detectedLang = detectLanguage(trimmedContent);
            if (detectedLang) {
                return '```' + detectedLang + '\n' + cleanedContent + '\n```';
            }
        }

        // コードブロックとして返す（末尾の改行を除去済み）
        return '```' + lang + '\n' + cleanedContent + '\n```';
    });

    // 3. 連続するコードブロックを統合（オプション）
    if (mergeConsecutiveCodeBlocks) {
        processed = processed.replace(/```(\w*)\n([\s\S]*?)\n```\s*\n\s*```(\1)\n([\s\S]*?)\n```/g, 
            (match, lang1, content1, lang2, content2) => {
                if (lang1 === lang2) {
                    return '```' + lang1 + '\n' + content1 + '\n\n' + content2 + '\n```';
                }
                return match;
            });
    }

    // 4. 複数の空行を統一
    processed = processed.replace(/\n\s*\n\s*\n+/g, '\n\n');

    // 5. 不適切な単一行コードブロック（インライン化）
    processed = processed.replace(/```[\w]*\n([^\n]+)\n```/g, (match, content) => {
        const trimmedContent = content.trim();
        
        // 短い内容で明らかに通常のテキストの場合はインライン化
        if (trimmedContent.length < 100 && calculateCodeScore(trimmedContent) < 0.3) {
            return '`' + trimmedContent + '`';
        }
        
        return match;
    });

    // 6. 行末の余分な空白を削除
    processed = processed.replace(/ +$/gm, '');

    // 7. ファイルの最初と最後の余分な空行を削除
    processed = processed.trim();

    return processed;
}

/**
 * コードブロックの統計情報を取得（デバッグ用）
 */
export function getCodeBlockStats(markdown: string) {
    const codeBlocks: Array<{
        content: string;
        language: string;
        score: number;
        lineCount: number;
        charCount: number;
    }> = [];

    markdown.replace(/```([\w]*)\n([\s\S]*?)\n```/g, (match, lang, content) => {
        const trimmedContent = content.trim();
        codeBlocks.push({
            content: trimmedContent,
            language: lang || 'unknown',
            score: calculateCodeScore(trimmedContent),
            lineCount: trimmedContent.split('\n').length,
            charCount: trimmedContent.length
        });
        return match;
    });

    const totalBlocks = codeBlocks.length;
    const likelyCode = codeBlocks.filter(block => block.score >= 0.4).length;
    const likelyText = totalBlocks - likelyCode;
    const avgScore = totalBlocks > 0 
        ? codeBlocks.reduce((sum, block) => sum + block.score, 0) / totalBlocks 
        : 0;

    return {
        totalBlocks,
        likelyCode,
        likelyText,
        avgScore: Math.round(avgScore * 100) / 100,
        blocks: codeBlocks
    };
}

/**
 * 問題のあるコードブロックを特定（デバッグ・分析用）
 */
export function findProblematicCodeBlocks(
    markdown: string, 
    threshold: number = 0.4
): Array<{
    content: string;
    language: string;
    score: number;
    reason: string;
    startIndex: number;
    endIndex: number;
}> {
    const problems: Array<{
        content: string;
        language: string;
        score: number;
        reason: string;
        startIndex: number;
        endIndex: number;
    }> = [];

    markdown.replace(/```([\w]*)\n([\s\S]*?)\n```/g, (match, lang, content, offset) => {
        const trimmedContent = content.trim();
        const score = calculateCodeScore(trimmedContent);
        
        let reason = '';
        if (score < threshold) {
            reason = `コードスコア(${score.toFixed(2)})が閾値(${threshold})を下回っています`;
        } else if (!trimmedContent) {
            reason = '空のコードブロックです';
        } else if (trimmedContent.length < 10 && !/[{}();,=]/.test(trimmedContent)) {
            reason = '短すぎる内容でコード要素が不足しています';
        }

        if (reason) {
            problems.push({
                content: trimmedContent,
                language: lang || 'unknown',
                score,
                reason,
                startIndex: offset,
                endIndex: offset + match.length
            });
        }

        return match;
    });

    return problems;
}