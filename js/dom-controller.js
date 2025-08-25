// ==================== DOM Controller ====================
// Handles all DOM element access and manipulation
export class DOMController {
    constructor() {
        this.elements = this.initializeElements();
    }

    initializeElements() {
        const elementIds = {
            inputText: 'inputText',
            outputText: 'outputText',
            targetLang: 'targetLang',
            apiUrl: 'apiUrl',
            modelName: 'modelName',
            fileInput: 'fileInput',
            translateBtn: 'translateBtn',
            saveHtmlBtn: 'saveHtmlBtn',
            copyButton: 'copyButton',
            markdownPreview: 'markdownPreview',
            errorMessage: 'errorMessage',
            inputCharCount: 'inputCharCount',
            outputCharCount: 'outputCharCount',
            progressFill: 'progressFill',
            progressInfo: 'progressInfo',
            statusMessage: 'statusMessage',
            chunkSize: 'chunkSize',
            refreshModels: 'refreshModels'
        };

        const elements = {};
        for (const [key, id] of Object.entries(elementIds)) {
            const element = document.getElementById(id);
            if (element) {
                elements[key] = element;
            } else {
                console.warn(`Element with id '${id}' not found`);
            }
        }
        
        return elements;
    }

    getElement(name) {
        return this.elements[name];
    }

    getValue(elementName) {
        const element = this.elements[elementName];
        return element ? element.value : '';
    }

    setValue(elementName, value) {
        const element = this.elements[elementName];
        if (element) {
            element.value = value;
        }
    }

    setHtml(elementName, html) {
        const element = this.elements[elementName];
        if (element) {
            element.innerHTML = html;
        }
    }

    setText(elementName, text) {
        const element = this.elements[elementName];
        if (element) {
            element.textContent = text;
        }
    }

    show(elementName) {
        const element = this.elements[elementName];
        if (element) {
            element.style.display = 'block';
        }
    }

    hide(elementName) {
        const element = this.elements[elementName];
        if (element) {
            element.style.display = 'none';
        }
    }

    addClass(elementName, className) {
        const element = this.elements[elementName];
        if (element) {
            element.classList.add(className);
        }
    }

    removeClass(elementName, className) {
        const element = this.elements[elementName];
        if (element) {
            element.classList.remove(className);
        }
    }

    setStyle(elementName, property, value) {
        const element = this.elements[elementName];
        if (element) {
            element.style[property] = value;
        }
    }

    addEventListener(elementName, event, handler) {
        const element = this.elements[elementName];
        if (element) {
            element.addEventListener(event, handler);
        }
    }

    removeEventListener(elementName, event, handler) {
        const element = this.elements[elementName];
        if (element) {
            element.removeEventListener(event, handler);
        }
    }

    createOption(value, text, selected = false) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = text;
        option.selected = selected;
        return option;
    }

    clearChildren(elementName) {
        const element = this.elements[elementName];
        if (element) {
            element.innerHTML = '';
        }
    }

    appendChild(elementName, child) {
        const element = this.elements[elementName];
        if (element) {
            element.appendChild(child);
        }
    }
}