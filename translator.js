// プロンプト設定の読み込み
let promptConfig = null;

// プロンプト設定を読み込む関数
async function loadPromptConfig() {
    // file://プロトコルの場合はCORSエラーになるため、チェック
    const isFileProtocol = window.location.protocol === 'file:';
    
    if (isFileProtocol) {
        console.log('Running from file:// protocol, using default prompts');
        promptConfig = getDefaultPromptConfig();
        // API設定の適用
        if (promptConfig.api && apiUrl) {
            apiUrl.value = promptConfig.api.defaultEndpoint;
        }
        return;
    }
    
    try {
        const response = await fetch('prompts.json');
        if (response.ok) {
            promptConfig = await response.json();
            console.log('Prompt configuration loaded successfully');
            
            // API設定の適用
            if (promptConfig.api && apiUrl) {
                apiUrl.value = promptConfig.api.defaultEndpoint;
            }
        } else {
            console.warn('Could not load prompts.json, using default prompts');
            // フォールバック用のデフォルト設定
            promptConfig = getDefaultPromptConfig();
        }
    } catch (error) {
        console.warn('Error loading prompts.json:', error.message);
        promptConfig = getDefaultPromptConfig();
        // API設定の適用
        if (promptConfig.api && apiUrl) {
            apiUrl.value = promptConfig.api.defaultEndpoint;
        }
    }
}

// デフォルトのプロンプト設定
function getDefaultPromptConfig() {
    return {
        translation: {
            system: "あなたは優秀な翻訳者です。",
            markdown: {
                instruction: `Markdown形式を保持したまま翻訳してください。以下の規則を厳守してください：
1. コードブロック（\`\`\`で囲まれた部分）は開始タグと終了タグを必ず保持する
2. コードブロック内のプログラムコードは変更しない（変数名、関数名、キーワードなど）
3. コードブロック内のコメントと文字列リテラルのみ翻訳する
4. コードブロックは必ず\`\`\`で開始し、\`\`\`で終了する
5. リンク、見出しなどの構造も維持する`,
                template: "{system}\n以下のテキストを{targetLanguage}に翻訳してください。\n{instruction}\n原文の意味を正確に保ち、自然な{targetLanguage}で表現してください。翻訳結果のみを出力し、説明は不要です。\n\n原文:\n{text}\n\n翻訳:"
            },
            plain: {
                instruction: "プレーンテキストとして翻訳してください。",
                template: "{system}\n以下のテキストを{targetLanguage}に翻訳してください。\n{instruction}\n原文の意味を正確に保ち、自然な{targetLanguage}で表現してください。翻訳結果のみを出力し、説明は不要です。\n\n原文:\n{text}\n\n翻訳:"
            }
        },
        api: {
            defaultEndpoint: "http://127.0.0.1:1234",
            temperature: 0.3,
            maxTokens: 16000,
            chunkMaxTokens: 12000
        }
    };
}

// DOM要素の取得
const inputText = document.getElementById('inputText');
const outputText = document.getElementById('outputText');
const targetLang = document.getElementById('targetLang');
const translateBtn = document.getElementById('translateBtn');
const saveHtmlBtn = document.getElementById('saveHtmlBtn');
const inputCharCount = document.getElementById('inputCharCount');
const outputCharCount = document.getElementById('outputCharCount');
const progressInfo = document.getElementById('progressInfo');
const statusMessage = document.getElementById('statusMessage');
const progressFill = document.getElementById('progressFill');
const errorMessage = document.getElementById('errorMessage');
const copyButton = document.getElementById('copyButton');
const isMarkdownCheckbox = document.getElementById('isMarkdown');
const markdownPreview = document.getElementById('markdownPreview');
const fileInput = document.getElementById('fileInput');
const apiUrl = document.getElementById('apiUrl');

let translatedHtml = '';
let originalFileName = null;
let translationChunks = [];
let translatedChunks = [];
let failedChunkIndex = -1;

// ページ読み込み時にプロンプト設定を読み込む
window.addEventListener('DOMContentLoaded', () => {
    loadPromptConfig();
});

// タブ切り替え機能
document.querySelectorAll('.tabs-trigger').forEach(button => {
    button.addEventListener('click', () => {
        const tab = button.dataset.tab;
        
        // すべてのタブボタンとコンテンツを非アクティブに
        document.querySelectorAll('.tabs-trigger').forEach(b => b.dataset.state = '');
        document.querySelectorAll('.tabs-content').forEach(c => c.dataset.state = '');
        
        // クリックされたタブをアクティブに
        button.dataset.state = 'active';
        document.querySelector(`[data-content="${tab}"]`).dataset.state = 'active';
    });
});

// EPUB to Markdown converter class
class EPUBToMarkdown {
    constructor() {
        this.zip = null;
        this.opfPath = null;
        this.opfDir = '';
    }

