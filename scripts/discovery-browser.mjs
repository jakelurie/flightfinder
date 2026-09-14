import { chromium } from 'playwright-core';
import { readFile } from 'node:fs/promises';
const result=JSON.parse(await readFile('.logs/discovery-fixture.json','utf8'));
const browser=await chromium.launch({channel:'chrome'});
try {
 const page=await browser.newPage({viewport:{width:393,height:852},isMobile:true});
 await page.goto('http://127.0.0.1:4340');
 await page.evaluate(r=>localStorage.setItem('flightfinder:last',JSON.stringify(r)),result);
 await page.reload();
 await page.getByRole('heading',{name:'Where could you go?'}).waitFor();
 const grid=page.getByRole('region',{name:'Explore destinations'});
 if(await grid.locator('article').count()!==16)throw Error('Missing destinations');
 await page.getByLabel('Sort destinations').selectOption('price');
 const first=await grid.locator('article').first().innerText();
 const cheapest=[...result.destinations].sort((a,b)=>a.price-b.price)[0];
 if(!first.includes(cheapest.city))throw Error('Price sort failed');
 await page.getByLabel('Filter region').selectOption('europe');
 if(await grid.locator('article').count()===16)throw Error('Region filter failed');
 await page.getByLabel('Filter region').selectOption('all');
 if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Horizontal overflow');
 await page.screenshot({path:'.logs/discovery-mobile.png',fullPage:true});
 await grid.getByRole('button',{name:/View .* flights/}).first().click();
 await page.getByRole('dialog').waitFor();
 console.log('PASS: 16 cards, price sort, region filter, flight details, mobile width');
}finally{await browser.close();}
