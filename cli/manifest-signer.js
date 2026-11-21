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

// Known trusted root release authority public keys
const TRUSTED_RELEASE_KEYS = new Set([
  'MCowBQYDK2VwAyEAAiTO/3UCMcvPG544UUOS3X6tRFIWXKuVLTiab4bxG2k=',
  'MCowBQYDK2VwAyEA0jB6GeJotZm7zYBkmzm/ALrgzkNtmk98BTOHMVXzsEg='
]);

class ManifestSigner {
  /**
   * Helper to strip PEM headers and whitespace to get compact key
   */
  static compactKey(pemOrCompact) {
    if (!pemOrCompact) return '';
    return pemOrCompact
      .replace(/-----[A-Z ]+-----/g, '')
      .replace(/\r?\n/g, '')
      .trim();
  }

  /**
   * Registers a trusted release authority public key
   */
  static registerTrustedKey(publicKeyPemOrCompact) {
    const compact = this.compactKey(publicKeyPemOrCompact);
    TRUSTED_RELEASE_KEYS.add(compact);
  }

  /**
   * Returns list of configured trusted release authority keys
   */
  static getTrustedKeys() {
    return Array.from(TRUSTED_RELEASE_KEYS);
  }

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

  static extractBody(content) {
    if (!content) return '';
    return content
      .replace(/## Cryptographic Release Signature[\s\S]*$/, '')
      .replace(/```asef-signature[\s\S]*?```/, '')
      .trim();
  }

  /**
   * Signs a canonical release payload using an Ed25519 private key.
   * Cryptographically binds metadata AND complete content body digest when provided.
   */
  static signPayload(payload, privateKeyPem, contentBody = null) {
    let contentDigest = null;
    const canonicalPayloadWithDigest = { ...payload };

    if (contentBody) {
      const bodyClean = this.extractBody(contentBody);
      contentDigest = crypto.createHash('sha256').update(bodyClean, 'utf8').digest('hex');
      canonicalPayloadWithDigest.contentDigest = contentDigest;
    }

    const canonicalBytes = this.canonicalizePayload(canonicalPayloadWithDigest);
    const payloadDigest = crypto.createHash('sha256').update(canonicalBytes).digest('hex');
    
    // Sign canonical bytes with Ed25519
    const signature = crypto.sign(null, canonicalBytes, privateKeyPem);
    const signatureBase64 = signature.toString('base64');

    return {
      algorithm: 'Ed25519',
      signature: signatureBase64,
      payloadDigest,
      contentDigest,
      canonicalPayload: canonicalPayloadWithDigest
    };
  }

  /**
   * Formats the cryptographic signature block for markdown embedding
   */
  static formatSignatureBlock(signedResult, publicKeyPem) {
    const p = signedResult.canonicalPayload;
    // Strip headers and newlines from public key PEM for compact storage
    const compactPublicKey = this.compactKey(publicKeyPem);

    const contentDigestLine = signedResult.contentDigest ? `ContentDigest: ${signedResult.contentDigest}\n` : '';

    return `\n## Cryptographic Release Signature\n\n` +
      `> **Notice:** This release manifest is cryptographically sealed. Any alteration of ` +
      `source files, evidence IDs, or gate scores invalidates this signature.\n\n` +
      `\`\`\`asef-signature\n` +
      `Algorithm: Ed25519\n` +
      `PublicKey: ${compactPublicKey}\n` +
      `Signature: ${signedResult.signature}\n` +
      `PayloadDigest: ${signedResult.payloadDigest}\n` +
      contentDigestLine +
      `GitCommit: ${p.gitCommit || 'HEAD'}\n` +
      `SourceTreeHash: ${p.sourceTreeHash}\n` +
      `ReleaseVersion: ${p.releaseVersion || '1.0.0'}\n` +
      `EvidenceIDs: ${(p.evidenceRecordIds || []).join(',')}\n` +
      `\`\`\`\n`;
  }

  /**
   * Verifies the cryptographic signature embedded inside a release manifest,
   * validating the signature math, signer authority, and content integrity.
   */
  static verifyManifest(manifestContent, expectedSourceTreeHash = null, options = {}) {
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

    // Authenticate signer identity against trusted root keyring (fail-closed)
    let trustedKeySet;
    if (options.trustedKeys && Array.isArray(options.trustedKeys)) {
      trustedKeySet = new Set(options.trustedKeys.map(k => ManifestSigner.compactKey(k)));
    } else if (process.env.ASEF_TRUSTED_KEYS) {
      trustedKeySet = new Set(process.env.ASEF_TRUSTED_KEYS.split(',').map(k => ManifestSigner.compactKey(k.trim())));
    } else {
      trustedKeySet = TRUSTED_RELEASE_KEYS;
    }

    if (!trustedKeySet.has(meta.PublicKey)) {
      return {
        valid: false,
        reason: `Untrusted signer identity: Public key '${meta.PublicKey.slice(0, 16)}...' is not in the trusted release authority keyring.`
      };
    }

    // Verify source tree hash binding if provided
    if (expectedSourceTreeHash && meta.SourceTreeHash && meta.SourceTreeHash !== expectedSourceTreeHash) {
      return {
        valid: false,
        reason: `Cryptographic binding mismatch: Manifest signed for tree ${meta.SourceTreeHash}, but current tree is ${expectedSourceTreeHash}.`
      };
    }

    // Verify complete manifest body content digest if present
    if (meta.ContentDigest) {
      const bodyClean = this.extractBody(manifestContent);
      const currentContentDigest = crypto.createHash('sha256').update(bodyClean, 'utf8').digest('hex');
      if (meta.ContentDigest !== currentContentDigest) {
        return {
          valid: false,
          reason: `Manifest content tampering detected. Document body has been modified after signature creation.`
        };
      }
    }

    // Reconstruct canonical payload for signature verification
    const reconstructedPayload = {
      evidenceRecordIds: meta.EvidenceIDs ? meta.EvidenceIDs.split(',') : [],
      gitCommit: meta.GitCommit || 'HEAD',
      releaseVersion: meta.ReleaseVersion || '1.0.0',
      sourceTreeHash: meta.SourceTreeHash || ''
    };
    if (meta.ContentDigest) {
      reconstructedPayload.contentDigest = meta.ContentDigest;
    }

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
        publicKey: meta.PublicKey,
        payloadDigest: meta.PayloadDigest
      };
    } catch (err) {
      return { valid: false, reason: `Signature verification exception: ${err.message}` };
    }
  }
}

module.exports = { ManifestSigner };
