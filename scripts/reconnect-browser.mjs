import { chromium } from 'playwright-core';
const browser=await chromium.launch({channel:'chrome'});
try {
 const context=await browser.newContext({viewport:{width:393,height:852},isMobile:true});
 const page=await context.newPage();
 const starts=[];
 page.on('request',r=>{if(r.url().endsWith('/api/trip')&&r.method()==='POST')starts.push(r.postDataJSON().searchId);});
 await page.goto('http://127.0.0.1:4340');
 await page.getByRole('textbox').fill('May trip 2027 leave from Richmond Virginia to Galapagos and I want a stop in Norway for a day or two');
 await page.getByRole('button',{name:'Analyze Trips',exact:true}).click();
 await page.getByText('What I understood',{exact:true}).waitFor({timeout:180000});
 await context.setOffline(true);
 await page.getByText(/Connection interrupted/).waitFor({timeout:25000});
 await page.screenshot({path:'.logs/reconnecting-mobile.png'});
 await context.setOffline(false);
 await page.reload();
 await page.getByText('What I understood',{exact:true}).waitFor({timeout:20000});
 if(new Set(starts).size!==1)throw Error('Reload started another search');
 console.log('PASS: real search resumed after offline connection and page reload; same search ID');
 await page.waitForFunction(()=>!!localStorage.getItem('flightfinder:last')||document.body.innerText.includes("Couldn't finish"),{},{timeout:600000});
 const result=await page.evaluate(()=>JSON.parse(localStorage.getItem('flightfinder:last')??'null'));
 if(!result)throw Error(await page.locator('main').innerText());
 await page.screenshot({path:'.logs/reconnect-results-mobile.png',fullPage:true});
 console.log('PASS: completed original screenshot query',result.journeys?.length,'routes', result.journeys?.[0]?.total);
}finally{await browser.close();}
