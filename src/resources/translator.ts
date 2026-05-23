/**
 * 翻译服务 - 使用 MyMemory API（免费，无需API密钥）
 * https://mymemory.translated.net/doc/spec.php
 */
import axios from 'axios';

const MYMEMORY_API = 'https://api.mymemory.translated.net/get';

export interface TranslationResult {
  translatedText: string;
  success: boolean;
  match?: number;
}

/**
 * 翻译文本
 * @param text 要翻译的文本
 * @param sourceLang 源语言代码 (如 'en')
 * @param targetLang 目标语言代码 (如 'zh-CN' 或 'zh')
 * @returns 翻译结果
 */
export async function translateText(
  text: string,
  sourceLang: string = 'en',
  targetLang: string = 'zh'
): Promise<TranslationResult> {
  if (!text || text.trim().length === 0) {
    return { translatedText: '', success: true };
  }

  // 限制文本长度（MyMemory单次请求限制）
  const maxLength = 500;
  const truncated = text.length > maxLength ? text.substring(0, maxLength) + '...' : text;

  try {
    const response = await axios.get(MYMEMORY_API, {
      params: {
        q: truncated,
        langpair: `${sourceLang}|${targetLang}`,
      },
      timeout: 10000,
    });

    if (response.data?.responseStatus === 200 && response.data?.responseData) {
      return {
        translatedText: response.data.responseData.translatedText,
        success: true,
        match: response.data.responseData.match,
      };
    }

    return { translatedText: truncated, success: false };
  } catch (error) {
    console.error('Translation error:', error);
    return { translatedText: truncated, success: false };
  }
}

/**
 * 检测文本是否已经是目标语言（简单检测）
 */
export function isLikelyTargetLanguage(text: string, targetLang: string): boolean {
  if (!text) return false;

  // 中文检测
  const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  const totalChars = text.replace(/\s/g, '').length;

  if (totalChars === 0) return false;

  if (targetLang.startsWith('zh')) {
    return chineseChars / totalChars > 0.3;
  }

  // 其他语言检测逻辑可以扩展
  return false;
}
