/**
 * Lifecycle Stages Configuration (ASEF Single Source of Truth)
 */

const STAGES = [
  {
    index: 0,
    id: '00_PROBLEM_INGESTION',
    name: 'Problem Statement Ingestion',
    agent: 'Orchestrator & Requirements Analyst',
    skill: 'evidence-based-stack-selection',
    template: 'contracts/problem_statement_template.md',
    targetArtifact: '00_problem_statement.md',
    description: 'Ingest raw problem statement, extract business bounds, user personas, and hard constraints.'
  },
  {
    index: 1,
    id: '01_REQUIREMENTS',
    name: 'Requirements Engineering',
    agent: 'Requirements Analyst',
    skill: 'evidence-based-stack-selection',
    template: 'contracts/feature_contract_template.md',
    targetArtifact: '01_requirements_spec.md',
    description: 'Deconstruct problem into functional requirements (REQ-001..N) and non-functional bounds with Gherkin acceptance criteria.'
  },
  {
    index: 2,
    id: '02_ARCHITECTURE',
    name: 'Evidence-Based Architecture & Stack Selection',
    agent: 'System Architect',
    skill: 'evidence-based-stack-selection',
    template: 'contracts/tech_decision_record_template.md',
    targetArtifact: '02_tech_decision_record.md',
    description: 'Evaluate candidate stacks against functional/NFR constraints, generate trade-off matrix and C4 architecture.'
  },
  {
    index: 3,
    id: '03_PLANNING',
    name: 'Work Breakdown & Dependency Planning',
    agent: 'Task Planner',
    skill: 'token-budget-optimization',
    template: 'contracts/implementation_plan_template.md',
    targetArtifact: '03_implementation_plan.md',
    description: 'Fracture architecture into sequenced milestones, atomic tasks (<=50 lines), and assumptions ledger.'
  },
  {
    index: 4,
    id: '04_IMPLEMENTATION',
    name: 'Surgical Implementation & TDD',
    agent: 'Senior Builder',
    skill: 'surgical-implementation-tdd',
    template: 'contracts/patch_contract_template.md',
    targetArtifact: '04_patch_contract.md',
    description: 'Implement atomic tasks via Red-Green-Refactor TDD cycle using minimal surgical diffs.'
  },
  {
    index: 5,
    id: '05_VERIFICATION',
    name: 'Automated Verification & Security Auditing',
    agent: 'Test Lead & Security Auditor',
    skill: 'verification-before-completion',
    template: 'contracts/test_evidence_report_template.md',
    targetArtifact: '05_verification_report.md',
    description: 'Enforce the Iron Law: fresh test evidence (Exit 0), SkillSpector security scan, and filesystem grounding.'
  },
  {
    index: 6,
    id: '06_DEPLOYMENT',
    name: 'Containerization & Infrastructure',
    agent: 'DevOps Engineer',
    skill: 'production-deployment-gate',
    template: null,
    targetArtifact: 'Dockerfile',
    description: 'Create multi-stage non-root Dockerfile, docker-compose, health check probes (/healthz), and CI/CD workflows.'
  },
  {
    index: 7,
    id: '07_RELEASE_GATE',
    name: 'Production Readiness Release Gate',
    agent: 'Release Manager & Orchestrator',
    skill: 'production-deployment-gate',
    template: 'contracts/release_manifest_template.md',
    targetArtifact: '07_release_manifest.md',
    description: 'Audit the 7 Iron-Clad Release Gates (Score 100/100 required) and produce signed release manifest.'
  }
];

module.exports = {
  STAGES
};