    async parse(arrayBuffer) {
        this.zip = await JSZip.loadAsync(arrayBuffer);
        
        // Find OPF file
        const containerXml = await this.zip.file('META-INF/container.xml').async('string');
        const parser = new DOMParser();
        const containerDoc = parser.parseFromString(containerXml, 'text/xml');
        const rootfile = containerDoc.querySelector('rootfile');
        this.opfPath = rootfile.getAttribute('full-path');
        this.opfDir = this.opfPath.substring(0, this.opfPath.lastIndexOf('/') + 1);
        
        // Parse OPF
        const opfContent = await this.zip.file(this.opfPath).async('string');
        const opfDoc = parser.parseFromString(opfContent, 'text/xml');
        
        // Get spine (reading order)
        const spine = opfDoc.querySelector('spine');
        const itemrefs = spine.querySelectorAll('itemref');
        
        // Get manifest
        const manifest = {};
        opfDoc.querySelectorAll('manifest item').forEach(item => {
            manifest[item.getAttribute('id')] = {
                href: item.getAttribute('href'),
                mediaType: item.getAttribute('media-type')
            };
        });
        
        // Process content in reading order
        let markdown = '';
        for (const itemref of itemrefs) {
            const idref = itemref.getAttribute('idref');
            const item = manifest[idref];
            if (item && item.mediaType === 'application/xhtml+xml') {
                const contentPath = this.opfDir + item.href;
                const content = await this.zip.file(contentPath).async('string');
                markdown += this.htmlToMarkdown(content) + '\n\n';
            }
        }
        
        return markdown;
    }

