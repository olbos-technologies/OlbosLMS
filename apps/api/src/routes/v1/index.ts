import type { FastifyPluginAsync } from 'fastify';
import { aiRoutes } from './ai.routes.js';
import { analyticsRoutes } from './analytics.routes.js';
import { authRoutes } from './auth.routes.js';
import { billingRoutes } from './billing.routes.js';
import { certificateRoutes } from './certificates.routes.js';
import { complianceRoutes } from './compliance.routes.js';
import { courseRoutes } from './courses.routes.js';
import { meRoutes } from './me.routes.js';
import { organizationRoutes } from './organizations.routes.js';
import { peopleRoutes } from './people.routes.js';
import { safetyRoutes } from './safety.routes.js';
import { trainingRoutes } from './training.routes.js';

/** Everything under `/api/v1`. */
export const registerV1Routes: FastifyPluginAsync = async (app) => {
  await app.register(authRoutes);
  await app.register(meRoutes);
  await app.register(organizationRoutes);
  await app.register(peopleRoutes);
  await app.register(courseRoutes);
  await app.register(trainingRoutes);
  await app.register(complianceRoutes);
  await app.register(safetyRoutes);
  await app.register(certificateRoutes);
  await app.register(analyticsRoutes);
  await app.register(billingRoutes);
  await app.register(aiRoutes);
};
