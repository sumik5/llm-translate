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
 * プログラミング言語の検出パターン
 */
const LANGUAGE_PATTERNS = [
    { pattern: /^\s*(function|const|let|var|class|import|export)\s/m, lang: 'javascript' },
    { pattern: /^\s*(def|class|import|from)\s/m, lang: 'python' },
    { pattern: /^\s*(public|private|class|interface|package)\s/m, lang: 'java' },
    { pattern: /^\s*(#include|int main|printf|scanf)\s/m, lang: 'c' },
    { pattern: /^\s*(using|namespace|class|struct)\s/m, lang: 'cpp' },
    { pattern: /^\s*(namespace|using|class|public class)\s/m, lang: 'csharp' },
    { pattern: /^\s*(def|class|require|include)\s/m, lang: 'ruby' },
    { pattern: /^\s*(package|import|func|var|type)\s/m, lang: 'go' },
    { pattern: /^\s*(fn|let|mut|struct|impl)\s/m, lang: 'rust' },
    { pattern: /^\s*(function|class|\$\w+|echo)\s/m, lang: 'php' },
    { pattern: /^\s*(SELECT|INSERT|UPDATE|DELETE|CREATE TABLE)\s/im, lang: 'sql' },
    { pattern: /^\s*<(!DOCTYPE|html|head|body|div|span)/im, lang: 'html' },
    { pattern: /^\s*[\w-]+\s*:\s*[\w#-]/m, lang: 'css' },
    { pattern: /^\s*\{[\s\S]*"[\w-]+"\s*:/m, lang: 'json' },
    { pattern: /^\s*<\?xml|<[a-zA-Z][^>]*>/m, lang: 'xml' }
];

/**
 * テキストからプログラミング言語を推定
 */
function detectLanguage(content: string): string {
    for (const { pattern, lang } of LANGUAGE_PATTERNS) {
        if (pattern.test(content)) {
            return lang;
        }
    }
    return '';
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