# LawyAI

## What is LawyAI?

This project consists of a website that with a AI chatbot serves as an advocacy helper for constitution of the portuguese republic and its articles. **This is not intended to replace the lawyers' work, since the model may produce inaccuracies.** The project serves only as a first analysis to user scenarios.

## Working Procedure

The project is based on the official "Build Agents on Cloudflare" tutorial, using the command:
`npx create-cloudflare@latest --template cloudflare/agents-starter`

The workflow of the app is:

1. The developer uses the web scraping script.
2. With the scraped data, inserts into the Cloudflare database with `Get-ChildItem -Path .\database_insertions\*.sql | ForEach-Object { Write-Host "A enviar o ficheiro: $($_.Name)..." -ForegroundColor Cyan; npx wrangler d1 execute lawyaidb --remote --file="$($_.FullName)" --yes }` inside the project folder. This specific command works for PowerShell.
3. The Cloudflare database is now populated. Now, the developer starts the app.
4. With the app initiated, when an user sends a message to the chat, the AI model classifies the message with one of the different types of areas of the constitution and a single word for search purposes.
5. The server script then requests all the articles and relevant official content that may be informative and relevant.
6. With all information gathered, the server loads another AI model and gives all the necessary context.
7. The server returns the model answer.
  
## Requisites

The requisites are basic since Cloudflare handles most of the hard work.

- Node.js
- Git
- A code editor

## Usage


