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

export default MarkdownProcessor;