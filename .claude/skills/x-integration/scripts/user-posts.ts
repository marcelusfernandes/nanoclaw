#!/usr/bin/env npx tsx
/**
 * X Integration - Read User Posts
 * Usage: echo '{"username":"elonmusk","count":10}' | npx tsx user-posts.ts
 */

import { getBrowserContext, runScript, config, ScriptResult } from '../lib/browser.js';

interface UserPostsInput {
  username: string;
  count?: number;
  tab?: 'posts' | 'replies' | 'media' | 'likes';
}

interface TweetData {
  text: string;
  url: string;
  metrics: { replies?: string; retweets?: string; likes?: string; views?: string };
  time?: string;
  isRetweet: boolean;
  isPinned: boolean;
}

async function getUserPosts(input: UserPostsInput): Promise<ScriptResult> {
  const { username, count = 10, tab = 'posts' } = input;

  if (!username || username.trim().length === 0) {
    return { success: false, message: 'Username is required' };
  }

  // Clean username (remove @ if present)
  const cleanUser = username.replace(/^@/, '').trim();

  let context = null;
  try {
    context = await getBrowserContext();
    const page = context.pages()[0] || await context.newPage();

    const tabPath = tab === 'replies' ? '/with_replies' : tab === 'media' ? '/media' : tab === 'likes' ? '/likes' : '';
    const profileUrl = `https://x.com/${cleanUser}${tabPath}`;

    await page.goto(profileUrl, { timeout: config.timeouts.navigation, waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(config.timeouts.pageLoad + 2000);

    // Check if profile exists
    const notFound = await page.locator('text="This account doesn\'t exist"').isVisible().catch(() => false);
    const suspended = await page.locator('text="Account suspended"').isVisible().catch(() => false);
    if (notFound) {
      return { success: false, message: `User @${cleanUser} not found.` };
    }
    if (suspended) {
      return { success: false, message: `User @${cleanUser} is suspended.` };
    }

    // Get profile info
    const displayName = await page.locator('[data-testid="UserName"]').first().textContent().catch(() => cleanUser);
    const bioEl = page.locator('[data-testid="UserDescription"]');
    const bio = await bioEl.textContent().catch(() => '');
    const followersEl = page.locator(`a[href="/${cleanUser}/verified_followers"], a[href="/${cleanUser}/followers"]`).first();
    const followers = await followersEl.textContent().catch(() => '');

    // Get tweets
    const articles = page.locator('article[data-testid="tweet"]');
    const articleCount = await articles.count();

    const tweets: TweetData[] = [];
    const limit = Math.min(count, articleCount, 20);

    for (let i = 0; i < limit; i++) {
      try {
        const article = articles.nth(i);

        const tweetText = await article.locator('[data-testid="tweetText"]').textContent().catch(() => '');

        // Check if pinned
        const socialContext = await article.locator('[data-testid="socialContext"]').textContent().catch(() => '');
        const isPinned = socialContext?.toLowerCase().includes('pinned') || false;

        // Check if retweet
        const isRetweet = socialContext?.toLowerCase().includes('reposted') || false;

        // Get tweet URL
        const statusLink = article.locator('a[href*="/status/"]').first();
        const href = await statusLink.getAttribute('href').catch(() => '');
        const url = href ? `https://x.com${href}` : '';

        // Timestamp
        const timeEl = article.locator('time').first();
        const datetime = await timeEl.getAttribute('datetime').catch(() => null);

        // Metrics
        const replyCount = await article.locator('[data-testid="reply"] span').textContent().catch(() => '');
        const retweetCount = await article.locator('[data-testid="retweet"] span').textContent().catch(() => '');
        const likeCount = await article.locator('[data-testid="like"] span').textContent().catch(() => '');
        const viewCount = await article.locator('a[href*="/analytics"] span').textContent().catch(() => '');

        tweets.push({
          text: tweetText || '',
          url,
          metrics: {
            replies: replyCount || undefined,
            retweets: retweetCount || undefined,
            likes: likeCount || undefined,
            views: viewCount || undefined,
          },
          time: datetime || undefined,
          isRetweet,
          isPinned,
        });
      } catch {
        // Skip tweets that fail to parse
      }
    }

    let header = `👤 ${displayName}\n`;
    if (bio) header += `📝 ${bio}\n`;
    if (followers) header += `👥 ${followers}\n`;
    header += '\n';

    if (tweets.length === 0) {
      return { success: true, message: `${header}No tweets found.` };
    }

    const formatted = tweets.map((t, i) => {
      const prefix = t.isPinned ? '📌 ' : t.isRetweet ? '🔁 ' : '';
      return `${i + 1}. ${prefix}${t.time || ''}\n   ${t.text.slice(0, 200)}${t.text.length > 200 ? '...' : ''}\n   ${t.url}\n   💬${t.metrics.replies || '0'} 🔁${t.metrics.retweets || '0'} ❤️${t.metrics.likes || '0'}${t.metrics.views ? ` 👁${t.metrics.views}` : ''}`;
    }).join('\n\n');

    return {
      success: true,
      message: `${header}${tweets.length} recent posts:\n\n${formatted}`,
      data: { profile: { displayName, bio, followers }, tweets },
    };

  } finally {
    if (context) await context.close();
  }
}

runScript<UserPostsInput>(getUserPosts);
