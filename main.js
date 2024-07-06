import puppeteer from 'puppeteer';
import fs from 'fs';

(async () => {
	const browser = await puppeteer.launch({ headless: false });
	const page = await browser.newPage();

	await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 15_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.5 Safari/605.1.15');
	await page.goto('https://tpp-act.taobao.com/yep/page/m/leer6kh915?spm=pc_detail.29232929/evo365560b447259.202205.3.544f7dd6OYrOjW');
	await new Promise(resolve => setTimeout(resolve, 3000));

	// 打开城市选择页面
	await page.click('.handleAreaCity__kzLJQ18053');

	// 函数：滚动页面以加载更多城市
	const scrollPage = async () => {
		await page.evaluate(() => {
			window.scrollBy(0, window.innerHeight);
		});
		await new Promise(resolve => setTimeout(resolve, 1000));
	};

	// 循环滚动，直到所有城市都加载完成
	let previousHeight;
	let currentHeight = await page.evaluate('document.body.scrollHeight');
	do {
		previousHeight = currentHeight;
		await scrollPage();
		currentHeight = await page.evaluate('document.body.scrollHeight');
	} while (currentHeight > previousHeight);

	// 获取所有城市元素
	let cityElements = await page.$$('.cityItem__PmNjd47726');
	console.log(`城市数量：${cityElements.length}`);

	for (let i = 0; i < cityElements.length; i++) {
		// 获取元素下的txt
		const cityTxt = await page.evaluate((cityElement) => cityElement.innerText, cityElements[i]);
		// 判断文件是否存在 存在则跳过
		const fileName = `./data/${cityTxt}.json`;
		if (fs.existsSync(fileName)) {
			console.log(`${fileName}文件已存在，跳过`);
			continue;
		}

		// 清除之前的response监听器
		page.removeAllListeners('response');

		// 监听拦截请求
		page.on('response', async (response) => {
			if (response.url().indexOf('https://acs.m.taobao.com/h5/mtop.film.mtopcinemaapi.getcinemalistinpage/7.5/') !== -1) {
				const res = await response.json();
				// 写入到文件
				fs.writeFileSync(`./data/${cityTxt}.json`, JSON.stringify(res.data.returnValue.cinemas));
			}
		});

		// 重新获取城市元素（因为页面重新加载后可能会失效）
		cityElements = await page.$$('.cityItem__PmNjd47726');
		const cityElement = cityElements[i];

		// 点击城市标签
		await cityElement.click();

		// 等待一段时间，以确保页面完全加载
		await new Promise(resolve => setTimeout(resolve, 3000));

		// 再次打开城市选择页面
		await page.click('.handleAreaCity__kzLJQ18053');
	}
	// await browser.close();
})();
