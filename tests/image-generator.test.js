const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const { ImageGenerator } = require('../cli/image-generator');

test('ImageGenerator generates complete visual suite (Logo, Hero, Bento, Mobile)', () => {
  const tmpOut = path.resolve(__dirname, '../.asef-test-images');
  if (fs.existsSync(tmpOut)) fs.rmSync(tmpOut, { recursive: true, force: true });

  const generator = new ImageGenerator(__dirname, { outputDir: tmpOut });
  const result = generator.generateProjectVisualSuite('CloudShield', 'Autonomous cloud security posture monitor', {
    theme: 'dark-tech'
  });

  assert.equal(result.images.length, 4);
  assert.ok(fs.existsSync(path.join(tmpOut, 'brand-logo.svg')));
  assert.ok(fs.existsSync(path.join(tmpOut, 'hero-visual.svg')));
  assert.ok(fs.existsSync(path.join(tmpOut, 'feature-bento.svg')));
  assert.ok(fs.existsSync(path.join(tmpOut, 'mobile-screen-mockup.svg')));

  // Check SVG content
  const heroContent = fs.readFileSync(path.join(tmpOut, 'hero-visual.svg'), 'utf8');
  assert.ok(heroContent.includes('CloudShield'));
  assert.ok(heroContent.includes('<svg'));

  // Clean up
  fs.rmSync(tmpOut, { recursive: true, force: true });
});
