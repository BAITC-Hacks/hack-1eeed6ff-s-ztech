import { chromium } from '../../../../web/node_modules/playwright/index.mjs';
import { mkdir,writeFile,readFile } from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const root = process.cwd() + '/';
const out=root+'output/playwright/';
await mkdir(out,{recursive:true}); await mkdir(root+'work/common-final/',{recursive:true});
const mode=process.argv[2]||'offline', live=mode==='live';
const origin=live?'http://127.0.0.1:8000':'http://127.0.0.1:8007';
const sources=['100000008748914100','100000008304139100','100000003880331100','100000004358004100','100000003528285100'];
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:900},colorScheme:'dark',acceptDownloads:true});
let paid=0;const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.url().endsWith('/api/v1/agent/query'))paid++;});
const report={mode,start:new Date().toISOString(),checks:[]};
try {
 await page.goto(origin);await page.getByRole('button',{name:'Открыть платформу',exact:true}).click();
 const apiCSV={};for(const name of ['nodes_roles.csv','clusters.csv','top_nodes.csv']) {const r=await page.request.get(origin+'/api/v1/exports/'+name);assert(r.ok());apiCSV[name]=createHash('sha256').update(await r.body()).digest('hex');}
 await page.getByRole('button',{name:'Открыть AI-аналитика'}).click();assert.equal(paid,0);
 await page.getByText('Общие получатели · без API-ключа',{exact:true}).click();
 const input=page.getByLabel('Отправители: 2–5 разных gid');
 await input.fill(sources.join('\n'));
 const request=page.waitForResponse(r=>r.url().includes('/analysis/common-recipients'));
 await page.getByRole('button',{name:'Найти общих получателей',exact:true}).click();
 const r=await request;assert.equal(r.status(),200);const data=await r.json();
 assert.equal(data.matched_recipients,1);assert.equal(data.items[0].gid,'100000003684369100');assert.equal(data.items[0].sum_kzt,'2874700.00');assert.equal(data.items[0].n_tx,31);assert.equal(data.items[0].source_count,5);
 const region=page.getByRole('region',{name:'Общие получатели',exact:true});await region.waitFor();assert((await region.textContent()).includes('2874700.00 KZT'));
 report.common_response=data;report.checks.push('five exact sources and full raw totals');
 await region.scrollIntoViewIfNeeded();await page.screenshot({path:out+mode+'-common-dark.png'});
 await page.getByRole('button',{name:'Подготовить вопрос AI',exact:true}).click();
 const question=await page.getByLabel('Вопрос аналитику',{exact:true}).inputValue();for(const gid of sources)assert(question.includes(gid));assert.equal(paid,0);report.checks.push('AI handoff does not submit or charge');
 if(live){
   const started=Date.now();const answerResponse=page.waitForResponse(r=>r.url().endsWith('/api/v1/agent/query'),{timeout:150000});
   await page.getByRole('button',{name:'Задать вопрос',exact:true}).click();
   await page.getByText('Аналитик обрабатывает вопрос…',{exact:true}).waitFor();
   const response=await answerResponse;assert.equal(response.status(),200);report.response=await response.json();report.seconds=(Date.now()-started)/1000;
   assert.equal(report.response.model,'gpt-6-astra');assert(report.response.answer.includes('2874700.00'));assert(report.response.answer.includes('31 операций'));
   const answer=page.getByRole('region',{name:'Ответ AI-аналитика'});await answer.waitFor();assert((await answer.textContent()).includes('2874700.00'));
   await page.getByRole('heading',{name:'Ответ с основаниями'}).scrollIntoViewIfNeeded();await page.screenshot({path:out+'live-astra-answer.png'});
   const download=page.waitForEvent('download');await page.getByRole('button',{name:'Сохранить ответ',exact:true}).click();await(await download).saveAs(root+'work/common-final/astra-answer.md');
   report.source_statuses=[];for(const url of new Set(report.response.citations.map(c=>c.url))){const r=await page.request.get(origin+url);assert(r.ok());report.source_statuses.push({url,status:r.status()});}
   report.checks.push('real Astra response, complete group, source URLs and Markdown download');assert.equal(paid,1);
 } else {
   assert(await page.getByRole('button',{name:'Задать вопрос',exact:true}).isDisabled());
   await page.getByRole('button',{name:'Открыть общего получателя 100000003684369100'}).click();
   await page.getByTestId('node-detail').waitFor();assert.equal(await page.getByTestId('node-detail').getAttribute('data-gid'),'100000003684369100');
   await page.getByRole('button',{name:'Открыть AI-аналитика'}).click();assert.equal(await input.inputValue(),sources.join('\n'));assert((await region.textContent()).includes('2874700.00'));report.checks.push('recipient navigation preserves group and result');
   await input.fill('100000002578405100 100000000331309100');const empty=page.waitForResponse(r=>r.url().includes('/analysis/common-recipients'));
   await page.getByRole('button',{name:'Найти общих получателей',exact:true}).click();assert.equal((await(await empty).json()).matched_recipients,0);await page.getByText('Общих прямых получателей в наблюдаемой выгрузке нет. Это не исключает связей через другие узлы.',{exact:true}).waitFor();report.checks.push('honest empty intersection');
   await input.fill(sources[0]+' '+sources[0]);await page.getByRole('button',{name:'Найти общих получателей',exact:true}).click();await page.getByRole('alert').filter({hasText:'разных полных gid'}).waitFor();report.checks.push('duplicate selection validation');
   await input.fill('');await page.keyboard.press('Escape');
   for (const id of sources.slice(0,2)){
     const search=page.getByRole('textbox',{name:'Поиск по полному gid'});await search.fill(id);await search.press('Enter');
     await page.waitForFunction(id=>document.querySelector('[data-testid="node-detail"]')?.getAttribute('data-gid')===id,id);
     await page.getByRole('button',{name:'Открыть AI-аналитика'}).click();await page.getByRole('button',{name:'Добавить выбранный узел',exact:true}).click();await page.keyboard.press('Escape');
   }
   await page.getByRole('button',{name:'Открыть AI-аналитика'}).click();assert.equal(await input.inputValue(),sources.slice(0,2).join('\n'));report.checks.push('build group by adding nodes across close and reopen');
   await input.fill(sources.join('\n'));const again=page.waitForResponse(r=>r.url().includes('/analysis/common-recipients'));await page.getByRole('button',{name:'Найти общих получателей',exact:true}).click();await again;await region.waitFor();
   for(const theme of ['dark','light']){
     await page.keyboard.press('Escape');const toggle=page.getByRole('switch',{name:'Тёмная тема',exact:true});if((await toggle.getAttribute('aria-checked')==='true')!==(theme==='dark'))await toggle.click();await page.getByRole('button',{name:'Открыть AI-аналитика'}).click();
     for(const [width,height] of [[1440,900],[1280,800],[1024,768]]) {await page.setViewportSize({width,height});await region.scrollIntoViewIfNeeded();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));const box=await page.getByRole('dialog').boundingBox();assert(box.x>=0&&box.width<=width);await page.screenshot({path:out+'common-'+theme+'-'+width+'.png'});}
   }
   assert.equal(paid,0);report.checks.push('six theme/viewport combinations without horizontal overflow');
 }
 const after={};for(const name of Object.keys(apiCSV)){const r=await page.request.get(origin+'/api/v1/exports/'+name);after[name]=createHash('sha256').update(await r.body()).digest('hex');}assert.deepEqual(after,apiCSV);assert.deepEqual(errors,[]);
 report.csv_hashes=after;report.paid_requests=paid;report.page_errors=errors;report.finish=new Date().toISOString();report.pass=true;
 await writeFile(root+'work/common-final/browser-'+mode+'.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({mode,pass:true,checks:report.checks,paid,usage:report.response?.usage,seconds:report.seconds}));
}finally{await browser.close();}
