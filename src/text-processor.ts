// ==================== Text Processing Utilities ====================
import { TOKEN_ESTIMATION, REGEX_PATTERNS, UNWANTED_PREFIXES, ERROR_MESSAGES } from './constants.js';
import { TextProtectionUtils, type ProtectedPattern } from './text-protection-utils.js';

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
     * Split text into manageable chunks while preserving semantic units
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

        const semanticUnits = this.identifySemanticUnits(text);
        const chunks: string[] = [];
        let currentChunk = '';
        let currentTokens = 0;

        for (const unit of semanticUnits) {
            const unitTokens = this.estimateTokens(unit.content, targetLanguage);

            // If a single unit exceeds max tokens, it needs special handling
            if (unitTokens > maxTokens) {
                // Finalize current chunk if it has content
                if (currentChunk.trim()) {
                    chunks.push(currentChunk.trim());
                    currentChunk = '';
                    currentTokens = 0;
                }

                // Handle oversized unit based on its type
                if (unit.type === 'paragraph' || unit.type === 'text') {
                    // Split large paragraphs by sentences
                    const splitUnits = this.splitLargeUnit(unit.content, maxTokens, targetLanguage);
                    chunks.push(...splitUnits);
                } else {
                    // For code blocks, tables, and lists, keep them intact even if oversized
                    // This ensures semantic integrity
                    chunks.push(unit.content);
                }
            }
            // Check if adding this unit would exceed the token limit
            else if (currentTokens + unitTokens > maxTokens && currentChunk) {
                // Start a new chunk
                chunks.push(currentChunk.trim());
                currentChunk = unit.content;
                currentTokens = unitTokens;
            } else {
                // Add to current chunk
                if (currentChunk && !currentChunk.endsWith('\n')) {
                    currentChunk += '\n';
                }
                currentChunk += unit.content;
                currentTokens += unitTokens;
            }
        }

        // Add remaining chunk
        if (currentChunk.trim()) {
            chunks.push(currentChunk.trim());
        }

        return chunks;
    }

    /**
     * Identify semantic units in text (paragraphs, code blocks, tables, lists)
     * @param text - Text to analyze
     * @returns Array of semantic units
     */
    private static identifySemanticUnits(text: string): Array<{type: string; content: string}> {
        const units: Array<{type: string; content: string}> = [];
        const lines = text.split(/\r?\n/);
        let currentUnit = '';
        let currentType = 'text';
        let inCodeBlock = false;
        let inTable = false;
        let inList = false;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i] || '';
            const trimmedLine = line.trim();
            const nextLine = lines[i + 1];
            const nextTrimmedLine = nextLine?.trim() || '';

            // Check for code block
            if (REGEX_PATTERNS.CODE_BLOCK_START.test(trimmedLine)) {
                // Handle code block inside list
                if (inList) {
                    currentUnit += '\n' + line;
                } else {
                    // Save current unit if exists
                    if (currentUnit.trim()) {
                        units.push({ type: currentType, content: currentUnit.trim() });
                        currentUnit = '';
                    }
                    inCodeBlock = true;
                    currentType = 'code_block';
                    currentUnit = line || '';
                }
            }
            else if (inCodeBlock) {
                currentUnit += '\n' + line;
                if (REGEX_PATTERNS.CODE_BLOCK_END.test(trimmedLine)) {
                    if (!inList) {
                        units.push({ type: currentType, content: currentUnit.trim() });
                        currentUnit = '';
                        inCodeBlock = false;
                        currentType = 'text';
                    }
                }
            }
            // Check for table (Markdown tables with |)
            else if (line && this.isTableLine(line)) {
                if (!inTable) {
                    // Save current unit and start table
                    if (currentUnit.trim()) {
                        units.push({ type: currentType, content: currentUnit.trim() });
                        currentUnit = '';
                    }
                    inTable = true;
                    currentType = 'table';
                }
                currentUnit += (currentUnit ? '\n' : '') + line;

                // Check if next line is not a table line
                if (!nextLine || !this.isTableLine(nextLine)) {
                    units.push({ type: currentType, content: currentUnit.trim() });
                    currentUnit = '';
                    inTable = false;
                    currentType = 'text';
                }
            }
            // Check for list items
            else if (line && this.isListItem(line)) {
                const currentIndent = this.getListIndentLevel(line);

                if (!inList) {
                    // Save current unit and start list
                    if (currentUnit.trim()) {
                        units.push({ type: currentType, content: currentUnit.trim() });
                        currentUnit = '';
                    }
                    inList = true;
                    currentType = 'list';
                }

                currentUnit += (currentUnit ? '\n' : '') + line;

                // Check if next line continues the list or is indented content (including code blocks)
                const nextIsListItem = nextLine ? this.isListItem(nextLine) : false;
                const nextIndent = nextLine ? this.getListIndentLevel(nextLine) : 0;
                const nextIsIndentedText = nextLine && !nextTrimmedLine && lines[i + 2] &&
                                           (lines[i + 2]?.startsWith('  ') || false);
                const nextIsCodeBlock = nextTrimmedLine && REGEX_PATTERNS.CODE_BLOCK_START.test(nextTrimmedLine);

                // Look ahead for code block closure if next line starts a code block
                let codeBlockEndsInList = false;
                if (nextIsCodeBlock) {
                    let j = i + 2;
                    while (j < lines.length) {
                        if (REGEX_PATTERNS.CODE_BLOCK_END.test(lines[j]?.trim() || '')) {
                            // Check if there's more list content after the code block
                            if (j + 1 < lines.length &&
                                (this.isListItem(lines[j + 1] || '') ||
                                 lines[j + 1]?.startsWith('  '))) {
                                codeBlockEndsInList = true;
                            }
                            break;
                        }
                        j++;
                    }
                }

                if (!nextIsListItem && !nextIsIndentedText && nextTrimmedLine !== '' && !nextIsCodeBlock && !codeBlockEndsInList) {
                    // End of list
                    units.push({ type: currentType, content: currentUnit.trim() });
                    currentUnit = '';
                    inList = false;
                    currentType = 'text';
                } else if (nextIsListItem && Math.abs(nextIndent - currentIndent) > 4) {
                    // Significant indent change might indicate a new list
                    if (nextIndent < currentIndent - 4) {
                        units.push({ type: currentType, content: currentUnit.trim() });
                        currentUnit = '';
                    }
                }
            }
            // Check for headers (Markdown headers with #)
            else if (trimmedLine.match(/^#{1,6}\s+/)) {
                // Save current unit if exists
                if (currentUnit.trim()) {
                    units.push({ type: currentType, content: currentUnit.trim() });
                    currentUnit = '';
                }
                // Headers are treated as single-line units
                units.push({ type: 'header', content: line || '' });
                currentType = 'text';
            }
            // Check for horizontal rules
            else if (trimmedLine.match(/^[-*_]{3,}$/)) {
                // Save current unit if exists
                if (currentUnit.trim()) {
                    units.push({ type: currentType, content: currentUnit.trim() });
                    currentUnit = '';
                }
                units.push({ type: 'hr', content: line || '' });
                currentType = 'text';
            }
            // Check for paragraph breaks (empty lines)
            else if (trimmedLine === '') {
                if (currentUnit.trim() && currentType === 'text') {
                    // End current paragraph
                    units.push({ type: 'paragraph', content: currentUnit.trim() });
                    currentUnit = '';
                } else if (currentUnit.trim()) {
                    currentUnit += '\n' + line;
                }
            }
            // Regular text line
            else {
                // Handle indented content in lists (including code inside lists)
                if (inList && line.startsWith('  ')) {
                    currentUnit += '\n' + line;

                    // Check if this ends the list
                    const nextIsListItem = nextLine ? this.isListItem(nextLine) : false;
                    const nextIsIndented = nextLine ? nextLine.startsWith('  ') : false;

                    if (!nextIsListItem && !nextIsIndented && nextTrimmedLine !== '') {
                        // End of list
                        units.push({ type: currentType, content: currentUnit.trim() });
                        currentUnit = '';
                        inList = false;
                        currentType = 'text';
                    }
                } else {
                    // End list if we hit non-indented text
                    if (inList && !line.startsWith('  ') && trimmedLine !== '') {
                        units.push({ type: currentType, content: currentUnit.trim() });
                        currentUnit = '';
                        inList = false;
                        currentType = 'text';
                    }

                    if (currentType !== 'text' && currentType !== 'paragraph') {
                        if (currentUnit.trim()) {
                            units.push({ type: currentType, content: currentUnit.trim() });
                            currentUnit = '';
                        }
                        currentType = 'text';
                    }
                    currentUnit += (currentUnit ? '\n' : '') + line;
                }
            }
        }

        // Add remaining unit
        if (currentUnit.trim()) {
            const finalType = currentType === 'text' ? 'paragraph' : currentType;
            units.push({ type: finalType, content: currentUnit.trim() });
        }

        return units;
    }

    /**
     * Check if a line is part of a Markdown table
     * @param line - Line to check
     * @returns True if the line is a table line
     */
    private static isTableLine(line: string): boolean {
        // Check for Markdown table patterns
        // Table separator: | --- | --- |
        if (/^\s*\|?\s*:?-+:?\s*\|/.test(line)) {
            return true;
        }
        // Table content: | cell | cell |
        if (/^\s*\|.*\|/.test(line)) {
            return true;
        }
        // Table without outer pipes: cell | cell
        if (line.includes('|') && !line.trim().startsWith('//') && !line.trim().startsWith('#')) {
            const pipes = (line.match(/\|/g) || []).length;
            return pipes >= 1;
        }
        return false;
    }

    /**
     * Check if a line is a list item
     * @param line - Line to check
     * @returns True if the line is a list item
     */
    private static isListItem(line: string): boolean {
        // Check for various list patterns
        // Unordered lists: *, -, +
        if (/^\s*[-*+]\s+/.test(line)) {
            return true;
        }
        // Ordered lists: 1., 1)
        if (/^\s*\d+[.)]\s+/.test(line)) {
            return true;
        }
        // Letter lists: a., a)
        if (/^\s*[a-zA-Z][.)]\s+/.test(line)) {
            return true;
        }
        // Checkbox lists: - [ ], - [x]
        if (/^\s*[-*+]\s*\[[x\s]\]/i.test(line)) {
            return true;
        }
        return false;
    }

    /**
     * Get the indentation level of a list item
     * @param line - List item line
     * @returns Indentation level in spaces
     */
    private static getListIndentLevel(line: string): number {
        const match = line ? line.match(/^(\s*)/) : null;
        return match && match[1] ? match[1].length : 0;
    }

    /**
     * Split a large unit into smaller chunks (for oversized paragraphs)
     * @param content - Content to split
     * @param maxTokens - Maximum tokens per chunk
     * @param targetLanguage - Target language for token estimation
     * @returns Array of split content
     */
    private static splitLargeUnit(content: string, maxTokens: number, targetLanguage: string | null): string[] {
        const chunks: string[] = [];

        // Try to split by sentences first
        const sentences = content.split(/(?<=[.!?。！？])\s+/);
        let currentChunk = '';
        let currentTokens = 0;

        for (const sentence of sentences) {
            const sentenceTokens = this.estimateTokens(sentence, targetLanguage);

            if (sentenceTokens > maxTokens) {
                // Single sentence exceeds limit, need to split by lines or words
                if (currentChunk) {
                    chunks.push(currentChunk.trim());
                    currentChunk = '';
                    currentTokens = 0;
                }

                // Split very long sentence by lines
                const lines = sentence.split(/\n/);
                for (const line of lines) {
                    const lineTokens = this.estimateTokens(line, targetLanguage);
                    if (currentTokens + lineTokens > maxTokens && currentChunk) {
                        chunks.push(currentChunk.trim());
                        currentChunk = line;
                        currentTokens = lineTokens;
                    } else {
                        currentChunk += (currentChunk ? '\n' : '') + line;
                        currentTokens += lineTokens;
                    }
                }
            } else if (currentTokens + sentenceTokens > maxTokens && currentChunk) {
                chunks.push(currentChunk.trim());
                currentChunk = sentence;
                currentTokens = sentenceTokens;
            } else {
                currentChunk += (currentChunk ? ' ' : '') + sentence;
                currentTokens += sentenceTokens;
            }
        }

        if (currentChunk) {
            chunks.push(currentChunk.trim());
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

        // First, fix indentation: convert 4 spaces to 2 spaces for list items
        text = this.fixListIndentation(text);
        
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
                // 番号付きリストやインデントされたリストアイテムかチェック
                const isListItem = /^\s*\d+[.)]\s+/.test(line || '') || // 番号付きリスト
                                  /^\s*[-*+]\s+/.test(line || '') ||     // 箇条書きリスト
                                  /^\s*[a-zA-Z][.)]\s+/.test(line || ''); // アルファベットリスト

                // リストアイテムの場合はそのまま処理（コードブロックとして扱わない）
                if (isListItem) {
                    processedLines.push(line || '');
                } else {
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
     * Fix list indentation by normalizing to 2-space indents per level
     * @param text - Text with potential indentation issues
     * @returns Text with corrected indentation
     */
    private static fixListIndentation(text: string): string {
        if (!text) return text;

        const lines = text.split('\n');
        const fixedLines: string[] = [];

        for (const line of lines) {
            const trimmedLine = line.trim();

            // Skip empty lines
            if (!trimmedLine) {
                fixedLines.push(line);
                continue;
            }

            // Pattern 1: Chapter with section (e.g., "3. 1 Introduction to...")
            // This should NOT be indented
            const chapterMatch = line.match(/^(\s*)(\d+)\.\s+(\d+)\s+([A-Z\u4e00-\u9faf].*)$/);

            // Pattern 2: Section number (e.g., "1. 1.1 Something")
            // This should be indented based on section depth
            const sectionMatch = line.match(/^(\s*)(\d+)\.\s+(\d+\.\d+(?:\.\d+)*)\s+(.+)$/);

            // Pattern 3: Simple numbered list
            const simpleNumberMatch = line.match(/^(\s*)(\d+)\.\s+(.+)$/);

            // Pattern 4: Bullet list
            const bulletMatch = line.match(/^(\s*)([-*+])\s+(.+)$/);

            if (chapterMatch && chapterMatch[2] && chapterMatch[3] && chapterMatch[4]) {
                // Chapter heading - no indent
                const chapterNum = chapterMatch[2];
                const sectionNum = chapterMatch[3];
                const content = chapterMatch[4];
                fixedLines.push(`${chapterNum}. ${sectionNum} ${content}`);
            }
            else if (sectionMatch && sectionMatch[2] && sectionMatch[3] && sectionMatch[4]) {
                // Section with number (e.g., "1. 1.1 Content")
                const listNumber = sectionMatch[2];
                const sectionNumber = sectionMatch[3];
                const content = sectionMatch[4];

                // Determine indent based on section number depth
                const sectionParts = sectionNumber.split('.');
                let indentLevel = 1; // Default to first level

                if (sectionParts.length >= 3) {
                    indentLevel = 2; // Sub-subsection (4 spaces)
                } else if (sectionParts.length === 2) {
                    indentLevel = 1; // Subsection (2 spaces)
                }

                const newSpaces = '  '.repeat(indentLevel);
                fixedLines.push(`${newSpaces}${listNumber}. ${sectionNumber} ${content}`);
            }
            else if (simpleNumberMatch && simpleNumberMatch[2] && simpleNumberMatch[3]) {
                // Simple numbered list - check current indent and normalize
                const currentSpaces = line.match(/^(\s*)/)?.[1] || '';
                const number = simpleNumberMatch[2];
                const content = simpleNumberMatch[3];

                // Normalize indent based on current spacing
                let indentLevel = 0;
                if (currentSpaces.length >= 4) {
                    indentLevel = Math.floor(currentSpaces.length / 4);
                }

                const newSpaces = '  '.repeat(indentLevel);
                fixedLines.push(`${newSpaces}${number}. ${content}`);
            }
            else if (bulletMatch && bulletMatch[2] && bulletMatch[3]) {
                // Bullet list - check current indent and normalize
                const currentSpaces = line.match(/^(\s*)/)?.[1] || '';
                const marker = bulletMatch[2];
                const content = bulletMatch[3];

                // Normalize indent
                let indentLevel = 0;
                if (currentSpaces.length >= 4) {
                    indentLevel = Math.floor(currentSpaces.length / 4);
                }

                const newSpaces = '  '.repeat(indentLevel);
                fixedLines.push(`${newSpaces}${marker} ${content}`);
            }
            else {
                // Not a recognized pattern, keep as is
                fixedLines.push(line);
            }
        }

        return fixedLines.join('\n');
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