    htmlToMarkdown(html) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const body = doc.body;
        const markdown = this.nodeToMarkdown(body).trim();
        return markdown;
    }

    nodeToMarkdown(node) {
        if (node.nodeType === Node.TEXT_NODE) {
            // preタグやcodeタグ内のテキストは空白を保持
            const parent = node.parentElement;
            if (parent && (parent.tagName === 'PRE' || parent.tagName === 'CODE')) {
                return node.textContent;
            }
            return node.textContent.replace(/\s+/g, ' ');
        }
        
        if (node.nodeType !== Node.ELEMENT_NODE) {
            return '';
        }
        
        let markdown = '';
        const tagName = node.tagName.toLowerCase();
        
        switch (tagName) {
            case 'h1': markdown = '# ' + this.getTextContent(node) + '\n\n'; break;
            case 'h2': markdown = '## ' + this.getTextContent(node) + '\n\n'; break;
            case 'h3': markdown = '### ' + this.getTextContent(node) + '\n\n'; break;
            case 'h4': markdown = '#### ' + this.getTextContent(node) + '\n\n'; break;
            case 'h5': markdown = '##### ' + this.getTextContent(node) + '\n\n'; break;
            case 'h6': markdown = '###### ' + this.getTextContent(node) + '\n\n'; break;
            case 'p':
                const text = this.processInlineElements(node);
                if (text.trim()) markdown = text + '\n\n';
                break;
            case 'ul':
            case 'ol':
                markdown = this.processList(node, tagName === 'ol') + '\n';
                break;
            case 'blockquote':
                const quoteContent = this.getChildrenMarkdown(node);
                markdown = quoteContent.split('\n').map(line => '> ' + line).join('\n') + '\n\n';
                break;
            case 'pre':
                // preタグのコード処理を改善
                let code = '';
                let lang = '';
                
                // innerTextまたはtextContentを優先的に使用（これらは正しく空白を保持している）
                if (node.innerText !== undefined) {
                    code = node.innerText;
                } else if (node.textContent) {
                    code = node.textContent;
                } else {
                    // フォールバック：子要素から再帰的に取得
                    code = this.extractTextFromNode(node);
                }
                
                // 言語クラスを取得（最初のcode要素から）
                const firstCode = node.querySelector('code');
                if (firstCode && firstCode.className) {
                    const langMatch = firstCode.className.match(/language-(\w+)/);
                    if (langMatch) {
                        lang = langMatch[1];
                    }
                }
                
                // 言語がある場合は指定、ない場合は空のコードブロック
                markdown = '```' + lang + '\n' + code + '\n```\n\n';
                break;
            case 'code':
                // codeタグが単体で使われている場合（親がpreでない場合）
                const parentTag = node.parentElement ? node.parentElement.tagName.toLowerCase() : '';
                if (parentTag === 'pre') {
                    // preの子要素の場合は親で処理するのでスキップ
                    return '';
                } else if (parentTag === 'p' || parentTag === 'li' || parentTag === 'td') {
                    // インラインコード
                    const codeText = this.extractTextFromNode(node);
                    markdown = '`' + codeText + '`';
                } else {
                    // ブロックレベルのcodeタグ
                    const className = node.className || '';
                    const langMatch = className.match(/language-(\w+)/);
                    const lang = langMatch ? langMatch[1] : '';
                    const codeText = this.extractTextFromNode(node);
                    markdown = '```' + lang + '\n' + codeText + '\n```\n\n';
                }
                break;
            case 'hr': markdown = '---\n\n'; break;
            case 'br': markdown = '  \n'; break;
            case 'strong':
            case 'b': markdown = '**' + this.getTextContent(node) + '**'; break;
            case 'em':
            case 'i': markdown = '*' + this.getTextContent(node) + '*'; break;
            case 'a':
                const href = node.getAttribute('href');
                const linkText = this.getTextContent(node);
                markdown = (href && !href.startsWith('#')) ? 
                    '[' + linkText + '](' + href + ')' : linkText;
                break;
            case 'div':
                // divタグは通常のコンテナとして処理
                // コードブロックはpre/codeタグでのみ処理
                markdown = this.getChildrenMarkdown(node);
                break;
            case 'section':
            case 'article':
                // これらのコンテナ要素は中身を処理
                markdown = this.getChildrenMarkdown(node);
                break;
            case 'span':
                // spanタグは通常のインライン要素として処理
                markdown = this.getChildrenMarkdown(node);
                break;
            case 'tt':  // 等幅フォント（旧式のコード表現）
            case 'kbd': // キーボード入力
            case 'samp': // サンプル出力
            case 'var': // 変数
                // これらはインラインコードとして扱う
                markdown = '`' + this.getTextContent(node) + '`';
                break;
            default:
                // その他のタグは通常の要素として処理
                markdown = this.getChildrenMarkdown(node);
        }
        
        return markdown;
    }

    processInlineElements(node) {
        let result = '';
        for (const child of node.childNodes) {
            if (child.nodeType === Node.TEXT_NODE) {
                result += child.textContent.replace(/\s+/g, ' ');
            } else if (child.nodeType === Node.ELEMENT_NODE) {
                const tag = child.tagName.toLowerCase();
                const text = this.getTextContent(child);
                
                switch (tag) {
                    case 'strong':
                    case 'b': result += '**' + text + '**'; break;
                    case 'em':
                    case 'i': result += '*' + text + '*'; break;
                    case 'code': 
                        // インラインコードのみ処理
                        result += '`' + text + '`'; 
                        break;
                    case 'a':
                        const href = child.getAttribute('href');
                        result += (href && !href.startsWith('#')) ?
                            '[' + text + '](' + href + ')' : text;
                        break;
                    case 'br': result += '  \n'; break;
                    case 'span':
                        // spanタグは特殊な処理が必要な場合があるため、クラスをチェック
                        const className = child.className || '';
                        if (className.includes('code') || className.includes('inline-code')) {
                            result += '`' + text + '`';
                        } else {
                            result += this.processInlineElements(child);
                        }
                        break;
                    default: result += this.processInlineElements(child);
                }
            }
        }
        return result;
    }

    processList(node, isOrdered) {
        let markdown = '';
        const items = node.querySelectorAll(':scope > li');
        items.forEach((item, index) => {
            const prefix = isOrdered ? `${index + 1}. ` : '- ';
            const content = this.processInlineElements(item).trim();
            markdown += prefix + content + '\n';
        });
        return markdown;
    }

    getTextContent(node) {
        return node.textContent.trim().replace(/\s+/g, ' ');
    }

    getChildrenMarkdown(node) {
        let markdown = '';
        for (const child of node.childNodes) {
            markdown += this.nodeToMarkdown(child);
        }
        return markdown;
    }
    
    // コード要素から再帰的にテキストを抽出（空白・改行を保持）
    extractTextFromNode(node, isRoot = true) {
        // innerTextを試す（ただし、これが期待通りに動作しないことがある）
        if (isRoot && node.innerText !== undefined) {
            const innerTextResult = node.innerText;
            // innerTextが適切に空白を含んでいるか確認
            if (innerTextResult && innerTextResult.includes(' ')) {
                return innerTextResult;
            }
        }
        
        let text = '';
        let lastWasElement = false;
        
        for (let i = 0; i < node.childNodes.length; i++) {
            const child = node.childNodes[i];
            
            if (child.nodeType === Node.TEXT_NODE) {
                // テキストノードの場合、そのまま追加
                text += child.textContent;
                lastWasElement = false;
            } else if (child.nodeType === Node.ELEMENT_NODE) {
                const tagName = child.tagName.toLowerCase();
                
                // 要素間に空白を追加する必要があるかチェック
                if (lastWasElement && text && !text.endsWith(' ') && !text.endsWith('\n')) {
                    // 前の要素との間に空白がない場合、追加を検討
                    const currentText = child.textContent.trim();
                    if (currentText && !currentText.match(/^[.,;:)}\]]/)) {
                        // 句読点や閉じ括弧で始まらない場合、空白を追加
                        text += ' ';
                    }
                }
                
                // 改行を表す要素の処理
                if (tagName === 'br') {
                    text += '\n';
                    lastWasElement = false;
                } else if (tagName === 'div' || tagName === 'p') {
                    // ブロック要素の場合、改行を追加
                    if (text && !text.endsWith('\n')) {
                        text += '\n';
                    }
                    text += this.extractTextFromNode(child, false);
                    if (!text.endsWith('\n')) {
                        text += '\n';
                    }
                    lastWasElement = false;
                } else {
                    // その他の要素は再帰的に処理
                    const childText = this.extractTextFromNode(child, false);
                    text += childText;
                    lastWasElement = true;
                }
            }
        }
        
        return text;
    }
}

