class ConfigManager {
    constructor() {
        this.promptConfig = null;
        this.defaultConfig = this.getDefaultConfig();
    }

    getDefaultConfig() {
        // デフォルトのAPI設定のみ保持
        return {
            api: {
                defaultEndpoint: "http://127.0.0.1:1234",
                defaultModel: "local-model",
                temperature: 0.3,
                maxTokens: 10000,
                chunkMaxTokens: 5000
            }
        };
    }

    loadPromptConfig() {
        // prompts.jsから設定を読み込み
        if (window.PROMPT_CONFIG) {
            this.promptConfig = window.PROMPT_CONFIG;
            return true;
        }
        
        throw new Error('プロンプト設定が読み込まれていません。prompts.jsファイルが存在することを確認してください。');
    }

    getConfig() {
        return this.promptConfig || this.defaultConfig;
    }

    buildTranslationPrompt(text, targetLanguage) {
        const config = this.getConfig();
        
        if (!config || !config.translation) {
            throw new Error('プロンプト設定が読み込まれていません');
        }
        
        // Always use markdown settings
        const promptSettings = config.translation.markdown;
        
        if (!promptSettings || !promptSettings.template) {
            throw new Error('プロンプトテンプレートが設定されていません');
        }
        
        return promptSettings.template
            .replace(/\{system\}/g, config.translation.system)
            .replace(/\{targetLanguage\}/g, targetLanguage)
            .replace(/\{instruction\}/g, promptSettings.instruction)
            .replace(/\{text\}/g, text);
    }
}

// ==================== File Processing ====================
class FileProcessor {
    static async processFile(file) {
        const fileType = file.name.split('.').pop().toLowerCase();
        const arrayBuffer = await file.arrayBuffer();
        
        const processors = {
            'epub': async () => await new EPUBProcessor().parse(arrayBuffer),
            'pdf': async () => await new PDFProcessor().parse(arrayBuffer),
            'txt': () => new TextDecoder('utf-8').decode(arrayBuffer),
            'md': () => new TextDecoder('utf-8').decode(arrayBuffer)
        };
        
        const processor = processors[fileType];
        if (!processor) {
            throw new Error(`不正なファイル形式です: ${fileType}`);
        }
        
        return await processor();
    }
}

// ==================== EPUB Processor ====================
class EPUBProcessor {
    async parse(arrayBuffer) {
        try {
            const zip = await JSZip.loadAsync(arrayBuffer);
            const contentOPF = await this.getContentOPF(zip);
            const spine = this.parseSpine(contentOPF);
            
            let fullText = '';
            for (const itemRef of spine) {
                const content = await this.getChapterContent(zip, itemRef.href, this.basePath);
                if (content) {
                    fullText += content + '\n\n';
                }
            }
            
            return fullText;
        } catch (error) {
            throw error;
        }
    }

    async getContentOPF(zip) {
        try {
            const containerFile = zip.file('META-INF/container.xml');
            if (!containerFile) {
                throw new Error('META-INF/container.xml not found in EPUB');
            }
            
            const containerXml = await containerFile.async('string');
            const parser = new DOMParser();
            const containerDoc = parser.parseFromString(containerXml, 'text/xml');
            const rootfile = containerDoc.querySelector('rootfile');
            
            if (!rootfile) {
                throw new Error('rootfile element not found in container.xml');
            }
            
            const contentPath = rootfile.getAttribute('full-path');
            
            const contentFile = zip.file(contentPath);
            if (!contentFile) {
                throw new Error(`Content OPF file not found: ${contentPath}`);
            }
            
            // Store base path for later use
            this.basePath = contentPath.substring(0, contentPath.lastIndexOf('/') + 1);
            
            return await contentFile.async('string');
        } catch (error) {
            throw error;
        }
    }

