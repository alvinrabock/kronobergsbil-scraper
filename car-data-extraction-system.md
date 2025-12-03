# Car Data Extraction System - Claude API Implementation Guide

## Overview

This system extracts structured vehicle data from multiple sources:
- **PDF documents** (price lists, brochures, spec sheets)
- **Images** (car photos, price stickers, spec tables)
- **HTML pages** (dealer websites, manufacturer pages)

All data is normalized into a flexible, brand-agnostic JSON schema.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        INPUT SOURCES                            │
├─────────────────┬─────────────────┬─────────────────────────────┤
│      PDF        │     Images      │           HTML              │
│  (price lists)  │  (brochures)    │    (dealer websites)        │
└────────┬────────┴────────┬────────┴──────────────┬──────────────┘
         │                 │                       │
         ▼                 ▼                       ▼
┌─────────────────────────────────────────────────────────────────┐
│                    PREPROCESSOR                                  │
│  • PDF: Extract text + convert pages to images                  │
│  • Images: Resize/compress if needed                            │
│  • HTML: Clean and extract relevant sections                    │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                 CLAUDE API (claude-sonnet-4-5)                    │
│  • Single unified prompt with JSON schema                       │
│  • Batch API for high volume (50% cost savings)                 │
│  • Prompt caching for repeated schema (90% cache discount)      │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    OUTPUT: Normalized JSON                      │
│  • Brand-agnostic schema                                        │
│  • Validation & error handling                                  │
│  • Storage to database/CMS                                      │
└─────────────────────────────────────────────────────────────────┘
```

---

## Cost Optimization Strategies

### 1. Model Selection

| Task | Recommended Model | Cost (per 1M tokens) | Use Case |
|------|-------------------|---------------------|----------|
| Simple extraction | claude-haiku-4-5 | $0.25 input / $1.25 output | Basic price/spec tables |
| Complex documents | claude-sonnet-4-5 | $3 input / $15 output | Multi-page PDFs, complex layouts |
| High accuracy needs | claude-opus-4-5 | $15 input / $75 output | Legal docs, contracts |

**Recommendation**: Use `claude-sonnet-4-5` for most car data extraction. Use `claude-haiku-4-5` for simple, repetitive tasks.

### 2. Batch API (50% Cost Reduction)

For non-urgent processing (24-hour turnaround), use the Batch API:

```python
# Instead of processing one at a time, batch multiple documents
batch_requests = [
    {"custom_id": "opel-mokka-001", "params": {...}},
    {"custom_id": "suzuki-swift-002", "params": {...}},
    {"custom_id": "volvo-xc40-003", "params": {...}},
]
# Submit batch - 50% cheaper than real-time API
```

### 3. Prompt Caching (90% Discount on Cached Tokens)

Cache your system prompt and JSON schema:

```python
# The schema and instructions stay the same across all requests
# Only the document content changes
# Cached tokens cost 90% less

headers = {
    "anthropic-beta": "prompt-caching-2024-07-31"
}

messages = [
    {
        "role": "user",
        "content": [
            {
                "type": "text",
                "text": SYSTEM_PROMPT + JSON_SCHEMA,  # ~2000 tokens - CACHED
                "cache_control": {"type": "ephemeral"}
            },
            {
                "type": "document",  # Varies per request
                "source": {"type": "base64", "media_type": "application/pdf", "data": pdf_base64}
            }
        ]
    }
]
```

### 4. Token Optimization

| Optimization | Savings | Implementation |
|-------------|---------|----------------|
| Compress images | 30-50% | Resize to max 1568px on longest side |
| Extract text from PDFs first | 50-70% | Use pypdf for text, only send images for tables/charts |
| Clean HTML | 60-80% | Remove scripts, styles, navigation, footers |
| Truncate irrelevant pages | Variable | Only send pages with pricing/specs |

---

## Implementation

### Project Structure

```
car-data-extraction/
├── src/
│   ├── extractors/
│   │   ├── pdf_extractor.py
│   │   ├── image_extractor.py
│   │   ├── html_extractor.py
│   │   └── base_extractor.py
│   ├── processors/
│   │   ├── preprocessor.py
│   │   └── postprocessor.py
│   ├── schemas/
│   │   ├── car_schema.json
│   │   └── field_mappings.json
│   ├── api/
│   │   ├── claude_client.py
│   │   └── batch_processor.py
│   └── utils/
│       ├── image_utils.py
│       └── pdf_utils.py
├── prompts/
│   └── extraction_prompt.txt
├── config/
│   └── settings.py
└── tests/
```

### Core Implementation

#### 1. Base Configuration (`config/settings.py`)

```python
import os
from dataclasses import dataclass
from typing import Literal

