export const academySources = [
  'https://docs.aws.amazon.com/aws-certification/latest/solutions-architect-associate-03/solutions-architect-associate-03.html',
  'https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html',
  'https://aws.amazon.com/compliance/shared-responsibility-model/',
  'https://docs.aws.amazon.com/organizations/latest/userguide/orgs_manage_policies_scps.html',
  'https://docs.aws.amazon.com/global-infrastructure/latest/regions/aws-regions-availability-zones.html',
];

export const academyMetadata = {
  certificationId: 'aws-solutions-architect-associate',
  examVersion: 'SAA-C03',
  contentVersion: 1,
  sourceVerifiedAt: '2026-10-30',
  sources: academySources,
  scope: 'Week 1 foundation; weeks 2–12 are not yet available',
  readinessTarget: 85,
  domains: [
    { id: '1', title: 'Design Secure Architectures', weight: 30 },
    { id: '2', title: 'Design Resilient Architectures', weight: 26 },
    { id: '3', title: 'Design High-Performing Architectures', weight: 24 },
    { id: '4', title: 'Design Cost-Optimized Architectures', weight: 20 },
  ],
  disclaimer:
    'Independent Olbos practice material. Not an official AWS exam. Practice percentages are not AWS scaled scores and do not guarantee a passing result.',
};

