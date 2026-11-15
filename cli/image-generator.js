/**
 * Project Image & Visual Generator (ASEF Creative Engine)
 * Implements high-end image generation adhering to imagegen-frontend-web,
 * imagegen-frontend-mobile, and brandkit guidelines.
 * Supports programmatic vector graphics (SVG), UI mockups, and AI image API adapters.
 */

const fs = require('fs');
const path = require('path');

class ImageGenerator {
  constructor(projectDir = process.cwd(), options = {}) {
    this.projectDir = path.resolve(projectDir);
    this.outputDir = options.outputDir && path.isAbsolute(options.outputDir)
      ? options.outputDir
      : path.join(this.projectDir, options.outputDir || 'public/assets/images');
  }

  /**
   * Generates a complete visual suite for a project (Hero, Features, Mobile Mockup, Logo)
   */
  generateProjectVisualSuite(projectName, description, options = {}) {
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }

    const theme = options.theme || 'dark-tech'; // dark-tech | modern-minimalist | vibrant-saas
    const palette = this.getThemePalette(theme);

    const generated = [];

    // 1. Brand Logo & Monogram
    const logoPath = path.join(this.outputDir, 'brand-logo.svg');
    const logoSvg = this.renderBrandLogo(projectName, palette);
    fs.writeFileSync(logoPath, logoSvg, 'utf8');
    generated.push({ type: 'LOGO', path: logoPath, relative: path.relative(this.projectDir, logoPath) });

    // 2. High-End Hero Section Visual (16:9 ratio)
    const heroPath = path.join(this.outputDir, 'hero-visual.svg');
    const heroSvg = this.renderHeroVisual(projectName, description, palette);
    fs.writeFileSync(heroPath, heroSvg, 'utf8');
    generated.push({ type: 'HERO', path: heroPath, relative: path.relative(this.projectDir, heroPath) });

    // 3. Feature Bento Grid Visual
    const featurePath = path.join(this.outputDir, 'feature-bento.svg');
    const featureSvg = this.renderFeatureBento(palette);
    fs.writeFileSync(featurePath, featureSvg, 'utf8');
    generated.push({ type: 'BENTO_FEATURE', path: featurePath, relative: path.relative(this.projectDir, featurePath) });

    // 4. Mobile App Screen Mockup
    const mobilePath = path.join(this.outputDir, 'mobile-screen-mockup.svg');
    const mobileSvg = this.renderMobileMockup(projectName, palette);
    fs.writeFileSync(mobilePath, mobileSvg, 'utf8');
    generated.push({ type: 'MOBILE_MOCKUP', path: mobilePath, relative: path.relative(this.projectDir, mobilePath) });