@dataclass
class Settings:
    # API Configuration
    ANTHROPIC_API_KEY: str = os.environ.get("ANTHROPIC_API_KEY")
    
    # Model Selection
    DEFAULT_MODEL: str = "claude-sonnet-4-5-20250929"
    FAST_MODEL: str = "claude-haiku-4-5-20251001"
    
    # Cost thresholds
    USE_BATCH_API_THRESHOLD: int = 10  # Use batch if > 10 documents
    MAX_TOKENS_OUTPUT: int = 8000
    
    # Image settings
    MAX_IMAGE_DIMENSION: int = 1568  # Claude's optimal size
    IMAGE_QUALITY: int = 85  # JPEG quality
    
    # Processing
    BATCH_SIZE: int = 50
    CACHE_TTL_MINUTES: int = 5

settings = Settings()
```

#### 2. Claude API Client (`src/api/claude_client.py`)

```python
import anthropic
import base64
import json
from typing import Optional, Union
from pathlib import Path

class ClaudeCarExtractor:
    def __init__(self, api_key: str, model: str = "claude-sonnet-4-5-20250929"):
        self.client = anthropic.Anthropic(api_key=api_key)
        self.model = model
        self.system_prompt = self._load_system_prompt()
        self.json_schema = self._load_json_schema()
    
    def _load_system_prompt(self) -> str:
        return """You are a specialized car data extraction system. Your task is to extract 
structured vehicle information from documents (PDFs, images, HTML) and return valid JSON.

CRITICAL RULES:
1. ALWAYS return valid JSON matching the provided schema
2. Use null for missing/unclear values - NEVER guess or hallucinate
3. Preserve original values in "value" field, normalize in "normalized" field
4. Include "source_label" with the original field name from the document
5. Handle ranges (e.g., "5.9-6.0") by populating min/max fields
6. All prices should be in the document's currency (usually SEK for Swedish docs)
7. Convert power units: 1 kW = 1.36 hp (but preserve original in value)

EXTRACTION PRIORITY:
1. Model names and trim levels
2. Pricing (purchase price, leasing, financing)
3. Engine specifications (power, fuel type, transmission)
4. Consumption and emissions (WLTP values)
5. Dimensions and weights
6. Standard equipment and options
7. Colors and customization options
8. Warranty information"""

    def _load_json_schema(self) -> str:
        # Load the flexible schema
        return """
{
  "meta": {
    "brand": "string - manufacturer name",
    "model": "string - model name",
    "variant": "string|null - e.g., 'Facelift', '2025'",
    "slug": "string - URL-friendly identifier",
    "currency": "string - ISO currency code",
    "market": "string - ISO country code"
  },
  "models": [
    {
      "id": "string - unique identifier",
      "name": "string - full model name",
      "trim_level": "string|null",
      "engine": {
        "fuel_type": {
          "value": "string - original value",
          "normalized": "petrol|diesel|electric|hybrid|plugin_hybrid",
          "source_label": "string - original field name"
        },
        "power": {
          "kw": {"value": "number|null", "min": "number|null", "max": "number|null"},
          "hp": {"value": "number|null", "min": "number|null", "max": "number|null"},
          "source_label": "string|null"
        },
        "torque": {
          "nm": {"value": "number|null"},
          "at_rpm": "number|null",
          "source_label": "string|null"
        }
      },
      "transmission": {
        "type": {"value": "string", "normalized": "manual|automatic|cvt"},
        "gears": {"value": "number|null"}
      },
      "consumption": {
        "fuel": {
          "combined": {
            "value": "number|null",
            "min": "number|null", 
            "max": "number|null",
            "display": "string|null - original text like '5.9-6.0'",
            "unit": "l/100km",
            "source_label": "string|null"
          }
        },
        "electric": {
          "combined": {"value": "number|null", "unit": "kWh/100km"}
        }
      },
      "emissions": {
        "co2": {
          "value": "number|null",
          "min": "number|null",
          "max": "number|null",
          "unit": "g/km"
        }
      },
      "pricing": {
        "purchase_price": {"value": "number|null", "source_label": "string|null"},
        "lease_monthly": {"value": "number|null", "source_label": "string|null"},
        "loan_monthly": {"value": "number|null", "source_label": "string|null"}
      }
    }
  ],
  "colors": [
    {
      "code": "string|null",
      "name": "string",
      "type": "solid|metallic|pearl|matte",
      "price": {"value": "number"}
    }
  ],
  "options": [
    {
      "code": "string|null",
      "name": "string",
      "price": {"value": "number|null"}
    }
  ]
}"""

    def extract_from_pdf(
        self, 
        pdf_path: Union[str, Path], 
        use_cache: bool = True
    ) -> dict:
        """Extract car data from PDF document."""
        
        with open(pdf_path, "rb") as f:
            pdf_base64 = base64.standard_b64encode(f.read()).decode("utf-8")
        
        messages = self._build_messages(
            content_type="document",
            media_type="application/pdf",
            data=pdf_base64,
            use_cache=use_cache
        )
        
        return self._call_api(messages)
    
    def extract_from_image(
        self, 
        image_path: Union[str, Path],
        use_cache: bool = True
    ) -> dict:
        """Extract car data from image."""
        
        # Determine media type
        suffix = Path(image_path).suffix.lower()
        media_types = {
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".png": "image/png",
            ".gif": "image/gif",
            ".webp": "image/webp"
        }
        media_type = media_types.get(suffix, "image/jpeg")
        
        with open(image_path, "rb") as f:
            image_base64 = base64.standard_b64encode(f.read()).decode("utf-8")
        
        messages = self._build_messages(
            content_type="image",
            media_type=media_type,
            data=image_base64,
            use_cache=use_cache
        )
        
        return self._call_api(messages)
    
    def extract_from_html(
        self, 
        html_content: str,
        source_url: Optional[str] = None,
        use_cache: bool = True
    ) -> dict:
        """Extract car data from HTML content."""
        
        # Clean HTML before sending
        cleaned_html = self._clean_html(html_content)
        
        messages = self._build_messages(
            content_type="text",
            text_content=f"Source URL: {source_url}\n\nHTML Content:\n{cleaned_html}",
            use_cache=use_cache
        )
        
        return self._call_api(messages)
    
    def extract_from_url(
        self,
        url: str,
        use_cache: bool = True
    ) -> dict:
        """Extract car data from a URL (PDF or webpage)."""
        
        if url.lower().endswith('.pdf'):
            # Use URL-based PDF
            messages = self._build_messages(
                content_type="document",
                source_type="url",
                url=url,
                use_cache=use_cache
            )
        else:
            # For HTML, we'd need to fetch first (or use web_fetch tool)
            raise ValueError("For HTML URLs, fetch content first and use extract_from_html()")
        
        return self._call_api(messages)
    
    def _build_messages(
        self,
        content_type: str,
        media_type: str = None,
        data: str = None,
        text_content: str = None,
        source_type: str = "base64",
        url: str = None,
        use_cache: bool = True
    ) -> list:
        """Build message array with optional caching."""
        
        content = []
        
        # Add cached system prompt and schema
        prompt_text = f"{self.system_prompt}\n\nOUTPUT JSON SCHEMA:\n{self.json_schema}\n\nExtract all vehicle data from the following document and return valid JSON:"
        
        prompt_block = {
            "type": "text",
            "text": prompt_text
        }
        
        if use_cache:
            prompt_block["cache_control"] = {"type": "ephemeral"}
        
        content.append(prompt_block)
        
        # Add document/image/text content
        if content_type == "document":
            if source_type == "url":
                content.append({
                    "type": "document",
                    "source": {
                        "type": "url",
                        "url": url
                    }
                })
            else:
                content.append({
                    "type": "document",
                    "source": {
                        "type": "base64",
                        "media_type": media_type,
                        "data": data
                    }
                })
        elif content_type == "image":
            content.append({
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": media_type,
                    "data": data
                }
            })
        elif content_type == "text":
            content.append({
                "type": "text",
                "text": text_content
            })
        
        return [{"role": "user", "content": content}]
    
    def _call_api(self, messages: list) -> dict:
        """Call Claude API and parse response."""
        
        response = self.client.messages.create(
            model=self.model,
            max_tokens=8000,
            messages=messages
        )
        
        # Extract JSON from response
        response_text = response.content[0].text
        
        # Parse JSON (handle potential markdown code blocks)
        json_text = response_text
        if "```json" in json_text:
            json_text = json_text.split("```json")[1].split("```")[0]
        elif "```" in json_text:
            json_text = json_text.split("```")[1].split("```")[0]
        
        try:
            return {
                "success": True,
                "data": json.loads(json_text.strip()),
                "usage": {
                    "input_tokens": response.usage.input_tokens,
                    "output_tokens": response.usage.output_tokens,
                    "cache_read_tokens": getattr(response.usage, 'cache_read_input_tokens', 0),
                    "cache_creation_tokens": getattr(response.usage, 'cache_creation_input_tokens', 0)
                }
            }
        except json.JSONDecodeError as e:
            return {
                "success": False,
                "error": f"JSON parse error: {str(e)}",
                "raw_response": response_text
            }
    
    def _clean_html(self, html: str) -> str:
        """Remove unnecessary HTML elements to reduce tokens."""
        from bs4 import BeautifulSoup
        
        soup = BeautifulSoup(html, 'html.parser')
        
        # Remove scripts, styles, navigation, footers
        for element in soup.find_all(['script', 'style', 'nav', 'footer', 'header', 'aside', 'iframe', 'noscript']):
            element.decompose()
        
        # Remove common non-content classes
        for element in soup.find_all(class_=lambda x: x and any(
            term in str(x).lower() for term in ['menu', 'nav', 'footer', 'sidebar', 'cookie', 'popup', 'modal', 'ad-', 'social']
        )):
            element.decompose()
        
        # Get text with some structure preserved
        return soup.get_text(separator='\n', strip=True)
