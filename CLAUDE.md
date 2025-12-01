# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Next.js 15 web scraper application for Kronobergsbil that scrapes vehicle data from websites, processes it with OpenAI, and imports it into a Payload CMS backend. The application includes advanced deduplication logic and comprehensive vehicle data management.

## Commands

### Development
- `npm run dev` - Start development server on localhost:3000
- `npm run build` - Build the application for production  
- `npm start` - Start production server
- `npm run lint` - Run ESLint for code quality checks

## Architecture & Key Components

### Core Application Structure
- **Next.js App Router**: Uses the `src/app` directory structure with API routes
- **TypeScript**: Fully typed codebase with strict configuration
- **Tailwind CSS**: Styled with Tailwind CSS framework

### Main Features
- **Web Scraping**: Automated vehicle data extraction using Puppeteer (`src/lib/scraper.ts`)
- **AI Processing**: OpenAI integration for data enhancement and normalization (`src/lib/ai-processor.ts`)
- **Payload CMS Integration**: Vehicle data management with deduplication logic (`src/lib/payload-api.ts`, `src/lib/payload-deduplication.ts`)
- **Vehicle Import API**: Comprehensive API for importing/updating vehicle records (`src/app/api/import/fordon/route.ts`)

### Key Libraries
- **puppeteer**: Web scraping automation
- **openai**: AI-powered data processing
- **axios**: HTTP client for API calls
- **React 19**: Latest React version with concurrent features

### Data Flow Architecture
1. Web scraping extracts raw vehicle data
2. AI processor enhances and normalizes data structure
3. Deduplication engine prevents duplicates using fuzzy matching
4. Payload CMS API handles final data storage with automatic brand creation

### Important Implementation Notes
- Vehicle data supports complex financing options (privatleasing, company_leasing, loan)
- Deduplication uses both exact matching and Levenshtein distance algorithms
- Brand handling includes automatic creation of missing `bilmarken` records
- API handles both single vehicle imports and batch processing
- All vehicle imports validate and clean data before storage

### File Structure Highlights
- `/src/app/scrape/` - Main scraping interface and components
- `/src/components/Scrape/` - Reusable scraping UI components  
- `/src/lib/` - Core business logic and API integrations
- `/src/app/api/import/fordon/` - Vehicle import API endpoint