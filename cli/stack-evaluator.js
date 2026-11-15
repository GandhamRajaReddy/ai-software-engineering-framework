/**
 * Evidence-Based Technology Selection Engine
 * Evaluates user-proposed stacks against functional and non-functional requirements.
 * Produces scored comparison matrices, trade-off analyses, and architectural justifications.
 */

const fs = require('fs');
const path = require('path');

const PRESET_STACKS = {
  'mern': {
    name: 'MERN Stack (MongoDB, Express, React SPA, Node.js)',
    frontend: 'React (Client-Side SPA)',
    backend: 'Express / Node.js (JavaScript/TypeScript)',
    database: 'MongoDB (NoSQL Document Store)',
    orm: 'Mongoose',
    deployment: 'Container / PaaS (Render, Heroku, Docker)',
    strengths: [
      'Rapid JSON document prototyping',
      'Unified JavaScript ecosystem frontend-to-backend',
      'Flexible polymorphic schema',
      'Large community and ubiquitous tutorials'
    ],
    weaknesses: [
      'Weak multi-entity ACID transactions across collections',
      'Client-side SPA hurts SEO and first contentful paint (FCP)',
      'Lack of compile-time type safety across network boundary without strict schemas',
      'MongoDB memory footprint increases under complex analytical aggregation'
    ],
    suitability: {
      acidTransactions: 3,     // Out of 10
      seoPerformance: 4,
      typeSafety: 5,
      highConcurrency: 6,
      devVelocity: 8,
      ecosystemMaturity: 9,
      dataRelationalIntegrity: 3
    },
    recommendedSkills: [
      'nodejs-backend-engineering',
      'database-engineering',
      'backend-security',
      'backend-testing',
      'api-design-principles',
      'frontend-design'
    ]
  },
  'modern-ts-fullstack': {
    name: 'Modern TypeScript Stack (Next.js / Remix, PostgreSQL, Drizzle/Prisma, Tailwind)',
    frontend: 'Next.js App Router (React Server Components, SSR/SSG)',
    backend: 'Next.js Server Actions / Route Handlers (Node/Edge Runtime)',
    database: 'PostgreSQL (Relational, ACID-compliant, JSONB support)',
    orm: 'Drizzle ORM / Prisma',
    deployment: 'Vercel / Docker Container / AWS ECS',
    strengths: [
      'Strict end-to-end TypeScript type safety from DB to UI',
      'Native Server-Side Rendering (SSR) & SEO optimization',
      'Robust relational data integrity with full ACID compliance',
      'Hybrid data model (Relational tables + JSONB for unstructured metadata)'
    ],
    weaknesses: [
      'Framework lock-in nuances with Next.js App Router caching',
      'Higher conceptual overhead (server vs client components)'
    ],
    suitability: {
      acidTransactions: 9,
      seoPerformance: 9,
      typeSafety: 9,
      highConcurrency: 8,
      devVelocity: 9,
      ecosystemMaturity: 9,
      dataRelationalIntegrity: 10
    },
    recommendedSkills: [
      'nodejs-backend-engineering',
      'database-engineering',
      'database-migrations',
      'backend-security',
      'backend-testing',
      'api-design-principles',
      'frontend-design',
      'brandkit'
    ]
  },
  'fastapi-postgres': {
    name: 'Python High-Performance Stack (FastAPI, PostgreSQL, Redis, React/Vite)',
    frontend: 'React / Svelte + Vite (SPA) or Next.js',
    backend: 'FastAPI (Python async I/O, Pydantic type validation)',
    database: 'PostgreSQL + pgvector (for AI/ML semantic search)',
    orm: 'SQLAlchemy 2.0 / Alembic',
    deployment: 'Docker / Kubernetes / AWS',
    strengths: [
      'Native integration with AI/ML libraries (PyTorch, LangChain, HuggingFace)',
      'Automatic OpenAPI 3.1 interactive Swagger docs',
      'High asynchronous I/O performance via Starlette & Uvicorn',
      'Strict runtime validation using Pydantic'
    ],
    weaknesses: [
      'Context switching between Python backend and JS/TS frontend',
      'GIL constraints on pure CPU-bound tasks (requires Celery/workers)'
    ],
    suitability: {
      acidTransactions: 9,
      seoPerformance: 7,
      typeSafety: 8,
      highConcurrency: 9,
      devVelocity: 8,
      ecosystemMaturity: 9,
      dataRelationalIntegrity: 9
    },
    recommendedSkills: [
      'fastapi-engineering',
      'database-engineering',
      'database-migrations',
      'caching-performance',
      'backend-security',
      'backend-testing',
      'async-background-processing',
      'backend-observability'
    ]
  },
  'django-drf': {
    name: 'Python Batteries-Included Stack (Django 5, DRF, PostgreSQL, Celery, Redis)',
    frontend: 'Django Templates / HTMX or React SPA',
    backend: 'Django & Django REST Framework (DRF)',
    database: 'PostgreSQL',
    orm: 'Django ORM',
    deployment: 'Docker / AWS ECS / Gunicorn + Nginx',
    strengths: [
      'Batteries-included admin dashboard, authentication, ORM, and migrations',
      'Mature ecosystem with high security defaults (CSRF, clickjacking, SQL injection)',
      'Asynchronous task processing via Celery and Redis',
      'High developer velocity for complex domain models'
    ],
    weaknesses: [
      'Monolithic framework overhead',
      'Synchronous ORM history requiring asgiref for async views'
    ],
    suitability: {
      acidTransactions: 10,
      seoPerformance: 8,
      typeSafety: 7,
      highConcurrency: 7,
      devVelocity: 9,
      ecosystemMaturity: 10,
      dataRelationalIntegrity: 10
    },
    recommendedSkills: [
      'django-drf-engineering',
      'database-engineering',
      'database-migrations',
      'caching-performance',
      'backend-security',
      'backend-testing',
      'async-background-processing',
      'backend-observability'
    ]
  },
  'go-microservice': {
    name: 'Go High-Throughput Stack (Go Gin/Chi, PostgreSQL, Redis, React/HTMX)',
    frontend: 'React SPA or HTMX / Tailwind',
    backend: 'Go (Gin / Chi / Fiber)',
    database: 'PostgreSQL',
    orm: 'pgx / SQLC / GORM',
    deployment: 'Minimal Distroless Docker image (<25MB), Kubernetes',
    strengths: [
      'Extremely low memory footprint (<20MB baseline)',
      'Sub-millisecond p99 latency & massive goroutine concurrency',
      'Single static binary distribution',
      'Compile-time safety and predictable runtime behavior'
    ],
    weaknesses: [
      'Lower developer velocity for initial CRUD prototyping',
      'Verbose error handling boilerplate',
      'Separate frontend build pipeline'
    ],
    suitability: {
      acidTransactions: 9,
      seoPerformance: 7,
      typeSafety: 9,
      highConcurrency: 10,
      devVelocity: 6,
      ecosystemMaturity: 8,
      dataRelationalIntegrity: 9
    },
    recommendedSkills: [
      'golang-backend-engineering',
      'microservices-engineering',
      'backend-architecture',
      'backend-security',
      'backend-testing',
      'backend-observability',
      'database-engineering'
    ]
  },
  'springboot-enterprise': {
    name: 'Java Enterprise Stack (Spring Boot 3, Spring Data JPA, PostgreSQL, Docker)',
    frontend: 'Angular / React or Thymeleaf',
    backend: 'Spring Boot 3 (Java 21 Virtual Threads, Spring MVC)',
    database: 'PostgreSQL / MySQL',
    orm: 'Hibernate / Spring Data JPA',
    deployment: 'Docker / Kubernetes / AWS EKS',
    strengths: [
      'Enterprise standard with battle-tested dependency injection and transactional management',
      'High throughput using Java 21 Virtual Threads (Project Loom)',
      'Rich observability via Micrometer, Actuator, and OpenTelemetry',
      'Comprehensive security integration via Spring Security'
    ],
    weaknesses: [
      'Higher memory consumption (JVM baseline ~250MB)',
      'Slower startup time compared to Go or Node.js without GraalVM Native Image'
    ],
    suitability: {
      acidTransactions: 10,
      seoPerformance: 7,
      typeSafety: 10,
      highConcurrency: 9,
      devVelocity: 7,
      ecosystemMaturity: 10,
      dataRelationalIntegrity: 10
    },
    recommendedSkills: [
      'springboot-engineering',
      'microservices-engineering',
      'backend-architecture',
      'backend-security',
      'backend-testing',
      'database-engineering',
      'database-migrations'
    ]
  }
};

