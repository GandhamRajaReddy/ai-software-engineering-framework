#!/usr/bin/env node

/**
 * ASEF Executable CLI Entry Point
 */

const {
  printHelp,
  handleInit,
  handleEvaluateStack,
  handleVerify,
  handleScanSkill,
  handleDriftDetect,
  handleGateCheck,
  handlePipeline,
  handleSignManifest
} = require('../cli/index');

const args = process.argv.slice(2);
const command = args[0] ? args[0].toLowerCase() : 'help';

switch (command) {
  case 'pipeline':
  case 'orchestrate':
    handlePipeline(args.slice(1));
    break;

  case 'init':
    handleInit(args[1]);
    break;

  case 'evaluate-stack':
  case 'eval-stack':
    handleEvaluateStack(args.slice(1));
    break;

  case 'verify':
    handleVerify(args[1] || 'npm test');
    break;

  case 'scan-skill':
  case 'scan':
    handleScanSkill(args[1]);
    break;

  case 'drift-detect':
  case 'drift':
    handleDriftDetect(args[1]);
    break;

  case 'gate-check':
  case 'release-gate': {
    const gateRes = handleGateCheck(args[1] || '.');
    if (!gateRes || !gateRes.isProductionReady) {
      process.exit(1);
    }
    break;
  }

  case 'sign-manifest':
  case 'sign':
    handleSignManifest(args[1] || '07_release_manifest.md');
    break;

  case 'version':
  case '-v':
  case '--version':
    console.log('asef v1.0.0 (AI Software Engineering Framework)');
    break;

  case 'help':
  case '--help':
  case '-h':
  default:
    printHelp();
    break;
}
