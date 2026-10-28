import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import { AppModule } from './app.module';
import { AuthController } from './auth';
import { CareController, CareSummariesController, ClinicalController } from './clinical';
import { CommunicationsController } from './communications';
import { FollowUpsController } from './followups';
import { HealthController } from './health';
import { MediaController } from './media';
import { RecordsController } from './records';
import { RemindersController } from './reminders';
import { PrismaService } from './prisma.service';
import { TasksController } from './tasks';
import { AdminController } from './admin';
import { DietPlanTemplateAdminController, NutritionController } from './nutrition';

const controllers = [
  HealthController,
  AuthController,
  ClinicalController,
  CareSummariesController,
  CareController,
  RecordsController,
  TasksController,
  FollowUpsController,
  CommunicationsController,
  MediaController,
  RemindersController,
  AdminController,
  NutritionController,
  DietPlanTemplateAdminController,
];

function values(value: string | string[] | undefined) {
  return value === undefined ? [''] : Array.isArray(value) ? value : [value];
}

function routeManifest() {
  const routes: string[] = [];
  for (const controller of controllers) {
    const prefixes = values(Reflect.getMetadata(PATH_METADATA, controller));
    const prototype = controller.prototype as unknown as Record<string, unknown>;
    for (const name of Object.getOwnPropertyNames(prototype)) {
      if (name === 'constructor') continue;
      const handler = prototype[name];
      if (typeof handler !== 'function') continue;
      const method = Reflect.getMetadata(METHOD_METADATA, handler);
      if (method === undefined) continue;
      const paths = values(Reflect.getMetadata(PATH_METADATA, handler));
      for (const prefix of prefixes) for (const path of paths) {
        const normalizedPath = [prefix, path]
          .filter(Boolean)
          .join('/')
          .replace(/\/+/g, '/')
          .replace(/^\/+|\/+$/g, '');
        routes.push(`${method}:${normalizedPath}`);
      }
    }
  }
  return routes;
}

describe('API route manifest', () => {
  const routes = routeManifest();

  it('compiles the full Nest module dependency graph', async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({ user: { findUnique: jest.fn().mockResolvedValue({ id: 'admin-1' }), create: jest.fn() } })
      .compile();
    const app = module.createNestApplication();
    await app.init();
    await app.close();
  });

  it('does not register duplicate method/path pairs', () => {
    const duplicates = routes.filter((route, index) => routes.indexOf(route) !== index);
    expect(duplicates).toEqual([]);
  });

  it.each([
    '1:auth/register',
    '1:auth/login',
    '1:auth/wechat/login',
    '1:clinical/patients',
    '0:clinical/patients/:id/care-summaries',
    '1:clinical/patients/:id/care-summaries',
    '0:care-summaries',
    '0:clinical/patients/:id/archive',
    '2:clinical/patients/:id/archive',
	'0:care/invites/:code/qr',
    '1:care/invites/:code/bind',
    '1:health-records',
    '0:reports',
    '1:follow-ups',
    '1:follow-ups/:id/complete',
    '0:messages/conversations',
    '0:notifications',
    '1:media/upload',
    '1:internal/reminders/run',
    '1:admin/auth/login',
    '0:admin/users',
    '4:admin/users/:id',
    '0:admin/audit-logs',
    '0:diet-plan-templates',
    '0:diet-plans',
    '1:clinical/patients/:patientId/diet-plans',
    '1:clinical/patients/:patientId/records/:recordId/review',
    '1:admin/diet-plan-templates',
  ])('contains the required route %s', (route) => {
    expect(routes).toContain(route);
  });
});
