import { chromium } from 'playwright-core';
const browser=await chromium.launch({channel:'chrome'});
const base='http://127.0.0.1:4340';
try {
 const page=await browser.newPage({viewport:{width:393,height:852}});
 await page.route('**/api/status',r=>r.abort());
 await page.goto(base);
 if(await page.locator('script[src]').evaluateAll(es=>es.some(e=>/hmr|next-devtools/.test(e.src))))throw Error('Harness served the development runtime');
 await page.getByRole('textbox').fill('Tokyo next month');
 const button=page.getByRole('button',{name:'Analyze Trips',exact:true});
 if(await button.isDisabled())throw Error('Disabled with text');
 // Simulate restored/autofilled DOM text without a React input event.
 await page.getByRole('textbox').evaluate(el=>el.value='Seoul from restored text');
 let submitted;
 let polls=0;
 await page.route('**/api/trip*',async r=>{
   if(r.request().method()==='POST') {submitted=r.request().postDataJSON();await r.fulfill({json:{searchId:submitted.searchId}});}
   else { polls++; await r.fulfill({json:{events:polls===1?[{type:'progress',stage:'dates',message:'Comparing test dates…'}]:[{type:'error',message:'Test intercepted'}],cursor:polls,done:polls>1}}); }
 });
 await button.click();
 await page.getByText('Comparing test dates…').waitFor();
 if(new URL(page.url()).searchParams.has('trip'))throw Error('Submit fell back to a page reload');
 await page.getByText('Test intercepted').waitFor();
 if(submitted.query!=='Seoul from restored text')throw Error('Stale request submitted');
 console.log('PASS: status unavailable and restored DOM text');
 const context=await browser.newContext({javaScriptEnabled:false});
 const nojs=await context.newPage();await nojs.goto(base);
 await nojs.getByRole('textbox').fill('Tokyo preserved after restart');
 await nojs.getByRole('button',{name:'Analyze Trips',exact:true}).click();
 await nojs.waitForURL('**/?trip=*');
 if(await nojs.getByRole('textbox').inputValue()!=='Tokyo preserved after restart')throw Error('Request lost');
 console.log('PASS: JavaScript unavailable, native reload preserves request');
} finally {await browser.close();}