```

#### 3. Batch Processor (`src/api/batch_processor.py`)

```python
import anthropic
import json
import time
from typing import List, Dict
from pathlib import Path

class BatchCarExtractor:
    """Process multiple documents using Claude's Batch API (50% cost savings)."""
    
    def __init__(self, api_key: str):
        self.client = anthropic.Anthropic(api_key=api_key)
        self.model = "claude-sonnet-4-5-20250929"
    
    def create_batch(self, documents: List[Dict]) -> str:
        """
        Create a batch processing job.
        
        Args:
            documents: List of dicts with 'id', 'type' (pdf/image/html), 'content'
        
        Returns:
            batch_id for tracking
        """
        
        requests = []
        
        for doc in documents:
            request = {
                "custom_id": doc["id"],
                "params": {
                    "model": self.model,
                    "max_tokens": 8000,
                    "messages": self._build_message(doc)
                }
            }
            requests.append(request)
        
        # Create batch
        batch = self.client.batches.create(requests=requests)
        
        return batch.id
    
    def check_batch_status(self, batch_id: str) -> Dict:
        """Check status of a batch job."""
        batch = self.client.batches.retrieve(batch_id)
        
        return {
            "id": batch.id,
            "status": batch.processing_status,
            "created_at": batch.created_at,
            "ended_at": batch.ended_at,
            "request_counts": {
                "total": batch.request_counts.total,
                "succeeded": batch.request_counts.succeeded,
                "failed": batch.request_counts.failed,
                "processing": batch.request_counts.processing
            }
        }
    
    def get_batch_results(self, batch_id: str) -> List[Dict]:
        """Retrieve results from completed batch."""
        
        results = []
        
        for result in self.client.batches.results(batch_id):
            if result.result.type == "succeeded":
                response_text = result.result.message.content[0].text
                
                # Parse JSON
                try:
                    json_text = response_text
                    if "```json" in json_text:
                        json_text = json_text.split("```json")[1].split("```")[0]
                    
                    results.append({
                        "custom_id": result.custom_id,
                        "success": True,
                        "data": json.loads(json_text.strip())
                    })
                except json.JSONDecodeError as e:
                    results.append({
                        "custom_id": result.custom_id,
                        "success": False,
                        "error": str(e),
                        "raw": response_text
                    })
            else:
                results.append({
                    "custom_id": result.custom_id,
                    "success": False,
                    "error": result.result.error
                })
        
        return results
    
    def process_batch_sync(
        self, 
        documents: List[Dict],
        poll_interval: int = 60,
        max_wait: int = 86400  # 24 hours
    ) -> List[Dict]:
        """
        Submit batch and wait for results.
        
        For production, consider using webhooks instead of polling.
        """
        
        batch_id = self.create_batch(documents)
        print(f"Batch created: {batch_id}")
        
        elapsed = 0
        while elapsed < max_wait:
            status = self.check_batch_status(batch_id)
            print(f"Status: {status['status']} - {status['request_counts']}")
            
            if status["status"] == "ended":
                return self.get_batch_results(batch_id)
            
            time.sleep(poll_interval)
            elapsed += poll_interval
        
        raise TimeoutError(f"Batch {batch_id} did not complete within {max_wait}s")
    
    def _build_message(self, doc: Dict) -> List[Dict]:
        """Build message for a single document."""
        # Similar to ClaudeCarExtractor._build_messages
        # ... implementation
        pass
