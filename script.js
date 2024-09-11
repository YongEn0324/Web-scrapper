const puppeteer = require('puppeteer');
const fs = require('fs');
const csv = require('csv-parser');

async function checkPageContent(page) {
    try {
        return await page.evaluate(() => {
            let englishFound = false;
            let englishOptionFound = false;

            const htmlLang = document.documentElement.getAttribute('lang');
            const visibleText = document.body.innerText || document.documentElement.innerText;
            const englishWords = visibleText.match(/\b(the|and|is|in|of|to|you|that)\b/gi);
            const englishRatio = (englishWords ? englishWords.length : 0) / visibleText.length;

            if (htmlLang === 'en' || englishRatio > 0.05) {
                englishFound = true;
            }

            const languageSwitchers = document.querySelectorAll(
                "a[href*='lang=en'], a[href*='english'], select[name*='lang'] option"
            );
            languageSwitchers.forEach(switcher => {
                if (switcher.innerText && switcher.innerText.toLowerCase().includes('english')) {
                    englishOptionFound = true;
                }
            });

            if (!englishFound && !englishOptionFound) {
                return { english: false, checkout: false };
            }

            const elements = document.getElementsByTagName('*');
            let checkoutFound = false;
            for (let i = 0; i < elements.length; i++) {
                if (elements[i].innerText) {
                    const text = elements[i].innerText.toLowerCase();
                    if (text.includes('add to cart') || text.includes('add to bag') || text.includes('add to basket')) {
                        checkoutFound = true;
                        break;
                    }
                }
            }

            return {
                english: englishFound || englishOptionFound,
                checkout: checkoutFound
            };
        });
    } catch (err) {
        console.error(`Failed to evaluate page content: ${err.message}`);
        return { english: false, checkout: false };
    }
}

async function processUrls() {
    const browser = await puppeteer.launch({ headless: true });
    const results = [];

    const processRow = async (row) => {
        const url = row.url;
        console.log(`Processing ${url}`);
        const page = await browser.newPage();
        try {
            await page.setViewport({ width: 1280, height: 800 });
            await page.goto(url, { waitUntil: 'networkidle2', timeout: 25000 });

            const result = await checkPageContent(page);
            if (result.english && result.checkout) {
                results.push({ url, english: result.english, checkout: result.checkout });
            }
        } catch (err) {
            console.error(`Failed to process ${url}: ${err.message}`);
        } finally {
            await page.close();
        }
    };

    try {
        const csvStream = fs.createReadStream('input_urls.csv').pipe(csv());
        for await (const row of csvStream) {
            await processRow(row);
        }

        if (results.length > 0) {
            fs.writeFileSync('valid_websites.csv', 'url,english,checkout\n');
            results.forEach(result => {
                fs.appendFileSync('valid_websites.csv', `${result.url},${result.english},${result.checkout}\n`);
            });
            console.log('CSV file has been processed.');
        } else {
            console.log('No valid websites found with both English and Checkout.');
        }
    } catch (err) {
        console.error(`Error processing CSV: ${err.message}`);
    } finally {
        await browser.close();
    }
}

processUrls();
