const headers = {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json'
};

// define DOM elements
const conceptInput = document.getElementById('concept');
const conceptButton = document.getElementById('conceptButton');
const contentsInput = document.getElementById('contents');
const contentButton = document.getElementById('contentButton');
const chaptersDiv = document.getElementById('chapters');
const chaptersButton = document.getElementById('chaptersButton');
const autoGenCheckbox = document.getElementById('auto-gen');

// define global variables
let tableOfContents = [];
let currentLine = 0;

// generate content using OpenAI's API
async function generateContent(role, prompt) {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
            model: 'gpt-3.5-turbo',
            messages: [{
                role: 'system',
                content: role
            }, {
                role: 'user',
                content: prompt
            }]
        })
    });
    const data = await response.json();
    return data.choices[0].message.content;
}

// disable inputs and buttons
function disableInputsAndButtons(inputs, buttons) {
    inputs.forEach(input => input.disabled = true);
    buttons.forEach(button => button.disabled = true);
}

// get input values
function getInputValues() {
    const gptRole = document.getElementById('gpt-role').value;
    const bookLength = document.getElementById('book-length').value;
    const genre = document.getElementById('genre').value;
    const keywords = document.getElementById('keywords').value.split(',');
    return { gptRole, bookLength, genre, keywords };
}

// event listeners for buttons
// conceptButton generates a concept
conceptButton.addEventListener('click', async () => {
    const { gptRole, bookLength, genre, keywords } = getInputValues();
    const prompt = `Generate a ${bookLength}-word ${genre} concept with keywords: ${keywords.join(', ')}.`;
    const concept = await generateContent(gptRole, prompt);
    conceptInput.value = concept;
});

// contentButton generates a table of contents
contentButton.addEventListener('click', async () => {
    const { gptRole, genre, keywords } = getInputValues();
    disableInputsAndButtons([conceptInput], [conceptButton]);

    const concept = conceptInput.value;
    const prompt = `Based on the ${genre} concept: "${concept}" with keywords: ${keywords.join(', ')}, generate a table of contents. The table of contents should be only a list of chapters, no introductory or concluding text, no formatting, no empty lines, just a list of chapter names with a short description.`;

    const contents = await generateContent(gptRole, prompt);
    contentsInput.value = contents;
});

// chaptersButton generates chapters
// if auto-gen is checked, it will generate chapters until the end of the table of contents
chaptersButton.addEventListener('click', async () => {
    const { gptRole, genre, keywords } = getInputValues();
    disableInputsAndButtons([conceptInput, contentsInput], [conceptButton, contentButton]);

    tableOfContents = contentsInput.value.split('\n').filter(line => line.trim() !== '');

    if (currentLine < tableOfContents.length) {
        const prompt = `Based on the ${genre} chapter title: "${tableOfContents[currentLine]}" with keywords: ${keywords.join(', ')}, generate the chapter content.`;
        let chapter = await generateContent(gptRole, prompt);

        // replace newlines with <br> tags
        chapter = chapter.replace(/\n/g, '<br/>\n');

        chaptersDiv.innerHTML += `<h2>${tableOfContents[currentLine]}</h2><p>${chapter}</p>`;
        currentLine++;
        if (autoGenCheckbox.checked) {
            chaptersButton.click();
        }
    };
});

// exportButton exports the chapters to a text file
document.getElementById('exportButton').addEventListener('click', () => {
    const element = document.createElement('a');
    element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(chaptersDiv.innerHTML));
    element.setAttribute('download', 'chapters.txt');
    element.style.display = 'none';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
});