```

#### 4. Preprocessor (`src/processors/preprocessor.py`)

```python
from PIL import Image
from io import BytesIO
import base64
from pathlib import Path
from typing import Union, Tuple
import fitz  # PyMuPDF

class DocumentPreprocessor:
    """Prepare documents for optimal Claude API processing."""
    
    MAX_IMAGE_DIMENSION = 1568  # Claude's recommended max
    JPEG_QUALITY = 85
    
    def optimize_image(
        self, 
        image_input: Union[str, Path, bytes, Image.Image]
    ) -> Tuple[str, str]:
        """
        Optimize image for Claude API.
        
        Returns:
            Tuple of (base64_data, media_type)
        """
        
        # Load image
        if isinstance(image_input, (str, Path)):
            img = Image.open(image_input)
        elif isinstance(image_input, bytes):
            img = Image.open(BytesIO(image_input))
        else:
            img = image_input
        
        # Convert to RGB if necessary
        if img.mode in ('RGBA', 'P'):
            img = img.convert('RGB')
        
        # Resize if too large
        if max(img.size) > self.MAX_IMAGE_DIMENSION:
            ratio = self.MAX_IMAGE_DIMENSION / max(img.size)
            new_size = tuple(int(dim * ratio) for dim in img.size)
            img = img.resize(new_size, Image.Resampling.LANCZOS)
        
        # Save to bytes
        buffer = BytesIO()
        img.save(buffer, format='JPEG', quality=self.JPEG_QUALITY, optimize=True)
        
        return base64.standard_b64encode(buffer.getvalue()).decode('utf-8'), 'image/jpeg'
    
    def extract_pdf_text(self, pdf_path: Union[str, Path]) -> str:
        """Extract text from PDF (cheaper than sending as images)."""
        
        doc = fitz.open(pdf_path)
        text_parts = []
        
        for page_num, page in enumerate(doc):
            text = page.get_text()
            if text.strip():
                text_parts.append(f"--- Page {page_num + 1} ---\n{text}")
        
        return "\n\n".join(text_parts)
    
    def pdf_has_complex_layout(self, pdf_path: Union[str, Path]) -> bool:
        """
        Detect if PDF has tables, charts, or complex layouts
        that require visual analysis.
        """
        
        doc = fitz.open(pdf_path)
        
        for page in doc:
            # Check for images
            if page.get_images():
                return True
            
            # Check for tables (look for grid patterns in drawings)
            drawings = page.get_drawings()
            if len(drawings) > 10:  # Likely has table borders
                return True
            
            # Check for multiple text columns
            blocks = page.get_text("blocks")
            if len(blocks) > 5:
                x_positions = set(int(b[0] / 50) for b in blocks)  # Group by ~50px
                if len(x_positions) > 2:  # Multiple columns
                    return True
        
        return False
    
    def smart_pdf_extract(
        self, 
        pdf_path: Union[str, Path]
    ) -> dict:
        """
        Intelligently decide whether to use text extraction or visual analysis.
        
        Returns:
            dict with 'method', 'content', and 'media_type'
        """
        
        if self.pdf_has_complex_layout(pdf_path):
            # Use PDF document type (Claude analyzes visually)
            with open(pdf_path, "rb") as f:
                pdf_base64 = base64.standard_b64encode(f.read()).decode("utf-8")
            
            return {
                "method": "visual",
                "content": pdf_base64,
                "media_type": "application/pdf"
            }
        else:
            # Use text extraction (cheaper)
            text = self.extract_pdf_text(pdf_path)
            
            return {
                "method": "text",
                "content": text,
                "media_type": "text/plain"
            }
    
    def extract_pdf_pages_as_images(
        self,
        pdf_path: Union[str, Path],
        pages: list = None,
        dpi: int = 150
    ) -> list:
        """
        Convert specific PDF pages to images.
        Useful for extracting only price/spec pages.
        """
        
        doc = fitz.open(pdf_path)
        images = []
        
        page_nums = pages if pages else range(len(doc))
        
        for page_num in page_nums:
            if page_num >= len(doc):
                continue
                
            page = doc[page_num]
            
            # Render page to image
            mat = fitz.Matrix(dpi / 72, dpi / 72)
            pix = page.get_pixmap(matrix=mat)
            
            img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
            
            # Optimize
            base64_data, media_type = self.optimize_image(img)
            
            images.append({
                "page": page_num + 1,
                "base64": base64_data,
                "media_type": media_type
            })
        
        return images