    parseSpine(contentOPF) {
        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(contentOPF, 'text/xml');
            const manifest = new Map();
            
            // Try with namespace and without
            let manifestItems = doc.querySelectorAll('manifest item');
            if (manifestItems.length === 0) {
                manifestItems = doc.getElementsByTagName('item');
            }
            
            Array.from(manifestItems).forEach(item => {
                manifest.set(item.getAttribute('id'), {
                    href: item.getAttribute('href'),
                    mediaType: item.getAttribute('media-type')
                });
            });
            
            // Try with namespace and without
            let spineItems = doc.querySelectorAll('spine itemref');
            if (spineItems.length === 0) {
                spineItems = doc.getElementsByTagName('itemref');
            }
            
            const result = Array.from(spineItems)
                .map(ref => manifest.get(ref.getAttribute('idref')))
                .filter(item => item && item.mediaType === 'application/xhtml+xml');
            
            return result;
        } catch (error) {
            throw error;
        }
    }

    async getChapterContent(zip, href, basePath = '') {
        try {
            // Try different path combinations
            let contentFile = zip.file(href);
            
            if (!contentFile && basePath) {
                // Try with base path
                const fullPath = basePath + href;
                contentFile = zip.file(fullPath);
            }
            
            if (!contentFile) {
                // Try in OEBPS folder (common in EPUBs)
                const oebpsPath = 'OEBPS/' + href;
                contentFile = zip.file(oebpsPath);
            }
            
            if (!contentFile) {
                return '';
            }
            
            const content = await contentFile.async('string');
            const parser = new DOMParser();
            const doc = parser.parseFromString(content, 'text/html');
            const text = this.extractTextFromNode(doc.body);
            
            return text;
        } catch (error) {
            return '';
        }
    }

    extractTextFromNode(node, isRoot = true, preserveFormatting = false) {
        if (!node) return '';
        
        let markdown = '';
        
        for (const child of node.childNodes) {
            if (child.nodeType === Node.TEXT_NODE) {
                const content = preserveFormatting ? child.textContent : child.textContent.trim();
                if (content) {
                    markdown += preserveFormatting ? content : (content + ' ');
                }
            } else if (child.nodeType === Node.ELEMENT_NODE) {
                const tagName = child.tagName.toLowerCase();
                
                // Convert HTML to Markdown
                switch(tagName) {
                    case 'h1':
                        markdown += '\n\n# ' + this.extractTextFromNode(child, false, false).trim() + '\n\n';
                        break;
                    case 'h2':
                        markdown += '\n\n## ' + this.extractTextFromNode(child, false, false).trim() + '\n\n';
                        break;
                    case 'h3':
                        markdown += '\n\n### ' + this.extractTextFromNode(child, false, false).trim() + '\n\n';
                        break;
                    case 'h4':
                        markdown += '\n\n#### ' + this.extractTextFromNode(child, false, false).trim() + '\n\n';
                        break;
                    case 'h5':
                        markdown += '\n\n##### ' + this.extractTextFromNode(child, false, false).trim() + '\n\n';
                        break;
                    case 'h6':
                        markdown += '\n\n###### ' + this.extractTextFromNode(child, false, false).trim() + '\n\n';
                        break;
                    case 'p':
                        const pContent = this.extractTextFromNode(child, false, false).trim();
                        if (pContent) {
                            markdown += '\n\n' + pContent + '\n\n';
                        }
                        break;
                    case 'div':
                        const divContent = this.extractTextFromNode(child, false, false).trim();
                        if (divContent) {
                            markdown += '\n' + divContent + '\n';
                        }
                        break;
                    case 'br':
                        markdown += '  \n';
                        break;
                    case 'ul':
                    case 'ol':
                        markdown += '\n' + this.extractListFromNode(child, tagName === 'ol') + '\n';
                        break;
                    case 'strong':
                    case 'b':
                        markdown += '**' + this.extractTextFromNode(child, false, false).trim() + '**';
                        break;
                    case 'em':
                    case 'i':
                        markdown += '*' + this.extractTextFromNode(child, false, false).trim() + '*';
                        break;
                    case 'code':
                        // Check if parent is <pre> - if so, skip (will be handled by pre)
                        const parentTag = child.parentElement ? child.parentElement.tagName.toLowerCase() : '';
                        if (parentTag === 'pre') {
                            // Skip - will be handled by parent pre element
                            break;
                        } else {
                            // Inline code
                            const codeText = child.textContent || child.innerText || '';
                            markdown += '`' + codeText + '`';
                        }
                        break;
                    case 'pre':
                        // Extract code with proper formatting
                        const codeContent = this.extractCodeContent(child);
                        const language = this.detectCodeLanguage(child);
                        markdown += '\n```' + language + '\n' + codeContent + '\n```\n';
                        break;
                    case 'blockquote':
                        const quoteContent = this.extractTextFromNode(child, false, false).trim();
                        if (quoteContent) {
                            markdown += '\n> ' + quoteContent.replace(/\n/g, '\n> ') + '\n';
                        }
                        break;
                    case 'a':
                        const linkText = this.extractTextFromNode(child, false, false).trim();
                        const href = child.getAttribute('href');
                        if (href && href.startsWith('http')) {
                            markdown += '[' + linkText + '](' + href + ')';
                        } else {
                            markdown += linkText;
                        }
                        break;
                    case 'hr':
                        markdown += '\n\n---\n\n';
                        break;
                    case 'script':
                    case 'style':
                    case 'nav':
                    case 'header':
                    case 'footer':
                        // Skip these elements
                        break;
                    default:
                        const content = this.extractTextFromNode(child, false, preserveFormatting);
                        if (content.trim()) {
                            markdown += content;
                        }
                        break;
                }
            }
        }
        
        // Clean up the markdown
        if (isRoot) {
            markdown = markdown
                .replace(/\n{3,}/g, '\n\n')  // Remove excessive newlines
                .replace(/\s+\n/g, '\n')      // Remove trailing spaces
                .replace(/\n\s+\n/g, '\n\n')  // Clean empty lines with spaces
                .trim();
        }
        
        return markdown;
    }

    extractListFromNode(listNode, isOrdered = false) {
        let markdown = '';
        let index = 1;
        
        for (const child of listNode.childNodes) {
            if (child.nodeType === Node.ELEMENT_NODE && child.tagName.toLowerCase() === 'li') {
                const prefix = isOrdered ? `${index}. ` : '- ';
                const content = this.extractTextFromNode(child, false, false).trim();
                if (content) {
                    markdown += prefix + content + '\n';
                    index++;
                }
            }
        }
        
        return markdown;
    }

    extractCodeContent(node) {
        // First, try to use innerText or textContent which properly preserve whitespace
        if (node.innerText !== undefined) {
            return node.innerText;
        } else if (node.textContent) {
            return node.textContent;
        }
        
        // Fallback: manually extract text preserving formatting
        let code = '';
        
        const processNode = (n) => {
            if (n.nodeType === Node.TEXT_NODE) {
                // Preserve all whitespace and newlines exactly as they are
                code += n.textContent;
            } else if (n.nodeType === Node.ELEMENT_NODE) {
                const tag = n.tagName.toLowerCase();
                
                // Handle line breaks in code
                if (tag === 'br') {
                    code += '\n';
                } else if (tag === 'div' || tag === 'p') {
                    // Add newline before block elements if needed
                    if (code && !code.endsWith('\n')) {
                        code += '\n';
                    }
                    for (const child of n.childNodes) {
                        processNode(child);
                    }
                    // Add newline after block elements
                    if (!code.endsWith('\n')) {
                        code += '\n';
                    }
                } else {
                    // Process other elements recursively
                    for (const child of n.childNodes) {
                        processNode(child);
                    }
                }
            }
        };
        
        for (const child of node.childNodes) {
            processNode(child);
        }
        
        return code;
    }

    detectCodeLanguage(node) {
        // Try to detect language from class names
        const className = node.getAttribute('class') || '';
        
        // Common patterns for language detection
        const langPatterns = [
            /language-([\w+-]+)/,
            /lang-([\w+-]+)/,
            /brush:\s*([\w+-]+)/,
            /highlight-([\w+-]+)/
        ];
        
        for (const pattern of langPatterns) {
            const match = className.match(pattern);
            if (match) {
                return match[1];
            }
        }
        
        // Check code element inside pre
        const codeElement = node.querySelector('code');
        if (codeElement) {
            const codeClass = codeElement.getAttribute('class') || '';
            for (const pattern of langPatterns) {
                const match = codeClass.match(pattern);
                if (match) {
                    return match[1];
                }
            }
        }
        
        return ''; // No language detected
    }
}

