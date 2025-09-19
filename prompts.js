// prompts.jsonの内容をJavaScript変数として定義
// file://プロトコルでも読み込み可能にするため
window.PROMPT_CONFIG = {
  "translation": {
    "system": "Translate to {targetLanguage}. MAINTAIN EXACT MARKDOWN FORMAT.\n\nCRITICAL RULES FOR CODE BLOCKS:\n1. NEVER modify content inside ``` blocks\n2. NEVER add language identifiers (json, python, etc.) unless in original\n3. If original has ```\\n then output must have ```\\n (nothing after ```)\n4. Keep commands, code, and paths EXACTLY as they are\n\nCRITICAL RULES FOR TEXT:\n1. If original text has NO ```, translated text must have NO ```\n2. Normal text paragraphs must remain as normal text (never wrap in ```)\n3. Lists (- items) must remain as lists with same indentation\n\nEXAMPLE:\nOriginal: ```\\nadk run --help\\n```\nCORRECT: ```\\nadk run --help\\n```\nWRONG: ```json\\nadk run --help\\n```\n\nPreserve ALL formatting EXACTLY. Do not \"improve\" or change anything.",
    "markdown": {
      "instruction": "",
      "template": "{system}\n\nOriginal text:\n{text}"
    },
    "plain": {
      "instruction": "プレーンテキストとして翻訳してください。",
      "template": "{system}\n以下のテキストを{targetLanguage}に翻訳してください。\n{instruction}\n原文の意味を正確に保ち、自然な{targetLanguage}で表現してください。\n\n原文:\n{text}"
    }
  },
  "codeBlockRules": {
    "detection": {
      "startPattern": "^```",
      "endPattern": "^```$",
      "inlinePattern": "`[^`]+`"
    },
    "translation": {
      "preserveElements": [
        "変数名",
        "関数名",
        "クラス名",
        "メソッド名",
        "キーワード",
        "演算子",
        "import文",
        "export文"
      ],
      "translateElements": [
        "コメント（//、#、/* */）",
        "文字列リテラル（''、\"\"内のテキスト）",
        "docstring",
        "JSDoc",
        "型注釈のコメント"
      ]
    }
  },
  "languages": {
    "英語": {
      "code": "en",
      "name": "English"
    },
    "日本語": {
      "code": "ja",
      "name": "Japanese"
    },
    "中国語": {
      "code": "zh",
      "name": "Chinese"
    },
    "韓国語": {
      "code": "ko",
      "name": "Korean"
    },
    "スペイン語": {
      "code": "es",
      "name": "Spanish"
    },
    "フランス語": {
      "code": "fr",
      "name": "French"
    },
    "ドイツ語": {
      "code": "de",
      "name": "German"
    },
    "ロシア語": {
      "code": "ru",
      "name": "Russian"
    },
    "ポルトガル語": {
      "code": "pt",
      "name": "Portuguese"
    },
    "イタリア語": {
      "code": "it",
      "name": "Italian"
    }
  },
  "api": {
    "defaultEndpoint": "http://127.0.0.1:1234",
    "defaultModel": "local-model",
    "temperature": 0.3,
    "maxTokens": 10000,
    "chunkMaxTokens": 5000 
  }
};