```

#### 5. HTML Scraper Integration (`src/extractors/html_extractor.py`)

```python
import httpx
from bs4 import BeautifulSoup
from typing import Optional, Dict
from urllib.parse import urljoin, urlparse

class CarWebsiteScraper:
    """Scrape and extract car data from dealer/manufacturer websites."""
    
    def __init__(self, claude_extractor):
        self.extractor = claude_extractor
        self.client = httpx.Client(
            headers={
                "User-Agent": "Mozilla/5.0 (compatible; CarDataBot/1.0)"
            },
            follow_redirects=True,
            timeout=30.0
        )
    
    def scrape_and_extract(self, url: str) -> Dict:
        """Fetch page and extract car data."""
        
        response = self.client.get(url)
        response.raise_for_status()
        
        # Clean HTML
        cleaned_html = self._clean_html(response.text)
        
        # Extract with Claude
        return self.extractor.extract_from_html(
            html_content=cleaned_html,
            source_url=url
        )
    
    def scrape_model_pages(self, base_url: str, model_urls: list) -> list:
        """Scrape multiple model pages from a dealer site."""
        
        results = []
        
        for model_url in model_urls:
            full_url = urljoin(base_url, model_url)
            
            try:
                result = self.scrape_and_extract(full_url)
                result["source_url"] = full_url
                results.append(result)
            except Exception as e:
                results.append({
                    "success": False,
                    "source_url": full_url,
                    "error": str(e)
                })
        
        return results
    
    def _clean_html(self, html: str) -> str:
        """Aggressively clean HTML to reduce tokens."""
        
        soup = BeautifulSoup(html, 'html.parser')
        
        # Remove non-content elements
        for tag in ['script', 'style', 'nav', 'footer', 'header', 
                    'aside', 'iframe', 'noscript', 'svg', 'form']:
            for element in soup.find_all(tag):
                element.decompose()
        
        # Remove elements by common non-content class names
        remove_classes = [
            'menu', 'navigation', 'nav-', 'footer', 'header', 
            'sidebar', 'cookie', 'popup', 'modal', 'newsletter',
            'social', 'share', 'comment', 'advertisement', 'ad-'
        ]
        
        for element in soup.find_all(class_=lambda x: x and any(
            term in ' '.join(x).lower() for term in remove_classes
        )):
            element.decompose()
        
        # Remove empty elements
        for element in soup.find_all():
            if not element.get_text(strip=True) and not element.find_all('img'):
                element.decompose()
        
        # Extract main content area if identifiable
        main_content = (
            soup.find('main') or 
            soup.find(id='content') or
            soup.find(class_='content') or
            soup.find(role='main') or
            soup.body
        )
        
        if main_content:
            return str(main_content)
        
        return str(soup)
    
    def find_pdf_links(self, url: str) -> list:
        """Find PDF links on a page (price lists, brochures, etc.)."""
        
        response = self.client.get(url)
        soup = BeautifulSoup(response.text, 'html.parser')
        
        pdf_links = []
        
        for link in soup.find_all('a', href=True):
            href = link.get('href', '')
            
            if href.lower().endswith('.pdf'):
                full_url = urljoin(url, href)
                
                # Get link text for context
                link_text = link.get_text(strip=True) or link.get('title', '')
                
                pdf_links.append({
                    "url": full_url,
                    "text": link_text,
                    "filename": urlparse(full_url).path.split('/')[-1]
                })
        
        return pdf_links
