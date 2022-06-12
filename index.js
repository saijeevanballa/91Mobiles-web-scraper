const puppeteer = require('puppeteer');
const request = require('request');
const fs = require('fs');

const mainPages = [
    { url: "https://www.91mobiles.com/tv-finder.php", name: 'TV' },
    { url: "https://www.91mobiles.com/laptopfinder.php", name: 'Laptop' },
    { url: "https://www.91mobiles.com/mobile-price-list-in-india", name: 'Mobile' },
    { url: "https://www.91mobiles.com/tabletfinder.php", name: 'Tablet' },
    { url: "https://www.91mobiles.com/list-of-smartbands/smartband-price-list-in-india", name: 'Watch' },
    { url: "https://www.91mobiles.com/headphones-finder.php", name: 'Headphone' },
    { url: "https://www.91mobiles.com/home-theater-finder.php", name: 'HomeTheater' },
    { url: "https://www.91mobiles.com/ac-finder.php", name: 'AC' },
    { url: "https://www.91mobiles.com/washing-machine-finder.php", name: 'WashingMachine' },
    { url: "https://www.91mobiles.com/camera-finder.php", name: 'Camera' },
]

let data = [];
const basePath = "./data";

(async () => {
    checkAndCreateFolder(basePath)
    const browser = await puppeteer.launch({
        headless: false,
        ignoreHTTPSErrors: true,
        args: [
            '--window-size=1920,1080',
        ]
    });
    try {
        //  Get Products List Data
        for (let i = 0; i < mainPages.length; i++) {
            await loadMainPageElements(browser, mainPages[i]);
        }
        console.log("--------------- DONE ----------------------")
        //  Get Product Details
        for (let i = 0; i < mainPages.length; i++) {
            let products = require(`${basePath}/${mainPages[i].name}-data.json`);
            const productBasePath = `${basePath}/${mainPages[i].name}`;
            checkAndCreateFolder(productBasePath)
            for (let j = 0; j < products.length; j++) {
                await loadProductElements(browser, products[j], productBasePath);
            }
        }

        await browser.close();
    } catch (error) {
        console.log(error);
        await browser.close();
    }
})().catch(console.error);

async function autoScroll(page) {
    try {
        return await page.evaluate(async () => {
            return await new Promise((resolve, reject) => {
                var totalHeight = 0;
                var distance = 100;
                var timer = setInterval(() => {
                    var scrollHeight = document.body.scrollHeight;
                    window.scrollBy(0, distance);
                    totalHeight += distance;

                    if (totalHeight >= scrollHeight) {
                        clearInterval(timer);
                        resolve();
                    }
                }, 1000);
            }).catch(error => { console.log(error) });
        });
    } catch (error) {
        console.log("error")
    }
}

writeJsonToFile = (path, data) => {
    fs.writeFile(path, JSON.stringify(data, null, 2), function (err) {
        if (err) {
            return console.log(err);
        }
        console.log("The file was saved!");
    });
}

async function loadProductElements(browser, product, productBasePath) {
    if (!product) return;
    const page = await browser.newPage();
    try {
        let productPath = `${productBasePath}/${product.title.replace(/[^a-zA-Z0-9 ]/g, "").trim().split(" ").join("_")}`;
        checkAndCreateFolder(productPath)
        await page.goto(product.href);
        await page.setViewport({ width: 1366, height: 768 })
        let productDetails = await getProductDetails(page);
        writeJsonToFile(`${productPath}/data.json`, productDetails);
        checkAndCreateFolder(`${productPath}/images`)
        for (let i = 0; i < productDetails.imageUrls.length; i++) {
            await download(productDetails.imageUrls[i], `${productPath}/images/${i}.jpg`);
        }
    } catch (error) {
        console.log(error);
    } finally {
        await page.close();
    }

}