// ==================== PDF Processor ====================
class PDFProcessor {
    async parse(arrayBuffer) {
        try {
            const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            
            let markdown = '';
            
            for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
                const page = await pdf.getPage(pageNum);
                const textContent = await page.getTextContent();
                
                // Group text items by lines based on Y position
                const lines = this.groupTextByLines(textContent.items);
                
                // Convert lines to markdown
                const pageMarkdown = this.convertLinesToMarkdown(lines);
                
                if (pageMarkdown.trim()) {
                    if (pageNum > 1) {
                        markdown += '\n\n---\n\n';  // Page separator
                    }
                    markdown += `## Page ${pageNum}\n\n`;
                    markdown += pageMarkdown;
                }
            }
            
            return markdown;
        } catch (error) {
            throw error;
        }
    }
    
    groupTextByLines(items) {
        if (!items || items.length === 0) return [];
        
        // Group items by Y position (with tolerance)
        const lineMap = new Map();
        const tolerance = 2; // Y position tolerance for same line
        
        for (const item of items) {
            if (!item.str || item.str.trim() === '') continue;
            
            const y = Math.round(item.transform[5]);
            let lineY = y;
            
            // Find existing line within tolerance
            for (const [existingY] of lineMap) {
                if (Math.abs(existingY - y) < tolerance) {
                    lineY = existingY;
                    break;
                }
            }
            
            if (!lineMap.has(lineY)) {
                lineMap.set(lineY, []);
            }
            
            lineMap.get(lineY).push({
                text: item.str,
                x: item.transform[4],
                fontSize: item.height,
                fontName: item.fontName
            });
        }
        
        // Sort lines by Y position (top to bottom)
        const sortedLines = Array.from(lineMap.entries())
            .sort((a, b) => b[0] - a[0])  // PDF Y coordinates are bottom-up
            .map(([y, items]) => {
                // Sort items in each line by X position
                return items.sort((a, b) => a.x - b.x);
            });
        
        return sortedLines;
    }
    
    convertLinesToMarkdown(lines) {
        let markdown = '';
        let previousLineType = '';
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const lineText = line.map(item => item.text).join(' ').trim();
            
            if (!lineText) continue;
            
            // Detect line type based on formatting
            const lineType = this.detectLineType(line, lineText);
            
            switch (lineType) {
                case 'heading1':
                    markdown += '\n\n# ' + lineText + '\n\n';
                    break;
                case 'heading2':
                    markdown += '\n\n## ' + lineText + '\n\n';
                    break;
                case 'heading3':
                    markdown += '\n\n### ' + lineText + '\n\n';
                    break;
                case 'bullet':
                    markdown += '- ' + lineText + '\n';
                    break;
                case 'numbered':
                    markdown += lineText + '\n';  // Already has number
                    break;
                default:
                    // Regular paragraph
                    if (previousLineType !== 'paragraph' && markdown && !markdown.endsWith('\n\n')) {
                        markdown += '\n\n';
                    }
                    markdown += lineText + ' ';
                    break;
            }
            
            previousLineType = lineType;
        }
        
        // Clean up markdown
        return markdown
            .replace(/\n{3,}/g, '\n\n')  // Remove excessive newlines
            .replace(/\s+\n/g, '\n')      // Remove trailing spaces
            .trim();
    }
    
    detectLineType(lineItems, lineText) {
        if (!lineItems || lineItems.length === 0) return 'paragraph';
        
        // Check average font size
        const avgFontSize = lineItems.reduce((sum, item) => sum + (item.fontSize || 0), 0) / lineItems.length;
        
        // Detect headings by font size
        if (avgFontSize > 20) return 'heading1';
        if (avgFontSize > 16) return 'heading2';
        if (avgFontSize > 14 && lineText.length < 100) return 'heading3';
        
        // Detect lists
        if (lineText.match(/^[•·▪▫◦‣⁃]\s+/)) return 'bullet';
        if (lineText.match(/^[➢➣→]\s+/)) return 'bullet';
        if (lineText.match(/^[-*]\s+/)) return 'bullet';
        if (lineText.match(/^\d+[.)]\s+/)) return 'numbered';
        if (lineText.match(/^[a-z][.)]\s+/i)) return 'numbered';
        
        return 'paragraph';
    }
}

