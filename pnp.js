import puppeteer from 'puppeteer';
import mysql from 'mysql2/promise';  // 使用 promise 版本的 mysql2

(async () => {
	const browser = await puppeteer.launch({ headless: false });
	const page = await browser.newPage();
	await page.goto('https://tophub.today/');

	// 使用 Puppeteer 抓取数据
	const data = await page.evaluate(() => {
		const nodes = document.querySelectorAll('#Sortable .cc-cd');
		const results = [];
		// 第一个剔除
		const title = document.querySelector('.cc-cd-lb span').textContent.trim();
		console.log(title);
		// 剔除第一个
		nodes.forEach(node => {
			const items = node.querySelectorAll('.cc-cd-cb-ll');
			items.forEach(item => {
				const rankElement = item.querySelector('.s');
				const titleElement = item.querySelector('.t');
				const linkElement = item.parentElement;
				const heatElement = item.querySelector('.e');

				results.push({
					rank: rankElement ? rankElement.textContent.trim() : null,
					title: titleElement ? titleElement.textContent.trim() : null,
					link: linkElement ? linkElement.getAttribute('href') : null,
					heat: heatElement ? heatElement.textContent.trim() : null,
				});
			});
		});
		return results;
	});

	console.log(data);
	// 创建 MySQL 连接
	const connection = await mysql.createConnection({
		host: '127.0.0.1',
		port: 3306,
		user: 'root',
		password: '123456',
		database: 'aa'
	});

	// 插入数据
	const sql = 'INSERT INTO hot (title, link,reak,heat) VALUES (?, ?, ?, ?)';
	for (const item of data) {
		const values = [item.title, item.link, item.rank, item.heat];
		try {
			const [results] = await connection.execute(sql, values);
			console.log('Data inserted, ID: ' + results.insertId);
		} catch (err) {
			console.error('error inserting: ' + err.stack);
		}
	}

	// 关闭连接
	await connection.end();
	// 关闭浏览器
	await browser.close();
})();