/**
 * Evaluates candidate stacks against a project's requirements profile
 */
function evaluateStack(requirements, userProposedStackKey = 'mern') {
  const req = {
    needsAcid: requirements.needsAcid !== undefined ? requirements.needsAcid : true,
    needsSeo: requirements.needsSeo !== undefined ? requirements.needsSeo : true,
    needsStrictTypes: requirements.needsStrictTypes !== undefined ? requirements.needsStrictTypes : true,
    expectedRps: requirements.expectedRps || 1000,
    hasComplexRelations: requirements.hasComplexRelations !== undefined ? requirements.hasComplexRelations : true,
    teamSkills: requirements.teamSkills || ['javascript', 'typescript'],
    aiIntegration: requirements.aiIntegration || false
  };

  const scores = {};

  for (const [key, stack] of Object.entries(PRESET_STACKS)) {
    let score = 0;
    const notes = [];

    // 1. ACID & Data Integrity Weight (25%)
    if (req.needsAcid || req.hasComplexRelations) {
      const acidScore = stack.suitability.acidTransactions * 2.5;
      score += acidScore;
      if (stack.suitability.acidTransactions < 6) {
        notes.push('Warning: Lacks native relational multi-table ACID guarantees.');
      }
    } else {
      score += 20;
    }

    // 2. SEO & Initial Page Load (20%)
    if (req.needsSeo) {
      const seoScore = stack.suitability.seoPerformance * 2.0;
      score += seoScore;
      if (stack.suitability.seoPerformance < 6) {
        notes.push('Warning: Client-rendered SPA degrades SEO indexing and First Contentful Paint (FCP).');
      }
    } else {
      score += 15;
    }

    // 3. Type Safety (15%)
    if (req.needsStrictTypes) {
      score += stack.suitability.typeSafety * 1.5;
      if (stack.suitability.typeSafety < 7) {
        notes.push('Caution: Runtime typing increases bug surface area across API boundary.');
      }
    } else {
      score += 10;
    }

    // 4. Concurrency & Throughput (15%)
    if (req.expectedRps > 5000) {
      score += stack.suitability.highConcurrency * 1.5;
    } else {
      score += stack.suitability.highConcurrency * 1.0;
    }

    // 5. Developer Velocity & Ecosystem (15%)
    score += stack.suitability.devVelocity * 1.5;

    // 6. AI/ML Integration bonus (10%)
    if (req.aiIntegration && key === 'fastapi-postgres') {
      score += 10;
      notes.push('Advantage: Native Python AI ecosystem (NumPy, PyTorch, LangChain, Transformers).');
    }

    scores[key] = {
      score: Math.round(score),
      stack,
      notes
    };
  }

  // Sort candidate stacks by score
  const sorted = Object.entries(scores).sort((a, b) => b[1].score - a[1].score);
  const bestStackKey = sorted[0][0];
  const best = sorted[0][1];

  const clean = str => (str || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const targetClean = clean(userProposedStackKey);
  const matchedUserKey = Object.keys(PRESET_STACKS).find(k => {
    const kClean = clean(k);
    return kClean === targetClean || kClean.includes(targetClean) || targetClean.includes(kClean);
  }) || 'mern';
  const userEvaluation = scores[matchedUserKey];

  return {
    requirements: req,
    userProposedStack: userEvaluation,
    recommendedStack: best,
    isUserStackOptimal: matchedUserKey === bestStackKey,
    rankedStacks: sorted,
    decisionSummary: generateMarkdownReport(req, matchedUserKey, userEvaluation, bestStackKey, best, sorted)
  };
}

function generateMarkdownReport(req, userKey, userEval, bestKey, bestEval, ranked) {
  const isMatch = userKey === bestKey;
  let md = `# Architecture & Technology Selection Record\n\n`;
  md += `> **Evaluation Date:** ${new Date().toISOString().split('T')[0]}\n`;
  md += `> **Status:** ${isMatch ? 'APPROVED (User Stack Aligns with NFRs)' : 'OVERRIDDEN / OPTIMIZED (Alternative Stack Recommended)'}\n\n`;

  md += `## 1. Requirements Profile Evaluated\n\n`;
  md += `| Constraint / Metric | Specified Value | Architectural Significance |\n`;
  md += `|:--------------------|:----------------|:---------------------------|\n`;
  md += `| **ACID Integrity** | ${req.needsAcid ? 'Strict Required' : 'Eventual Allowed'} | Determines SQL vs NoSQL document storage |\n`;
  md += `| **SEO Requirements** | ${req.needsSeo ? 'Mandatory (Server-Side)' : 'Internal/Behind-Auth'} | Determines SSR/SSG vs Client-Side SPA |\n`;
  md += `| **Type Safety** | ${req.needsStrictTypes ? 'Strict End-to-End' : 'Permissive'} | Determines TypeScript/Go/Rust vs plain JS |\n`;
  md += `| **Target Throughput** | ${req.expectedRps} RPS | Determines async runtime & connection pooling |\n`;
  md += `| **Relational Complexity** | ${req.hasComplexRelations ? 'High (Multi-entity foreign keys)' : 'Flat'} | Foreign key constraints and joins |\n`;
  md += `| **AI/ML Capability** | ${req.aiIntegration ? 'Yes (Vector/Inference)' : 'No'} | Vector extensions, embeddings, Python toolchain |\n\n`;

  md += `## 2. User-Proposed Stack Analysis: \`${userEval.stack.name}\`\n\n`;
  md += `* **Initial Proposal Score:** **${userEval.score} / 100**\n`;
  md += `* **Identified Architectural Gaps / Trade-Offs:**\n`;
  if (userEval.notes.length === 0) {
    md += `  - No critical blockers detected. Stack satisfies project constraints.\n`;
  } else {
    for (const note of userEval.notes) {
      md += `  - ⚠️ ${note}\n`;
    }
  }

  md += `\n## 3. Evidence-Based Stack Ranking\n\n`;
  md += `| Rank | Architecture / Stack | Score | Key Rationale |\n`;
  md += `|:----:|:---------------------|:-----:|:--------------|\n`;
  ranked.forEach(([key, item], idx) => {
    const isRec = key === bestKey ? ' *(Recommended)*' : '';
    const isUser = key === userKey ? ' *(User Proposed)*' : '';
    md += `| #${idx + 1} | **${item.stack.name}**${isRec}${isUser} | **${item.score}/100** | ${item.stack.strengths[0]} |\n`;
  });

  md += `\n## 4. Final Architectural Recommendation\n\n`;
  if (isMatch) {
    md += `✅ **The user-proposed stack (${userEval.stack.name}) is fully validated.** It achieves the highest suitability score for the stated functional and non-functional requirements.\n`;
  } else {
    md += `🎯 **Recommended Stack: ${bestEval.stack.name}** (Score: ${bestEval.score} vs Proposed: ${userEval.score})\n\n`;
    md += `### Why this change is necessary for production readiness:\n`;
    for (const strength of bestEval.stack.strengths) {
      md += `* **${strength}**\n`;
    }
    md += `\n### Explicit Migration Strategy from Proposed Stack:\n`;
    md += `If the user explicitly requested \`${userEval.stack.name}\`, we retain common layers (e.g. React ecosystem and TypeScript) while upgrading the database layer to PostgreSQL and utilizing Server-Side Rendering to satisfy the non-functional performance and data integrity constraints.\n`;
  }

  return md;
}

module.exports = {
  PRESET_STACKS,
  evaluateStack
};