// ==================== Text Processing Utilities ====================
class TextProcessor {
    static estimateTokens(text) {
        // 日本語の文字カウント（ひらがな、カタカナ、漢字）
        const japaneseChars = (text.match(/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/g) || []).length;
        // 英数字と記号のカウント
        const asciiChars = (text.match(/[\x00-\x7F]/g) || []).length;
        
        // 日本語は1文字≒1トークン、英語は4文字≒1トークンとして推定
        return Math.ceil(japaneseChars + (asciiChars / 4));
    }

    static splitTextIntoChunks(text, maxTokens = 12000) {
        const lines = text.split(/\r?\n/);
        const chunks = [];
        let currentChunk = '';
        let currentTokens = 0;
        let inCodeBlock = false;
        
        for (const line of lines) {
            const lineTokens = this.estimateTokens(line);
            
            if (line.trim().startsWith('```')) {
                inCodeBlock = !inCodeBlock;
            }
            
            if (currentTokens + lineTokens > maxTokens && currentChunk && !inCodeBlock) {
                chunks.push(currentChunk.trim());
                currentChunk = line + '\n';
                currentTokens = lineTokens;
            } else {
                currentChunk += line + '\n';
                currentTokens += lineTokens;
            }
        }
        
        if (currentChunk.trim()) {
            if (inCodeBlock) {
                currentChunk += '\n```';
            }
            chunks.push(currentChunk.trim());
        }
        
        return chunks;
    }

