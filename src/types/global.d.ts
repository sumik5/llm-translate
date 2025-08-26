/**
 * Global type definitions for LLM Translate project
 * Gradual migration support for existing JavaScript modules
 */

declare global {
  interface Window {
    FileProcessor?: any;
    EPUBProcessor?: any;
    PDFProcessor?: any;
    TextProcessor?: any;
    MarkdownProcessor?: any;
    ImageManager?: any;
    translatorApp?: any;
    JSZip?: any;
    pdfjsLib?: any;
    marked?: any;
    Prism?: any;
  }
}

// Basic type definitions for existing modules
export interface TranslationConfig {
  model: string;
  apiKey: string;
  temperature: number;
  maxTokens: number;
  prompt: string;
}

export interface FileProcessorOptions {
  outputFormat: 'text' | 'html' | 'markdown';
  preserveFormatting: boolean;
}

export interface TranslationRequest {
  text: string;
  sourceLanguage: string;
  targetLanguage: string;
  config: TranslationConfig;
}

export interface TranslationResponse {
  translatedText: string;
  originalText: string;
  status: 'success' | 'error';
  error?: string;
}

export interface ProcessedFile {
  name: string;
  content: string;
  type: string;
  size: number;
}

export interface UIState {
  isTranslating: boolean;
  progress: number;
  currentFile?: string;
  error?: string;
}

// DOM utility types
export type EventHandler<T extends Event = Event> = (event: T) => void;

export interface ElementCreationOptions {
  className?: string;
  textContent?: string;
  innerHTML?: string;
  attributes?: Record<string, string>;
  eventListeners?: Record<string, EventHandler>;
}

// Translation service types
export interface APIClient {
  request(endpoint: string, options: RequestInit): Promise<Response>;
}

export interface TranslationService {
  translate(request: TranslationRequest): Promise<TranslationResponse>;
}

export {};