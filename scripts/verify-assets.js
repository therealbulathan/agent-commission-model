#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const projectRoot = process.cwd();
const htmlPath = path.join(projectRoot, 'index.html');
if (!fs.existsSync(htmlPath)) {
  console.error('✖ index.html not found at project root');
  process.exit(1);
}

const html = fs.readFileSync(htmlPath, 'utf8');
const figureMatches = Array.from(html.matchAll(/<figure>\s*<img[^>]*class="chart"[^>]*>/gi));
if (figureMatches.length !== 3) {
  console.error(`✖ Expected 3 chart <img> tags, found ${figureMatches.length}`);
  process.exit(1);
}

const PLACEHOLDER_SRC = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const expected = {
  'net per deal vs commission': {
    dataSrc: 'assets/net-per-deal.b64',
    width: '1832',
    height: '990',
  },
  'break even deals per month': {
    dataSrc: 'assets/break-even.b64',
    width: '1497',
    height: '1036',
  },
  'required commission to net 20%': {
    dataSrc: 'assets/required-commission.b64',
    width: '1517',
    height: '990',
  },
};

const attributeValue = (tag, name) => {
  const match = new RegExp(`${name}=["']([^"']+)["']`, 'i').exec(tag);
  return match ? match[1] : null;
};

const failures = [];
const seenAlts = new Set();

for (const match of figureMatches) {
  const tag = match[0];
  const alt = attributeValue(tag, 'alt');
  if (!alt) {
    failures.push('Missing alt attribute on chart image.');
    continue;
  }
  const normalizedAlt = alt.toLowerCase();
  if (seenAlts.has(normalizedAlt)) {
    failures.push(`Duplicate chart found for alt text "${alt}".`);
    continue;
  }
  seenAlts.add(normalizedAlt);
  const expectedConfig = expected[normalizedAlt];
  if (!expectedConfig) {
    failures.push(`Unexpected alt text "${alt}".`);
    continue;
  }

  const src = attributeValue(tag, 'src');
  if (!src) {
    failures.push(`Image with alt "${alt}" is missing src attribute.`);
  } else if (src !== PLACEHOLDER_SRC) {
    failures.push(`Image with alt "${alt}" should use the transparent GIF placeholder as src.`);
  }

  const dataSrcAttr = attributeValue(tag, 'data-chart-src');
  if (!dataSrcAttr) {
    failures.push(`Image with alt "${alt}" should provide data-chart-src attribute.`);
  } else {
    const normalizedDataSrc = dataSrcAttr.replace(/^\.\//, '');
    if (normalizedDataSrc !== expectedConfig.dataSrc) {
      failures.push(`Image with alt "${alt}" should reference ${expectedConfig.dataSrc} via data-chart-src but points to ${dataSrcAttr}.`);
    } else {
      const assetPath = path.join(projectRoot, normalizedDataSrc);
      if (!fs.existsSync(assetPath)) {
        failures.push(`Referenced base64 asset missing on disk: ${normalizedDataSrc}`);
      } else {
        const raw = fs.readFileSync(assetPath, 'utf8').replace(/\s+/g, '');
        if (!raw) {
          failures.push(`Base64 asset ${normalizedDataSrc} is empty.`);
        } else {
          let buffer;
          try {
            buffer = Buffer.from(raw, 'base64');
          } catch (error) {
            failures.push(`Base64 asset ${normalizedDataSrc} is not valid base64: ${error.message}`);
          }
          if (buffer && buffer.length < PNG_SIGNATURE.length) {
            failures.push(`Decoded asset ${normalizedDataSrc} is unexpectedly small.`);
          } else if (buffer && !buffer.slice(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
            failures.push(`Decoded asset ${normalizedDataSrc} does not appear to be a PNG.`);
          }
        }
      }
    }
  }

  const loading = attributeValue(tag, 'loading');
  if (loading !== 'lazy') {
    failures.push(`Image with alt "${alt}" should use loading="lazy".`);
  }

  const decoding = attributeValue(tag, 'decoding');
  if (!decoding) {
    failures.push(`Image with alt "${alt}" should set decoding="async".`);
  } else if (decoding.toLowerCase() !== 'async') {
    failures.push(`Image with alt "${alt}" should set decoding="async" (found "${decoding}").`);
  }

  const width = attributeValue(tag, 'width');
  if (width !== expectedConfig.width) {
    failures.push(`Image with alt "${alt}" should declare width="${expectedConfig.width}" (found "${width}").`);
  }

  const height = attributeValue(tag, 'height');
  if (height !== expectedConfig.height) {
    failures.push(`Image with alt "${alt}" should declare height="${expectedConfig.height}" (found "${height}").`);
  }
}

if (seenAlts.size !== Object.keys(expected).length) {
  const missing = Object.keys(expected).filter((alt) => !seenAlts.has(alt));
  if (missing.length) {
    failures.push(`Missing chart entries for: ${missing.join(', ')}`);
  }
}

if (failures.length) {
  console.error('✖ Chart asset verification failed:');
  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }
  process.exit(1);
}

console.log('✔ Chart assets verified successfully.');