    static postProcessTranslation(text) {
        if (!text) return text;
        
        // Remove consecutive code block markers
        text = text.replace(/```\s*\n\s*```/g, '```');
        
        const lines = text.split('\n');
        const processedLines = [];
        let inCodeBlock = false;
        let codeBlockStartIndex = -1;
        let lastClosedBlockIndex = -1;
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmedLine = line.trim();
            
            // Skip duplicate closing tags
            if (trimmedLine === '```' && !inCodeBlock && i === lastClosedBlockIndex + 1) {
                continue;
            }
            
            if (trimmedLine.startsWith('```') && !inCodeBlock) {
                inCodeBlock = true;
                codeBlockStartIndex = i;
                processedLines.push(line);
            } else if (trimmedLine === '```' && inCodeBlock && i > codeBlockStartIndex) {
                inCodeBlock = false;
                lastClosedBlockIndex = i;
                processedLines.push('```');
            } else {
                processedLines.push(line);
            }
        }
        
        if (inCodeBlock) {
            processedLines.push('```');
        }
        
        // Remove consecutive empty lines (except in code blocks)
        const finalLines = [];
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
        result = result.replace(/```\s*\n\s*```/g, '```');
        
        return result;
    }
}

// ==================== Markdown Processing ====================
class MarkdownProcessor {
    constructor() {
        this.initializeMarked();
    }

    initializeMarked() {
        marked.setOptions({
            breaks: true,
            gfm: true,
            pedantic: false,
            headerIds: false,
            mangle: false,
            sanitize: false,
            smartLists: true,
            smartypants: false,
            xhtml: false,
            highlight: (code, lang) => {
                if (!lang) return code;
                
                if (typeof Prism !== 'undefined' && Prism.languages[lang]) {
                    try {
                        return Prism.highlight(code, Prism.languages[lang], lang);
                    } catch (e) {
                        return code;
                    }
                }
                return code;
            }
        });
    }

    toHtml(markdown) {
        const preprocessed = this.preprocessCodeBlocks(markdown);
        return marked.parse(preprocessed);
    }

    preprocessCodeBlocks(markdown) {
        const lines = markdown.split('\n');
        const processedLines = [];
        let inCodeBlock = false;
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            if (line.trim().startsWith('```')) {
                inCodeBlock = !inCodeBlock;
                processedLines.push(line);
                
                if (!inCodeBlock && i < lines.length - 1 && lines[i + 1].trim() !== '') {
                    processedLines.push('');
                }
            } else {
                processedLines.push(line);
            }
        }
        
        return processedLines.join('\n');
    }
}

// ==================== API Client ====================
class APIClient {
    constructor(configManager) {
        this.configManager = configManager;
    }

    async translate(text, targetLanguage, apiUrl, modelName, signal = null) {
        const prompt = this.configManager.buildTranslationPrompt(text, targetLanguage);
        const config = this.configManager.getConfig();
        const baseUrl = apiUrl || config.api.defaultEndpoint;
        
        const requestBody = {
            model: modelName || 'local-model',
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
                signal: signal || AbortSignal.timeout(600000)
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            return data.choices[0].message.content;
        } catch (error) {
            throw new Error('LM Studio APIへの接続に失敗しました');
        }
    }

    async testConnection(apiUrl, modelName) {
        try {
            const baseUrl = apiUrl || 'http://127.0.0.1:1234';
            
            const testBody = {
                model: modelName || 'local-model',
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
            }
            
            return response.ok;
        } catch (error) {
            return false;
        }
    }

    async fetchAvailableModels(apiUrl) {
        try {
            const baseUrl = apiUrl || 'http://127.0.0.1:1234';
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
            return [];
        }
    }
}

// ==================== UI Manager ====================
class UIManager {
    constructor() {
        this.elements = this.initializeElements();
        this.hasUnsavedChanges = false;
        this.translatedHtml = '';
    }

    initializeElements() {
        return {
            inputText: document.getElementById('inputText'),
            outputText: document.getElementById('outputText'),
            targetLang: document.getElementById('targetLang'),
            apiUrl: document.getElementById('apiUrl'),
            modelName: document.getElementById('modelName'),
            fileInput: document.getElementById('fileInput'),
            translateBtn: document.getElementById('translateBtn'),
            saveHtmlBtn: document.getElementById('saveHtmlBtn'),
            copyButton: document.getElementById('copyButton'),
            markdownPreview: document.getElementById('markdownPreview'),
            errorMessage: document.getElementById('errorMessage'),
            inputCharCount: document.getElementById('inputCharCount'),
            outputCharCount: document.getElementById('outputCharCount'),
            progressBar: document.getElementById('progressBar'),
            progressFill: document.getElementById('progressFill'),
            progressInfo: document.getElementById('progressInfo'),
            statusMessage: document.getElementById('statusMessage'),
            chunkSize: document.getElementById('chunkSize'),
            refreshModels: document.getElementById('refreshModels')
        };
    }

    updateCharCount(element, countElement) {
        const count = element.value.length;
        countElement.textContent = `${count}文字`;
    }

