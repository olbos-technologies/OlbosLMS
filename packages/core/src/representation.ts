/**
 * Training representation rules (§10).
 *
 * OLBOS must never imply an authorisation it does not hold. A course records
 * *what kind of training it is*, and the rules below decide what may be printed
 * on a certificate and shown in the catalogue.
 *
 * The product does not decide whether an organization is compliant with any
 * regulation; it records what the organization says it delivered.
 */

export type TrainingType =
  | 'ORGANIZATION_TRAINING'
  | 'COMPANY_POLICY_TRAINING'
  | 'SAFETY_AWARENESS_TRAINING'
  | 'REGULATORY_TRAINING'
  | 'THIRD_PARTY_TRAINING'
  | 'OSHA_OUTREACH_TRAINING'
  | 'CERTIFICATION'
  | 'CREDENTIAL';

export interface TrainingTypeDefinition {
  readonly type: TrainingType;
  readonly label: string;
  readonly description: string;
  /**
   * True when this type asserts an external authorisation. Such courses require
   * documented provider details before they may be published.
   */
  readonly requiresAuthorizationEvidence: boolean;
  /** Default disclaimer; organizations may extend but not remove it. */
  readonly defaultDisclaimer: string;
}

const SELF_ISSUED_DISCLAIMER =
  'This record documents training delivered by the issuing organization. ' +
  'It is not a government-issued credential and does not certify compliance ' +
  'with any law or regulation.';

export const TRAINING_TYPES: Readonly<Record<TrainingType, TrainingTypeDefinition>> = {
  ORGANIZATION_TRAINING: {
    type: 'ORGANIZATION_TRAINING',
    label: 'Organization Training',
    description: 'Training defined and delivered by the organization for its own purposes.',
    requiresAuthorizationEvidence: false,
    defaultDisclaimer: SELF_ISSUED_DISCLAIMER,
  },
  COMPANY_POLICY_TRAINING: {
    type: 'COMPANY_POLICY_TRAINING',
    label: 'Company Policy Training',
    description: 'Instruction on the organization’s own policies and procedures.',
    requiresAuthorizationEvidence: false,
    defaultDisclaimer: SELF_ISSUED_DISCLAIMER,
  },
  SAFETY_AWARENESS_TRAINING: {
    type: 'SAFETY_AWARENESS_TRAINING',
    label: 'Safety Awareness Training',
    description: 'Hazard-awareness instruction delivered by the organization.',
    requiresAuthorizationEvidence: false,
    defaultDisclaimer:
      'This is safety awareness training delivered by the issuing organization. ' +
      'It is not an OSHA course, is not OSHA-approved, and does not by itself ' +
      'satisfy any regulatory training requirement.',
  },
  REGULATORY_TRAINING: {
    type: 'REGULATORY_TRAINING',
    label: 'Regulatory Training',
    description:
      'Training the organization delivers in order to address a regulation it has identified. ' +
      'Any cited regulation is the organization’s own reference, not a determination by OLBOS.',
    requiresAuthorizationEvidence: false,
    defaultDisclaimer:
      'This training was delivered by the issuing organization in connection with the ' +
      'regulatory references it identified. It is not issued, approved or endorsed by any ' +
      'regulatory agency, and does not constitute a determination of regulatory compliance.',
  },
  THIRD_PARTY_TRAINING: {
    type: 'THIRD_PARTY_TRAINING',
    label: 'Third-Party Training',
    description: 'Training delivered by an external provider and recorded here.',
    requiresAuthorizationEvidence: true,
    defaultDisclaimer:
      'This record documents training delivered by the named third-party provider. ' +
      'The issuing organization records it for training-history purposes.',
  },
  OSHA_OUTREACH_TRAINING: {
    type: 'OSHA_OUTREACH_TRAINING',
    label: 'OSHA Outreach Training',
    description:
      'OSHA Outreach Training Program course delivered by an OSHA-authorized trainer. ' +
      'Requires the trainer’s authorization details before it may be published.',
    requiresAuthorizationEvidence: true,
    defaultDisclaimer:
      'OSHA Outreach Training Program course. Department of Labor course completion cards ' +
      'are issued by the authorized trainer’s OSHA Training Institute Education Center, ' +
      'not by OLBOS. This record is not a Department of Labor card.',
  },
  CERTIFICATION: {
    type: 'CERTIFICATION',
    label: 'Certification',
    description: 'A certification issued under a named certifying body’s scheme.',
    requiresAuthorizationEvidence: true,
    defaultDisclaimer:
      'This certification is issued under the scheme of the named certifying body. ' +
      'OLBOS records and verifies the issuance; it is not the certifying body.',
  },
  CREDENTIAL: {
    type: 'CREDENTIAL',
    label: 'Credential',
    description: 'A digital credential issued by the organization or a partner.',
    requiresAuthorizationEvidence: true,
    defaultDisclaimer:
      'This credential is issued by the named issuer. OLBOS records and verifies the ' +
      'issuance on the issuer’s behalf.',
  },
};

