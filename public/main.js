
document.getElementById('searchbutton').addEventListener('click', function() {
    document.getElementById('results-stats').innerHTML = 'Loading...';
    fetch('/details', {
        method: 'POST',
        body: document.getElementById('searchbox').value,
        headers: {'Content-Type': 'application/json'}
    })
    .then(response => response.json())
    .then(data => {
        showData(data);
    });
});

function showData(data) {    
    const resultsDetails = document.getElementById('results-details');
    while (resultsDetails.firstChild) {
        resultsDetails.removeChild(resultsDetails.firstChild);
    }
    document.getElementById('results-stats').innerHTML = data.visits.visitCount + ' visits (' + data.timeElapsed + 'ms)<br>';
    const details = data.visits.details;
    for (const detail in details) {
        const div = document.createElement('div');
        div.className = 'detail detail-' + detail;
        const title = document.createElement('h2');
        title.innerHTML = Object.keys(details[detail]).length + ' ' + detail;
        div.appendChild(title);
        const ul = document.createElement('ul');
        for (const value in details[detail]) {
            const li = document.createElement('li');
            li.className = 'detail-neutral';
            li.appendChild(createA('⊕', () => addSearchDetail(detail, value, true, li)));
            li.appendChild(createA('⊖', () => addSearchDetail(detail, value, false, li)));
            li.appendChild(createSpan(details[detail][value] + ' ', 'count'));
            li.appendChild(createSpan(value, 'value'));
            ul.appendChild(li);
        }
        div.appendChild(ul);
        resultsDetails.appendChild(div);
    }
}

function createA(text, onclick) {
    const a = document.createElement('a');
    a.text = text;
    a.onclick = onclick;
    return a;
}

function createSpan(text, className) {
    const span = document.createElement('span');
    span.innerHTML = text;
    span.className = className;
    return span;
}

function addSearchDetail(detail, value, include, li) {
    var query = JSON.parse(document.getElementById('searchbox').value);
    const newDetail = { detail: detail, value: value, include: include };
    if (query.some(item => item.detail === detail && item.value === value && item.include === include)) {
        query = query.filter(item => !(item.detail === detail && item.value === value && item.include === include));
        li.className = 'detail-neutral';
    } else {
        query.push(newDetail);
        li.className = include ? 'detail-include' : 'detail-exclude';
    }
    document.getElementById('searchbox').value = JSON.stringify(query);
}