    showError(message) {
        this.elements.errorMessage.textContent = message;
        this.elements.errorMessage.classList.add('show');
        setTimeout(() => {
            this.elements.errorMessage.classList.remove('show');
        }, 5000);
    }

    hideError() {
        this.elements.errorMessage.classList.remove('show');
    }

    updateProgress(percentage, message) {
        this.elements.progressFill.style.width = `${percentage}%`;
        if (message) {
            this.elements.statusMessage.textContent = message;
        }
    }

    showProgressBar() {
        this.elements.progressInfo.style.display = 'block';
    }

    hideProgressBar() {
        this.elements.progressInfo.style.display = 'none';
    }

    updatePreview(text, markdownProcessor) {
        if (text) {
            try {
                const html = markdownProcessor.toHtml(text);
                this.elements.markdownPreview.innerHTML = html;
                this.translatedHtml = html;
                
                setTimeout(() => {
                    if (typeof Prism !== 'undefined') {
                        Prism.highlightAll();
                    }
                }, 0);
            } catch (error) {
                this.elements.markdownPreview.innerHTML = `<pre>${text}</pre>`;
            }
        } else {
            this.elements.markdownPreview.innerHTML = '';
        }
    }

    async updateModelDropdown(models) {
        const modelSelect = this.elements.modelName;
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

    markAsChanged() {
        this.hasUnsavedChanges = true;
    }

    clearChanges() {
        this.hasUnsavedChanges = false;
    }

    downloadHtml() {
        if (!this.translatedHtml) return;
        
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
    ${this.translatedHtml}
</body>
</html>`;
        
        const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        
        const now = new Date();
        const dateStr = now.toISOString().replace(/[:.]/g, '-').slice(0, -5);
        a.download = `translation_${dateStr}.html`;
        
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        this.clearChanges();
    }

    async copyToClipboard() {
        if (this.elements.outputText.value) {
            await navigator.clipboard.writeText(this.elements.outputText.value);
            this.elements.copyButton.classList.add('copied');
            this.elements.copyButton.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
            `;
            setTimeout(() => {
                this.elements.copyButton.classList.remove('copied');
                this.elements.copyButton.innerHTML = `
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                    </svg>
                `;
            }, 2000);
        }
    }
}

// ==================== Main Application ====================
class TranslatorApp {
    constructor() {
        this.configManager = new ConfigManager();
        this.uiManager = new UIManager();
        this.apiClient = new APIClient(this.configManager);
        this.markdownProcessor = new MarkdownProcessor();
        
        this.translationChunks = [];
        this.translatedChunks = [];
        this.failedChunkIndex = -1;
        this.isTranslating = false;
        this.abortController = null;
        
        this.initialize();
    }

    async initialize() {
        try {
            this.configManager.loadPromptConfig();
            this.loadPromptConfig();
            this.setupEventListeners();
            this.setupPageLeaveProtection();
            await this.refreshModels();
        } catch (error) {
            // プロンプト設定の読み込みエラーを表示
            this.uiManager.showError(error.message);
            // 翻訳ボタンを無効化
            if (this.uiManager.elements.translateBtn) {
                this.uiManager.elements.translateBtn.disabled = true;
                this.uiManager.elements.translateBtn.textContent = '設定エラー';
            }
        }
    }

    loadPromptConfig() {
        const config = this.configManager.getConfig();
        if (config.api && this.uiManager.elements.apiUrl) {
            this.uiManager.elements.apiUrl.value = config.api.defaultEndpoint;
        }
    }

    setupEventListeners() {
        const { elements } = this.uiManager;
        
        // Translation/Cancel button
        elements.translateBtn.addEventListener('click', () => {
            if (this.isTranslating) {
                this.cancelTranslation();
            } else {
                this.handleTranslation();
            }
        });
        
        // File input
        elements.fileInput.addEventListener('change', (e) => this.handleFileUpload(e));
        
        // Character count updates
        elements.inputText.addEventListener('input', () => {
            this.uiManager.updateCharCount(elements.inputText, elements.inputCharCount);
            this.uiManager.markAsChanged();
        });
        
        elements.outputText.addEventListener('input', () => {
            this.uiManager.updateCharCount(elements.outputText, elements.outputCharCount);
            this.uiManager.markAsChanged();
        });
        
        // Markdown preview
        elements.outputText.addEventListener('input', () => {
            this.uiManager.updatePreview(elements.outputText.value, this.markdownProcessor);
        });
        
        // Save HTML button
        elements.saveHtmlBtn.addEventListener('click', () => this.uiManager.downloadHtml());
        
        // Copy button
        elements.copyButton.addEventListener('click', () => this.uiManager.copyToClipboard());
        
        // Model refresh
        if (elements.refreshModels) {
            elements.refreshModels.addEventListener('click', async () => {
                elements.refreshModels.disabled = true;
                await this.refreshModels();
                elements.refreshModels.disabled = false;
            });
        }
        
        // API URL change
        elements.apiUrl.addEventListener('change', () => this.refreshModels());
        
        // Tab switching
        const tabButtons = document.querySelectorAll('[data-tab]');
        tabButtons.forEach(button => {
            button.addEventListener('click', () => this.switchTab(button));
        });
    }

