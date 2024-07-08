import puppeteer from 'puppeteer';
import redis from 'redis';
import mongodb from 'mongodb';
const client = redis.createClient({
    url: 'redis://127.0.0.1:6379'
});
const mongodbClient = mongodb.MongoClient;
const url = 'mongodb://root:123456@127.0.0.1';
const dbName = 'jav';
// 存入mongodb
async function saveToMongo(data) {
    try {
        const client = await mongodbClient.connect(url, { useUnifiedTopology: true });
        const db = client.db(dbName);
        const collection = db.collection('magnet_links');
        await collection.insertOne(data);
    } catch (err) {
        console.error('Error saving to MongoDB:', err);
    }
}

async function crawlIndexPage(page) {
    // 确保页面已加载并选择电影盒子
    await page.waitForSelector('.movie-box');

    // 获取当前页面的电影链接
    const links = await page.evaluate(() =>
        Array.from(document.querySelectorAll('.movie-box')).map(element => element.href)
    );

    // 将电影链接推送到 Redis 列表
    for (const url of links) {
        console.log(`Pushing URL to Redis: ${url}`);
        await client.lPush('javbus', url);
    }

    // 下滑到页面底部以加载更多内容
    await page.evaluate(async () => {
        await new Promise((resolve, reject) => {
            let totalHeight = 0;
            const distance = 100;
            const timer = setInterval(() => {
                const scrollHeight = document.body.scrollHeight;
                window.scrollBy(0, distance);
                totalHeight += distance;
                if (totalHeight >= scrollHeight) {
                    clearInterval(timer);
                    resolve();
                }
            }, 100);
        });
    });
    // 最多爬10页
    const currentPage = await page.evaluate(() => document.querySelector('.pagination').querySelector('.active').textContent);
    if (parseInt(currentPage) >= 10) {
        return;
    }
    // 确保下一页按钮已加载并且可点击
    const nextButton = await page.$('#next');
    if (nextButton) {
        await nextButton.click();
        await page.waitForNavigation({ waitUntil: 'networkidle2' });
        await crawlIndexPage(page); // 递归调用以爬取下一页
    } else {
        console.log('Next page button not found or not clickable');
    }
}

async function scrape(url, browser) {
    const page = await browser.newPage();
    try {
        await page.goto(url);
        await page.waitForSelector('#magnet-table');
        await page.goto(url);
        // 页面加载完成后，等待 .container 元素加载完成
        await page.waitForSelector('#magnet-table');
        const title = await page.evaluate(() => {
            const container = document.querySelector('.container');
            const h3 = container.querySelector('h3');
            return h3.textContent;
        });
        const magnetLinks = await page.evaluate(() => {
            const rows = Array.from(document.querySelectorAll('#magnet-table tr')).slice(1); // Skip header row
            return rows.map(row => {
                const magnetLink = row.querySelector('td a').href;
                const size = row.querySelectorAll('td')[1].innerText.trim();
                const date = row.querySelectorAll('td')[2].innerText.trim();
                return { magnetLink, size, date };
            });
        });
        // 获取参数信息
        const tags = await page.evaluate(() => {
            const container = document.querySelector('.info');

            // 获取所有txet
            console.log(container.textContent)
            const identifier = container.querySelector('p:nth-child(1) span:nth-child(2)').textContent.trim();

            const releaseDate = container.querySelector('p:nth-child(2)').textContent.trim();
            const length = container.querySelector('p:nth-child(3)').textContent.trim();
            const director = container.querySelector('p:nth-child(4) a').textContent.trim();
            return {
                identifier,
                releaseDate,
                length,
                director,
            };
        });
        // 预览图
        const preview = await page.evaluate(() => {
            const container = document.querySelector('.screencap');
            const img = container.querySelector('a img');
            return img.src;
        });
        const result = {
            identifier: tags.identifier,
            name: title,
            url: url,
            magnetLinks: magnetLinks,
            preview: preview,
            tags: tags,
        };
        await saveToMongo(result);
    } catch (err) {
        console.error(`Error scraping ${url}:`, err);
    } finally {
        await page.close();
    }
}

async function processQueue(browser) {
    while (true) {
        let url;
        try {
            url = await client.rPop('javbus');
            if (!url) {
                console.log('No more URLs to process or Redis list is empty');
                break;
            }
            console.log('processQueue url', url); // 确认是否成功获取到 URL
            await scrape(url, browser);
            await new Promise(resolve => setTimeout(resolve, 3000)); // 每次读取后等待3秒
        } catch (err) {
            console.error(`Error processing ${url}:`, err);
            break; // 出现错误时退出循环
        }
    }
}
(async () => {
    const browser = await puppeteer.launch();
    await client.connect();
    const page = await browser.newPage();
    await page.goto('https://www.javbus.com/');
    // await crawlIndexPage(page); // 调用爬取函数
    await processQueue(browser); // 调用处理队列函数
})();