```

---

## Usage Examples

### Basic Usage

```python
from src.api.claude_client import ClaudeCarExtractor
import os

# Initialize
extractor = ClaudeCarExtractor(
    api_key=os.environ["ANTHROPIC_API_KEY"],
    model="claude-sonnet-4-5-20250929"
)

# Extract from PDF
result = extractor.extract_from_pdf("prislista_mokka.pdf")
if result["success"]:
    car_data = result["data"]
    print(f"Found {len(car_data['models'])} models")
    
    # Token usage
    print(f"Input tokens: {result['usage']['input_tokens']}")
    print(f"Cached tokens: {result['usage']['cache_read_tokens']}")

# Extract from image
result = extractor.extract_from_image("price_sticker.jpg")

# Extract from HTML
html_content = "<html>...</html>"
result = extractor.extract_from_html(html_content, source_url="https://dealer.se/opel/mokka")
```

### Batch Processing (50% cheaper)

```python
from src.api.batch_processor import BatchCarExtractor

batch_extractor = BatchCarExtractor(api_key=os.environ["ANTHROPIC_API_KEY"])

# Prepare documents
documents = [
    {"id": "opel-mokka", "type": "pdf", "path": "mokka.pdf"},
    {"id": "suzuki-swift", "type": "pdf", "path": "swift.pdf"},
    {"id": "volvo-xc40", "type": "pdf", "path": "xc40.pdf"},
    # ... up to thousands of documents
]

