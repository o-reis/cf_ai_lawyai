/**
 * webscraper.js
 *
 * Scraps from https://www.pgdlisboa.pt/ all the articles
 * and creates DML files in the folder database_insertions
 *
 * Usage:
 *   node webscraper.js
 *
 */

import { load } from "cheerio";
import { writeFileSync, existsSync, mkdirSync } from "fs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms)); // Credits to https://stackoverflow.com/questions/951021/what-is-the-javascript-version-of-sleep

const website_id_arr = [];
let query = "";
const chunk_size = 3000;

let insert_counter = 0;
let file_counter = 1;
const INSERTS_PER_FILE = 500;

function saveFile(forceSave = false) {
  if (query.trim() === "") return;
  if (insert_counter >= INSERTS_PER_FILE || forceSave) {
    if (!existsSync("./database_insertions")) {
      mkdirSync("./database_insertions");
    }
    const fileName = `./database_insertions/insert-in-db${file_counter}.sql`;
    writeFileSync(fileName, query);
    query = "";
    insert_counter = 0;
    file_counter++;
  }
}

(async () => {
  const url = "https://www.pgdlisboa.pt/leis/lei_main.php";
  const response = await fetch(url);
  const buffer = await response.arrayBuffer();
  const decoder = new TextDecoder("iso-8859-1");
  const html = decoder.decode(buffer);

  const $ = load(html);

  $('select[name="select_area"] option').each(async (i, element) => {
    const category = $(element).text().trim();
    const website_id = $(element).val();
    if (category && category != "Todas") {
      query += `INSERT OR IGNORE INTO Categories (id, name) VALUES ('${website_id}', '${category}');\n`;
      insert_counter++;
      website_id_arr.push(website_id);
    }
  });

  for (const id of website_id_arr) {
    await allArticlesFromCategory(id);
  }

  saveFile(true);
})();

async function allArticlesFromCategory(id) {
  const url = "https://www.pgdlisboa.pt/leis/lei_main.php?codarea=" + id;
  const response = await fetch(url);

  const links = [];

  const $ = load(await response.text());
  $('a[href*="lei_mostra_articulado"]').each(async (i, element) => {
    links.push(
      "https://www.pgdlisboa.pt/leis/" +
        $(element)
          .attr("href")
          .replace("lei_mostra_articulado", "lei_print_articulado")
    );
  });

  for (const link of links) {
    await sleep(300);
    console.log("A");
    const article_text = await getTextFromArticle(link);

    for (let i = 0; i < article_text.length; i += chunk_size) {
      const chunk = article_text.substring(i, i + chunk_size);
      const safeChunk = chunk.replace(/'/g, "''");
      query += `INSERT OR IGNORE INTO Articles (text, category_id) VALUES ('${safeChunk}','${id}');\n`;
      insert_counter++;

      saveFile();
    }
  }
}

async function getTextFromArticle(url) {
  const response = await fetch(url);
  const buffer = await response.arrayBuffer();
  const decoder = new TextDecoder("iso-8859-1");
  const html = decoder.decode(buffer);
  const $ = load(html);

  $("script, style, nav, footer, header, noscript").remove();
  return $("body")
    .text()
    .replace(/\t/g, "")
    .replace(/\n+/g, "\n")
    .replace(/[^\p{L}\p{N}\s.,;:!?\-"'()ºª§\/]/gu, "")
    .trim();
}