export const weekOneLessons = [
  {
    title: 'Cloud computing fundamentals',
    objectiveId: '1.1',
    objectives: ['Distinguish elasticity from availability', 'Explain operational responsibility'],
    concept:
      'Cloud resources are acquired through service APIs rather than by waiting for physical hardware. Elasticity changes capacity with demand; availability concerns whether a service remains usable. Neither follows automatically from moving an application to a cloud provider.',
    example:
      'A seasonal application can increase compute capacity during a sale and release it afterward. A single instance can still fail: elastic capacity and fault tolerance address different requirements.',
    comparison:
      'Infrastructure services expose more operating-system control and responsibility. Managed services move some operations to the provider while leaving data, identity and configuration decisions with the customer.',
    misconception: 'Cloud hosting alone does not make an application secure or highly available.',
    exercise:
      'For a web store, list three workload responsibilities the customer retains. Identify one demand change and one failure that the architecture must handle.',
    check:
      'Does adding capacity protect against a single point of failure? Explain which failure boundaries you must also address.',
  },
  {
    title: 'AWS global infrastructure',
    objectiveId: '2.2',
    objectives: [
      'Separate Region, Availability Zone and edge roles',
      'Identify failure boundaries',
    ],
    concept:
      'An AWS Region is a geographic area containing multiple Availability Zones. An Availability Zone is an isolated location within a Region, consisting of one or more data centers. Edge locations bring supported content and network services closer to users; they do not replace the regional deployment of your application.',
    example:
      'Place redundant application components in separate Availability Zones to reduce exposure to a single-zone failure. A design that must survive a regional outage needs additional regional planning.',
    comparison:
      'Multi-AZ design addresses zonal failures. Multi-Region design addresses a broader failure scope but adds replication, routing and operational complexity.',
    misconception:
      'Two instances in the same Availability Zone are not independent of that zone’s failure.',
    exercise:
      'Draw Region → two Availability Zones → one application instance per zone. Mark which component is still shared.',
    check: 'Which deployment boundary should change to tolerate loss of one Availability Zone?',
  },
  {
    title: 'Regions and Availability Zones',
    objectiveId: '2.2',
    objectives: [
      'Choose a Region from workload requirements',
      'Reason about locality and resilience',
    ],
    concept:
      'Choose a Region using data-location requirements, user latency, required service availability and cost. Do not assume a service or feature exists in every Region. Distribute redundant components across Availability Zones when the workload requires zonal resilience.',
    example:
      'A workload with a contractual data-location requirement must first select a permitted Region. Performance and cost comparisons then happen within the set of allowed locations.',
    comparison:
      'An Availability Zone is inside a Region; it is not a substitute for a second Region. Regional disaster recovery also requires a data replication and recovery strategy.',
    misconception:
      'Picking the nearest Region is not sufficient if data-location or service requirements rule it out.',
    exercise:
      'Write a decision table for data location, latency, service availability and price before choosing a deployment Region.',
    check: 'Why can the cheapest Region be unsuitable for an application?',
  },
  {
    title: 'Shared responsibility model',
    objectiveId: '1.1',
    objectives: [
      'Allocate infrastructure and workload duties',
      'Compare EC2 with managed services',
    ],
    concept:
      'Responsibility changes with the selected service. AWS operates underlying facilities and cloud infrastructure. For an EC2 instance, the customer maintains the guest operating system, application and relevant network access configuration. Managed services reduce some infrastructure tasks without removing customer responsibility for data and authorization.',
    example:
      'Moving a database from an EC2 virtual machine to a managed database changes who maintains parts of the platform. It does not decide who may read your records or which data you should retain.',
    comparison:
      'A provider controls physical infrastructure; a customer configures workload identities and access. Document responsibility per service rather than applying an EC2 checklist to every service.',
    misconception: 'A managed service does not remove the need to configure access securely.',
    exercise:
      'Create two columns for an EC2 application: provider infrastructure and customer workload operations. Place OS patching, physical access, application code and IAM policy in the appropriate column.',
    check: 'Who patches an EC2 guest operating system?',
  },
  {
    title: 'IAM users, groups, roles and policies',
    objectiveId: '1.1',
    objectives: ['Select roles for workloads', 'Distinguish identity and permission'],
    concept:
      'An identity identifies a caller; a policy defines permitted or denied actions under conditions. IAM groups organize permissions for IAM users. A role is assumed to obtain temporary session credentials. Prefer federated access for people and role credentials for workloads rather than distributing permanent keys.',
    example:
      'An application on EC2 reads one S3 bucket by using an attached role. The application obtains temporary credentials through its execution environment instead of embedding a user access key in code.',
    comparison:
      'A role trust policy controls who may assume the role. Permissions policies control what that assumed session may do. A trust relationship by itself does not grant access to all resources.',
    misconception: 'An IAM group is not a role that an application assumes.',
    exercise:
      'Sketch human → federated session → role → permitted resource. Separately sketch EC2 → workload role → S3 object. Do not create credentials.',
    check:
      'Which policy determines who can assume a role, and which permissions determine subsequent access?',
  },
  {
    title: 'Least privilege and policy reasoning',
    objectiveId: '1.1',
    objectives: ['Restrict actions and resources', 'Explain explicit deny and temporary access'],
    concept:
      'Grant only the actions, resources and conditions required by a task. Start from the workload’s access needs and validate the policy. An applicable explicit deny overrides an allow. Guardrails and permissions boundaries can restrict possible permissions; they do not independently grant an action.',
    example:
      'An image reader needs object read access to a specific prefix, not administrator permissions for the account. Listing a bucket is a distinct action from retrieving an object; grant each only when required.',
    comparison:
      'A broad managed policy can help initial exploration, but production permissions should be narrowed using observed requirements. A permissions boundary caps identity permissions; an identity still needs an applicable allow.',
    misconception: 'Attaching another allow policy cannot override an applicable explicit deny.',
    exercise:
      'On paper, describe a policy allowing only retrieval of objects under a training prefix. Identify the object resource scope and any separate listing requirement. No AWS resources or keys are needed.',
    check:
      'What happens when an applicable allow and an applicable explicit deny both match a request?',
  },
  {
    title: 'AWS Organizations fundamentals',
    objectiveId: '1.1',
    objectives: ['Explain account guardrails', 'Protect the root identity'],
    concept:
      'AWS Organizations groups accounts for centralized governance. Organizational units organize accounts into a hierarchy. Service control policies restrict available permissions for member-account principals; they do not grant permissions. The management account is not restricted by these SCPs. Protect root credentials and avoid routine root use.',
    example:
      'A company groups sandbox accounts in an organizational unit and applies a guardrail limiting allowed actions. Each workload still needs its own identity permissions within those limits.',
    comparison:
      'An organization-level guardrail limits account capabilities; an IAM policy grants identity access within applicable constraints. Account separation and IAM permissions solve different parts of governance.',
    misconception:
      'An SCP that allows an action does not by itself authorize a user to perform it.',
    exercise:
      'Draw organization → organizational unit → member accounts. Describe an identity permission and a separate account guardrail. No provisioning is performed.',
    check:
      'Why does adding an account to an organizational unit not automatically give its users new permissions?',
  },
];

