// ==================== Text Processing Utilities ====================
import { TOKEN_ESTIMATION, REGEX_PATTERNS, UNWANTED_PREFIXES, ERROR_MESSAGES } from './constants.js';
import { TextProtectionUtils, type ProtectedPattern } from './text-protection-utils.js';
// import type { ChunkType } from './types/index.js'; // Unused import commented out

/**
 * Interface for validation result
 */
interface ValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
    metadata: {
        length: number;
        estimatedTokens: number;
        hasContent: boolean;
    };
}

/**
 * Interface for input validation options
 */
interface ValidationOptions {
    readonly minLength?: number;
    readonly maxLength?: number;
    readonly allowEmpty?: boolean;
    readonly maxTokens?: number;
}

/**
 * Text processing utilities class
 */
class TextProcessor {
    /**
     * Validate input text with various constraints
     * @param text - Text to validate
     * @param options - Validation options
     * @returns Validation result object
     */
    static validateInput(text: string, options: ValidationOptions = {}): ValidationResult {
        const {
            minLength = 0,
            maxLength = Infinity,
            allowEmpty = false,
            maxTokens = TOKEN_ESTIMATION.maxChunkSize
        } = options;

        // Validation result object
        const result: ValidationResult = {
            valid: true,
            errors: [],
            warnings: [],
            metadata: {
                length: text.length,
                estimatedTokens: 0,
                hasContent: false
            }
        };

        // Check if empty
        if (!text || text.trim().length === 0) {
            if (!allowEmpty) {
                result.valid = false;
                (result.errors as string[]).push(ERROR_MESSAGES.NO_TEXT);
            }
            return result;
        }

        // Check length constraints
        if (text.length < minLength) {
            result.valid = false;
            (result.errors as string[]).push(`テキストが短すぎます（最小: ${minLength}文字）`);
        }

        if (text.length > maxLength) {
            result.valid = false;
            (result.errors as string[]).push(`テキストが長すぎます（最大: ${maxLength}文字）`);
        }

        // Estimate tokens
        const estimatedTokens = this.estimateTokens(text);
        (result.metadata as any).estimatedTokens = estimatedTokens;
        (result.metadata as any).hasContent = text.trim().length > 0;

        // Check token limit
        if (estimatedTokens > maxTokens) {
            (result.warnings as string[]).push(`推定トークン数が上限を超えています（${estimatedTokens} > ${maxTokens}）。チャンクに分割されます。`);
        }

        return result;
    }

    /**
     * Estimate token count for given text
     * @param text - Text to analyze
     * @param targetLanguage - Target language for translation compression
     * @returns Estimated token count
     */
    static estimateTokens(text: string, targetLanguage: string | null = null): number {
        if (!text) return 0;
        
        // Count Japanese characters
        const japaneseChars = (text.match(REGEX_PATTERNS.JAPANESE_CHARS) || []).length;
        
        // Count English words (not characters)
        const englishWords = (text.match(REGEX_PATTERNS.ENGLISH_WORDS) || []).length;
        
        // For English characters, we need to count the actual characters in English words
        const englishText = text.match(REGEX_PATTERNS.ENGLISH_WORDS) || [];
        const englishCharCount = englishText.join('').length;
        
        // Other characters = total - Japanese - English characters (not words)
        const otherChars = text.length - japaneseChars - englishCharCount;
        
        // Calculate base token count
        let tokenCount = Math.ceil(
            japaneseChars * TOKEN_ESTIMATION.japaneseMultiplier +
            englishWords * TOKEN_ESTIMATION.englishMultiplier +
            otherChars * TOKEN_ESTIMATION.otherMultiplier
        );
        
        // Apply translation compression ratio if target language is specified
        if (targetLanguage) {
            const compressionRatio = this.getTranslationCompressionRatio(text, targetLanguage);
            tokenCount = Math.ceil(tokenCount * compressionRatio);
        }
        
        return tokenCount;
    }
    
    /**
     * Get translation compression ratio based on language pair
     * @param text - Source text
     * @param targetLanguage - Target language
     * @returns Compression ratio
     */
    static getTranslationCompressionRatio(text: string, targetLanguage: string): number {
        // Detect source language (simplified detection)
        const japaneseChars = (text.match(REGEX_PATTERNS.JAPANESE_CHARS) || []).length;
        const totalChars = text.length;
        const isJapaneseSource = (japaneseChars / totalChars) > 0.3;
        
        // Determine compression ratio based on language pair
        if (isJapaneseSource && targetLanguage === '英語') {
            return TOKEN_ESTIMATION.translationCompressionRatio.JA_TO_EN;
        } else if (!isJapaneseSource && targetLanguage === '日本語') {
            return TOKEN_ESTIMATION.translationCompressionRatio.EN_TO_JA;
        }
        
        return TOKEN_ESTIMATION.translationCompressionRatio.DEFAULT;
    }

