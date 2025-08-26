// ==================== Markdown Formatter ====================
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
        
        for (let i = 0; i < lines.length; i++) {
            const currentLine = lines[i] || '';
            const prevLine = i > 0 ? (lines[i - 1] || '') : '';
            const nextLine = i < lines.length - 1 ? (lines[i + 1] || '') : '';
            
            // 各種パターンの判定関数
            const isImagePlaceholder = (line: string) => /^\[\[IMG_\d+\]\]$/.test(line.trim());
            const isHeader = (line: string) => /^#{1,6}\s+/.test(line.trim());
            const isCodeBlock = (line: string) => line.trim().startsWith('```');
            const isListItem = (line: string) => /^\s*\d+\.\s/.test(line) || /^\s*[-*+]\s/.test(line);
            
            // 現在の行のインデントレベルを取得
            const getCurrentIndent = (line: string) => {
                const match = line.match(/^(\s*)/);
                return match && match[1] ? match[1].length : 0;
            };
            
            // リスト項目のインデント調整（marked.jsは4スペースでネストを認識）
            let processedLine = currentLine;
            if (isListItem(currentLine)) {
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
            if (isImagePlaceholder(processedLine) && prevLine.trim() !== '') {
                result.push('');
            }
            
            // ヘッダーの前に空行を追加
            if (isHeader(processedLine) && 
                prevLine.trim() !== '' && 
                !isHeader(prevLine)) {
                result.push('');
            }
            
            // コードブロック開始の前に空行を追加
            if (isCodeBlock(processedLine) && 
                prevLine.trim() !== '' && 
                !isCodeBlock(prevLine)) {
                result.push('');
            }
            
            result.push(processedLine);
            
            // 画像プレースホルダーの後に空行を追加
            if (isImagePlaceholder(processedLine) && nextLine.trim() !== '') {
                result.push('');
            }
            
            // ヘッダーの後に空行を追加
            if (isHeader(processedLine) && 
                nextLine.trim() !== '' && 
                !isHeader(nextLine) &&
                !isListItem(nextLine)) {
                result.push('');
            }
            
            // コードブロック終了の後に空行を追加
            if (isCodeBlock(processedLine) && 
                this.isCodeBlockEnd(lines, i) && 
                nextLine.trim() !== '' && 
                !isCodeBlock(nextLine)) {
                result.push('');
            }
        }
        
        // 連続する空行を最大2つまでに制限
        return result.join('\n').replace(/\n{3,}/g, '\n\n');
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
}