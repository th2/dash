class ResultBox extends HTMLElement {
    constructor() {
        super();
    }
    connectedCallback() {
        console.log("Custom element added to page.");
    }

    disconnectedCallback() {
        console.log("Custom element removed from page.");
    }

    adoptedCallback() {
        console.log("Custom element moved to new page.");
    }

    attributeChangedCallback(name, oldValue, newValue) {
        console.log(`Attribute ${name} has changed.`);
    }
}
customElements.define("result-box", ResultBox);


document.getElementById('searchbutton').addEventListener('click', function() {
    //document.getElementById('results').innerHTML = 'Loading...';
 
    document.getElementById('results').appendChild(document.createElement('result-box'));

    /*fetch('/query', {
        method: 'POST',
        body: JSON.stringify({search: document.getElementById('searchbox').value}),
        headers: {
            'Content-Type': 'application/json'
        }
    })
    .then(response => response.json())
    .then(data => {
        document.getElementById('results').innerHTML = data.result;
    });*/
});