// PDF to Markdown converter class
class PDFToMarkdown {
    async parse(arrayBuffer) {
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let markdown = '';
        
        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
            const page = await pdf.getPage(pageNum);
            const textContent = await page.getTextContent();
            
            if (pageNum > 1) {
                markdown += '\n\n---\n\n';
            }
            
            markdown += '## Page ' + pageNum + '\n\n';
            markdown += this.processTextContent(textContent);
        }
        
        return markdown;
    }

    processTextContent(textContent) {
        let markdown = '';
        let currentY = null;
        let currentLine = '';
        let previousHeight = 0;
        
        const items = textContent.items;
        
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const y = item.transform[5];
            const height = item.height;
            const text = item.str;
            
            // New line detection
            if (currentY !== null && Math.abs(y - currentY) > 2) {
                if (currentLine.trim()) {
                    // Detect headings based on font size
                    if (previousHeight > 14) {
                        markdown += '### ' + currentLine.trim() + '\n\n';
                    } else {
                        markdown += currentLine.trim() + '\n\n';
                    }
                }
                currentLine = text;
            } else {
                currentLine += text;
            }
            
            currentY = y;
            previousHeight = height;
        }
        
        // Add last line
        if (currentLine.trim()) {
            markdown += currentLine.trim() + '\n\n';
        }
        
        // Clean up markdown
        markdown = markdown.replace(/\n{3,}/g, '\n\n');
        markdown = this.detectAndFormatLists(markdown);
        
        return markdown;
    }

    detectAndFormatLists(text) {
        // Detect bullet points
        text = text.replace(/^[•·▪▫◦‣⁃]\s+(.+)$/gm, '- $1');
        
        // Detect numbered lists
        text = text.replace(/^(\d+)\.\s+(.+)$/gm, '$1. $2');
        
        return text;
    }
}

// Markdown判定関数（より正確な判定）
function isMarkdown(text) {
    // 明確なMarkdownパターンのみを検出
    const strongMarkdownPatterns = [
        /^#{1,6}\s+.+/m,        // 見出し（#の後に内容があることを確認）
        /^\*{3,}$/m,            // 水平線
        /^-{3,}$/m,             // 水平線
        /^[\*\-]\s+.+/m,        // 箇条書き（内容があることを確認）
        /^\d+\.\s+.+/m,         // 番号付きリスト（内容があることを確認）
        /\[([^\]]+)\]\(([^)]+)\)/, // リンク
        /```[\s\S]*?```/,       // コードブロック
        /\*\*[^*]+\*\*/,        // 太字
        /^>\s+.+/m              // 引用（内容があることを確認）
    ];
    
    // 少なくとも2つ以上のMarkdownパターンが含まれている場合のみMarkdownと判定
    let matchCount = 0;
    for (const pattern of strongMarkdownPatterns) {
        if (pattern.test(text)) {
            matchCount++;
            if (matchCount >= 2) {
                return true;
            }
        }
    }
    
    // 明示的なコードブロックが含まれている場合はMarkdown
    if (/```[\s\S]*?```/.test(text)) {
        return true;
    }
    
    return false;
}

// コードブロック検出と処理（現在は無効化）
// ユーザーが明示的に```で囲んだコードブロックのみを処理するため、
// 自動検出機能は無効化しています。
/*
function processCodeBlocks(text) {
    // この関数は無効化されています
    return text;
}

function detectLanguage(text) {
    // この関数は無効化されています
    return '';
}

function formatCodeBlock(code, language) {
    // この関数は無効化されています
    return code;
}
*/

// marked.jsの設定
marked.setOptions({
    breaks: true, // 改行を<br>に変換
    gfm: true, // GitHub Flavored Markdown
    pedantic: false, // 標準的なMarkdown仕様に準拠
    headerIds: false,
    mangle: false,
    sanitize: false,
    smartLists: true,
    smartypants: false,
    xhtml: false,
    // コードブロックのレンダリング設定
    highlight: function(code, lang) {
        // 言語が指定されていない場合は、プレーンテキストとして扱う
        if (!lang) {
            return code;
        }
        // Prism.jsを使用してハイライト
        if (typeof Prism !== 'undefined' && Prism.languages[lang]) {
            try {
                return Prism.highlight(code, Prism.languages[lang], lang);
            } catch (e) {
                console.error('Highlighting error:', e);
                return code;
            }
        }
        return code;
    }
});

// MarkdownをHTMLに変換
function markdownToHtml(markdown) {
    // コードブロックの前処理（終了タグが正しく認識されるように）
    // 連続する```を正しく処理
    const preprocessed = preprocessMarkdownCodeBlocks(markdown);
    const html = marked.parse(preprocessed);
    return html;
}

