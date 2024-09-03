const express = require('express');
const cloudflare = require('cloudflare-express');
const app = express();
const http = require('http').createServer(app);
const logger = require('./logger.js');
const path = require('path');
const fs = require('fs');
const { count } = require('console');

const services = fs.readdirSync(path.join(__dirname, '..')).filter(file => fs.statSync(path.join(__dirname, '..', file)).isDirectory());

app.use(cloudflare.restore({update_on_start:true}));
app.use(logger.visitReq());

app.get('/', (req, res, next) => {
    const timeStart = Date.now();
    const visits = countVisits();
    const timeEnd = Date.now();
    const timeElapsed = timeEnd - timeStart;

    res.send({ visits, timeElapsed });
});

app.get('/base', (req, res, next) => {
    const timeStart = Date.now();
    const visits = countEndpointVisitsPerService('base');
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

function countEndpointVisitsPerService(service) {
    makeSureLogDirExists(service);
    let visitCount = 0;
    let messages = {};
    let cf_ip = {};
    let remoteAddress = {};
    let accept = {};
    let referer = {};
    let userAgent = {};
    fs.readdirSync(path.join(__dirname, '..', service, 'log', 'visit')).forEach(file => {
        let fileAgeDays = (Date.now() - new Date(file.split('.')[0])) / 1000 / 60 / 60 / 24;
        if (fileAgeDays < 7) {
            fs.readFileSync(path.join(__dirname, '..', service, 'log', 'visit', file)).toString().split('\n').forEach(line => {
                if (line) {
                    visitCount++;
                    const entry = JSON.parse(line);

                    mapCount(messages, entry.message);
                    mapCount(cf_ip, entry.meta.req.cf_ip);
                    mapCount(remoteAddress, entry.meta.req.connection.remoteAddress);
                    mapCount(accept, entry.meta.req.headers['accept']);
                    mapCount(referer, entry.meta.req.headers['referer']);
                    mapCount(userAgent, entry.meta.req.headers['user-agent']);
                }
            });
        }
    });
    return { 
        visitCount, 
        messages: sortByValue(messages),
        cf_ip: sortByValue(cf_ip),
        remoteAddress: sortByValue(remoteAddress),
        accept: sortByValue(accept),
        referer: sortByValue(referer),
        userAgent: sortByValue(userAgent)

    };
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