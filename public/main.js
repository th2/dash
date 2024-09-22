document.getElementById('searchbutton').addEventListener('click', function() {
    document.getElementById('results-header').innerHTML = 'Loading...';
 
    //document.getElementById('results').appendChild(document.createElement('div'));

    fetch('/base', {
        method: 'POST',
        body: JSON.stringify({search: document.getElementById('searchbox').value}),
        headers: {'Content-Type': 'application/json'}
    })
    .then(response => response.json())
    .then(data => {
        showData(data);
    });
});

function showData(data) {    
    document.getElementById('results-header').innerHTML = data.visits.visitCount + ' visits (' + data.timeElapsed + 'ms)<br>';
    const details = data.visits.details;
    for (const detail in details) {
        const div = document.createElement('div');
        div.className = 'detail';
        const title = document.createElement('b');
        title.innerHTML = detail + ' ' + Object.keys(details[detail]).length;
        div.appendChild(title);
        div.appendChild(document.createElement('br'));
        for (const value in details[detail]) {
            div.appendChild(document.createTextNode(details[detail][value] + ' ' + value));
            div.appendChild(document.createElement('br'));
        }
        document.getElementById('results-details').appendChild(div);
    }
    console.log(details);
}