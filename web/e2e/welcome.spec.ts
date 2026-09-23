import { test, expect } from '@playwright/test';
import { mockApi } from './fixture';

test.beforeEach(async ({ page }) => { await mockApi(page); });
test('welcome enters smoothly by keyboard, remembers the session and retains theme', async ({ page }, info) => {
  for (const size of [{width:1440,height:900},{width:1024,height:768},{width:360,height:780}]) {
    await page.setViewportSize(size); await page.goto('/');
    await expect(page.getByRole('heading',{name:'Граф денежных переводов',exact:true})).toBeVisible();
    await expect(page.getByRole('img',{name:'Freedom',exact:true})).toBeVisible();
    const enter=page.getByRole('button',{name:'Открыть платформу',exact:true});
    await expect(enter).toBeEnabled();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
  const toggle=page.getByRole('switch',{name:'Тёмная тема',exact:true});
  await toggle.click(); const theme=await page.locator('html').getAttribute('data-theme');
  await page.getByRole('button',{name:'Открыть платформу',exact:true}).press('Enter');
  await expect(page.getByRole('textbox',{name:'Поиск по полному gid'})).toBeFocused();
  await page.reload(); await expect(page.locator('.app')).toBeVisible();
  await expect(page.locator('.welcome')).toHaveCount(0);
  await expect(page.locator('html')).toHaveAttribute('data-theme',theme!);
  expect(theme).not.toBe(info.project.name);
  await page.getByRole('button',{name:'Стартовый экран Neverlose',exact:true}).click();
  await expect(page.locator('.welcome')).toBeVisible();
  await page.getByRole('button',{name:'Открыть платформу',exact:true}).click();
  await expect(page.locator('.app')).toBeVisible();
  expect(await page.locator('.app').evaluate(el=>getComputedStyle(el).animationName)).toBe('workspace-enter');
  await expect(page.getByRole('textbox',{name:'Поиск по полному gid'})).toBeFocused();
});
test('entry works with blocked session storage, reduced motion and an unavailable API', async ({ page }) => {
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.addInitScript(()=>{Object.defineProperty(window,'sessionStorage',{get(){throw new DOMException('Blocked','SecurityError');}});});
  await page.route('**/api/v1/**',route=>route.fulfill({status:503,json:{error:{code:'NOT_READY',message:'API не готов'},run_id:null}}));
  await page.goto('/');
  expect(await page.locator('.welcome-team').evaluate(el=>getComputedStyle(el).animationName)).toBe('none');
  await page.getByRole('button',{name:'Открыть платформу',exact:true}).click();
  await expect(page.locator('.welcome')).toHaveCount(0);
  await expect(page.getByRole('alert').first()).toBeVisible();
  await expect(page.getByTestId('network-canvas')).toHaveCount(0);
});
