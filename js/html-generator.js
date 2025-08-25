// ==================== HTML Generator ====================
// Handles HTML generation for downloads and exports
export class HTMLGenerator {
    constructor() {
        this.defaultStyles = this.getDefaultStyles();
    }

    getDefaultStyles() {
        return `
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            margin: 0;
            padding: 1rem;
            color: #333;
            background: #f8fafc;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
        }
        .header {
            text-align: center;
            margin-bottom: 2rem;
            padding: 1rem;
            background: white;
            border-radius: 0.5rem;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }
        .translation-content {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 1rem;
            margin-bottom: 2rem;
        }
        .panel {
            background: white;
            border-radius: 0.5rem;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
            overflow: hidden;
        }
        .panel-header {
            background: #f1f5f9;
            padding: 1rem;
            border-bottom: 1px solid #e2e8f0;
            font-weight: 600;
            color: #334155;
        }
        .panel-content {
            padding: 1.5rem;
            min-height: 200px;
        }
        .original-panel .panel-header {
            background: #fef3c7;
            color: #92400e;
        }
        .translated-panel .panel-header {
            background: #dcfce7;
            color: #166534;
        }
        h1, h2, h3, h4, h5, h6 {
            margin-top: 1.5rem;
            margin-bottom: 1rem;
            font-weight: 600;
            line-height: 1.3;
        }
        h1 { font-size: 1.875rem; border-bottom: 2px solid #e5e7eb; padding-bottom: 0.5rem; }
        h2 { font-size: 1.5rem; border-bottom: 1px solid #e5e7eb; padding-bottom: 0.25rem; }
        h3 { font-size: 1.25rem; }
        pre {
            background: #1e293b;
            color: #e2e8f0;
            padding: 1rem;
            border-radius: 0.375rem;
            overflow-x: auto;
            font-size: 0.875rem;
        }
        code {
            background: #f1f5f9;
            color: #1e293b;
            padding: 0.125rem 0.375rem;
            border-radius: 0.25rem;
            font-family: 'SF Mono', 'Monaco', 'Consolas', monospace;
            font-size: 0.875rem;
        }
        pre code {
            background: transparent;
            color: inherit;
            padding: 0;
        }
        blockquote {
            border-left: 4px solid #3b82f6;
            padding-left: 1rem;
            margin: 1rem 0;
            color: #4b5563;
            font-style: italic;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin: 1rem 0;
        }
        th, td {
            border: 1px solid #e5e7eb;
            padding: 0.75rem;
            text-align: left;
        }
        th {
            background: #f9fafb;
            font-weight: 600;
        }
        .footer {
            text-align: center;
            padding: 1rem;
            background: white;
            border-radius: 0.5rem;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
            font-size: 0.875rem;
            color: #6b7280;
        }
        @media (max-width: 768px) {
            .translation-content {
                grid-template-columns: 1fr;
            }
            .container {
                padding: 0.5rem;
            }
        }`;
    }

    generateTranslationHtml(originalHtml, translatedHtml, options = {}) {
        const {
            title = '翻訳結果',
            subtitle = '原文と翻訳文の対照表示',
            originalLabel = '原文 (Original)',
            translatedLabel = '翻訳文 (Translation)',
            styles = this.defaultStyles
        } = options;

        return `<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${this.escapeHtml(title)}</title>
    <style>${styles}</style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>${this.escapeHtml(title)}</h1>
            <p>${this.escapeHtml(subtitle)}</p>
        </div>
        
        <div class="translation-content">
            <div class="panel original-panel">
                <div class="panel-header">
                    ${this.escapeHtml(originalLabel)}
                </div>
                <div class="panel-content">
                    ${originalHtml || '<p>原文がありません</p>'}
                </div>
            </div>
            
            <div class="panel translated-panel">
                <div class="panel-header">
                    ${this.escapeHtml(translatedLabel)}
                </div>
                <div class="panel-content">
                    ${translatedHtml || '<p>翻訳文がありません</p>'}
                </div>
            </div>
        </div>
        
        <div class="footer">
            <p>Generated by LLM Translation Tool - ${new Date().toLocaleString('ja-JP')}</p>
        </div>
    </div>
</body>
</html>`;
    }

    generateSingleColumnHtml(content, options = {}) {
        const {
            title = 'ドキュメント',
            styles = this.defaultStyles
        } = options;

        return `<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${this.escapeHtml(title)}</title>
    <style>${styles}</style>
</head>
<body>
    <div class="container">
        <div class="panel">
            <div class="panel-content">
                ${content}
            </div>
        </div>
        
        <div class="footer">
            <p>Generated by LLM Translation Tool - ${new Date().toLocaleString('ja-JP')}</p>
        </div>
    </div>
</body>
</html>`;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    downloadAsHtml(htmlContent, filename) {
        const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    generateFilename(prefix = 'translation') {
        const now = new Date();
        const dateStr = now.toISOString().replace(/[:.]/g, '-').slice(0, -5);
        return `${prefix}_${dateStr}.html`;
    }
}