// Markdownのコードブロックを前処理
function preprocessMarkdownCodeBlocks(markdown) {
    // コードブロックの開始と終了を正しく識別
    const lines = markdown.split('\n');
    let inCodeBlock = false;
    let processedLines = [];
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        // コードブロックの開始または終了を検出
        if (line.trim().startsWith('```')) {
            if (!inCodeBlock) {
                // コードブロック開始
                inCodeBlock = true;
                processedLines.push(line);
            } else {
                // コードブロック終了
                inCodeBlock = false;
                processedLines.push(line);
                // コードブロック終了後に空行を追加（次のコンテンツとの区切り）
                if (i < lines.length - 1 && lines[i + 1].trim() !== '') {
                    processedLines.push('');
                }
            }
        } else {
            processedLines.push(line);
        }
    }
    
    return processedLines.join('\n');
}

// 翻訳結果の後処理
function postProcessTranslation(text) {
    if (!text) return text;
    
    // コードブロックの修復と終了判定を強化
    const lines = text.split('\n');
    let processedLines = [];
    let inCodeBlock = false;
    let codeBlockStartIndex = -1;
    let codeBlockLang = '';
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmedLine = line.trim();
        
        // コードブロックの開始を検出
        if (trimmedLine.startsWith('```') && !inCodeBlock) {
            inCodeBlock = true;
            codeBlockStartIndex = i;
            // 言語指定を保持
            codeBlockLang = trimmedLine.substring(3).trim();
            processedLines.push(line);
        }
        // コードブロックの終了を検出（```のみの行）
        else if ((trimmedLine === '```' || trimmedLine.startsWith('```')) && inCodeBlock && i > codeBlockStartIndex) {
            inCodeBlock = false;
            // 終了タグを確実に```だけにする
            processedLines.push('```');
            // コードブロック後に空行を追加（必要な場合）
            if (i < lines.length - 1 && lines[i + 1].trim() !== '') {
                processedLines.push('');
            }
            codeBlockLang = '';
        }
        // 通常の行
        else {
            processedLines.push(line);
        }
    }
    
    // 未閉じのコードブロックがある場合
    if (inCodeBlock) {
        console.warn('Unclosed code block detected, auto-closing');
        // 自動的に閉じる
        processedLines.push('```');
        processedLines.push('');
    }
    
    // 連続する空行を削減（ただしコードブロック内は除く）
    let finalLines = [];
    let prevWasEmpty = false;
    let inCode = false;
    
    for (const line of processedLines) {
        if (line.trim().startsWith('```')) {
            inCode = !inCode;
            finalLines.push(line);
            prevWasEmpty = false;
        } else if (inCode) {
            // コードブロック内はそのまま保持
            finalLines.push(line);
            prevWasEmpty = false;
        } else {
            // 通常のテキスト部分
            const isEmpty = line.trim() === '';
            if (!(isEmpty && prevWasEmpty)) {
                finalLines.push(line);
            }
            prevWasEmpty = isEmpty;
        }
    }
    
    return finalLines.join('\n');
}

// HTMLプレビューを更新
function updatePreview(text) {
    if (isMarkdownCheckbox.checked && text) {
        try {
            // デバッグ: コードブロックの検出状況を確認
            const codeBlockPattern = /```[\s\S]*?```/g;
            const codeBlocks = text.match(codeBlockPattern);
            if (codeBlocks) {
                console.log('Detected code blocks:', codeBlocks.length);
            }
            
            const html = markdownToHtml(text);
            markdownPreview.innerHTML = html;
            translatedHtml = html;
            
            // Prismでシンタックスハイライト適用
            setTimeout(() => {
                if (typeof Prism !== 'undefined') {
                    Prism.highlightAll();
                }
            }, 0);
        } catch (error) {
            console.error('Markdown parsing error details:', error);
            console.error('Error stack:', error.stack);
            console.error('Input text (first 500 chars):', text.substring(0, 500));
            // エラーの詳細を表示
            markdownPreview.innerHTML = `<div style="color: red; padding: 10px; border: 1px solid red; border-radius: 4px;">
                <strong>プレビューエラー:</strong><br>
                ${error.message || 'Markdown変換中にエラーが発生しました'}<br>
                <small>詳細はコンソールを確認してください</small>
            </div>`;
        }
    } else {
        markdownPreview.innerHTML = text.replace(/\n/g, '<br>');
        translatedHtml = text.replace(/\n/g, '<br>');
    }
}

// 文字数カウントの更新
inputText.addEventListener('input', () => {
    inputCharCount.textContent = `${inputText.value.length}文字`;
    
    // 入力内容からMarkdown形式を自動判定
    if (inputText.value) {
        const detected = isMarkdown(inputText.value);
        isMarkdownCheckbox.checked = detected;
    }
});

