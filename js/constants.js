// ==================== Constants ====================

export const API_CONFIG = {
    DEFAULT_ENDPOINT: 'http://127.0.0.1:1234',
    DEFAULT_MODEL: 'local-model',
    TEMPERATURE: 0.3,
    MAX_TOKENS: 10000,
    CHUNK_MAX_TOKENS: 5000,
    TIMEOUT: 600000, // 10 minutes
    RETRY_ATTEMPTS: 3,
    RETRY_DELAY: 1000, // 1 second
};

export const FILE_TYPES = {
    EPUB: 'epub',
    PDF: 'pdf',
    TEXT: 'txt',
    MARKDOWN: 'md',
};

export const SUPPORTED_LANGUAGES = [
    { value: '日本語', label: '日本語' },
    { value: '英語', label: '英語' },
    { value: '中国語', label: '中国語' },
    { value: '韓国語', label: '韓国語' },
    { value: 'スペイン語', label: 'スペイン語' },
    { value: 'フランス語', label: 'フランス語' },
    { value: 'ドイツ語', label: 'ドイツ語' },
    { value: 'ロシア語', label: 'ロシア語' },
    { value: 'ポルトガル語', label: 'ポルトガル語' },
    { value: 'イタリア語', label: 'イタリア語' },
];

export const TOKEN_ESTIMATION = {
    JAPANESE_MULTIPLIER: 2,
    ENGLISH_MULTIPLIER: 1.3,
    OTHER_MULTIPLIER: 0.5,
    DEFAULT_CHUNK_SIZE: 500,
    MAX_CHUNK_SIZE: 12000,
};

export const UI_STATES = {
    IDLE: 'idle',
    TRANSLATING: 'translating',
    ERROR: 'error',
    SUCCESS: 'success',
};

export const ERROR_MESSAGES = {
    NO_TEXT: '翻訳するテキストを入力してください',
    NO_PROMPT_CONFIG: 'プロンプト設定が読み込まれていません。prompts.jsファイルが存在することを確認してください。',
    NO_PROMPT_TEMPLATE: 'プロンプトテンプレートが設定されていません',
    INVALID_FILE_TYPE: (type) => `不正なファイル形式です: ${type}`,
    FILE_READ_ERROR: (message) => `ファイル読み込みエラー: ${message}`,
    API_CONNECTION_ERROR: 'LM Studio APIに接続できません',
    API_GENERAL_ERROR: 'LM Studio APIへの接続に失敗しました',
    API_TIMEOUT_ERROR: 'APIリクエストがタイムアウトしました',
    API_RESPONSE_ERROR: 'APIレスポンスの形式が不正です',
    TRANSLATION_ERROR: (message) => `翻訳エラー: ${message}`,
    TRANSLATION_CANCELLED: '翻訳を中止しました',
    TRANSLATION_ABORTED: '翻訳が中止されました',
    CONFIGURATION_ERROR: '設定エラー',
    EPUB_PARSE_ERROR: 'EPUBファイルの解析に失敗しました',
    EPUB_CONTAINER_ERROR: 'META-INF/container.xml not found in EPUB',
    EPUB_ROOTFILE_ERROR: 'rootfile element not found in container.xml',
    EPUB_OPF_ERROR: 'Content OPF file not found',
    PDF_PARSE_ERROR: 'PDFファイルの解析に失敗しました',
};

export const DOM_SELECTORS = {
    INPUT_TEXT: 'inputText',
    OUTPUT_TEXT: 'outputText',
    TARGET_LANG: 'targetLang',
    API_URL: 'apiUrl',
    MODEL_NAME: 'modelName',
    FILE_INPUT: 'fileInput',
    TRANSLATE_BTN: 'translateBtn',
    SAVE_HTML_BTN: 'saveHtmlBtn',
    COPY_BUTTON: 'copyButton',
    MARKDOWN_PREVIEW: 'markdownPreview',
    ERROR_MESSAGE: 'errorMessage',
    INPUT_CHAR_COUNT: 'inputCharCount',
    OUTPUT_CHAR_COUNT: 'outputCharCount',
    PROGRESS_BAR: 'progressBar',
    PROGRESS_FILL: 'progressFill',
    PROGRESS_INFO: 'progressInfo',
    STATUS_MESSAGE: 'statusMessage',
    CHUNK_SIZE: 'chunkSize',
    REFRESH_MODELS: 'refreshModels',
};

export const CSS_CLASSES = {
    SHOW: 'show',
    LOADING: 'loading',
    TRANSLATING: 'translating',
    COPIED: 'copied',
    ERROR: 'error',
    SUCCESS: 'success',
    ACTIVE: 'active',
    INACTIVE: 'inactive',
};

export const REGEX_PATTERNS = {
    JAPANESE_CHARS: /[\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf]/g,
    ENGLISH_WORDS: /[a-zA-Z]+/g,
    CODE_BLOCK_START: /^```\w*/,
    CODE_BLOCK_END: /^```$/,
    CODE_LIKE_LINE: /^\s*(if|for|while|function|def|class|import|export|const|let|var|return)\s|^[\s]{4,}[\w]/,
    BULLET_POINTS: /^[•·▪▫◦‣⁃➢➣→\-*]\s+/,
    NUMBERED_LIST: /^\d+[.)]\s+/,
    LETTER_LIST: /^[a-z][.)]\s+/i,
    LANGUAGE_CLASS: [
        /language-([\w+-]+)/,
        /lang-([\w+-]+)/,
        /brush:\s*([\w+-]+)/,
        /highlight-([\w+-]+)/,
    ],
};

export const UNWANTED_PREFIXES = [
    '翻訳後の日本語テキスト:',
    '翻訳後のテキスト:',
    '日本語翻訳:',
    '以下が翻訳結果です:',
    '翻訳結果:',
    'Here is the translation:',
    'Translation:',
];