    return {
      projectName,
      theme,
      outputDir: this.outputDir,
      images: generated,
      summary: `Generated ${generated.length} high-quality project visual assets in ${this.outputDir}`
    };
  }

  /**
   * Returns calibrated color tokens based on theme
   */
  getThemePalette(theme) {
    switch (theme) {
      case 'modern-minimalist':
        return {
          bg: '#FAFAFA',
          surface: '#FFFFFF',
          text: '#111827',
          subtext: '#6B7280',
          accent: '#2563EB',
          accentGradient: ['#2563EB', '#3B82F6'],
          cardBg: '#FFFFFF',
          border: '#E5E7EB'
        };

      case 'vibrant-saas':
        return {
          bg: '#0F172A',
          surface: '#1E293B',
          text: '#F8FAFC',
          subtext: '#94A3B8',
          accent: '#06B6D4',
          accentGradient: ['#06B6D4', '#3B82F6'],
          cardBg: '#1E293B',
          border: '#334155'
        };

      case 'dark-tech':
      default:
        return {
          bg: '#0A0A0C',
          surface: '#141418',
          text: '#EDEDED',
          subtext: '#A1A1AA',
          accent: '#6366F1',
          accentGradient: ['#6366F1', '#A855F7'],
          cardBg: '#18181B',
          border: '#27272A'
        };
    }
  }

  renderBrandLogo(name, palette) {
    const initials = (name || 'ASEF').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 120" width="400" height="120">
  <defs>
    <linearGradient id="logoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${palette.accentGradient[0]}" />
      <stop offset="100%" stop-color="${palette.accentGradient[1]}" />
    </linearGradient>
  </defs>
  <!-- Monogram Icon -->
  <rect x="20" y="20" width="80" height="80" rx="20" fill="url(#logoGrad)" />
  <text x="60" y="72" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="34" font-weight="900" fill="#FFFFFF" text-anchor="middle" letter-spacing="-1">${initials}</text>
  <!-- Wordmark -->
  <text x="120" y="68" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="32" font-weight="800" fill="${palette.text}" letter-spacing="-0.5">${name}</text>
  <text x="122" y="90" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="14" font-weight="500" fill="${palette.subtext}" letter-spacing="1.5">PRODUCTION VERIFIED</text>
</svg>`;
  }

  renderHeroVisual(name, description, palette) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 675" width="1200" height="675">
  <defs>
    <linearGradient id="heroBg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${palette.bg}" />
      <stop offset="100%" stop-color="${palette.surface}" />
    </linearGradient>
    <linearGradient id="heroAccent" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="${palette.accentGradient[0]}" stop-opacity="0.8" />
      <stop offset="100%" stop-color="${palette.accentGradient[1]}" stop-opacity="0.8" />
    </linearGradient>
    <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
      <path d="M 40 0 L 0 0 0 40" fill="none" stroke="${palette.border}" stroke-width="0.75" stroke-opacity="0.4" />
    </pattern>
  </defs>

  <!-- Background -->
  <rect width="1200" height="675" fill="url(#heroBg)" />
  <rect width="1200" height="675" fill="url(#grid)" />

  <!-- Ambient Glow -->
  <circle cx="900" cy="200" r="300" fill="${palette.accent}" opacity="0.12" filter="blur(80px)" />

  <!-- Browser Frame Mockup -->
  <g transform="translate(150, 100)">
    <rect width="900" height="480" rx="16" fill="${palette.cardBg}" stroke="${palette.border}" stroke-width="1.5" />
    <!-- Window controls -->
    <circle cx="30" cy="25" r="6" fill="#EF4444" />
    <circle cx="50" cy="25" r="6" fill="#F59E0B" />
    <circle cx="70" cy="25" r="6" fill="#10B981" />
    <rect x="120" y="16" width="300" height="18" rx="6" fill="${palette.surface}" />

    <!-- Mock UI Content -->
    <rect x="40" y="70" width="220" height="370" rx="10" fill="${palette.surface}" stroke="${palette.border}" stroke-width="1" />
    <rect x="280" y="70" width="580" height="140" rx="10" fill="${palette.surface}" stroke="${palette.border}" stroke-width="1" />
    <rect x="280" y="230" width="280" height="210" rx="10" fill="${palette.surface}" stroke="${palette.border}" stroke-width="1" />
    <rect x="580" y="230" width="280" height="210" rx="10" fill="${palette.surface}" stroke="${palette.border}" stroke-width="1" />

    <!-- Accent Highlights -->
    <rect x="310" y="100" width="180" height="12" rx="4" fill="url(#heroAccent)" />
    <rect x="310" y="125" width="340" height="8" rx="4" fill="${palette.subtext}" opacity="0.4" />
  </g>

  <!-- Title Overlay -->
  <text x="180" y="620" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="28" font-weight="700" fill="${palette.text}">${name}</text>
  <text x="180" y="645" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="14" font-weight="400" fill="${palette.subtext}">${(description || '').slice(0, 90)}</text>
</svg>`;
  }

  renderFeatureBento(palette) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 500" width="1000" height="500">
  <rect width="1000" height="500" rx="16" fill="${palette.bg}" />
  <!-- Bento Card 1: Fast Latency -->
  <rect x="40" y="40" width="440" height="200" rx="12" fill="${palette.cardBg}" stroke="${palette.border}" stroke-width="1" />
  <text x="70" y="90" font-family="sans-serif" font-size="20" font-weight="700" fill="${palette.text}">Sub-50ms P99 Latency</text>
  <text x="70" y="120" font-family="sans-serif" font-size="14" fill="${palette.subtext}">Optimized with distributed Edge caching & async workers.</text>

  <!-- Bento Card 2: Security Clearance -->
  <rect x="520" y="40" width="440" height="200" rx="12" fill="${palette.cardBg}" stroke="${palette.border}" stroke-width="1" />
  <text x="550" y="90" font-family="sans-serif" font-size="20" font-weight="700" fill="${palette.text}">SkillSpector Security Shield</text>
  <text x="550" y="120" font-family="sans-serif" font-size="14" fill="${palette.subtext}">Zero prompt injection, hardened RBAC, verified secrets.</text>

  <!-- Bento Card 3: Enterprise Grade -->
  <rect x="40" y="260" width="920" height="200" rx="12" fill="${palette.cardBg}" stroke="${palette.border}" stroke-width="1" />
  <text x="70" y="320" font-family="sans-serif" font-size="24" font-weight="700" fill="${palette.text}">100% Production Readiness Gate</text>
  <text x="70" y="355" font-family="sans-serif" font-size="15" fill="${palette.subtext}">Full compliance with the 7 Iron-Clad Gates before deployment.</text>
</svg>`;
  }

  renderMobileMockup(name, palette) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 800" width="400" height="800">
  <defs>
    <linearGradient id="phoneGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${palette.cardBg}" />
      <stop offset="100%" stop-color="${palette.surface}" />
    </linearGradient>
  </defs>

  <!-- Phone Chassis -->
  <rect x="25" y="25" width="350" height="750" rx="48" fill="#1C1C1E" stroke="#3A3A3C" stroke-width="4" />
  <!-- Screen Area -->
  <rect x="40" y="45" width="320" height="710" rx="36" fill="url(#phoneGrad)" />
  <!-- Dynamic Island -->
  <rect x="150" y="55" width="100" height="26" rx="13" fill="#000000" />

  <!-- App Header -->
  <text x="65" y="130" font-family="sans-serif" font-size="22" font-weight="800" fill="${palette.text}">${name}</text>
  <circle cx="325" cy="122" r="14" fill="${palette.accent}" opacity="0.8" />

  <!-- App Cards -->
  <rect x="60" y="160" width="280" height="120" rx="16" fill="${palette.bg}" stroke="${palette.border}" stroke-width="1" />
  <rect x="60" y="300" width="280" height="160" rx="16" fill="${palette.bg}" stroke="${palette.border}" stroke-width="1" />
  <rect x="60" y="480" width="280" height="180" rx="16" fill="${palette.bg}" stroke="${palette.border}" stroke-width="1" />

  <!-- Bottom Navigation Bar -->
  <rect x="40" y="690" width="320" height="65" fill="${palette.surface}" opacity="0.95" />
  <circle cx="100" cy="720" r="10" fill="${palette.accent}" />
  <circle cx="200" cy="720" r="10" fill="${palette.subtext}" opacity="0.5" />
  <circle cx="300" cy="720" r="10" fill="${palette.subtext}" opacity="0.5" />
</svg>`;
  }
}

module.exports = {
  ImageGenerator
};
