const express = require('express');
const cloudflare = require('cloudflare-express');
const app = express();
const http = require('http').createServer(app);
const logger = require('./logger.js');
const path = require('path');
const fs = require('fs');
const { count } = require('console');

const services = fs.readdirSync(path.join(__dirname, '..')).filter(file => fs.statSync(path.join(__dirname, '..', file)).isDirectory());
const detailDimensions = ['ip', 'country', 'host', 'accept', 'referer', 'userAgent', 'messages'];

app.use(cloudflare.restore({update_on_start:true}));
app.use(express.json());
app.use(logger.visitReq());

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res, next) => {
    res.sendFile(path.join(__dirname, 'main.html'));
});

app.post('/details', (req, res, next) => {
    const timeStart = Date.now();
    const visits = countEndpointVisitsPerService('base', req.body);
    const timeElapsed = Date.now() - timeStart;
    res.send({ visits, timeElapsed });
});

app.get('/all', (req, res, next) => {
    const timeStart = Date.now();
    const visits = countVisits();
    const timeEnd = Date.now();
    const timeElapsed = timeEnd - timeStart;

    res.send({ visits, timeElapsed });
});

app.get('/base', (req, res, next) => {
    const timeStart = Date.now();
    const visits = countEndpointVisitsPerService('base', []);
    const timeEnd = Date.now();
    const timeElapsed = timeEnd - timeStart;

    res.send({ visits, timeElapsed });
});

app.use((req, res) => {
    res.send('');
});

app.use(logger.errorReq());

http.listen(process.env.PORT, () => console.log(`listening on port ${process.env.PORT}`));

function countVisits() {
    let visitCount = {};
    services.forEach(service => {
        visitCount[service] = countVisitsPerService(service);
    });
    return visitCount;
}

function countVisitsPerService(service) {
    makeSureLogDirExists(service);
    let visitCount = 0;
    fs.readdirSync(path.join(__dirname, '..', service, 'log', 'visit')).forEach(file => {
        let fileAgeDays = (Date.now() - new Date(file.split('.')[0])) / 1000 / 60 / 60 / 24;
        if (fileAgeDays < 7) {
            fs.readFileSync(path.join(__dirname, '..', service, 'log', 'visit', file)).toString().split('\n').forEach(line => {
                if (line) {
                    visitCount++;
                }
            });
        }
    });
    return visitCount;
}

function countEndpointVisitsPerService(service, query) {
    makeSureLogDirExists(service);
    let aggregators = {};
    detailDimensions.forEach(dimension => aggregators[dimension] = {});
    let visitCount = 0;

    fs.readdirSync(path.join(__dirname, '..', service, 'log', 'visit')).forEach(file => {
        let fileAgeDays = (Date.now() - new Date(file.split('.')[0])) / 1000 / 60 / 60 / 24;
        if (fileAgeDays < 7) {
            fs.readFileSync(path.join(__dirname, '..', service, 'log', 'visit', file)).toString().split('\n').forEach(line => {
                if (line) {
                    const entry = extractValues(JSON.parse(line));
                    if (filterEntry(entry, query)) {
                        visitCount++;
                        detailDimensions.forEach(dimension => mapCount(aggregators[dimension], entry[dimension]));
                    }
                }
            });
        }
    });
    return { 
        visitCount, 
        details: {
            ip: sortByValue(aggregators.ip),
            country: sortByValue(aggregators.country),
            host: sortByValue(aggregators.host),
            accept: sortByValue(aggregators.accept),
            referer: sortByValue(aggregators.referer),
            userAgent: sortByValue(aggregators.userAgent),
            messages: sortByValue(aggregators.messages)
        }
    };
}

function extractValues(entry) {
    return {
        ip: unifyIP(entry),
        country: entry.meta.req.headers['cf-ipcountry'],
        host: entry.meta.req.headers['host'],
        accept: entry.meta.req.headers['accept'],
        referer: entry.meta.req.headers['referer'],
        userAgent: entry.meta.req.headers['user-agent'],
        messages: entry.message,
        timestamp: entry.timestamp
    };
}

function filterEntry(entry, query) {
    if (isBotVisit(entry)) {
        return false;
    }

    var filter = true;
    query.forEach(item => {
        if (String(entry[item.detail]) !== item.value && item.include) {
            filter = false;
        } else if (String(entry[item.detail]) === item.value && !item.include) {
            filter = false;
        }
    });
    return filter;
}