export interface AuthorizationEvidence {
  /** Legal name of the authorised provider, trainer or certifying body. */
  readonly providerName?: string | null;
  /** The provider's authorisation/accreditation identifier. */
  readonly authorizationId?: string | null;
  readonly authorizationExpiresAt?: Date | null;
}

export interface RepresentationCheck {
  readonly ok: boolean;
  readonly problems: string[];
  readonly disclaimer: string;
}

/**
 * Phrases that assert an authorisation OLBOS cannot grant. They are rejected in
 * free-text course titles and certificate text unless the course type carries
 * documented authorisation evidence.
 */
const RESTRICTED_CLAIMS: readonly { pattern: RegExp; message: string }[] = [
  {
    pattern: /\bosha[-\s]?(approved|certified|accredited|endorsed)\b/i,
    message: 'OSHA does not approve, certify or accredit courses or providers.',
  },
  {
    pattern: /\bosha[-\s]?authorized\b/i,
    message:
      'Only an individual trainer can be OSHA-authorized. Record the trainer’s authorization ' +
      'details on an OSHA Outreach course instead of asserting it in free text.',
  },
  {
    pattern: /\b(government|federally|state)[-\s]?(approved|certified|mandated)\b/i,
    message: 'A government approval claim requires documented evidence.',
  },
  {
    pattern: /\bguarantee[sd]?\s+compliance\b/i,
    message: 'Training cannot be represented as guaranteeing regulatory compliance.',
  },
];

/** Flags restricted authorisation claims in free text. */
export const findRestrictedClaims = (text: string): string[] =>
  RESTRICTED_CLAIMS.filter((rule) => rule.pattern.test(text)).map((rule) => rule.message);

/**
 * Checks that a course version may be published under the representation it
 * claims, and returns the disclaimer that must be shown with it.
 */
export const checkRepresentation = (input: {
  readonly trainingType: TrainingType;
  readonly title?: string;
  readonly description?: string | null;
  readonly evidence?: AuthorizationEvidence | null;
  readonly organizationDisclaimer?: string | null;
  readonly now?: Date;
}): RepresentationCheck => {
  const definition = TRAINING_TYPES[input.trainingType];
  const problems: string[] = [];

  for (const text of [input.title, input.description]) {
    if (!text) continue;
    problems.push(...findRestrictedClaims(text));
  }

  if (definition.requiresAuthorizationEvidence) {
    const evidence = input.evidence;
    if (!evidence?.providerName) {
      problems.push(
        `${definition.label} requires the name of the authorised provider, trainer or certifying body.`,
      );
    }
    if (!evidence?.authorizationId) {
      problems.push(`${definition.label} requires the provider's authorization identifier.`);
    }
    const now = input.now ?? new Date();
    if (evidence?.authorizationExpiresAt && evidence.authorizationExpiresAt < now) {
      problems.push(
        `The recorded authorization expired on ${evidence.authorizationExpiresAt
          .toISOString()
          .slice(0, 10)}; it must be renewed before publishing.`,
      );
    }
  }

  const disclaimer = [definition.defaultDisclaimer, input.organizationDisclaimer?.trim()]
    .filter((part): part is string => !!part && part.length > 0)
    .join(' ');

  return { ok: problems.length === 0, problems: [...new Set(problems)], disclaimer };
};

export const disclaimerFor = (
  trainingType: TrainingType,
  organizationDisclaimer?: string | null,
): string => checkRepresentation({ trainingType, organizationDisclaimer }).disclaimer;
