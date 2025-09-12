// ==================== Markdown Formatter ====================


// Global marked library type - declare outside to avoid conflicts
declare const marked: {
    parse: (src: string) => string;
    setOptions?: (options: any) => void;
    Renderer?: any;
};

interface ImageMatch {
    placeholder: string;
    alt: string;
    src: string;
}

/**
 * Markdown整形のユーティリティクラス
 * 各種ファイルプロセッサーで共通使用される
 */
export class MarkdownFormatter {
    /**
     * マークダウンの空行を適切に配置して整形する
     * @param markdown - 整形対象のマークダウン
     * @returns 整形後のマークダウン
     */
    static ensureProperSpacing(markdown: string): string {
        const lines = markdown.split('\n');
        const result: string[] = [];
        let inCodeBlock = false;
        
        for (let i = 0; i < lines.length; i++) {
            const currentLine = lines[i] || '';
            const prevLine = i > 0 ? (lines[i - 1] || '') : '';
            const nextLine = i < lines.length - 1 ? (lines[i + 1] || '') : '';
            
            // 各種パターンの判定関数
            const isImagePlaceholder = (line: string) => /^\[\[IMG_\d+\]\]$/.test(line.trim());
            const isHeader = (line: string) => /^#{1,6}\s+/.test(line.trim());
            const isCodeBlock = (line: string) => line.trim().startsWith('```');
            const isListItem = (line: string) => /^\s*\d+\.\s/.test(line) || /^\s*[-*+]\s/.test(line);
            
            // コードブロックの開始/終了を追跡
            if (isCodeBlock(currentLine)) {
                inCodeBlock = !inCodeBlock;
            }
            
            // 現在の行のインデントレベルを取得
            const getCurrentIndent = (line: string) => {
                const match = line.match(/^(\s*)/);
                return match && match[1] ? match[1].length : 0;
            };
            
            // リスト項目のインデント調整（marked.jsは4スペースでネストを認識）
            let processedLine = currentLine;
            if (isListItem(currentLine) && !inCodeBlock) {
                const currentIndent = getCurrentIndent(currentLine);
                
                // 2スペースインデントを4スペースに変換（ネストレベルを保持）
                if (currentIndent > 0 && currentIndent % 2 === 0) {
                    const nestLevel = currentIndent / 2;
                    const newIndent = ' '.repeat(nestLevel * 4);
                    processedLine = newIndent + currentLine.trim();
                } else if (currentIndent === 1 || currentIndent === 3) {
                    // 奇数インデントの場合も適切に調整
                    const nestLevel = Math.floor((currentIndent + 1) / 2);
                    const newIndent = ' '.repeat(nestLevel * 4);
                    processedLine = newIndent + currentLine.trim();
                }
            }
            
            // 画像プレースホルダーの前に空行を追加
            if (isImagePlaceholder(processedLine) && prevLine.trim() !== '' && !inCodeBlock) {
                result.push('');
            }
            
            // ヘッダーの前に空行を追加
            if (isHeader(processedLine) && 
                prevLine.trim() !== '' && 
                !isHeader(prevLine) && 
                !inCodeBlock) {
                result.push('');
            }
            
            // コードブロック開始の前に空行を追加（ただし前の行が空行でない場合）
            if (isCodeBlock(processedLine) && 
                prevLine.trim() !== '' && 
                !isCodeBlock(prevLine) && 
                !inCodeBlock) {
                result.push('');
            }
            
            result.push(processedLine);
            
            // 画像プレースホルダーの後に空行を追加
            if (isImagePlaceholder(processedLine) && nextLine.trim() !== '' && !inCodeBlock) {
                result.push('');
            }
            
            // ヘッダーの後に空行を追加
            if (isHeader(processedLine) && 
                nextLine.trim() !== '' && 
                !isHeader(nextLine) &&
                !isListItem(nextLine) && 
                !inCodeBlock) {
                result.push('');
            }
            
            // コードブロック終了の後に空行を追加（次の行が空行でない場合）
            if (isCodeBlock(processedLine) && 
                this.isCodeBlockEnd(lines, i) && 
                nextLine.trim() !== '' && 
                !isCodeBlock(nextLine)) {
                result.push('');
            }
        }
        
        // 連続する空行を制限（ただしコードブロック外のみ）
        return this.limitConsecutiveEmptyLines(result.join('\n'));
    }
    
    /**
     * 連続する空行を制限（コードブロック内は除外）
     * @param text - 処理対象のテキスト
     * @returns 処理後のテキスト
     */
    private static limitConsecutiveEmptyLines(text: string): string {
        const lines = text.split('\n');
        const result: string[] = [];
        let inCodeBlock = false;
        let emptyLineCount = 0;
        
        for (const line of lines) {
            // コードブロックの開始/終了を追跡
            if (line.trim().startsWith('```')) {
                inCodeBlock = !inCodeBlock;
                emptyLineCount = 0;
                result.push(line);
                continue;
            }
            
            // コードブロック内では空行をそのまま保持
            if (inCodeBlock) {
                result.push(line);
                continue;
            }
            
            // コードブロック外での空行制限
            if (line.trim() === '') {
                emptyLineCount++;
                // 最大2つの連続する空行まで許可
                if (emptyLineCount <= 2) {
                    result.push(line);
                }
            } else {
                emptyLineCount = 0;
                result.push(line);
            }
        }
        
        return result.join('\n');
    }
    
