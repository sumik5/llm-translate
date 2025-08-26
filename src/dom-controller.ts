// ==================== DOM Controller ====================
// Handles all DOM element access and manipulation

export type EventHandlerFunction<T extends Event = Event> = (event: T) => void;

export interface ElementMap {
    [key: string]: HTMLElement;
}

export interface ElementIds {
    readonly inputText: string;
    readonly outputText: string;
    readonly targetLang: string;
    readonly apiUrl: string;
    readonly modelName: string;
    readonly fileInput: string;
    readonly translateBtn: string;
    readonly saveHtmlBtn: string;
    readonly markdownPreview: string;
    readonly errorMessage: string;
    readonly inputCharCount: string;
    readonly outputCharCount: string;
    readonly progressFill: string;
    readonly progressInfo: string;
    readonly statusMessage: string;
    readonly chunkSize: string;
    readonly refreshModels: string;
}

export class DOMController {
    public readonly elements: ElementMap;

    constructor() {
        this.elements = this.initializeElements();
    }

    private initializeElements(): ElementMap {
        const elementIds: ElementIds = {
            inputText: 'inputText',
            outputText: 'outputText',
            targetLang: 'targetLang',
            apiUrl: 'apiUrl',
            modelName: 'modelName',
            fileInput: 'fileInput',
            translateBtn: 'translateBtn',
            saveHtmlBtn: 'saveHtmlBtn',
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

        const elements: ElementMap = {};
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

    getElement(name: string): HTMLElement | null {
        return this.elements[name] || null;
    }

    getValue(elementName: string): string {
        const element = this.elements[elementName];
        if (!element) return '';
        
        if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
            return element.value;
        }
        return element.textContent || '';
    }

    setValue(elementName: string, value: string): void {
        const element = this.elements[elementName];
        if (!element) return;
        
        if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
            element.value = value;
        } else {
            element.textContent = value;
        }
    }

    setHtml(elementName: string, html: string): void {
        const element = this.elements[elementName];
        if (element) {
            element.innerHTML = html;
        }
    }

    setText(elementName: string, text: string): void {
        const element = this.elements[elementName];
        if (element) {
            element.textContent = text;
        }
    }

    show(elementName: string): void {
        const element = this.elements[elementName] as HTMLElement;
        if (element) {
            element.style.display = 'block';
        }
    }

    hide(elementName: string): void {
        const element = this.elements[elementName] as HTMLElement;
        if (element) {
            element.style.display = 'none';
        }
    }

    addClass(elementName: string, className: string): void {
        const element = this.elements[elementName];
        if (element) {
            element.classList.add(className);
        }
    }

    removeClass(elementName: string, className: string): void {
        const element = this.elements[elementName];
        if (element) {
            element.classList.remove(className);
        }
    }

    setStyle(elementName: string, property: string, value: string): void {
        const element = this.elements[elementName] as HTMLElement;
        if (element) {
            (element.style as any)[property] = value;
        }
    }

    addEventListener<K extends keyof HTMLElementEventMap>(
        elementName: string, 
        event: K, 
        handler: EventHandlerFunction<HTMLElementEventMap[K]>
    ): void;
    addEventListener(
        elementName: string, 
        event: string, 
        handler: EventHandlerFunction
    ): void;
    addEventListener(
        elementName: string, 
        event: string, 
        handler: EventHandlerFunction
    ): void {
        const element = this.elements[elementName];
        if (element) {
            element.addEventListener(event, handler);
        }
    }

    removeEventListener<K extends keyof HTMLElementEventMap>(
        elementName: string, 
        event: K, 
        handler: EventHandlerFunction<HTMLElementEventMap[K]>
    ): void;
    removeEventListener(
        elementName: string, 
        event: string, 
        handler: EventHandlerFunction
    ): void;
    removeEventListener(
        elementName: string, 
        event: string, 
        handler: EventHandlerFunction
    ): void {
        const element = this.elements[elementName];
        if (element) {
            element.removeEventListener(event, handler);
        }
    }

    createOption(value: string, text: string, selected: boolean = false): HTMLOptionElement {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = text;
        option.selected = selected;
        return option;
    }

    clearChildren(elementName: string): void {
        const element = this.elements[elementName];
        if (element) {
            element.innerHTML = '';
        }
    }

    appendChild(elementName: string, child: Node): void {
        const element = this.elements[elementName];
        if (element) {
            element.appendChild(child);
        }
    }
}