const botUserAgents = [
    "Watchbot monitoring robot (https://watchbot.fflow.net)",
    "Mozilla/5.0 (compatible; YandexBot/3.0; +http://yandex.com/bots)",
    "Mozilla/5.0 (compatible; Let's Encrypt validation server; +https://www.letsencrypt.org)",
    "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    "IonCrawl (https://www.ionos.de/terms-gtc/faq-crawler-en/)",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15 (Applebot/0.1; +http://www.apple.com/go/applebot)",
    "Pandalytics/2.0 (https://domainsbot.com/pandalytics/)",
    "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm) Chrome/116.0.1938.76 Safari/537.36",
    "serpstatbot/2.1 (advanced backlink tracking bot; https://serpstatbot.com/; abuse@serpstatbot.com)",
    "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)",
    "CheckMarkNetwork/1.0 (+http://www.checkmarknetwork.com/spider.html)",
    "Expanse, a Palo Alto Networks company, searches across the global IPv4 space multiple times per day to identify customers&#39; presences on the Internet. If you would like to be excluded from our scans, please send IP addresses/domains to: scaninfo@paloaltonetworks.com",
    "Mozilla/5.0 (compatible; CensysInspect/1.1; +https://about.censys.io/)",
    "Mozilla/5.0 (compatible; InternetMeasurement/1.0; +https://internet-measurement.com/)",
    "Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.6613.137 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    "Mozilla/5.0 (compatible; MJ12bot/v1.4.8; http://mj12bot.com/)",
    "Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)",
    "Mozilla/5.0 researchscan.comsys.rwth-aachen.de",
    "Googlebot-Image/1.0",
    "2ip bot/1.1 (+http://2ip.io)",
    "Mozilla/5.0 (compatible; SemrushBot/7~bl; +http://www.semrush.com/bot.html)",
    "Mozilla/5.0 (compatible; archive.org_bot +http://archive.org/details/archive.org_bot) Zeno/cfa2980 warc/v0.8.47",
    "Mozilla/5.0 (compatible; archive.org_bot +http://archive.org/details/archive.org_bot) Zeno/6d512bb warc/v0.8.47",
    "Mozilla/5.0 (compatible; archive.org_bot +http://archive.org/details/archive.org_bot) Zeno/08ba828 warc/v0.8.48",
    "Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/99.0.4844.84 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.0; +https://openai.com/gptbot)",
    "DomainStatsBot/1.0 (https://domainstats.com/pages/our-bot)",
    "Timpibot/0.9 (+http://www.timpi.io)",
    "ZoominfoBot (zoominfobot at zoominfo dot com)",
    "Mozilla/5.0 (compatible; DataForSeoBot/1.0; +https://dataforseo.com/dataforseo-bot)",
    "Mozilla/5.0 (compatible; DotBot/1.2; +https://opensiteexplorer.org/dotbot; help@moz.com)",
    "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0; +claudebot@anthropic.com)",
    "Mozilla/5.0 (compatible; BLEXBot/1.0; +http://webmeup-crawler.com/)",
    "Mozilla/5.0 (compatible; BitSightBot/1.0)",
    "Mozilla/5.0 (compatible; SeekportBot; +https://bot.seekport.com)",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_1) AppleWebKit/601.2.4 (KHTML, like Gecko) Version/9.0.1 Safari/601.2.4 facebookexternalhit/1.1 Facebot Twitterbot/1.0",
    "Gaisbot/3.0 (robot@gais.cs.ccu.edu.tw; http://gais.cs.ccu.edu.tw/robot.php)",
    "TelegramBot (like TwitterBot)",
    "msnbot-media/1.1 ( http://search.msn.com/msnbot.htm)",
    "Mozilla/5.0 (compatible; Timpibot/0.8; +http://www.timpi.io)"



];
var botIPs = new Set();
var botIPvisits = {};

var botMessages = [];

function isBotVisit(entry) {
    if (botUserAgents.includes(entry.userAgent) ||
        entry.messages === 'HTTP GET /phpinfo' ||
        entry.messages === 'HTTP GET /php_info' ||
        entry.messages === 'HTTP GET /_profiler/phpinfo' ||
        entry.messages === 'HTTP GET /phpinfo.php3' ||
        entry.messages === 'HTTP GET /phpinfo.php4' ||
        entry.messages === 'HTTP GET /phpinfo.php5' ||
        entry.messages === 'HTTP GET /laravel/core/.env' ||
        entry.messages === 'HTTP GET /view-source:' ||
        entry.messages === 'HTTP GET /misc/ajax.js' ||
        entry.messages === 'HTTP GET /chosen' ||
        entry.messages === 'HTTP GET /tink_chat/' ||
        entry.messages === 'HTTP GET /max' ||
        entry.messages === 'HTTP GET /a.nel.cloud' ||
        entry.messages === 'HTTP GET /?error=404' ||
        entry.messages === 'HTTP GET /.well-known/acme-challenge/file' ||
        entry.messages === 'HTTP GET /bet/lotteryinfo/allLotteryInfoList' ||
        entry.messages === 'HTTP GET /common/template/lottery/lecai/css/style.css' ||
        entry.messages === 'HTTP GET /getConfig/listPopFrame.do?code=1&position=index&_=1601489645097' ||
        entry.messages === 'HTTP GET /getConfig/listPopFrame.do?code=14&position=index&_=1601489645097' ||
        entry.messages === 'HTTP POST /api/user/ismustmobile' ||
        entry.messages === 'HTTP GET /banner.do?code=1' ||
        entry.messages === 'HTTP GET /Home/Get/getJnd28' ||
        entry.messages === 'HTTP GET /api/common/config' ||
        entry.messages === 'HTTP GET /Home/GetInitSource' ||
        entry.messages === 'HTTP GET /prod/api/common/config' ||
        entry.messages === 'HTTP GET /data/json/config.json' ||
        entry.messages === 'HTTP GET /Scripts/common.js' ||
        entry.messages === 'HTTP GET /mobile/v3/appSuperDownload.do' ||
        entry.messages === 'HTTP GET /Public/Home/js/cls.js' ||
        entry.messages === 'HTTP GET /getConfig/getArticle.do?code=1' ||
        entry.messages === 'HTTP GET /ws/index/getTheLotteryInitList' ||
        entry.messages === 'HTTP GET /views/commData/commonSite.js' ||
        entry.messages === 'HTTP GET /getConfig/getArticle.do?code=19' ||
        entry.messages === 'HTTP GET /api/v/index/queryOfficePage?officeCode=customHomeLink' ||
        entry.messages === 'HTTP POST /melody/api/v1/pageconfig/list' ||
        entry.messages === 'HTTP GET /debug/default/view?panel=config' ||
        entry.messages === 'HTTP GET /my/zijin.png' ||
        entry.messages === 'HTTP GET /Template/Mobile/js/main.js' ||
        entry.messages === 'HTTP GET /common/member/js/user.util.js' ||
        entry.messages === 'HTTP GET /api/user/ismustmobile' ||
        entry.messages === 'HTTP GET /.env' ||
        entry.messages === 'HTTP GET /admin' ||
        entry.messages === 'HTTP GET /h5/' ||
        entry.messages === 'HTTP GET /m/' ||
        entry.messages === 'HTTP GET /api/config' ||
        entry.messages === 'HTTP GET /js/nsc/main.js' ||
        entry.messages === 'HTTP GET /app/' ||
        entry.messages === 'HTTP GET /skin/main/onload.js' ||
        entry.messages === 'HTTP GET /resources/css/headernav.css' ||
        entry.messages === 'HTTP GET /css/nsc/reset.css' ||
        entry.messages === 'HTTP GET /resources/main/common.js' ||
        entry.messages === 'HTTP GET /f/user/index' ||
        entry.messages === 'HTTP GET /m/allticker/1' ||
        entry.messages === 'HTTP GET /fePublicInfo/' ||
        entry.messages === 'HTTP GET /stock/mzhishu' ||
        entry.messages === 'HTTP GET /nyyh/game.css' ||
        entry.messages === 'HTTP GET /api/v1/config' ||
        entry.messages === 'HTTP GET /download/info' ||
        entry.messages === 'HTTP GET /im/App/config' ||
        entry.messages === 'HTTP GET /api/Business/' ||
        entry.messages === 'HTTP GET /img/xxing.png' ||
        entry.messages === 'HTTP GET /Home/Index/api' ||
        entry.messages === 'HTTP GET /Pay_Index.html' ||
        entry.messages === 'HTTP GET /setting/global' ||
        entry.messages === 'HTTP GET /api/shop/getKF' ||
        entry.messages === 'HTTP GET /bao/img/gz.png' ||
        entry.messages === 'HTTP GET /api/index/init' ||
        entry.messages === 'HTTP GET /api/apps/config' ||
        entry.messages === 'HTTP GET /api/Event/basic' ||
        entry.messages === 'HTTP GET /api/front/index' ||
        entry.messages === 'HTTP GET /friendGroup/list' ||
        entry.messages === 'HTTP GET /index/newapi/api' ||
        entry.messages === 'HTTP GET /appxz/index.html' ||
        entry.messages === 'HTTP GET /Home/Bind/binding' ||
        entry.messages === 'HTTP GET /dist/index.html' ||
        entry.messages === 'HTTP GET /verification.asp' ||
        entry.messages === 'HTTP POST /biz/server/config' ||
        entry.messages === 'HTTP GET /mobile/lists.html' ||
        entry.messages === 'HTTP GET /mytio/config/base' ||
        entry.messages === 'HTTP GET /mobile/login.html' ||
        entry.messages === 'HTTP GET /api/app/indexList' ||
        entry.messages === 'HTTP GET /mobile/index/home' ||
        entry.messages === 'HTTP GET /123/ok/index.html' ||
        entry.messages === 'HTTP GET /API/Web/chat.ashx' ||
        entry.messages === 'HTTP POST /mall/toget/banner' ||
        entry.messages === 'HTTP POST /api/getCustomLink' ||
        entry.messages === 'HTTP GET /api/v1/member/kefu' ||
        entry.messages === 'HTTP GET /api/uploads/apimap' ||
        entry.messages === 'HTTP GET /api/config/getkefu' ||
        entry.messages === 'HTTP GET /api/site/getInfo.do' ||
        entry.messages === 'HTTP GET /public/img/cz1.png' ||
        entry.messages === 'HTTP GET /api/message/webInfo' ||
        entry.messages === 'HTTP GET /api/index/webconfig' ||
        entry.messages === 'HTTP GET /api/index/getConfig' ||
        entry.messages === 'HTTP GET /room/getRoomBangFans' ||
        entry.messages === 'HTTP GET /index/user/register' ||
        entry.messages === 'HTTP GET /Content/favicon.ico' ||
        entry.messages === 'HTTP GET /api/index/grailindex' ||
        entry.messages === 'HTTP POST /km.asmx/getPlatParam' ||
        entry.messages === 'HTTP GET /api/shares/hqStrList' ||
        entry.messages === 'HTTP GET /xy/image/jiantou.png' ||
        entry.messages === 'HTTP GET /other/getTopQuestion' ||
        entry.messages === 'HTTP GET /index/login/register' ||
        entry.messages === 'HTTP GET /index/home/login.html' ||
        entry.messages === 'HTTP GET /procoin/config/all.do' ||
        entry.messages === 'HTTP GET /iexchange/webtrader/' ||
        entry.messages === 'HTTP GET /cx_platform/conf.json' ||
        entry.messages === 'HTTP GET /client-api/app/config' ||
        entry.messages === 'HTTP GET /static/js/download.js' ||
        entry.messages === 'HTTP GET /static/css/common.css' ||
        entry.messages === 'HTTP GET /index/index/getchatLog' ||
        entry.messages === 'HTTP GET /static/picture/gz.png' ||
        entry.messages === 'HTTP GET /index/index/getchatLogs' ||
        entry.messages === 'HTTP GET /Public/home/js/check.js' ||
        entry.messages === 'HTTP GET /static/mobile/user.html' ||
        entry.messages === 'HTTP GET /static/home/css/css.css' ||
        entry.messages === 'HTTP GET /static/home/js/rooms.js' ||
        entry.messages === 'HTTP GET /assets/app-manifest.json' ||
        entry.messages === 'HTTP GET /static/voice/default.wav' ||
        entry.messages === 'HTTP GET /Public/Wchat/js/cvphp.js' ||
        entry.messages === 'HTTP GET /api/banner?appKey=bxefdn' ||
        entry.messages === 'HTTP GET /api/Config/getShowConfig' ||
        entry.messages === 'HTTP GET /s_api/basic/download/info' ||
        entry.messages === 'HTTP GET /static/new/css/style.css' ||
        entry.messages === 'HTTP GET /h5/static/tabbar/txl.png' ||
        entry.messages === 'HTTP GET /api/product/getPointStore' ||
        entry.messages === 'HTTP GET /Public/home/js/fukuang.js' ||
        entry.messages === 'HTTP GET /mobile/film/css/index.css' ||
        entry.messages === 'HTTP GET /api/currency/quotation_new' ||
        entry.messages === 'HTTP GET /static/wap/css/common.css' ||
        entry.messages === 'HTTP GET /app/static/js/download.js' ||
        entry.messages === 'HTTP GET /portal/index/protocol.html' ||
        entry.messages === 'HTTP GET /api/vue/transaction/config' ||
        entry.messages === 'HTTP GET /front/index/getSiteSetting' ||
        entry.messages === 'HTTP GET /api/predict-whole-panel.do' ||
        entry.messages === 'HTTP GET /Public/mobile/css/base.css' ||
        entry.messages === 'HTTP GET /pages/console/js/common.js' ||
        entry.messages === 'HTTP GET /static/data/thirdgames.json' ||
        entry.messages === 'HTTP GET /resource/home/js/common.js' ||
        entry.messages === 'HTTP GET /market/market-ws/iframe.html' ||
        entry.messages === 'HTTP GET /static/wap/css/tipmask.css' ||
        entry.messages === 'HTTP GET /template/mb/lang/text-zh.json' ||
        entry.messages === 'HTTP GET /app/static/picture/star.png' ||
        entry.messages === 'HTTP GET /forerest/user/custSrv/findOne' ||
        entry.messages === 'HTTP GET /masterControl/getSystemSetting' ||
        entry.messages === 'HTTP GET /stage-api/common/configKey/all' ||
        entry.messages === 'HTTP GET /index/index/home?business_id=1' ||
        entry.messages === 'HTTP GET /api/appVersion?mobile_system=2' ||
        entry.messages === 'HTTP GET /Public/home/common/js/index.js' ||
        entry.messages === 'HTTP GET /wap/static//images/index_tzjr.png' ||
        entry.messages === 'HTTP GET /install.inc/vipsignInstall.css' ||
        entry.messages === 'HTTP GET /api/public/?service=Home.getConfig' ||
        entry.messages === 'HTTP GET /index/police/index.html?agent=1000' ||
        entry.messages === 'HTTP GET /static/mobile/yunbi/css/style.css' ||
        entry.messages === 'HTTP GET /public/static/home/js/moblie/login.js' ||
        entry.messages === 'HTTP GET /index/index/info?type=ultimate&date=2' ||
        entry.messages === 'HTTP GET /api/stock/getSingleStock.do?code=002405' ||
        entry.messages === 'HTTP GET /ajax/allcoin_a/id/0?t=0.3782499195965951' ||
        entry.messages === 'HTTP GET /static/images/config/common/cpjy.png' ||
        entry.messages === 'HTTP GET /wap/api/exchangerateuserconfig!get.action' ||
        entry.messages === 'HTTP GET /source/20220119/static/wap/js/order.js' ||
        entry.messages === 'HTTP GET /clientapi/app/getinfo?appid=0&android=false' ||
        entry.messages === 'HTTP POST /api/system/systemConfigs/getCustomerServiceLink' ||
        entry.messages === 'HTTP GET /infe/rest/fig/advertise/common.json?mobile_open=1' ||
        entry.messages === 'HTTP GET /client/api/findConfigByKey?configKey=level_config' ||
        entry.messages === 'HTTP POST /site/api/v1/site/vipExclusiveDomain/getGuestDomain' ||
        entry.messages === 'HTTP GET /static/img/new-lottery-title.921682f7.png' ||
        entry.messages === 'HTTP GET /mobile/' ||
        entry.messages === 'HTTP GET /lander/sber/' ||
        entry.messages === 'HTTP POST /login/?login_only=1' ||
        entry.messages === 'HTTP GET /merchant/z/payment/?order=1' ||
        entry.messages === 'HTTP GET /merchant/code' ||
        entry.messages === 'HTTP GET /site/info' ||
        entry.messages === 'HTTP GET /js/base1.js' ||
        entry.messages === 'HTTP GET /css/main.css' ||
        entry.messages === 'HTTP GET /nyyh/chkjs.js' ||
        entry.messages === 'HTTP GET /css/style.css' ||
        entry.messages === 'HTTP GET /3/favicon.ico' ||
        entry.messages === 'HTTP GET /home/login.jpg' ||
        entry.messages === 'HTTP GET /app/js/base.js' ||
        entry.messages === 'HTTP GET /css/scanner.css' ||
        entry.messages === 'HTTP GET /files/pub_rem.js' ||
        entry.messages === 'HTTP GET /skin/js/common.js' ||
        entry.messages === 'HTTP GET /JS/loginstatus.js' ||
        entry.messages === 'HTTP GET /static/js/user.js' ||
        entry.messages === 'HTTP GET /lander/test' ||
        entry.messages === 'HTTP GET /tcn/' ||
        entry.messages === 'HTTP GET /banner/lunbo1.png' ||
        entry.messages === 'HTTP GET /kefu/css/style.css' ||
        entry.messages === 'HTTP GET /static/guide/ab.css' ||
        entry.messages === 'HTTP GET /Public/js/common.js' ||
        entry.messages === 'HTTP GET /public/css/style.css' ||
        entry.messages === 'HTTP GET /static/css/style.css' ||
        entry.messages === 'HTTP GET /static/css/reset.css' ||
        entry.messages === 'HTTP GET /static/css/mobile.css' ||
        entry.messages === 'HTTP GET /dist/images/star.png' ||
        entry.messages === 'HTTP GET /static/diff_worker.js' ||
        entry.messages === 'HTTP GET /public/wap/js/basis.js' ||
        entry.messages === 'HTTP GET /aktv/img/nyyh/chkjs.js' ||
        entry.messages === 'HTTP GET /assets/res/mods/room.js' ||
        entry.messages === 'HTTP GET /Public/css/errorCss.css' ||
        entry.messages === 'HTTP GET /static/data/configjs.js' ||
        entry.messages === 'HTTP GET /phone/images/icon_01.png' ||
        entry.messages === 'HTTP GET /static/js/chat-config.js' ||
        entry.messages === 'HTTP GET /static/home/imgs/pico.png' ||
        entry.messages === 'HTTP GET /dist/azzara/css/down.css' ||
        entry.messages === 'HTTP GET /Content/css/wzwstylel.css' ||
        entry.messages === 'HTTP GET /static/index/js/common.js' ||
        entry.messages === 'HTTP GET /public/h5static/js/main.js' ||
        entry.messages === 'HTTP GET /static/common/js/common.js' ||
        entry.messages === 'HTTP GET /Public/home/wap/css/qdgame.css' ||
        entry.messages === 'HTTP GET /public/assets/img/index/pay1.png' ||
        entry.messages === 'HTTP GET /static/mobile/zj/css/yaoqing.css' ||
        entry.messages === 'HTTP GET /static/images/auth/background.png' ||
        entry.messages === 'HTTP GET /public/static/index/picture/img_33.png' ||
        entry.messages === 'HTTP GET /client/static/icon/hangqingicon.png' ||
        entry.messages === 'HTTP GET /static/customer/js/xiaotian.cli.v2.js' ||
        entry.messages === 'HTTP GET /Public/Mobile/ecshe_css/wapmain.css?v=1545408652' ||
        entry.messages === 'HTTP GET /Public/Home/ecshe_css/main.css?v=1543997196' ||
        entry.messages === 'HTTP GET /js/index.js' ||
        entry.messages === 'HTTP GET /img/style.css' ||
        entry.messages === 'HTTP GET /thriveGame.css' ||
        entry.messages === 'HTTP GET /Res/font/font.css' ||
        entry.messages === 'HTTP GET /manager/js/left.js' ||
        entry.messages === 'HTTP GET /Public/H5/js/h5.js' ||
        entry.messages === 'HTTP GET /static/js/common.js' ||
        entry.messages === 'HTTP GET /Public/css/_pk10.css' ||
        entry.messages === 'HTTP GET /static/css/public.css' ||
        entry.messages === 'HTTP GET /static/wap/js/common.js' ||
        entry.messages === 'HTTP GET /member/js/lang_zh_CN.js' ||
        entry.messages === 'HTTP GET /index_files/bankCheck.js' ||
        entry.messages === 'HTTP GET /saconfig/secure/yunwei.js' ||
        entry.messages === 'HTTP GET /template/920ka/css/lsy.css' ||
        entry.messages === 'HTTP GET /Templates/user/js/global.js' ||
        entry.messages === 'HTTP GET /static/admincp/js/common.js' ||
        entry.messages === 'HTTP GET /Public/Qts/Home/js/appAlert.js' ||
        entry.messages === 'HTTP GET /public/assets/js/lib/my-help.js' ||
        entry.messages === 'HTTP GET /static/h5/img/icon__create-group.png' ||
        entry.messages === 'HTTP GET /static/home/css/feiqi-ee5401a8e6.css' ||
        entry.messages === 'HTTP GET /uploads/20240628/41c342ee032b6e289c230b09b7f827f0.png' ||
        entry.messages === 'HTTP GET /api' ||
        entry.messages === 'HTTP GET /fresh:' ||
        entry.messages === 'HTTP GET /search/label/PHP-Shells' ||
        entry.messages === 'HTTP GET /used:' ||
        entry.messages === 'HTTP GET /mini.phpa' ||
        entry.messages === 'HTTP GET /info' ||
        entry.messages === 'HTTP GET /beta/.env' ||
        entry.messages === 'HTTP GET /prod/.env' ||
        entry.messages === 'HTTP GET /.aws/credentials' ||
        entry.messages === 'HTTP GET /config.json' ||
        entry.messages === 'HTTP GET /?%3Cplay%3Ewithme%3C/%3E' ||
        entry.messages === 'HTTP GET /.well-known/' ||
        entry.messages === 'HTTP GET /option.png' ||
        entry.messages === 'HTTP GET /h5.2.taobao/' ||
        entry.messages === 'HTTP GET /api/.env' ||
        entry.messages === 'HTTP GET /laravel/.env' ||
        entry.messages === 'HTTP GET /.env.exemple' ||
        entry.messages === 'HTTP GET /.env_exemple' ||
        entry.messages === 'HTTP GET /sendgrid.env' ||
        entry.messages === 'HTTP GET /?z' ||
        entry.messages === 'HTTP GET /profile.php6' ||
        entry.messages === 'HTTP GET /.well-known/pki-validation/' ||
        entry.messages === 'HTTP GET /.well-known/acme-challenge/' ||
        entry.messages === 'HTTP GET /.well-known/acme-challenge/__resolve-check' ||
        entry.messages === 'HTTP GET /vendor/phpunit/phpunit/src/Util/PHP/' ||
        entry.messages === 'HTTP GET /ALFA_DATA/' ||
        entry.messages === 'HTTP GET /upload/image/' ||
        entry.messages === 'HTTP GET /sites/default/files/' ||
        entry.messages === 'HTTP GET /admin/controller/extension/extension/' ||
        entry.messages === 'HTTP GET /admin/editor/' ||
        entry.messages === 'HTTP GET /admin/images/slider/' ||
        entry.messages === 'HTTP GET /admin/tmp/' ||
        entry.messages === 'HTTP GET /admin/uploads/' ||
        entry.messages === 'HTTP GET /Admin/uploads/' ||
        entry.messages === 'HTTP GET /admin/uploads/images/' ||
        entry.messages === 'HTTP GET /administrator/' ||
        entry.messages === 'HTTP GET /ALFA_DATA/alfacgiapi/' ||
        entry.messages === 'HTTP GET /assets/' ||
        entry.messages === 'HTTP GET /cgi-bin/' ||
        entry.messages === 'HTTP GET /components/' ||
        entry.messages === 'HTTP GET /home/' ||
        entry.messages === 'HTTP GET /include/' ||
        entry.messages === 'HTTP GET /modules/' ||
        entry.messages === 'HTTP GET /modules/mod_simplefileuploadv1.3/elements/' ||
        entry.messages === 'HTTP GET /mt/' ||
        entry.messages === 'HTTP GET /tmps/' ||
        entry.messages === 'HTTP GET /cache-wordpress/' ||
        entry.messages === 'HTTP GET /cakil/' ||
        entry.messages === 'HTTP GET /cekidot/' ||
        entry.messages === 'HTTP GET /ubh/' ||
        entry.messages === 'HTTP GET /admin/upload/' ||
        entry.messages === 'HTTP GET /up/.well-known/' ||
        entry.messages === 'HTTP GET /api/' ||
        entry.messages === 'HTTP POST /api/other/appSetting' ||
        entry.messages === 'HTTP GET /app/index/config' ||
        entry.messages === 'HTTP GET /phalapi/public/?s=Site.calc_down' ||
        entry.messages === 'HTTP GET /h5' ||
        entry.messages === 'HTTP GET /index/login' ||
        entry.messages === 'HTTP GET /a/' ||
        entry.messages === 'HTTP GET /home/index/getConfig' ||
        entry.messages === 'HTTP GET /im/' ||
        entry.messages === 'HTTP GET /wap' ||
        entry.messages === 'HTTP GET /xy/' ||
        entry.messages === 'HTTP GET /otc/' ||
        entry.messages === 'HTTP GET /999/' ||
        entry.messages === 'HTTP GET /888/' ||
        entry.messages === 'HTTP GET /wap/' ||
        entry.messages === 'HTTP GET /imei/' ||
        entry.messages === 'HTTP GET /homes/' ||
        entry.messages === 'HTTP GET /mobile' ||
        entry.messages === 'HTTP GET /config' ||
        entry.messages === 'HTTP GET /m.html' ||
        entry.messages === 'HTTP GET /im/h5/' ||
        entry.messages === 'HTTP GET /dsxs/' ||
        entry.messages === 'HTTP GET /jym-wn/' ||
        entry.messages === 'HTTP GET /pc.html' ||
        entry.messages === 'HTTP GET /api/c/a' ||
        entry.messages === 'HTTP GET /platform' ||
        entry.messages === 'HTTP GET /js/xz.js' ||
        entry.messages === 'HTTP GET /api/ping' ||
        entry.messages === 'HTTP GET /z03.html' ||
        entry.messages === 'HTTP GET /ddoo_im/' ||
        entry.messages === 'HTTP GET /getLocale' ||
        entry.messages === 'HTTP GET /step1.asp' ||
        entry.messages === 'HTTP GET /home/help' ||
        entry.messages === 'HTTP GET /css/m.css' ||
        entry.messages === 'HTTP GET /css/skin/ymPrompt.css' ||
        entry.messages === 'HTTP GET /home.html' ||
        entry.messages === 'HTTP GET /ay-1.html' ||
        entry.messages === 'HTTP GET /index/aurl' ||
        entry.messages === 'HTTP GET /js/app.js' ||
        entry.messages === 'HTTP POST /api/notice' ||
        entry.messages === 'HTTP GET /jiaoyimao/' ||
        entry.messages === 'HTTP GET /pro/qb365/' ||
        entry.messages === 'HTTP GET /kline/1m/1' ||
        entry.messages === 'HTTP GET /code1.html' ||
        entry.messages === 'HTTP GET /api/version' ||
        entry.messages === 'HTTP POST /wap/forward' ||
        entry.messages === 'HTTP GET /proxy/games' ||
        entry.messages === 'HTTP GET /js/a.script' ||
        entry.messages === 'HTTP GET /js/post.js/' ||
        entry.messages === 'HTTP GET /login.html' ||
        entry.messages === 'HTTP GET /mindex.html' ||
        entry.messages === 'HTTP GET /config.js' ||
        entry.messages === 'HTTP GET /lander/testsberv4_1703110539/' ||
        entry.messages === 'HTTP GET /kyc/.env' ||
        entry.messages === 'HTTP GET /admin/.env' ||
        entry.messages === 'HTTP GET /.docker/laravel/app/.env' ||
        entry.messages === 'HTTP GET /.docker/.env' ||
        entry.messages === 'HTTP GET /.gitlab-ci/.env' ||
        entry.messages === 'HTTP GET /.vscode/.env' ||
        entry.messages === 'HTTP GET /web/.env' ||
        entry.messages === 'HTTP GET /app/.env' ||
        entry.messages === 'HTTP GET /crm/.env' ||
        entry.messages === 'HTTP GET /backend/.env' ||
        entry.messages === 'HTTP GET /local/.env' ||
        entry.messages === 'HTTP GET /application/.env' ||
        entry.messages === 'HTTP GET /live_env' ||
        entry.messages === 'HTTP GET /admin-app/.env' ||
        entry.messages === 'HTTP GET /mailer/.env' ||
        entry.messages === 'HTTP GET /shared/.env' ||
        entry.messages === 'HTTP GET /.env.project' ||
        entry.messages === 'HTTP GET /apps/.env' ||
        entry.messages === 'HTTP GET /development/.env' ||
        entry.messages === 'HTTP GET /public/client/planinfo' ||
        entry.messages === 'HTTP GET /env.js' ||
        entry.messages === 'HTTP GET /3ds1633693954432212' ||
        entry.messages === 'HTTP GET /wordpress/' ||
        entry.messages === 'HTTP GET /T8LMdb3N' ||
        entry.messages === 'HTTP GET /.env.example' ||
        entry.messages === 'HTTP GET /blog/.env' ||
        entry.messages === 'HTTP GET /docs/.env' ||
        entry.messages === 'HTTP GET /phpMyAdmin/' ||
        entry.messages === 'HTTP GET /PhpMyAdmin/' ||
        entry.messages === 'HTTP GET /pma/' ||
        entry.messages === 'HTTP GET /H6W7VRDj' ||
        entry.messages === 'HTTP GET /.git/config' ||
        entry.messages === 'HTTP GET /alfa-rex.php56' ||
        entry.messages === 'HTTP GET /dist/images/mask/bg1.jpg' ||
        entry.messages === 'HTTP GET /onlinePay/abcefg.html' ||
        entry.messages === 'HTTP GET /static/wap/js/order.js' ||
        entry.messages === 'HTTP GET /eids.js' ||
        entry.messages === 'HTTP GET /lanren/css/global.css' ||
        entry.messages === 'HTTP GET /aws.yml' ||
        entry.messages === 'HTTP GET /.env.bak' ||
        entry.messages === 'HTTP GET /config/aws.yml' ||
        entry.messages === 'HTTP GET /app-ads.txt' ||
        entry.messages === 'HTTP GET /sellers.json' ||
        entry.messages === 'HTTP GET /sftp-config.json' ||
        entry.messages === 'HTTP GET /assets/js/chat.js' ||
        entry.messages === 'HTTP GET /static/wap/css/trade-history.css' ||
        entry.messages === 'HTTP GET /static/index/css/trade-history.css' ||
        entry.messages === 'HTTP GET /dist/images/mask/guide/cn/step1.jpg' ||
        entry.messages === 'HTTP GET /myConfig.js' ||
        entry.messages === 'HTTP GET /administrator/language/en-GB/en-GB.xml' ||
        entry.messages === 'HTTP GET /demo/.env' ||
        entry.messages === 'HTTP GET /staging/.env' ||
        entry.messages === 'HTTP GET /.env.prod' ||
        entry.messages === 'HTTP GET /public/.env' ||
        entry.messages === 'HTTP GET /core/.env' ||
        entry.messages === 'HTTP GET /.env.save' ||
        entry.messages === 'HTTP GET /ads.txt' ||
        entry.messages === 'HTTP GET /app_dev.php/_profiler/phpinfo' ||
        entry.messages === 'HTTP GET /.json' ||
        entry.messages === 'HTTP GET /app_dev.php/_profiler/open?file=app/config/parameters.yml' ||
        entry.messages === 'HTTP GET /.env.production' ||
        entry.messages === 'HTTP GET /vendor/.env' ||
        entry.messages === 'HTTP GET /library/.env' ||
        entry.messages === 'HTTP GET /config/.env' ||
        entry.messages === 'HTTP GET /static/image/bg1.jpg' ||
        entry.messages === 'HTTP GET /static/index/js/lk/order.js' ||
        entry.messages === 'HTTP GET /lang.js' ||
        entry.messages === 'HTTP GET /js/home.js' ||
        entry.messages === 'HTTP GET /database/.env' ||
        entry.messages === 'HTTP GET /.env.local' ||
        entry.messages === 'HTTP GET /.env.dev' ||
        entry.messages === 'HTTP GET /cgi-bin/.env' ||
        entry.messages === 'HTTP GET /new/.env' ||
        entry.messages === 'HTTP GET /old/.env' ||
        entry.messages === 'HTTP GET /protected/.env' ||
        entry.messages === 'HTTP GET /src/.env' ||
        entry.messages === 'HTTP GET /storage/.env' ||
        entry.messages === 'HTTP GET /.env.backup' ||
        entry.messages === 'HTTP GET /.env.stage' ||
        entry.messages === 'HTTP GET /app/config/.env' ||
        entry.messages === 'HTTP GET /.env.live' ||
        entry.messages === 'HTTP GET /wp/' ||
        entry.messages === 'HTTP GET /blog/' ||
        entry.messages === 'HTTP GET /old/' ||
        entry.messages === 'HTTP GET /new/' ||
        entry.messages === 'HTTP GET /test/' ||
        entry.messages === 'HTTP GET /backup/' ||
        entry.messages === 'HTTP GET /temp/' ||
        entry.messages === 'HTTP GET /.env.old' ||
        entry.messages === 'HTTP GET /.env.production.local' ||
        entry.messages === 'HTTP GET /.env_1' ||
        entry.messages === 'HTTP GET /phpmyadmin/' ||
        entry.messages === 'HTTP GET /Telerik.Web.UI.WebResource.axd?type=rau' ||
        entry.messages === 'HTTP GET /.vscode/sftp.json' ||
        entry.messages === 'HTTP HEAD /wp' ||
        entry.messages.includes('/wp-admin/') ||
        entry.messages.includes('/wp-content/') ||
        entry.messages.includes('/wp-includes/') ||
        entry.messages.includes('/wp-json/') ||
        entry.messages.toLowerCase().includes('/index.php') ||
        entry.messages.toLowerCase().includes('/home.php') ||
        entry.messages.toLowerCase().includes('/xmrlpc.php') ||
        entry.messages.toLowerCase().includes('/xmrlpc.php') ||
        entry.messages.toLowerCase().includes('.php?') ||
        entry.messages.toLowerCase().endsWith('.php') ||
        entry.messages.toLowerCase().endsWith('.php7') ||
        entry.messages.toLowerCase().endsWith('.php8')) {
        botIPs.add(entry.ip);
        botIPvisits[entry.ip] ? botIPvisits[entry.ip].push(entry.timestamp) : botIPvisits[entry.ip] = [entry.timestamp];
        return true;
    }

    if (botIPs.has(entry.ip)) {
        //console.log('entry.messages', entry.messages);
        //mapCount(botMessages, entry.messages);
        //console.log(sortByValue(botMessages));
        for (const visitTime of botIPvisits[entry.ip]) {
            var timeDiff = new Date(entry.timestamp) - new Date(visitTime);
            if (Math.abs(timeDiff) < 60 * 1000) {
                return true;
            }
        }
    }

    return false;
}

function unifyIP(entry) {
    if (entry.meta.req.connection.remoteAddress === '::ffff:172.20.0.1' &&
        entry.meta.req.cf_ip === entry.meta.req.headers['cf-connecting-ip'] &&
        entry.meta.req.cf_ip === entry.meta.req.headers['x-forwarded-for']
    ) {
        return entry.meta.req.cf_ip + ' ' + entry.meta.req.headers['cf-ipcountry'];
    } else {
        return `${entry.meta.req.cf_ip} cf-connecting-ip: ${entry.meta.req.headers['cf-connecting-ip']} x-forwarded-for: ${entry.meta.req.headers['x-forwarded-for']} remoteAddress: ${entry.meta.req.connection.remoteAddress} cf-ipcountry: ${entry.meta.req.headers['cf-ipcountry']}`;
    }
}

function sortByValue(obj) {
    return Object.fromEntries(Object.entries(obj).sort((a, b) => b[1] - a[1]));
}

function mapCount(aggregator, element) {
    if (aggregator[element]) {
        aggregator[element]++;
    } else {
        aggregator[element] = 1;
    }
}

function makeSureLogDirExists(service) {
    fs.existsSync(path.join(__dirname, '..', service, 'log')) || fs.mkdirSync(path.join(__dirname, '..', service, 'log'));
    fs.existsSync(path.join(__dirname, '..', service, 'log', 'visit')) || fs.mkdirSync(path.join(__dirname, '..', service, 'log', 'visit'));
    fs.existsSync(path.join(__dirname, '..', service, 'log', 'error')) || fs.mkdirSync(path.join(__dirname, '..', service, 'log', 'error'));
}