# Process batch (returns within 24 hours, 50% cheaper)
results = batch_extractor.process_batch_sync(documents)

for result in results:
    if result["success"]:
        save_to_database(result["custom_id"], result["data"])
```

### Smart Preprocessing

```python
from src.processors.preprocessor import DocumentPreprocessor

preprocessor = DocumentPreprocessor()

# Intelligently decide text vs visual extraction
result = preprocessor.smart_pdf_extract("pricelist.pdf")

if result["method"] == "text":
    # Cheaper - use text content
    response = extractor.extract_from_html(result["content"])
else:
    # More expensive but necessary for complex layouts
    response = extractor.extract_from_pdf("pricelist.pdf")
```

---

## Cost Estimation

### Per-Document Costs (claude-sonnet-4-5)

| Document Type | Avg Input Tokens | Avg Output Tokens | Cost (Real-time) | Cost (Batch) |
|--------------|------------------|-------------------|------------------|--------------|
| PDF (5 pages) | ~15,000 | ~3,000 | ~$0.09 | ~$0.045 |
| Image (1 page) | ~2,000 | ~1,500 | ~$0.03 | ~$0.015 |
| HTML (cleaned) | ~5,000 | ~2,000 | ~$0.045 | ~$0.023 |

### With Prompt Caching

When processing multiple documents with the same schema (after first request):

| Document Type | Cached Tokens | Cache Savings | Total Cost |
|--------------|---------------|---------------|------------|
| PDF (5 pages) | ~1,500 | 90% on cached | ~$0.075 |
| + Batch API | - | +50% savings | ~$0.038 |

### Monthly Estimates

| Volume | Real-time API | Batch API | Batch + Caching |
|--------|--------------|-----------|-----------------|
| 100 docs/month | ~$9 | ~$4.50 | ~$3.80 |
| 1,000 docs/month | ~$90 | ~$45 | ~$38 |
| 10,000 docs/month | ~$900 | ~$450 | ~$380 |

---

## Error Handling & Validation

```python
from jsonschema import validate, ValidationError