// Original drafts. The first option is the answer key; delivery shuffles options.
// Every distractor carries its own explanation for instructor review.
const questionDrafts: [
  string,
  string,
  [string, string],
  [string, string],
  [string, string],
  [string, string],
][] = [
  [
    '1.1',
    'An EC2 application needs to read private S3 objects. Which credential approach is preferred?',
    ['Use an EC2 role with scoped permissions', 'The workload can use temporary role credentials.'],
    ['Embed a root access key', 'Root credentials expose excessive authority.'],
    ['Share an IAM user password', 'A console password is not workload authentication.'],
    ['Make the bucket public', 'Public access removes the required confidentiality.'],
  ],
  [
    '1.1',
    'Who is responsible for patching the guest operating system of an EC2 instance?',
    ['The customer', 'The guest OS belongs to the customer’s operating responsibility.'],
    ['The data center operator', 'Facility operation does not include the customer guest OS.'],
    ['AWS Organizations', 'Organizations is a governance service, not a patch operator.'],
    ['The DNS provider', 'DNS does not maintain guest operating systems.'],
  ],
  [
    '2.2',
    'Two redundant instances must tolerate a single Availability Zone outage. Where should they run?',
    ['In separate Availability Zones', 'Separate zones reduce shared zonal failure exposure.'],
    ['In one subnet', 'A subnet is contained in one Availability Zone.'],
    ['On one larger instance', 'One instance remains a single point of failure.'],
    [
      'Only at an edge location',
      'An edge location is not a general replacement for regional EC2 deployment.',
    ],
  ],
  [
    '1.1',
    'A workload only reads objects under one bucket prefix. What permission scope best follows least privilege?',
    [
      'Allow required read actions on that prefix',
      'Actions and resources match the stated requirement.',
    ],
    [
      'Allow all S3 actions on every bucket',
      'This exceeds both the action and resource requirement.',
    ],
    ['Grant account administration', 'Administration is unrelated to object reading.'],
    ['Disable authorization checks', 'Removing authorization cannot enforce least privilege.'],
  ],
  [
    '1.1',
    'An applicable policy explicitly denies an action that another policy allows. What is the result?',
    ['The request is denied', 'An applicable explicit deny takes precedence.'],
    ['The newest policy wins', 'Policy age does not resolve this conflict.'],
    ['The allow always wins', 'An allow does not override an explicit deny.'],
    ['The user chooses a policy', 'Evaluation is performed by the authorization system.'],
  ],
  [
    '1.1',
    'What is the purpose of a role trust policy?',
    ['Define who can assume the role', 'Trust controls role assumption.'],
    ['Store a permanent password', 'A trust policy does not store authentication secrets.'],
    ['Grant every AWS action', 'Trust is distinct from the role’s permissions.'],
    ['Choose an Availability Zone', 'Placement is not a role trust decision.'],
  ],
  [
    '1.1',
    'What does a service control policy grant to an IAM user by itself?',
    ['No permissions', 'An SCP limits permissions rather than granting them.'],
    ['Administrator access', 'An identity still needs an applicable permission grant.'],
    ['A console password', 'An SCP does not create credentials.'],
    ['A role session', 'A session requires authentication and authorized assumption.'],
  ],
  [
    '1.1',
    'A person needs routine workforce access to AWS. Which approach is preferred?',
    [
      'Federation with temporary sessions',
      'Federation avoids distributing long-lived credentials for routine workforce use.',
    ],
    ['Shared root login', 'Root should not be a shared routine identity.'],
    [
      'A key checked into source control',
      'Source control is not a safe secret distribution mechanism.',
    ],
    [
      'Anonymous access to private resources',
      'Anonymous access does not provide workforce identity.',
    ],
  ],
  [
    '1.1',
    'Which task remains with the customer when using a managed service?',
    [
      'Configure authorized access to customer data',
      'Managed infrastructure does not choose customer authorization policy.',
    ],
    [
      'Secure the provider’s physical facilities',
      'Physical facility security is the provider’s responsibility.',
    ],
    [
      'Replace provider hardware disks',
      'Provider infrastructure maintenance is not a customer operation.',
    ],
    [
      'Operate the provider’s virtualization layer',
      'The underlying virtualization infrastructure is operated by the provider.',
    ],
  ],
  [
    '2.2',
    'What is an Availability Zone?',
    [
      'An isolated location within an AWS Region',
      'A zone is a regional failure boundary containing one or more data centers.',
    ],
    ['An IAM permissions container', 'Permissions are not organized by Availability Zones.'],
    ['A geographic collection of Regions', 'Regions contain zones, not the reverse.'],
    ['A billing discount', 'A zone is an infrastructure location, not a pricing commitment.'],
  ],
  [
    '2.2',
    'A contract requires data to remain in a permitted geography. What should guide Region selection first?',
    [
      'The data-location requirement',
      'Location constraints must be satisfied before optimizing optional preferences.',
    ],
    ['The shortest Region name', 'Names have no bearing on contractual suitability.'],
    ['Only the lowest price', 'Price cannot override a mandatory location requirement.'],
    [
      'The developer’s laptop location',
      'The developer’s location does not define the workload’s obligations.',
    ],
  ],
  [
    '1.1',
    'What is the primary purpose of an IAM group?',
    ['Organize permissions for IAM users', 'Groups simplify permission management for users.'],
    ['Provide workload role sessions', 'Workloads assume roles rather than groups.'],
    ['Create separate AWS accounts', 'Account creation is not an IAM group function.'],
    ['Replicate data between Regions', 'IAM groups do not replicate application data.'],
  ],
  [
    '1.1',
    'A permissions boundary allows an action, but no identity policy grants it. Does the boundary alone authorize it?',
    [
      'No; it limits permissions without granting them',
      'A boundary is a maximum, not an independent grant.',
    ],
    [
      'Yes; it replaces identity policies',
      'The boundary does not replace required permission grants.',
    ],
    ['Yes; only for administrators', 'A role label does not turn the boundary into a grant.'],
    ['Yes; after a day', 'Time does not create a missing permission grant.'],
  ],
  [
    '1.1',
    'Which identity should be protected and avoided for routine account work?',
    ['The root user', 'Root has exceptional account authority and needs strong protection.'],
    ['A narrowly scoped workload role', 'A scoped role is appropriate for its intended workload.'],
    [
      'An application’s temporary session',
      'Temporary sessions reduce long-lived credential exposure.',
    ],
    ['A federated employee session', 'Federated sessions support individual routine access.'],
  ],
  [
    '1.1',
    'An application already uses temporary role credentials. What further step improves least privilege?',
    [
      'Restrict its allowed actions and resource scope',
      'Temporary credentials still need appropriately narrow permissions.',
    ],
    [
      'Grant every action to avoid errors',
      'Credential lifetime does not justify excessive authority.',
    ],
    ['Publish the credentials', 'Temporary credentials are still secrets.'],
    ['Replace the role with root', 'Root widens authority unnecessarily.'],
  ],
  [
    '2.2',
    'Does deploying across two Availability Zones necessarily provide recovery from loss of the entire Region?',
    ['No; regional recovery needs a broader design', 'Both zones remain within the same Region.'],
    ['Yes; each zone is a separate Region', 'Zones are subdivisions of a Region.'],
    ['Yes; DNS automatically copies all data', 'DNS does not replicate workload data.'],
    ['Yes; IAM groups provide failover', 'IAM groups manage permissions, not regional failover.'],
  ],
  [
    '1.1',
    'A role trust policy permits an application to assume a role. What else determines what the resulting session can do?',
    [
      'Applicable permissions policies and constraints',
      'Assumption and resource authorization are separate decisions.',
    ],
    ['Only the role name', 'Names do not grant authority.'],
    ['Only the application’s programming language', 'Language does not define IAM authorization.'],
    ['The number of Availability Zones', 'Infrastructure placement does not grant IAM actions.'],
  ],
  [
    '1.1',
    'Why should teams review unused permissions?',
    [
      'To remove authority the workload no longer requires',
      'Least privilege needs maintenance as workloads change.',
    ],
    ['To make all resources public', 'Public access is not a substitute for permission review.'],
    ['To eliminate authentication', 'Authentication remains necessary.'],
    [
      'To guarantee the AWS exam result',
      'Operational review cannot guarantee a certification result.',
    ],
  ],
  [
    '1.1',
    'Where can organizational units help an AWS organization?',
    [
      'Group accounts for governance policies',
      'OUs structure member accounts for policy administration.',
    ],
    ['Group EC2 memory pages', 'OUs are not a compute memory feature.'],
    ['Store S3 objects instead of buckets', 'OUs do not store object data.'],
    [
      'Replace every identity policy',
      'Account guardrails do not replace identity permission grants.',
    ],
  ],
  [
    '1.1',
    'Which statement correctly describes elasticity?',
    ['Capacity can change with demand', 'Elasticity concerns adjusting resource capacity.'],
    [
      'It automatically removes all failure modes',
      'Failure tolerance requires architecture decisions.',
    ],
    ['It grants users temporary credentials', 'Temporary credentials are an identity concern.'],
    [
      'It makes every Region have identical features',
      'Regional service availability must still be checked.',
    ],
  ],
];

export const weekOneQuestions = questionDrafts.map(([objectiveId, prompt, ...options], index) => ({
  stableId: `saa-c03-w01-${String(index + 1).padStart(3, '0')}`,
  objectiveId,
  prompt,
  difficulty: 1,
  explanation: options[0]![1],
  options: options.map(([text, feedback], position) => ({
    text,
    feedback,
    isCorrect: position === 0,
    position,
  })),
}));