    setupPageLeaveProtection() {
        const { elements } = this.uiManager;
        
        // Track changes
        elements.fileInput.addEventListener('change', () => this.uiManager.markAsChanged());
        elements.translateBtn.addEventListener('click', () => {
            setTimeout(() => this.uiManager.markAsChanged(), 100);
        });
        
        // Before unload warning
        window.addEventListener('beforeunload', (event) => {
            if (this.uiManager.hasUnsavedChanges || 
                elements.inputText.value.trim() || 
                elements.outputText.value.trim()) {
                const confirmationMessage = '翻訳内容が失われる可能性があります。このページを離れてもよろしいですか？';
                event.returnValue = confirmationMessage;
                return confirmationMessage;
            }
        });
        
        // Popstate (back/forward) handling
        window.addEventListener('popstate', (event) => {
            if (this.uiManager.hasUnsavedChanges || 
                elements.inputText.value.trim() || 
                elements.outputText.value.trim()) {
                if (!confirm('翻訳内容が失われる可能性があります。このページを離れてもよろしいですか？')) {
                    window.history.pushState(null, '', window.location.href);
                    event.preventDefault();
                }
            }
        });
        
        // Add initial state to history
        window.history.pushState(null, '', window.location.href);
    }

    async handleFileUpload(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        try {
            const text = await FileProcessor.processFile(file);
            
            this.uiManager.elements.inputText.value = text;
            this.uiManager.updateCharCount(
                this.uiManager.elements.inputText, 
                this.uiManager.elements.inputCharCount
            );
            this.uiManager.markAsChanged();
        } catch (error) {
            this.uiManager.showError(`ファイル読み込みエラー: ${error.message}`);
        }
    }

    async handleTranslation() {
        const { elements } = this.uiManager;
        const text = elements.inputText.value.trim();
        
        if (!text) {
            this.uiManager.showError('翻訳するテキストを入力してください');
            return;
        }
        
        this.isTranslating = true;
        this.abortController = new AbortController();
        
        this.uiManager.hideError();
        
        // ボタンを中止ボタンに変更
        elements.translateBtn.innerHTML = '<span class="btn-text">中止</span>';
        elements.translateBtn.style.backgroundColor = '#ef4444';
        elements.translateBtn.style.color = '#ffffff';
        
        elements.saveHtmlBtn.disabled = true;
        elements.fileInput.disabled = true;  // ファイル選択を無効化
        
        const isRetry = this.failedChunkIndex >= 0;
        if (!isRetry) {
            elements.outputText.value = '';
            this.uiManager.elements.outputCharCount.textContent = '0文字';
            this.translatedChunks = [];
            this.translationChunks = [];
        }
        
        elements.outputText.classList.add('translating');
        elements.markdownPreview.innerHTML = '';
        this.uiManager.showProgressBar();
        
        // Test API connection
        const isConnected = await this.apiClient.testConnection(
            elements.apiUrl.value,
            elements.modelName.value
        );
        
        if (!isConnected) {
            this.uiManager.showError('LM Studio APIに接続できません');
            elements.translateBtn.disabled = false;
            elements.translateBtn.classList.remove('loading');
            elements.outputText.classList.remove('translating');
            this.uiManager.hideProgressBar();
            return;
        }
        
        try {
            const targetLanguage = elements.targetLang.value;
            const estimatedTokens = TextProcessor.estimateTokens(text);
            const maxChunkTokens = parseInt(elements.chunkSize.value) || 500;
            
            if (estimatedTokens <= maxChunkTokens) {
                // Single chunk translation
                await this.translateSingleChunk(text, targetLanguage);
            } else {
                // Multi-chunk translation
                await this.translateMultipleChunks(text, targetLanguage, maxChunkTokens, isRetry);
            }
            
            elements.saveHtmlBtn.disabled = false;
            this.failedChunkIndex = -1;
        } catch (error) {
            if (error.name !== 'AbortError') {
                this.uiManager.showError(`翻訳エラー: ${error.message}`);
                if (this.failedChunkIndex >= 0) {
                    elements.translateBtn.innerHTML = '<span class="btn-text">再開</span>';
                }
            }
        } finally {
            this.isTranslating = false;
            this.abortController = null;
            
            // ボタンを元に戻す
            elements.translateBtn.innerHTML = `
                <span class="btn-text">翻訳する</span>
                <span class="spinner"></span>
            `;
            elements.translateBtn.style.backgroundColor = '';
            elements.translateBtn.style.color = '';
            elements.translateBtn.classList.remove('loading');
            
            elements.outputText.classList.remove('translating');
            elements.fileInput.disabled = false;  // ファイル選択を再有効化
            this.uiManager.hideProgressBar();
        }
    }