    /**
     * Pre-process text before translation to protect technical content
     * @param text - Text to protect
     * @returns Protected text and protection metadata
     */
    static preProcessForTranslation(text: string): { protectedText: string; patterns: ProtectedPattern[] } {
        if (!text) {
            return { protectedText: '', patterns: [] };
        }

        const patterns: ProtectedPattern[] = [];
        let protectedText = text;

        // コードブロックを最優先で保護（```で囲まれたブロック）
        let codeBlockId = 1;
        const codeBlockPattern = /```[\w]*\n[\s\S]*?\n```/g;
        protectedText = protectedText.replace(codeBlockPattern, (match) => {
            const placeholder = `[CODEBLOCK${codeBlockId++}]`;
            patterns.push({
                type: 'code_block',
                originalText: match,
                placeholder: placeholder,
                metadata: {}
            });
            return placeholder;
        });

        // インラインコードブロックの保護は複雑になりすぎたため、一旦無効化
        // コードブロック（```）のみを保護し、インラインコードは翻訳時に自然に処理させる

        // テーブル形式（Count\n-------\n     0）を保護
        const simpleTablePattern = /(\n|^)([ \t]*)(Count|generate_series|[\w_]+)\n([ \t]*-{3,})\n([ \t]*\d+(?:\n[ \t]*\d+)*)/gi;

        let tableId = 1000;
        protectedText = protectedText.replace(simpleTablePattern, (match, _leading, _indent, header, separator, data) => {
            const placeholder = `\n[SIMPLETABLE${tableId++}]\n`;
            patterns.push({
                type: 'simple_table',
                originalText: match.startsWith('\n') ? match.substring(1) : match,
                placeholder: placeholder.trim(),
                metadata: { header, separator, data }
            });
            return placeholder;
        });

        // インデント付き数値のみの行を保護
        const indentedNumberPattern = /(^|\n)([ \t]{4,})(\d+)\s*$/gm;
        protectedText = protectedText.replace(indentedNumberPattern, (match, leading, indent, number) => {
            const placeholder = `${leading}[INDENTNUM${number}]`;
            patterns.push({
                type: 'indented_number',
                originalText: match,
                placeholder: placeholder,
                metadata: { indent, number }
            });
            return placeholder;
        });

        return {
            protectedText: protectedText,
            patterns: patterns
        };
    }


    /**
     * Split text into manageable chunks
     * @param text - Text to split
     * @param maxTokens - Maximum tokens per chunk
     * @param targetLanguage - Target language for token estimation
     * @returns Array of text chunks
     */
    static splitTextIntoChunks(text: string, maxTokens: number = TOKEN_ESTIMATION.maxChunkSize, targetLanguage: string | null = null): string[] {
        // Validate input before processing
        const validation = this.validateInput(text, { maxTokens: Infinity });
        if (!validation.valid) {
            throw new Error(validation.errors.join('; '));
        }

        const lines = text.split(/\r?\n/);
        const chunks: string[] = [];
        let currentChunk = '';
        let currentTokens = 0;
        let inCodeBlock = false;
        let codeBlockDepth = 0;
        
        for (const line of lines) {
            const lineTokens = this.estimateTokens(line, targetLanguage);
            const trimmedLine = line.trim();
            
            // Track code block depth to handle nested or multiple code blocks
            if (REGEX_PATTERNS.CODE_BLOCK_START.test(trimmedLine)) {
                codeBlockDepth++;
                inCodeBlock = codeBlockDepth > 0;
            }
            if (REGEX_PATTERNS.CODE_BLOCK_END.test(trimmedLine)) {
                codeBlockDepth = Math.max(0, codeBlockDepth - 1);
                inCodeBlock = codeBlockDepth > 0;
            }
            
            // Check if adding this line would exceed the token limit
            if (currentTokens + lineTokens > maxTokens && currentChunk) {
                // If we're in a code block, we need to be more careful about splitting
                const shouldSplit = !inCodeBlock || 
                                   currentTokens > maxTokens * 0.9 || // Already using 90% of limit
                                   (currentTokens + lineTokens) > maxTokens * 1.2; // Would exceed 120% of limit
                
                if (shouldSplit) {
                    chunks.push(this.finalizeChunk(currentChunk, inCodeBlock));
                    currentChunk = line + '\n';
                    currentTokens = lineTokens;
                } else {
                    // Continue adding to current chunk even though it exceeds limit
                    // This is only for code blocks to keep them together
                    currentChunk += line + '\n';
                    currentTokens += lineTokens;
                }
            } else {
                currentChunk += line + '\n';
                currentTokens += lineTokens;
            }
        }
        
        // Add remaining chunk
        if (currentChunk.trim()) {
            chunks.push(this.finalizeChunk(currentChunk, inCodeBlock));
        }
        
        return chunks;
    }

