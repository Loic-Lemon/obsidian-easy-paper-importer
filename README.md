# Easy Paper Importer for Obsidian 📚

**Easy Paper Importer** is an easy way import paper metadata from a DOI into Obsidian for note taking and literature management.

This plugin was (very) partially coded with GitHub Copilot to save time (e.g. get basics up and running + allowing for easier learning curve). Generated code is reviewed as needed. Use at your own discretion and report any issues you find.

## Why?

I could not find a paper importer that worked how I wanted it to.

## Features

- Input a DOI and fetch metadata
- Creates a note in a user-defined folder with:
    - Automated user-defined filename
    - YAML frontmatter (title, authors, doi, pdf link, tags)
    - User-defined body templating

> Note: This plugin does **not** currently download paper PDFs

## To Do

1. Custom non-DOI user-defined YAML frontmatter fields
2. PDF downloading: via affiliation login (??)
3. Verify code as a human :smile:

## Installation

1. Clone this repo into `<Vault>/.obsidian/plugins/easy-paper-importer`.
2. `npm install` + `npm run dev`/`npm run build` as shown in https://docs.obsidian.md/Plugins/Getting+started/Build+a+plugin

Note: Plugins can always modify your files, use with caution in case of any issues.

## Recommended

1. Pair with the PDF++ plugin for easy annotations (make a subfolder for PDFs and insert downloaded PDFs, open side by side to the note)
