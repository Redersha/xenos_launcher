/**
 * MC百科 (mcmod.cn) 抓取服务
 * 用于获取模组的补充详情信息
 */
import axios from 'axios';
import * as cheerio from 'cheerio';

const MCMOD_BASE_URL = 'https://www.mcmod.cn';

export interface McmodModInfo {
  name: string;
  modId?: string;
  chineseName?: string;
  categories?: string[];
  tags?: string[];
  introduction?: string;
  description?: string;
  author?: string;
  sourceLink?: string;
  updateUrl?: string;
  homepage?: string;
  supportUrl?: string;
  found: boolean;
}

/**
 * 根据Modrinth slug搜索MC百科上的模组信息
 * @param modrinthSlug Modrinth项目slug
 * @returns MC百科模组信息
 */
export async function getMcmodInfoBySlug(modrinthSlug: string): Promise<McmodModInfo> {
  try {
    // 尝试通过slug直接搜索 MC百科
    // MC百科使用 /search/ 搜索，keyword参数搜索mod
    const searchUrl = `${MCMOD_BASE_URL}/search/`;
    const response = await axios.get(searchUrl, {
      params: { keyword: modrinthSlug },
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'zh-CN,zh;q=0.9',
      },
    });

    const $ = cheerio.load(response.data);
    
    // 尝试多种可能的选择器
    const firstResult = $('.result-item a, .mod-item a, .search-result-item a, .class-title a').first();
    const href = firstResult.attr('href');

    if (href) {
      return await getMcmodDetailByUrl(href);
    }

    // 备用：尝试直接按 /class/ 链接查找
    const classLink = $('a[href*="/class/"]').first().attr('href');
    if (classLink) {
      return await getMcmodDetailByUrl(classLink);
    }

    return { name: modrinthSlug, found: false };
  } catch (error) {
    console.error('MC百科搜索失败:', error);
    return { name: modrinthSlug, found: false };
  }
}

/**
 * 根据MC百科URL获取模组详情
 * @param url MC百科模组页面URL
 * @returns MC百科模组详细信息
 */
export async function getMcmodDetailByUrl(url: string): Promise<McmodModInfo> {
  try {
    // 确保URL完整
    const fullUrl = url.startsWith('http') ? url : `${MCMOD_BASE_URL}${url}`;

    const response = await axios.get(fullUrl, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'zh-CN,zh;q=0.9',
      },
    });

    const $ = cheerio.load(response.data);

    // 提取名称 - 尝试多种选择器
    const name = $('.class-title h3, .class-title, h3.title, .mod-title, h1').first().text().trim();
    
    // 提取中文名 - MC百科页面标题通常包含中文名
    const chineseName = $('.class-title h3, .class-title, h3.title, .mod-title').first().text().trim() || name;

    const info: McmodModInfo = {
      name: name || url,
      chineseName: chineseName || undefined,
      found: true,
    };

    // 提取分类 - MC百科分类通常在面包屑或标签区域
    const categories: string[] = [];
    $('.class-info a[href*="/list/"], .breadcrumb a, a[href*="/category/"], a[href*="/list/"]').each((_, el) => {
      const cat = $(el).text().trim();
      if (cat && !['首页', 'MOD', 'MC百科', '分类', ''].includes(cat)) {
        categories.push(cat);
      }
    });
    // 也尝试从class-info中提取
    $('.class-info .col-lg-9 .block, .class-info .info-list span').each((_, el) => {
      const text = $(el).text().trim();
      if (text && !text.includes('：')) {
        const parts = text.split('、');
        parts.forEach(p => {
          const v = p.trim();
          if (v && !categories.includes(v)) categories.push(v);
        });
      }
    });
    info.categories = categories;

    // 提取标签
    const tags: string[] = [];
    $('.classinfo a[href*="/class/"], .common-icon-text, a.common-icon').each((_, el) => {
      const tag = $(el).text().trim();
      if (tag) tags.push(tag);
    });
    info.tags = tags;

    // 提取MOD ID
    const modIdText = $('span:contains("MODID"), li:contains("MODID")').first().text().trim();
    if (modIdText) {
      info.modId = modIdText.replace(/MODID[：:]\s*/i, '').trim();
    }

    // 提取介绍 - 通常在描述区域
    const introText = $('meta[name="description"]').attr('content') || 
                      $('.class-description, .class-intro, .desktop-classinfo p, .class-info .col-lg-9 p').first().text().trim();
    if (introText) info.introduction = introText.substring(0, 500);

    // 提取描述
    const descText = $('.class-desc, .short-description').first().text().trim();
    if (descText) info.description = descText;

    // 提取作者
    const authorText = $('span:contains("作者"), li:contains("作者")').first().text().trim();
    if (authorText) {
      info.author = authorText.replace(/^作者[：:]\s*/, '').trim();
    }

    // 提取链接
    const homepageLink = $('a[href*="curseforge.com"], a[href*="modrinth.com"], a[href*="github.com"]').first().attr('href');
    if (homepageLink) info.homepage = homepageLink;
    
    const sourceLink = $('a:contains("源码"), a:contains("源代码")').first().attr('href');
    if (sourceLink) info.sourceLink = sourceLink;

    return info;
  } catch (error) {
    console.error('MC百科详情获取失败:', error);
    return { name: url, found: false };
  }
}

/**
 * 根据模组名称搜索MC百科
 * @param modName 模组名称
 * @returns MC百科模组信息
 */
export async function searchMcmodByName(modName: string): Promise<McmodModInfo> {
  try {
    // 使用MC百科搜索
    const searchUrl = `${MCMOD_BASE_URL}/search/`;
    const response = await axios.get(searchUrl, {
      params: { modpack: modName },
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; TerminalCraftLauncher/1.0)',
      },
    });

    const $ = cheerio.load(response.data);

    // 尝试从搜索结果中获取第一个匹配的模组
    const firstResult = $('.mod-item').first();
    const link = firstResult.find('a').attr('href');

    if (link) {
      return await getMcmodDetailByUrl(link);
    }

    // 如果没有找到，尝试获取搜索结果中的名称
    const resultName = firstResult.find('.name, .title').first().text().trim();
    if (resultName) {
      return {
        name: resultName,
        found: true,
        categories: [],
        tags: [],
      };
    }

    return { name: modName, found: false };
  } catch (error) {
    console.error('MC百科搜索失败:', error);
    return { name: modName, found: false };
  }
}