    /**
     * Finalize chunk by handling unclosed code blocks
     * @param chunk - Raw chunk text
     * @param inCodeBlock - Whether currently in a code block
     * @returns Finalized chunk
     */
    static finalizeChunk(chunk: string, inCodeBlock: boolean): string {
        let finalChunk = chunk.trim();
        
        // Close unclosed code block
        if (inCodeBlock) {
            finalChunk += '\n```';
        }
        
        return finalChunk;
    }

    /**
     * Post-process translated text to clean up formatting and restore protected patterns
     * @param text - Translated text
     * @param protectedPatterns - Patterns that were protected before translation (optional)
     * @returns Cleaned and restored text
     */
    static postProcessTranslation(text: string, protectedPatterns?: ProtectedPattern[]): string {
        if (!text) return text;
        
        // Validate translated text
        const validation = this.validateInput(text, { allowEmpty: true });
        if (!validation.metadata.hasContent) {
            return '';
        }
        
        // Remove prompt text if it appears at the beginning
        // This handles cases where the LLM returns the entire prompt with translation
        let cleanedText = text;
        
        // Check if the text starts with the prompt pattern
        // More aggressive pattern matching for various prompt formats
        const promptPatterns = [
            /^あなたは[^。]*翻訳者です[。\s]*[\s\S]*?(?:原文[:：]|\n\n)/,
            /^[^に]*に翻訳してください[。\s]*[\s\S]*?(?:原文[:：]|\n\n)/,
            /^Markdown形式を保持したまま翻訳[\s\S]*?(?:原文[:：]|\n\n)/,
            // Match instruction list format
            /^[\s\S]*?以下の規則を厳守してください[:：]\s*\n+(?:[0-9]+\.|・|\*|-)[^\n]+(?:\n+(?:[0-9]+\.|・|\*|-)[^\n]+)*\s*\n+/,
            // Match if starts with system prompt and instruction
            /^あなたは[\s\S]*?翻訳してください[\s\S]*?\n\n/
        ];
        
        for (const pattern of promptPatterns) {
            const match = cleanedText.match(pattern);
            if (match) {
                // Extract the actual content after the prompt
                cleanedText = cleanedText.substring(match[0].length).trim();
                break;
            }
        }
        
        // Alternative: if the text contains numbered rules, try to find where content actually starts
        if (cleanedText.includes('以下の規則を厳守してください') || 
            cleanedText.includes('のような前置きは絶対に付けない')) {
            // Find the last instruction line and start from after it
            const lines = cleanedText.split('\n');
            let contentStartIndex = -1;
            
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i]?.trim() || '';
                // Check for typical last instruction patterns
                if (line.includes('前置きは絶対に付けない') ||
                    line.includes('翻訳結果のみを出力') ||
                    (line === '' && i > 0 && lines[i-1]?.includes('絶対に付けない'))) {
                    contentStartIndex = i + 1;
                    // Skip empty lines after instructions
                    while (contentStartIndex < lines.length && lines[contentStartIndex]?.trim() === '') {
                        contentStartIndex++;
                    }
                    break;
                }
            }
            
