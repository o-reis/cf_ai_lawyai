# LawyAI

## What is LawyAI?

This project consists of a website that with a AI chatbot serves as an advocacy helper for the legislation of the portuguese republic and its articles. **This is not intended to replace the lawyers' work, since the model may produce inaccuracies.** The project serves only as a first analysis to user scenarios.

## The Coding Problem

The legislation of the portuguese republic contains large files, that are difficult for human reading, with a high frequency of amendments. This need for constant update presents a significant barrier not only to human comprehension but also to traditional artificial intelligence. Standard Large Language Models (LLMs) bake knowledge into their static training weights. Consequently, their understanding of the law becomes obsolete the moment a new decree is published. Keeping LLMs with this daily training is prohibitive, has higher chance to produce errors and is inefficient. Nowadays, AI models tend to cheat when running out of other options, and this scenario can be a major risk, so making the model always state its sources is important.

## My Solution

LawyAI is a model that unifies reasoning with information. It delivers accurate, context-aware, and fully traceable legal insights.

## Working Procedure

The project is based on the official "Build Agents on Cloudflare" tutorial, using the command:
`npx create-cloudflare@latest --template cloudflare/agents-starter`

The workflow of the app is:

1. The developer uses the web scraping script with `node webscraper.js` inside the project folder.
2. With the scraped data, inserts into the Cloudflare database with `Get-ChildItem -Path .\database_insertions\*.sql | ForEach-Object { Write-Host "A enviar o ficheiro: $($_.Name)..." -ForegroundColor Cyan; npx wrangler d1 execute lawyaidb --remote --file="$($_.FullName)" --yes }` inside the project folder. This specific command works for PowerShell.
3. The Cloudflare database is now populated. Now, the developer starts the app.
4. With the app initiated, when an user sends a message to the chat, the server calls a different AI model that generates other similar prompts and then vectorizes all requests.
5. The server script then requests all the articles and relevant official content that may be informative and relevant (have matching vectors).
6. With all information gathered, the server loads another AI model and gives all the necessary context.
7. The server returns the model answer to the user via the website.
  
## Requisites

The requisites are basic since Cloudflare handles most of the hard work.

- Node.js
- Git
- A code editor

## Usage

After initiating the server with `npx wrangler dev`, go to <http://localhost:8787/>. After going to the website with the browser you are now ready to use it.

## Demonstration Video

*The video is in portuguese.*

![Demonstration](demonstration/demonstration_video.mp4)

## Credits

This app wouldn't be possible without Cloudlfare's infrastructure for vectorization and deployment.