    /**
     * コードブロックの終了かどうかを判定
     * @param lines - 全行の配列
     * @param index - 現在の行インデックス
     * @returns 終了の場合true
     */
    private static isCodeBlockEnd(lines: string[], index: number): boolean {
        // 現在の行より前にコードブロック開始があるか確認
        let codeBlockCount = 0;
        for (let i = 0; i <= index; i++) {
            const line = lines[i];
            if (line && line.trim().startsWith('```')) {
                codeBlockCount++;
            }
        }
        // 奇数回なら開始、偶数回なら終了
        return codeBlockCount % 2 === 0;
    }

    /**
     * MarkdownをHTMLに変換
     * @param markdown - 変換対象のMarkdown
     * @returns HTML文字列
     */
    static toHtml(markdown: string): string {
        try {
            const sanitized = this.sanitizeForMarked(markdown);
            const preprocessed = this.preprocessCodeBlocks(sanitized);
            
            if (preprocessed.includes('data:image/') || preprocessed.includes('data:application/octet-stream')) {
                return this.convertBase64ImagesToHtml(preprocessed);
            }
            
            return marked.parse(preprocessed);
        } catch (error) {
            console.error('Markdown parsing error:', error);
            return this.fallbackToPlainText(markdown);
        }
    }

    /**
     * HTMLエスケープ
     * @param text - エスケープ対象のテキスト
     * @returns エスケープ済みテキスト
     */
    static escapeHtml(text: string): string {
        const map: { [key: string]: string } = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, m => map[m] || m);
    }

    /**
     * marked.js用にMarkdownをサニタイズ
     * @param text - サニタイズ対象のテキスト
     * @returns サニタイズ済みテキスト
     */
    static sanitizeForMarked(text: string): string {
        // まず画像プレースホルダーを一時的に保護
        const imagePlaceholders: string[] = [];
        const imageRegex = /\[\[IMG_\d+\]\]/g;
        let match: RegExpExecArray | null;
        while ((match = imageRegex.exec(text)) !== null) {
            imagePlaceholders.push(match[0]);
        }
        
        // 画像プレースホルダーを一時的なマーカーに置換
        let sanitized = text;
        imagePlaceholders.forEach((placeholder, index) => {
            sanitized = sanitized.replace(placeholder, `__IMAGE_PLACEHOLDER_${index}__`);
        });
        
        // lheadingのエラーを防ぐため、問題のあるパターンを事前に処理
        // 行が文字で始まり、次の行が=か-の連続の場合の処理
        sanitized = sanitized.replace(/^(.+)\n(={2,})\s*$/gm, (_match, p1, _p2) => {
            return `# ${p1}\n`;
        });
        sanitized = sanitized.replace(/^(.+)\n(-{2,})\s*$/gm, (_match, p1, _p2) => {
            return `## ${p1}\n`;
        });
        
        // 空行の連続を制限（最大2つまで）
        sanitized = sanitized.replace(/\n{3,}/g, '\n\n');
        
        // 独立した = や - の行を水平線に変換
        sanitized = sanitized.replace(/^\s*(={3,})\s*$/gm, '\n---\n');
        sanitized = sanitized.replace(/^\s*(-{3,})\s*$/gm, '\n---\n');
        
        // 不正な文字を除去
        // eslint-disable-next-line no-control-regex
        sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
        
        // 行末の空白を削除
        sanitized = sanitized.replace(/[ \t]+$/gm, '');
        
        // 画像プレースホルダーを元に戻す
        imagePlaceholders.forEach((placeholder, index) => {
            sanitized = sanitized.replace(`__IMAGE_PLACEHOLDER_${index}__`, placeholder);
        });
        
        return sanitized;
    }

    /**
     * Base64画像をHTMLに変換
     * @param markdown - 変換対象のMarkdown
     * @returns HTML文字列
     */
    private static convertBase64ImagesToHtml(markdown: string): string {
        const imageMatches: ImageMatch[] = [];
        let imageCounter = 0;
        
        const processedMarkdown = markdown.replace(
            /!\[([^\]]*)\]\((data:(?:image\/[^;]+|application\/octet-stream);base64,[^)]+)\)/g,
            (_match, alt, src): string => {
                const placeholder = `<!--IMG_PLACEHOLDER_${imageCounter}-->`;
                imageMatches.push({
                    placeholder,
                    alt: alt || '',
                    src: src
                });
                imageCounter++;
                return placeholder;
            }
        );
        
        let html = marked.parse(processedMarkdown);
        
        imageMatches.forEach(({ placeholder, alt, src }) => {
            const escapedAlt = this.escapeHtml(alt);
            const imgTag = `<img src="${src}" alt="${escapedAlt}" style="max-width: 100%; height: auto; display: block; margin: 10px auto;" />`;
            html = html.replace(placeholder, imgTag);
        });
        
        return html;
    }

    /**
     * プレーンテキストをHTMLに変換（フォールバック）
     * @param text - 変換対象のテキスト
     * @returns HTML文字列
     */
    private static fallbackToPlainText(text: string): string {
        // プレーンテキストをHTMLに変換（改行を保持）
        const escaped = text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
        
        // 段落に分割して表示
        const paragraphs = escaped.split(/\n\n+/);
        return paragraphs.map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('\n');
    }

    /**
     * コードブロックの前処理
     * @param markdown - 処理対象のMarkdown
     * @returns 処理後のMarkdown
     */
    private static preprocessCodeBlocks(markdown: string): string {
        const lines = markdown.split('\n');
        const processedLines: string[] = [];
        let inCodeBlock = false;
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (!line) continue;
            
            if (line.trim().startsWith('```')) {
                inCodeBlock = !inCodeBlock;
                processedLines.push(line || '');
                
                if (!inCodeBlock && i < lines.length - 1 && lines[i + 1]?.trim() !== '') {
                    processedLines.push('');
                }
            } else {
                processedLines.push(line || '');
            }
        }
        
        return processedLines.join('\n');
    }
}