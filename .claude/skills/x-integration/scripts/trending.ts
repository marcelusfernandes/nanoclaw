#!/usr/bin/env npx tsx
/**
 * X Integration - Trending Topics
 * Usage: echo '{}' | npx tsx trending.ts
 */

import { getBrowserContext, runScript, config, ScriptResult } from '../lib/browser.js';

interface TrendingInput {
  count?: number;
}

interface TrendData {
  rank: number;
  topic: string;
  category?: string;
  postCount?: string;
}

async function getTrending(input: TrendingInput): Promise<ScriptResult> {
  const { count = 20 } = input;

  let context = null;
  try {
    context = await getBrowserContext();
    const page = context.pages()[0] || await context.newPage();

    await page.goto('https://x.com/explore/tabs/trending', { timeout: config.timeouts.navigation, waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(config.timeouts.pageLoad + 2000);

    // Try trending page first, fallback to explore
    let trendElements = page.locator('[data-testid="trend"]');
    let trendCount = await trendElements.count();

    if (trendCount === 0) {
      // Fallback: try the explore page
      await page.goto('https://x.com/explore', { timeout: config.timeouts.navigation, waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(config.timeouts.pageLoad + 2000);
      trendElements = page.locator('[data-testid="trend"]');
      trendCount = await trendElements.count();
    }

    if (trendCount === 0) {
      // Second fallback: try the "What's happening" section on home
      await page.goto('https://x.com/home', { timeout: config.timeouts.navigation, waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(config.timeouts.pageLoad + 2000);
      trendElements = page.locator('[data-testid="trend"]');
      trendCount = await trendElements.count();
    }

    const trends: TrendData[] = [];
    const limit = Math.min(count, trendCount, 30);

    for (let i = 0; i < limit; i++) {
      try {
        const trend = trendElements.nth(i);
        const allText = await trend.textContent().catch(() => '');

        if (!allText) continue;

        // Parse trend text - typically structured as:
        // "Category · Trending\nTopic\nN posts" or "N · Trending\nTopic\nN posts"
        const lines = allText.split('\n').map(l => l.trim()).filter(Boolean);

        let topic = '';
        let category = '';
        let postCount = '';

        for (const line of lines) {
          if (line.toLowerCase().includes('trending')) {
            // This line contains category info
            const catMatch = line.match(/^(.+?)\s*·\s*Trending/i);
            if (catMatch) category = catMatch[1].trim();
          } else if (line.match(/^\d+[\d,.]*[KkMm]?\s*(posts|post)/i)) {
            postCount = line;
          } else if (line.match(/^#?\w/) && !topic) {
            topic = line;
          }
        }

        // If no topic found, use the longest non-category line
        if (!topic) {
          const candidates = lines.filter(l => !l.toLowerCase().includes('trending') && !l.match(/^\d+\s*·/));
          topic = candidates.sort((a, b) => b.length - a.length)[0] || lines[0] || '';
        }

        if (topic) {
          trends.push({
            rank: i + 1,
            topic,
            category: category || undefined,
            postCount: postCount || undefined,
          });
        }
      } catch {
        // Skip trends that fail to parse
      }
    }

    if (trends.length === 0) {
      return { success: true, message: 'No trending topics found.' };
    }

    const formatted = trends.map(t =>
      `${t.rank}. ${t.topic}${t.category ? ` (${t.category})` : ''}${t.postCount ? ` — ${t.postCount}` : ''}`
    ).join('\n');

    return {
      success: true,
      message: `Trending topics:\n\n${formatted}`,
      data: trends,
    };

  } finally {
    if (context) await context.close();
  }
}

runScript<TrendingInput>(getTrending);
