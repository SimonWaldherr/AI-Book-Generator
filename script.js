const apiKey = '<OpenAI API key here>';
const headers = {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json'
}

document.getElementById('conceptButton').addEventListener('click', function(event) {
    event.preventDefault();
    generateConcept();
});

document.getElementById('contentButton').addEventListener('click', function(event) {
    event.preventDefault();
    generateContents();
    document.getElementById('concept').disabled = true;
    document.getElementById('conceptButton').disabled = true;
});

document.getElementById('chaptersButton').addEventListener('click', function(event) {
    event.preventDefault();
    generateChapters();
    document.getElementById('contents').disabled = true;
    document.getElementById('contentButton').disabled = true;
});

document.getElementById('exportButton').addEventListener('click', function(event) {
    event.preventDefault();
    exportToTxt();
});

let tableOfContents = [];
let currentLine = 0;

async function generateConcept() {
    const gptRole = document.getElementById('gpt-role').value;
    const bookLength = document.getElementById('book-length').value;
    const genre = document.getElementById('genre').value;
    const keywords = document.getElementById('keywords').value.split(',');
    
    const prompt = `Generate a ${bookLength}-word ${genre} concept with keywords: ${keywords.join(', ')}.`;
    
    const concept = await generateContent(gptRole, prompt);
    document.getElementById('concept').value = concept;
}

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

async function generateContents() {
    const gptRole = document.getElementById('gpt-role').value;
    const concept = document.getElementById('concept').value;
    const genre = document.getElementById('genre').value;
    const keywords = document.getElementById('keywords').value.split(',');
    
    const prompt = `Based on the ${genre} concept: "${concept}" with keywords: ${keywords.join(', ')}, generate a table of contents. The table of contents should be only a list of chapters, no introductory or concluding text, no formatting, no empty lines, just a list of chapter names with a short description.`;
    
    const contents = await generateContent(gptRole, prompt);
    document.getElementById('contents').value = contents;
    // Split the table of contents into lines
    tableOfContents = contents.split('\n').filter(line => line.trim() !== '');
    
    document.getElementById('concept').disabled = true;
    document.getElementById('conceptButton').disabled = true;
}

async function generateChapters() {
    if (currentLine >= tableOfContents.length) {
        console.log("All chapters generated");
        return;
    }
    
    const gptRole = document.getElementById('gpt-role').value;
    const genre = document.getElementById('genre').value;
    const keywords = document.getElementById('keywords').value.split(',');
    
    const prompt = `Based on the ${genre} chapter title: "${tableOfContents[currentLine]}" with keywords: ${keywords.join(', ')}, generate the chapter content.`;
    
    const chapter = await generateContent(gptRole, prompt);
    const chapterDiv = document.getElementById('chapters');
    chapterDiv.innerHTML += `<h2>${tableOfContents[currentLine]}</h2><p>${chapter}</p>`;
    currentLine++;
    
    // If "Auto Generate Chapters" is checked, automatically generate the next chapter
    const autoGenerateChapters = document.getElementById('auto-gen').checked;
    if (autoGenerateChapters) {
        generateChapters();
    }
}

function exportToTxt() {
    const chapters = document.getElementById('chapters').innerHTML;
    const element = document.createElement('a');
    element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(chapters));
    element.setAttribute('download', 'chapters.txt');
    element.style.display = 'none';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
}
