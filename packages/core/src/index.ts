export {
  addDays,
  addYears,
  daysBetween,
  DEFAULT_TIMEZONE,
  isSameZonedDay,
  maxDate,
  startOfZonedDay,
  zonedDayKey,
} from './dates.js';

export {
  computeExpiresAt,
  DEFAULT_WARNING_INTERVALS,
  evaluateCompletion as evaluateExpirationForCompletion,
  evaluateExpiration,
  neverExpires,
  nextWarningDate,
  RENEWAL_PRESETS,
  type ExpirationBasis,
  type ExpirationEvaluation,
  type ExpirationPolicy,
  type ExpirationStatus,
} from './expiration.js';

export {
  AT_RISK_STATUSES,
  computeComplianceState,
  computeDueDate,
  countsTowardCompliance,
  diffRequirements,
  effectiveHazardExposures,
  isCompliant,
  NON_COMPLIANT_STATUSES,
  requirementApplies,
  requirementIsInForce,
  resolveRequirements,
  type ComplianceInput,
  type ComplianceResult,
  type ComplianceStatus,
  type EmployeeAttributes,
  type EmployeeStatus,
  type EmploymentType,
  type RequirementDiff,
  type RequirementRule,
  type RequirementScopeType,
  type TrainingAssignmentSummary,
  type TrainingRecordSummary,
} from './requirements.js';

export {
  buildTrainingMatrix,
  employeesAtRisk,
  filterMatrix,
  matrixToCsv,
  matrixToRows,
  rollup,
  statusLabel,
  summarise,
  worstStatus,
  type BuildMatrixInput,
  type ComplianceSummary,
  type MatrixCell,
  type MatrixCourse,
  type MatrixEmployee,
  type MatrixFilter,
  type MatrixRow,
  type RollupBucket,
  type RollupDimension,
  type TrainingMatrix,
} from './matrix.js';

export {
  applyLatePenalty,
  assessLateness,
  calculateCourseGrade,
  DEFAULT_LETTER_SCALE,
  diffGrade,
  letterFor,
  type CalculateCourseGradeOptions,
  type CategoryResult,
  type CourseGradeResult,
  type GradeCategory,
  type GradeChange,
  type GradeEntry,
  type LateAssessment,
  type LatePolicy,
  type LetterGradeBand,
} from './grading.js';

export {
  gradeAttempt,
  gradeResponse,
  type GradeAttemptOptions,
  type GradedAttempt,
  type GradedResponse,
  type QuestionInput,
  type QuestionOptionInput,
  type QuestionType,
  type ResponseInput,
} from './quiz.js';

export {
  checkRepresentation,
  disclaimerFor,
  findRestrictedClaims,
  TRAINING_TYPES,
  type AuthorizationEvidence,
  type RepresentationCheck,
  type TrainingType,
  type TrainingTypeDefinition,
} from './representation.js';

export {
  buildVerificationPayload,
  buildVerificationUrl,
  certificateIntegrityHash,
  classifyCertificate,
  formatCertificateNumber,
  generatePublicId,
  verificationPath,
  verifyCertificateIntegrity,
  type CertificateIntegrityFields,
  type CertificateNumberParts,
  type CertificateRecord,
  type CertificateStatus,
  type PublicVerificationPayload,
  type VerificationResult,
} from './certificates.js';

export {
  evaluateCompletion,
  type CompletionBlocker,
  type CompletionBlockerCode,
  type CompletionEvaluation,
  type CompletionRules,
  type CompletionSignals,
} from './completion.js';

export {
  isPracticalComplete,
  scorePracticalAssessment,
  type CriterionEntry,
  type CriterionResult,
  type PracticalCriterion,
  type PracticalScore,
  type PracticalTemplate,
  type SignoffState,
} from './practical.js';

export {
  assessRisk,
  DEFAULT_RISK_THRESHOLDS,
  DEFAULT_RISK_WEIGHTS,
  type RiskAssessment,
  type RiskFactor,
  type RiskLevel,
  type RiskSignals,
  type RiskThresholds,
  type RiskWeights,
} from './risk.js';