            if (contentStartIndex > 0 && contentStartIndex < lines.length) {
                cleanedText = lines.slice(contentStartIndex).join('\n');
            }
        }
        
        // Remove unwanted prefixes from constants
        for (const prefix of UNWANTED_PREFIXES) {
            const regex = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*`, 'gim');
            cleanedText = cleanedText.replace(regex, '');
        }
        
        // Remove language labels that might appear at the beginning
        const languageLabels = [
            '日本語:', '日本語：', '英語:', '英語：', 
            '中国語:', '中国語：', '韓国語:', '韓国語：',
            'Japanese:', 'English:', 'Chinese:', 'Korean:',
            'Translation:', '翻訳:'
        ];
        
        for (const label of languageLabels) {
            if (cleanedText.startsWith(label)) {
                cleanedText = cleanedText.substring(label.length).trim();
                break;
            }
        }
        
        const lines = cleanedText.split('\n');
        const processedLines: string[] = [];
        let inCodeBlock = false;
        // let codeBlockBuffer: string[] = [];
        // let codeBlockLanguage = '';
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (!line) continue;
            const trimmedLine = line.trim();
            
            // コードブロックの開始を検出
            if (REGEX_PATTERNS.CODE_BLOCK_START.test(trimmedLine) && !inCodeBlock) {
                // 前の行が空行でない場合は空行を追加
                if (processedLines.length > 0 && processedLines[processedLines.length - 1]?.trim() !== '') {
                    processedLines.push('');
                }
                inCodeBlock = true;
                // codeBlockLanguage = trimmedLine.substring(3).trim();
                // codeBlockBuffer = [];
                processedLines.push(trimmedLine);
            }
            // コードブロックの終了を検出
            else if (REGEX_PATTERNS.CODE_BLOCK_END.test(trimmedLine) && inCodeBlock) {
                inCodeBlock = false;
                processedLines.push('```');
                // 次の行が空行でない場合は空行を追加
                if (i < lines.length - 1 && lines[i + 1]?.trim() !== '') {
                    processedLines.push('');
                }
                // codeBlockBuffer = [];
                // codeBlockLanguage = '';
            }
            // コードブロック内の処理
            else if (inCodeBlock) {
                processedLines.push(line || '');
            }
            // 通常のテキスト処理
            else {
                // 誤ってコードブロック外に出たコードらしき行を検出
                const looksLikeCode = REGEX_PATTERNS.CODE_LIKE_LINE.test(line || '');
                
                if (looksLikeCode && !line?.startsWith('#') && !line?.startsWith('//')) {
                    // コードらしき行が連続している場合、コードブロックとして扱う
                    if (processedLines.length > 0 && processedLines[processedLines.length - 1]?.trim() !== '') {
                        processedLines.push('');
                    }
                    processedLines.push('```');
                    processedLines.push(line || '');
                    inCodeBlock = true;
                } else {
                    processedLines.push(line || '');
                }
            }
        }
        
        // 未閉じのコードブロックがある場合は閉じる
        if (inCodeBlock) {
            processedLines.push('```');
            processedLines.push('');
        }
        
        // 連続する空行を削除（コードブロック外のみ）
        const finalLines: string[] = [];
        let prevWasEmpty = false;
        let inCode = false;
        
        for (const line of processedLines) {
            if (line.trim().startsWith('```')) {
                inCode = !inCode;
                finalLines.push(line);
                prevWasEmpty = false;
            } else if (inCode) {
                finalLines.push(line);
                prevWasEmpty = false;
            } else {
                const isEmpty = line.trim() === '';
                if (!(isEmpty && prevWasEmpty)) {
                    finalLines.push(line);
                }
                prevWasEmpty = isEmpty;
            }
        }
        
        let result = finalLines.join('\n');
        
        // 連続する```を修正
        result = result.replace(/```\s*\n\s*```/g, '```\n\n```');
        
        // 最終的なクリーンアップ
        result = result.trim();
        
        // 保護されたパターンがある場合は復元
        if (protectedPatterns && protectedPatterns.length > 0) {
            const restoreResult = TextProtectionUtils.restorePatterns(result, protectedPatterns);
            result = restoreResult.restoredText;
            
            // デバッグ用：復元された数を確認（実際のプロダクトでは削除可能）
            if (restoreResult.restoredCount > 0) {
                console.debug(`Restored ${restoreResult.restoredCount} protected patterns`);
            }
        }
        
        return result;
    }

    /**
     * Detect the primary language of text
     * @param text - Text to analyze
     * @returns Detected language ('japanese', 'english', 'other', or 'unknown')
     */
    static detectLanguage(text: string): string {
        // Simple language detection based on character ratio
        const japaneseChars = (text.match(REGEX_PATTERNS.JAPANESE_CHARS) || []).length;
        const englishWords = (text.match(REGEX_PATTERNS.ENGLISH_WORDS) || []).length;
        const totalLength = text.length;
        
        if (totalLength === 0) return 'unknown';
        
        const japaneseRatio = japaneseChars / totalLength;
        const englishRatio = englishWords / totalLength;
        
        if (japaneseRatio > 0.3) return 'japanese';
        if (englishRatio > 0.5) return 'english';
        
        return 'other';
    }

    /**
     * Sanitize text by removing control characters
     * @param text - Text to sanitize
     * @returns Sanitized text
     */
    static sanitizeText(text: string): string {
        if (!text) return '';
        
        // Remove control characters except newlines and tabs
        // eslint-disable-next-line no-control-regex
        let sanitized = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
        
        // Normalize whitespace
        sanitized = sanitized.replace(/\r\n/g, '\n'); // Windows to Unix line endings
        sanitized = sanitized.replace(/\r/g, '\n');   // Mac to Unix line endings
        
        return sanitized;
    }
}

export default TextProcessor;