async function getProductDetails(page) {
    try {
        let productDetails = {};
        productDetails.name = await page.$eval('.h1_pro_head', el => el.innerText);
        productDetails.variant = await page.$$eval(".selectOption.variantclass", el => el.map(x => x.getAttribute("data-variant-memory-name")).filter(Boolean));
        productDetails.colour = await page.$$eval(".selectOption.variantclass", el => el.map(x => x.getAttribute("data-variant-color-name")).filter(Boolean));
        let storePrice = await page.$$eval("div.prc_listPanel.onlineStoreRow", el => el.map(x => x.getAttribute("data-price")).filter(Boolean));
        let storeNames = await page.$$eval("div.prc_listPanel.onlineStoreRow", el => el.map(x => x.getAttribute("data-store")).filter(Boolean));
        productDetails.stores = storeNames.map((store, index) => ({ store, price: storePrice[index] }));
        const tittleElementHandles = await page.$$('span.specHead');
        const tittleElements = await getInnerText(tittleElementHandles, 'innerText')
        const contentElementHandles = await page.$$('table.spec_table');
        for (let i = 0; i < tittleElements.length; i++) {
            let tittle = tittleElements[i].toLowerCase().split(" ").join("_");
            let content = await contentElementHandles[i].$$eval('tr', rows => {
                return Array.from(rows, row => {
                    const columns = row.querySelectorAll('td');
                    return Array.from(columns, column => column.innerText.split("\n").filter(text => !text.includes("▾")).join(" ") || "Yes");
                });
            });
            productDetails[tittle] = content.reduce((acc, curr) => Object.assign(acc, { [curr[0]]: curr[1] }), {});
        }
        let imageUrls = await page.$$eval("span.elevatezoom-gallery", el => el.map(x => x.getAttribute("data-image")))
        if (!imageUrls.length) imageUrls = await page.$$eval("span", el => el.map(x => x.getAttribute("data-image")).filter(Boolean))
        productDetails.imageUrls = imageUrls.map(url => `https:${url}`);
        return productDetails;
    } catch (error) {
        console.log(error);
    }
}

async function loadMainPageElements(browser, pageDetails) {
    const page = await browser.newPage();
    try {
        data.length = 0
        await page.goto(pageDetails.url);
        await page.setDefaultNavigationTimeout(120000);
        await page.setViewport({ width: 1366, height: 768 })
        let listToggle = await page.$('.design_box.list_icon')
        if (listToggle !== null) {
            await Promise.all([
                await page.click('.design_box.list_icon')
            ]);
        }
        let count = Number(await page.$eval('#finder-records', el => el.innerText));
        let pageCount = Math.ceil(count / 20);
        console.log(`Products: ${count}, Pages: ${pageCount}`);
        for (let i = 1; i <= pageCount; i++) {
            try {
                console.log(`Pages: ${pageCount}, current: ${i}, `)
                let products = await getMainPageElements(page)
                console.log(products);
                data = data.concat(products);
                console.log(`Total Products: ${data.length}`)
                await Promise.all([
                    await page.click('.listing-btns4')
                ]);
            } catch (error) {
                console.log(`error occur on page ${i}`, error);
            }
        }
        writeJsonToFile(`${basePath}/${pageDetails.name}-data.json`, data);
    } catch (error) {
        console.log(error);
    } finally {
        await page.close();
    }
}

async function getMainPageElements(page) {
    try {
        await scrollDown(page);
        const elementHandles = await page.$$('.hover_blue_link.name.gaclick');
        const hrefElements = await getInnerText(elementHandles, 'href');
        const titleElements = await getInnerText(elementHandles, 'title');

        let priceElementHandles = await page.$$('.price.price_padding')
        const priceElements = await getInnerText(priceElementHandles, 'innerText');

        return hrefElements.map((href, index) => {
            return {
                title: titleElements[index],
                price: priceElements[index],
                href: href
            }
        });
    } catch (error) {
        console.log(error);
    }
}


async function scrollDown(page) {
    await page.waitForSelector('.listing-btns4');
    await page.$eval('.listing-btns4', e => {
        e.scrollIntoView({ behavior: 'smooth', block: 'end', inline: 'end' });
    });
    await page.waitForSelector('.listing-btns4');
    await page.$eval('.listing-btns4', e => {
        e.scrollIntoView({ behavior: 'smooth', block: 'end', inline: 'end' });
    });
    await delay(3000);
}

function delay(time) {
    return new Promise(function (resolve) {
        setTimeout(resolve, time)
    });
}

async function getInnerText(elementHandles, property) {
    const PropertyJsHandles = await Promise.all(
        elementHandles.map(handle => handle.getProperty(property))
    );
    return await Promise.all(
        PropertyJsHandles.map(handle => handle.jsonValue())
    );
}

function checkAndCreateFolder(path) {
    if (!fs.existsSync(path)) {
        console.log(`Creating folder: ${path}`);
        fs.mkdirSync(path);
    }
}

function download(uri, filename) {
    return new Promise((resolve, reject) => {
        request.head(uri, function (err, res, body) {
            request(uri).pipe(fs.createWriteStream(filename)).on('close', resolve);
        });
    });
}