// ファイル入力ハンドラー
fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    originalFileName = file.name.replace(/\.[^/.]+$/, '');
    progressInfo.style.display = 'block';
    statusMessage.textContent = 'ファイルを読み込み中...';
    progressFill.style.width = '30%';
    
    try {
        let content = '';
        
        if (file.name.endsWith('.epub')) {
            const arrayBuffer = await file.arrayBuffer();
            const converter = new EPUBToMarkdown();
            statusMessage.textContent = 'EPUBをMarkdownに変換中...';
            progressFill.style.width = '60%';
            content = await converter.parse(arrayBuffer);
            isMarkdownCheckbox.checked = true;
        } else if (file.name.endsWith('.pdf')) {
            const arrayBuffer = await file.arrayBuffer();
            const converter = new PDFToMarkdown();
            statusMessage.textContent = 'PDFをMarkdownに変換中...';
            progressFill.style.width = '60%';
            content = await converter.parse(arrayBuffer);
            isMarkdownCheckbox.checked = true;
        } else if (file.name.endsWith('.txt') || file.name.endsWith('.md')) {
            content = await file.text();
            if (file.name.endsWith('.md')) {
                isMarkdownCheckbox.checked = true;
            } else {
                isMarkdownCheckbox.checked = isMarkdown(content);
            }
        }
        
        inputText.value = content;
        inputCharCount.textContent = `${content.length}文字`;
        progressFill.style.width = '100%';
        statusMessage.textContent = 'ファイル読み込み完了！';
        
        setTimeout(() => {
            progressInfo.style.display = 'none';
        }, 2000);
        
    } catch (error) {
        console.error('File processing error:', error);
        showError('ファイルの処理中にエラーが発生しました: ' + error.message);
        progressInfo.style.display = 'none';
    }
});

// コピー機能
copyButton.addEventListener('click', async () => {
    if (outputText.value) {
        await navigator.clipboard.writeText(outputText.value);
        copyButton.classList.add('copied');
        copyButton.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
        `;
        setTimeout(() => {
            copyButton.classList.remove('copied');
            copyButton.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
            `;
        }, 2000);
    }
});

// HTML保存機能
saveHtmlBtn.addEventListener('click', () => {
    if (!translatedHtml) return;
    
    const htmlContent = `<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>翻訳結果</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            max-width: 900px;
            margin: 0 auto;
            padding: 2rem;
            color: #333;
        }
        h1, h2, h3, h4, h5, h6 {
            margin-top: 1.5rem;
            margin-bottom: 1rem;
            font-weight: 600;
        }
        h1 { font-size: 2rem; border-bottom: 1px solid #e5e7eb; padding-bottom: 0.5rem; }
        h2 { font-size: 1.5rem; border-bottom: 1px solid #e5e7eb; padding-bottom: 0.25rem; }
        h3 { font-size: 1.25rem; }
        pre {
            background: #1e1e1e;
            color: #d4d4d4;
            padding: 1rem;
            border-radius: 0.375rem;
            overflow-x: auto;
        }
        code {
            background: #f3f4f6;
            padding: 0.125rem 0.25rem;
            border-radius: 0.25rem;
            font-family: 'Consolas', 'Monaco', monospace;
        }
        pre code {
            background: transparent;
            padding: 0;
        }
        blockquote {
            border-left: 4px solid #d1d5db;
            padding-left: 1rem;
            margin: 1rem 0;
            color: #6b7280;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin: 1rem 0;
        }
        th, td {
            border: 1px solid #e5e7eb;
            padding: 0.5rem;
            text-align: left;
        }
        th {
            background: #f9fafb;
        }
    </style>
</head>
<body>
    ${translatedHtml}
</body>
</html>`;
    
    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    
    const now = new Date();
    const dateStr = now.toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const fileName = originalFileName ? `${originalFileName}_translated` : `translation_${dateStr}`;
    a.download = `${fileName}.html`;
    
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
});

// トークン数の概算
function estimateTokens(text) {
    const japaneseChars = (text.match(/[\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf]/g) || []).length;
    const englishWords = (text.match(/[a-zA-Z]+/g) || []).length;
    const otherChars = text.length - japaneseChars - englishWords;
    
    return Math.ceil(japaneseChars * 2 + englishWords * 1.3 + otherChars * 0.5);
}

// テキストをチャンクに分割（コードブロックを分断しないように）
function splitTextIntoChunks(text, maxTokens = null) {
    // プロンプト設定から最大トークン数を取得
    const config = promptConfig || getDefaultPromptConfig();
    maxTokens = maxTokens || config.api.chunkMaxTokens;
    const lines = text.split(/\r?\n/);
    const chunks = [];
    let currentChunk = '';
    let currentTokens = 0;
    let inCodeBlock = false;
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineTokens = estimateTokens(line);
        
        // コードブロックの開始/終了を検出
        if (line.trim().startsWith('```')) {
            inCodeBlock = !inCodeBlock;
        }
        
        // チャンクの区切り判定
        if (currentTokens + lineTokens > maxTokens && currentChunk && !inCodeBlock) {
            // コードブロック内でない場合のみチャンクを分割
            chunks.push(currentChunk.trim());
            currentChunk = line + '\n';
            currentTokens = lineTokens;
        } else {
            currentChunk += line + '\n';
            currentTokens += lineTokens;
            
            // コードブロック内の場合、最大トークン数を超えても続ける（ただし安全な上限まで）
            if (inCodeBlock && currentTokens > maxTokens * 1.5) {
                console.warn('Large code block detected, may need splitting');
            }
        }
    }
    
    if (currentChunk.trim()) {
        // 未閉じのコードブロックがある場合、警告
        if (inCodeBlock) {
            console.warn('Unclosed code block in chunk');
            currentChunk += '\n```';  // 自動的に閉じる
        }
        chunks.push(currentChunk.trim());
    }
    
    return chunks;
}

