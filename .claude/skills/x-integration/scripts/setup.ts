#!/usr/bin/env npx tsx
/**
 * X Integration - Authentication Setup
 * Usage: npx tsx setup.ts
 *
 * On headless servers: launches Chrome with remote debugging on port 9222.
 * User connects via SSH tunnel to log in from their local browser.
 *
 * On desktop: opens Chrome window directly for manual login.
 */

import { chromium } from 'playwright';
import { execSync } from 'child_process';
import * as readline from 'readline';
import fs from 'fs';
import path from 'path';
import { config, cleanupLockFiles } from '../lib/browser.js';

const REMOTE_DEBUG_PORT = 9222;

function isHeadless(): boolean {
  return !process.env.DISPLAY;
}

async function setup(): Promise<void> {
  console.log('=== X (Twitter) Authentication Setup ===\n');
  console.log(`Chrome path: ${config.chromePath}`);
  console.log(`Profile dir: ${config.browserDataDir}\n`);

  // Ensure directories exist
  fs.mkdirSync(path.dirname(config.authPath), { recursive: true });
  fs.mkdirSync(config.browserDataDir, { recursive: true });

  cleanupLockFiles();

  const headless = isHeadless();

  // On headless servers, start Xvfb
  if (headless) {
    const display = ':99';
    try {
      execSync(`Xvfb ${display} -screen 0 1280x800x24 &`, { stdio: 'ignore' });
      process.env.DISPLAY = display;
      await new Promise(r => setTimeout(r, 500));
    } catch {
      process.env.DISPLAY = display;
    }
  }

  const args = [
    ...config.chromeArgs.slice(0, 3),
    `--remote-debugging-port=${REMOTE_DEBUG_PORT}`,
  ];

  console.log('Launching browser...\n');

  const context = await chromium.launchPersistentContext(config.browserDataDir, {
    executablePath: config.chromePath,
    headless: false,
    viewport: config.viewport,
    args,
    ignoreDefaultArgs: config.chromeIgnoreDefaultArgs,
  });

  const page = context.pages()[0] || await context.newPage();
  await page.goto('https://x.com/login');

  if (headless) {
    console.log('=== REMOTE LOGIN ===');
    console.log('O Chrome está rodando na VPS com remote debugging na porta 9222.');
    console.log('');
    console.log('No seu computador local, rode:');
    console.log(`  ssh -L 9222:localhost:9222 ${process.env.USER}@<IP_DA_VPS>`);
    console.log('');
    console.log('Depois abra no seu navegador local:');
    console.log('  http://localhost:9222');
    console.log('');
    console.log('Clique no link da página do X para controlar o Chrome remoto.');
    console.log('Faça login no X normalmente.');
    console.log('');
  } else {
    console.log('Please log in to X in the browser window.');
  }

  console.log('Depois de fazer login e ver o feed, volte aqui e pressione Enter.\n');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  await new Promise<void>(resolve => {
    rl.question('Pressione Enter quando estiver logado... ', () => {
      rl.close();
      resolve();
    });
  });

  // Verify login
  console.log('\nVerificando login...');
  await page.goto('https://x.com/home');
  await page.waitForTimeout(config.timeouts.pageLoad);

  const isLoggedIn = await page.locator('[data-testid="SideNav_AccountSwitcher_Button"]').isVisible().catch(() => false);

  if (isLoggedIn) {
    fs.writeFileSync(config.authPath, JSON.stringify({
      authenticated: true,
      timestamp: new Date().toISOString()
    }, null, 2));

    console.log('\n✅ Autenticação concluída!');
    console.log(`Sessão salva em: ${config.browserDataDir}`);
    console.log('\nVocê pode usar as funcionalidades do X agora.');
  } else {
    console.log('\n❌ Não foi possível verificar o login.');
    console.log('Tente novamente e certifique-se de estar logado no X.');
  }

  await context.close();
}

setup().catch(err => {
  console.error('Setup failed:', err.message);
  process.exit(1);
});
