// prompts.jsonの内容をJavaScript変数として定義
// file://プロトコルでも読み込み可能にするため
window.PROMPT_CONFIG = {
  "translation": {
    "system": "Translate to {targetLanguage}. Keep markdown format. Translate only comments and strings in code blocks.",
    "markdown": {
      "instruction": "",
      "template": "{system}\n\n{text}"
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