// プロンプトテンプレートからプロンプトを構築
function buildTranslationPrompt(text, targetLanguage, isMarkdown) {
    // プロンプト設定が読み込まれていない場合はデフォルトを使用
    const config = promptConfig || getDefaultPromptConfig();
    
    // Markdown用かプレーンテキスト用の設定を選択
    const promptSettings = isMarkdown ? 
        config.translation.markdown : 
        config.translation.plain;
    
    // テンプレートの変数を置換
    let prompt = promptSettings.template
        .replace(/\{system\}/g, config.translation.system)
        .replace(/\{targetLanguage\}/g, targetLanguage)
        .replace(/\{instruction\}/g, promptSettings.instruction)
        .replace(/\{text\}/g, text);
    
    return prompt;
}

// LM Studio APIを使用した翻訳
async function translateWithLMStudio(text, targetLanguage) {
    const isMarkdownFormat = isMarkdownCheckbox.checked;
    
    // コードブロックの自動検出は無効化（ユーザーが明示的に```で囲んだ場合のみ処理）
    let processedText = text;
    
    // 外部プロンプト設定を使用してプロンプトを構築
    const prompt = buildTranslationPrompt(processedText, targetLanguage, isMarkdownFormat);

    const modelName = document.getElementById('modelName')?.value || 'local-model';
    const config = promptConfig || getDefaultPromptConfig();
    const baseUrl = apiUrl.value || config.api.defaultEndpoint;
    
    const requestBody = {
        model: modelName,
        messages: [
            {
                role: 'user',
                content: prompt
            }
        ],
        temperature: config.api.temperature,
        max_tokens: config.api.maxTokens,
        stream: false
    };

    try {
        const response = await fetch(`${baseUrl}/v1/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
            signal: AbortSignal.timeout(300000)
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('API Error Response:', errorText);
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        return data.choices[0].message.content;
    } catch (error) {
        console.error('Translation error:', error);
        throw new Error('LM Studio APIへの接続に失敗しました');
    }
}

// モデル一覧を取得
async function fetchAvailableModels() {
    try {
        const baseUrl = apiUrl.value || 'http://127.0.0.1:1234';
        const response = await fetch(`${baseUrl}/v1/models`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            }
        });

        if (response.ok) {
            const data = await response.json();
            return data.data || [];
        }
        return [];
    } catch (error) {
        console.error('Failed to fetch models:', error);
        return [];
    }
}

// モデル選択ドロップダウンを更新
async function updateModelDropdown() {
    const modelSelect = document.getElementById('modelName');
    const models = await fetchAvailableModels();
    
    modelSelect.innerHTML = '';
    
    if (models.length === 0) {
        modelSelect.innerHTML = '<option value="">モデルが見つかりません</option>';
        modelSelect.innerHTML += '<option value="local-model">local-model (デフォルト)</option>';
        modelSelect.innerHTML += '<option value="plamo-2-translate">plamo-2-translate</option>';
    } else {
        models.forEach((model, index) => {
            const option = document.createElement('option');
            option.value = model.id || model.name || model;
            option.textContent = model.id || model.name || model;
            if (index === 0) {
                option.selected = true;
            }
            modelSelect.appendChild(option);
        });
    }
}

// API接続テスト
async function testAPIConnection() {
    try {
        const modelName = document.getElementById('modelName')?.value || 'local-model';
        const baseUrl = apiUrl.value || 'http://127.0.0.1:1234';
        
        const testBody = {
            model: modelName,
            messages: [
                {
                    role: 'user',
                    content: 'Hello'
                }
            ],
            temperature: 0.1,
            max_tokens: 1,
            stream: false
        };
        
        const response = await fetch(`${baseUrl}/v1/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(testBody)
        });
        
        if (!response.ok) {
            const responseText = await response.text();
            console.error('API test failed:', responseText);
        }
        
        return response.ok;
    } catch (error) {
        console.error('API connection test failed:', error);
        return false;
    }
}

