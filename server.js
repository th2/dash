const express = require('express');
const app = express();
const http = require('http').createServer(app);
const logger = require('./logger.js');
const path = require('path');
const fs = require('fs');
const { count } = require('console');

const services = fs.readdirSync(path.join(__dirname, '..')).filter(file => fs.statSync(path.join(__dirname, '..', file)).isDirectory());

app.use(logger.visitReq());

app.get('/', (req, res, next) => {
    const timeStart = Date.now();
    const visits = countVisits();
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
    let messages = {};
    fs.readdirSync(path.join(__dirname, '..', service, 'log', 'visit')).forEach(file => {
        let fileAgeDays = (Date.now() - new Date(file.split('.')[0])) / 1000 / 60 / 60 / 24;
        if (fileAgeDays < 7) {
            fs.readFileSync(path.join(__dirname, '..', service, 'log', 'visit', file)).toString().split('\n').forEach(line => {
                if (line) {
                    visitCount++;
                    const entry = JSON.parse(line);
                    if (messages[entry.message]) {
                        messages[entry.message]++;
                    } else {
                        messages[entry.message] = 1;
                    }
                }
            });
        }
    });
    const sortedMessages = Object.entries(messages).sort((a, b) => b[1] - a[1]);
    return { visitCount, messages: Object.fromEntries(sortedMessages) };
}

function makeSureLogDirExists(service) {
    fs.existsSync(path.join(__dirname, '..', service, 'log')) || fs.mkdirSync(path.join(__dirname, '..', service, 'log'));
    fs.existsSync(path.join(__dirname, '..', service, 'log', 'visit')) || fs.mkdirSync(path.join(__dirname, '..', service, 'log', 'visit'));
    fs.existsSync(path.join(__dirname, '..', service, 'log', 'error')) || fs.mkdirSync(path.join(__dirname, '..', service, 'log', 'error'));
}