    async translateSingleChunk(text, targetLanguage) {
        const { elements } = this.uiManager;
        
        this.uiManager.updateProgress(50, '翻訳中...');
        
        const translatedText = await this.apiClient.translate(
            text,
            targetLanguage,
            elements.apiUrl.value,
            elements.modelName.value,
            this.abortController.signal
        );
        
        this.uiManager.updateProgress(100);
        
        const postProcessedText = TextProcessor.postProcessTranslation(translatedText);
        elements.outputText.value = postProcessedText;
        this.uiManager.updateCharCount(elements.outputText, elements.outputCharCount);
        this.uiManager.updatePreview(postProcessedText, this.markdownProcessor);
        elements.outputText.scrollTop = elements.outputText.scrollHeight;
    }

    async translateMultipleChunks(text, targetLanguage, maxChunkTokens, isRetry) {
        const { elements } = this.uiManager;
        
        if (!isRetry) {
            this.translationChunks = TextProcessor.splitTextIntoChunks(text, maxChunkTokens);
            this.translatedChunks = new Array(this.translationChunks.length).fill('');
        }
        
        const totalChunks = this.translationChunks.length;
        const startIndex = isRetry ? this.failedChunkIndex : 0;
        
        const statusMessage = isRetry ? 
            `チャンク ${startIndex + 1}/${totalChunks} から再開中...` :
            `${totalChunks}個のチャンクで翻訳中...`;
        this.uiManager.updateProgress(0, statusMessage);
        
        if (isRetry) {
            elements.outputText.value = this.translatedChunks.slice(0, startIndex).join('\n\n');
        }
        
        for (let i = startIndex; i < totalChunks; i++) {
            const progress = ((i + 1) / totalChunks) * 100;
            this.uiManager.updateProgress(progress, `翻訳中... (${i + 1}/${totalChunks})`);
            
            try {
                // 中止チェック
                if (this.abortController.signal.aborted) {
                    throw new DOMException('翻訳が中止されました', 'AbortError');
                }
                
                const translatedChunk = await this.apiClient.translate(
                    this.translationChunks[i],
                    targetLanguage,
                    elements.apiUrl.value,
                    elements.modelName.value,
                    this.abortController.signal
                );
                
                this.translatedChunks[i] = translatedChunk;
                
                const fullTranslation = this.translatedChunks
                    .filter(chunk => chunk)
                    .join('\n\n');
                
                const postProcessedText = TextProcessor.postProcessTranslation(fullTranslation);
                elements.outputText.value = postProcessedText;
                this.uiManager.updateCharCount(elements.outputText, elements.outputCharCount);
                this.uiManager.updatePreview(postProcessedText, this.markdownProcessor);
                elements.outputText.scrollTop = elements.outputText.scrollHeight;
                
            } catch (error) {
                this.failedChunkIndex = i;
                throw error;
            }
        }
    }

    async refreshModels() {
        const models = await this.apiClient.fetchAvailableModels(this.uiManager.elements.apiUrl.value);
        await this.uiManager.updateModelDropdown(models);
    }

    cancelTranslation() {
        if (this.abortController) {
            this.abortController.abort();
            this.uiManager.showError('翻訳を中止しました');
        }
    }

    switchTab(button) {
        const tabName = button.getAttribute('data-tab');
        const tabContents = document.querySelectorAll('.tabs-content');
        const tabButtons = document.querySelectorAll('[data-tab]');
        
        tabButtons.forEach(btn => {
            btn.setAttribute('data-state', btn === button ? 'active' : 'inactive');
        });
        
        tabContents.forEach(content => {
            const contentName = content.getAttribute('data-content');
            content.setAttribute('data-state', contentName === tabName ? 'active' : 'inactive');
        });
        
        if (tabName === 'preview') {
            this.uiManager.updatePreview(
                this.uiManager.elements.outputText.value, 
                this.markdownProcessor
            );
        }
    }
}

// ==================== Application Initialization ====================
document.addEventListener('DOMContentLoaded', () => {
    const app = new TranslatorApp();
});