// 翻訳処理
translateBtn.addEventListener('click', async () => {
    const text = inputText.value.trim();
    if (!text) {
        showError('翻訳するテキストを入力してください');
        return;
    }

    hideError();
    translateBtn.disabled = true;
    translateBtn.classList.add('loading');
    saveHtmlBtn.disabled = true;
    
    // 再開の場合は既存の翻訳結果を保持
    const isRetry = failedChunkIndex >= 0;
    if (!isRetry) {
        outputText.value = '';
        outputCharCount.textContent = '0文字';
        translatedChunks = [];
        translationChunks = [];
    }
    
    outputText.classList.add('translating');
    markdownPreview.innerHTML = '';
    progressInfo.style.display = 'block';

    // API接続テスト
    const isConnected = await testAPIConnection();
    if (!isConnected) {
        showError('LM Studio APIに接続できません');
        translateBtn.disabled = false;
        translateBtn.classList.remove('loading');
        outputText.classList.remove('translating');
        progressInfo.style.display = 'none';
        return;
    }

    try {
        const targetLanguage = targetLang.value;
        const estimatedTokens = estimateTokens(text);
        const maxChunkTokens = parseInt(document.getElementById('chunkSize').value) || 8000;
        
        if (estimatedTokens <= maxChunkTokens) {
            statusMessage.textContent = '翻訳中...';
            
            if (!isRetry) {
                outputText.value = '';
            }
            progressFill.style.width = '50%';
            
            const translatedText = await translateWithLMStudio(text, targetLanguage);
            
            progressFill.style.width = '100%';
            // 翻訳結果の後処理（コードブロックの修正など）
            const postProcessedText = postProcessTranslation(translatedText);
            outputText.value = postProcessedText;
            outputCharCount.textContent = `${postProcessedText.length}文字`;
            updatePreview(postProcessedText);
            outputText.scrollTop = outputText.scrollHeight;
            failedChunkIndex = -1;
        } else {
            // チャンク分割処理
            if (!isRetry) {
                translationChunks = splitTextIntoChunks(text, maxChunkTokens);
                translatedChunks = new Array(translationChunks.length).fill('');
            }
            
            const totalChunks = translationChunks.length;
            const startIndex = isRetry ? failedChunkIndex : 0;
            
            statusMessage.textContent = isRetry ? 
                `チャンク ${startIndex + 1}/${totalChunks} から再開中...` :
                `${totalChunks}個のチャンクで翻訳中...`;
            
            // 既存の翻訳済みテキストを表示
            if (isRetry) {
                outputText.value = translatedChunks.slice(0, startIndex).join('\n\n');
            }
            
            for (let i = startIndex; i < totalChunks; i++) {
                statusMessage.textContent = `チャンク ${i + 1}/${totalChunks} を翻訳中...`;
                progressFill.style.width = `${((i + 1) / totalChunks) * 100}%`;
                
                const translatedChunk = await translateWithLMStudio(translationChunks[i], targetLanguage);
                translatedChunks[i] = translatedChunk;
                
                // 全ての翻訳済みチャンクを結合して表示
                const joinedText = translatedChunks.filter(chunk => chunk).join('\n\n');
                const postProcessedText = postProcessTranslation(joinedText);
                outputText.value = postProcessedText;
                outputCharCount.textContent = `${postProcessedText.length}文字`;
                updatePreview(postProcessedText);
                outputText.scrollTop = outputText.scrollHeight;
            }
        }
        
        statusMessage.textContent = '翻訳完了！';
        outputText.classList.remove('translating');
        saveHtmlBtn.disabled = false;
        failedChunkIndex = -1; // 成功したのでリセット
        setTimeout(() => {
            progressInfo.style.display = 'none';
        }, 2000);
        
    } catch (error) {
        showError(error.message);
        progressInfo.style.display = 'none';
        outputText.classList.remove('translating');
        
        // チャンク翻訳中のエラーの場合、失敗したインデックスを記録
        if (translationChunks && translationChunks.length > 0) {
            for (let i = 0; i < translatedChunks.length; i++) {
                if (!translatedChunks[i]) {
                    failedChunkIndex = i;
                    translateBtn.textContent = '翻訳を再開';
                    showError(`チャンク ${i + 1} で失敗しました。「翻訳を再開」をクリックして続きから再開できます。`);
                    break;
                }
            }
        }
    } finally {
        translateBtn.disabled = false;
        translateBtn.classList.remove('loading');
        if (failedChunkIndex < 0) {
            translateBtn.textContent = '翻訳する';
        }
    }
});

// エラー表示
function showError(message) {
    errorMessage.textContent = message;
    errorMessage.classList.add('show');
    setTimeout(() => {
        errorMessage.classList.remove('show');
    }, 5000);
}

// エラー非表示
function hideError() {
    errorMessage.classList.remove('show');
}

// ページ読み込み時
window.addEventListener('DOMContentLoaded', async () => {
    await updateModelDropdown();
    
    const refreshButton = document.getElementById('refreshModels');
    if (refreshButton) {
        refreshButton.addEventListener('click', async () => {
            refreshButton.disabled = true;
            await updateModelDropdown();
            refreshButton.disabled = false;
        });
    }
    
    // API URL変更時にモデル一覧を更新
    apiUrl.addEventListener('change', async () => {
        await updateModelDropdown();
    });
});