CAR_SCHEMA = {
    "type": "object",
    "required": ["meta", "models"],
    "properties": {
        "meta": {
            "type": "object",
            "required": ["brand", "model"]
        },
        "models": {
            "type": "array",
            "minItems": 1
        }
    }
}

def validate_and_store(result: dict, document_id: str):
    """Validate extracted data and store."""
    
    if not result.get("success"):
        log_error(document_id, result.get("error"))
        return False
    
    try:
        validate(instance=result["data"], schema=CAR_SCHEMA)
    except ValidationError as e:
        log_error(document_id, f"Schema validation failed: {e.message}")
        return False
    
    # Store in database
    store_car_data(document_id, result["data"])
    return True
```

---

## Integration with Your CMS

```python
# Example: Payload CMS integration
import httpx

class PayloadCMSClient:
    def __init__(self, base_url: str, api_key: str):
        self.base_url = base_url
        self.client = httpx.Client(headers={"Authorization": f"Bearer {api_key}"})
    
    def upsert_car_model(self, car_data: dict):
        """Create or update car model in Payload CMS."""
        
        slug = car_data["meta"]["slug"]
        
        # Check if exists
        existing = self.client.get(
            f"{self.base_url}/api/cars",
            params={"where[slug][equals]": slug}
        ).json()
        
        if existing["docs"]:
            # Update
            car_id = existing["docs"][0]["id"]
            return self.client.patch(
                f"{self.base_url}/api/cars/{car_id}",
                json=car_data
            )
        else:
            # Create
            return self.client.post(
                f"{self.base_url}/api/cars",
                json=car_data
            )
```

---

## Best Practices Summary

1. **Use Batch API** for processing more than 10 documents (50% savings)
2. **Enable prompt caching** for repeated extractions (90% savings on cached tokens)
3. **Preprocess documents**: Clean HTML, compress images, extract text when possible
4. **Use claude-haiku-4-5** for simple, repetitive tasks
5. **Validate output** against your JSON schema before storing
6. **Handle errors gracefully** - retry with exponential backoff
7. **Monitor token usage** to optimize costs over time
8. **Extract only relevant pages** from multi-page PDFs

---

## Next Steps

1. Set up environment variables (`ANTHROPIC_API_KEY`)
2. Install dependencies: `pip install anthropic httpx beautifulsoup4 pillow pymupdf jsonschema`
3. Create your first extraction script
4. Set up batch processing for bulk imports
5. Integrate with your CMS/database
