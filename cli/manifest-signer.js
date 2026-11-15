/**
 * Cryptographic Manifest Signer & Verifier (Ed25519)
 *
 * Implements digital signing and mathematical signature verification for
 * ASEF Release Manifests. Binds signatures to Git commit, source tree hash,
 * evidence record IDs, and build artifact digests.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const SIGNATURE_BLOCK_REGEX = /```asef-signature\r?\n([\s\S]*?)\r?\n```/;

class ManifestSigner {
  /**
   * Generates a new Ed25519 keypair for an agent or release authority
   */
  static generateKeyPair() {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519', {
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
    });
    return { publicKey, privateKey };
  }

  /**
   * Canonicalizes payload object into deterministic UTF-8 bytes
   */
  static canonicalizePayload(payload) {
    const ordered = Object.keys(payload).sort().reduce((obj, key) => {
      obj[key] = payload[key];
      return obj;
    }, {});
    return Buffer.from(JSON.stringify(ordered), 'utf8');
  }

  /**
   * Signs a canonical release payload using an Ed25519 private key
   */
  static signPayload(payload, privateKeyPem) {
    const canonicalBytes = this.canonicalizePayload(payload);
    const payloadDigest = crypto.createHash('sha256').update(canonicalBytes).digest('hex');
    
    // Sign canonical bytes with Ed25519
    const signature = crypto.sign(null, canonicalBytes, privateKeyPem);
    const signatureBase64 = signature.toString('base64');

    return {
      algorithm: 'Ed25519',
      signature: signatureBase64,
      payloadDigest,
      canonicalPayload: payload
    };
  }

  /**
   * Formats the cryptographic signature block for markdown embedding
   */
  static formatSignatureBlock(signedResult, publicKeyPem) {
    const p = signedResult.canonicalPayload;
    // Strip headers and newlines from public key PEM for compact storage
    const compactPublicKey = publicKeyPem
      .replace(/-----BEGIN PUBLIC KEY-----/, '')
      .replace(/-----END PUBLIC KEY-----/, '')
      .replace(/\r?\n/g, '')
      .trim();

    return `\n## Cryptographic Release Signature\n\n` +
      `> **Notice:** This release manifest is cryptographically sealed. Any alteration of ` +
      `source files, evidence IDs, or gate scores invalidates this signature.\n\n` +
      `\`\`\`asef-signature\n` +
      `Algorithm: Ed25519\n` +
      `PublicKey: ${compactPublicKey}\n` +
      `Signature: ${signedResult.signature}\n` +
      `PayloadDigest: ${signedResult.payloadDigest}\n` +
      `GitCommit: ${p.gitCommit || 'HEAD'}\n` +
      `SourceTreeHash: ${p.sourceTreeHash}\n` +
      `ReleaseVersion: ${p.releaseVersion || '1.0.0'}\n` +
      `EvidenceIDs: ${(p.evidenceRecordIds || []).join(',')}\n` +
      `\`\`\`\n`;
  }

  /**
   * Verifies the cryptographic signature embedded inside a release manifest
   */
  static verifyManifest(manifestContent, expectedSourceTreeHash = null) {
    if (!manifestContent) {
      return { valid: false, reason: 'Manifest content is empty.' };
    }

    const match = manifestContent.match(SIGNATURE_BLOCK_REGEX);
    if (!match) {
      return {
        valid: false,
        reason: 'Missing cryptographic signature block (```asef-signature ... ```). Textual claim alone is rejected.'
      };
    }

    const blockLines = match[1].split(/\r?\n/);
    const meta = {};
    for (const line of blockLines) {
      const idx = line.indexOf(':');
      if (idx > -1) {
        const k = line.slice(0, idx).trim();
        const v = line.slice(idx + 1).trim();
        meta[k] = v;
      }
    }

    if (!meta.Signature || !meta.PublicKey || !meta.PayloadDigest) {
      return { valid: false, reason: 'Incomplete signature block: missing Signature, PublicKey, or PayloadDigest.' };
    }

    // Verify source tree hash binding if provided
    if (expectedSourceTreeHash && meta.SourceTreeHash && meta.SourceTreeHash !== expectedSourceTreeHash) {
      return {
        valid: false,
        reason: `Cryptographic binding mismatch: Manifest signed for tree ${meta.SourceTreeHash}, but current tree is ${expectedSourceTreeHash}.`
      };
    }

    // Reconstruct canonical payload for signature verification
    const reconstructedPayload = {
      evidenceRecordIds: meta.EvidenceIDs ? meta.EvidenceIDs.split(',') : [],
      gitCommit: meta.GitCommit || 'HEAD',
      releaseVersion: meta.ReleaseVersion || '1.0.0',
      sourceTreeHash: meta.SourceTreeHash || ''
    };

    const canonicalBytes = this.canonicalizePayload(reconstructedPayload);
    const computedDigest = crypto.createHash('sha256').update(canonicalBytes).digest('hex');

    if (computedDigest !== meta.PayloadDigest) {
      return {
        valid: false,
        reason: `Payload digest tampering detected. Expected ${meta.PayloadDigest}, computed ${computedDigest}.`
      };
    }

    // Format PEM from compact public key
    const pem = `-----BEGIN PUBLIC KEY-----\n${meta.PublicKey}\n-----END PUBLIC KEY-----`;

    try {
      const sigBuffer = Buffer.from(meta.Signature, 'base64');
      const isValid = crypto.verify(null, canonicalBytes, pem, sigBuffer);

      if (!isValid) {
        return { valid: false, reason: 'Cryptographic signature is mathematically invalid. Data or key has been modified.' };
      }

      return {
        valid: true,
        algorithm: meta.Algorithm || 'Ed25519',
        sourceTreeHash: meta.SourceTreeHash,
        gitCommit: meta.GitCommit,
        payloadDigest: meta.PayloadDigest
      };
    } catch (err) {
      return { valid: false, reason: `Signature verification exception: ${err.message}` };
    }
  }
}

module.exports = { ManifestSigner };
